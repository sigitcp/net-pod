"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    X, Play, Loader2, AlertCircle, ArrowLeft, Edit2,
    CheckCircle, Film, User, Sparkles, Database, Search, Star
} from "lucide-react";
import SettingsModal from "../components/settings"; 
import { useSolidSession } from "@/src/contexts/SolidSessionContext";
import { getPodUrlAll } from "@inrupt/solid-client";
import {
    loadSettings,
    loadBehaveKnowledge,
    saveSearchSession,
    saveRecommendations,
    saveSeedMovies,
    saveInteraction,
    initializePodFiles,
    MovieInteraction
} from "../../src/solid-storage";
import toast, { Toaster } from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYjRhZWRjYjAyNTY1NTdkOTIwNDlkMDE5NWI3ZGM4MCIsIm5iZiI6MTc4ODc2NjAxOC4yNiwic3ViIjoiNmE5ZTY3NDI2NDg2YjVkMDBjNGIyMTU3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.j2sLcGSvG_AQCSOQ6OK89jh8Q0_Jedy2f8-IZH6QwD8";

const tmdbHeaders = {
    Authorization: `Bearer ${TMDB_TOKEN}`,
    accept: "application/json"
};

type Movie = {
    id: number;
    title: string;
    original_title: string;
    overview: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string;
    vote_average: number;
    vote_count: number;
    genre_ids: number[];
};

type SelectedMovie = {
    id: number;
    title: string;
    poster: string | null;
    year: string;
    overview: string;
};

type Personalization = {
    favoriteDirectors: string[];
    previouslyRecommended: { title: string; year: string }[];
    dislikedMovies: { title: string; year: string }[];
    genrePreferences: string[];
    interactionCount: number;
};

type EnrichedRecommendation = {
    title: string;
    year: string;
    tmdbId: number;
    genre?: string;
    reason?: string;
    personalized?: boolean;
    genreMatch?: boolean;
    verified?: boolean;
    matchMethod?: string;
    poster?: string | null;
    backdrop?: string | null;
    overview?: string;
    rating?: number;
    movieUrl?: string;
    podMovieUrl?: string;
    isSelected?: boolean;
};

export default function FindMoreMoviesPage() {
    const { session, isLoggedIn } = useSolidSession();
    const router = useRouter();

    const [storageRoot, setStorageRoot] = useState<string | null>(null);
    const [ageRange, setAgeRange] = useState("18+");
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
    
    const [movieQuery, setMovieQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Movie[]>([]);
    const [selectedMovies, setSelectedMovies] = useState<SelectedMovie[]>([]);
    const [theme, setTheme] = useState("");
    const [llm, setLlm] = useState("GPT");
    const [showSettings, setShowSettings] = useState(false);

    const [currentSessionId, setCurrentSessionId] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState<EnrichedRecommendation[]>([]);
    const [ragStep, setRagStep] = useState("");
    
    const [personalization, setPersonalization] = useState<Personalization>({
        favoriteDirectors: [],
        previouslyRecommended: [],
        dislikedMovies: [],
        genrePreferences: [],
        interactionCount: 0,
    });

    useEffect(() => {
        if (!isLoggedIn) router.replace("/sign-in");
    }, [isLoggedIn, router]);

    useEffect(() => {
        if (isLoggedIn && session?.info?.webId) {
            (async () => {
                try {
                    let podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
                    if (!podUrls.length) podUrls = [session.info.webId!.replace("/profile/card#me", "/")];
                    const storage = podUrls[0];
                    setStorageRoot(storage);

                    await initializePodFiles(storage, session.fetch);

                    const settings = await loadSettings(storage, session.fetch);
                    if (settings && settings.genres && settings.genres.length > 0) {
                        setAgeRange(settings.ageRange);
                        setSelectedGenres(settings.genres.slice(0, 3));
                    }

                    const interactions = await loadBehaveKnowledge(storage, session.fetch);
                    const highRated = interactions.filter(i => i.action === "rate" && (i.ratingValue || 0) >= 4);

                    setPersonalization({
                        favoriteDirectors: [...new Set(highRated.map(s => s.resolvedDirector).filter(Boolean) as string[])].slice(0, 5),
                        previouslyRecommended: highRated.filter(s => s.resolvedTitle).map(s => ({ title: s.resolvedTitle!, year: "N/A" })),
                        dislikedMovies: [],
                        genrePreferences: settings?.genres || [],
                        interactionCount: interactions.length,
                    });
                } catch (err) {
                    console.error("Failed to initialize Pod:", err);
                }
            })();
        }
    }, [isLoggedIn, session]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (movieQuery.length < 2) { 
                setSearchResults([]); 
                return; 
            }
            try {
                const url = `${TMDB_API_URL}/search/movie?query=${encodeURIComponent(movieQuery)}&language=en-US&include_adult=false&page=1`;
                const response = await fetch(url, { headers: tmdbHeaders });
                if (response.ok) {
                    const data = await response.json();
                    setSearchResults(data.results || []);
                }
            } catch (err) {
                console.error("TMDB Search error:", err);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [movieQuery]);

    const handleAddMovie = (movie: Movie) => {
        if (selectedMovies.length >= 5) {
            toast.error("You can only select up to 5 movies!");
            return;
        }
        if (selectedMovies.find(m => m.id === movie.id)) {
            toast.error("Movie already selected!");
            return;
        }

        setSelectedMovies([...selectedMovies, {
            id: movie.id,
            title: movie.title,
            poster: movie.poster_path,
            year: movie.release_date ? movie.release_date.substring(0, 4) : "N/A",
            overview: movie.overview,
        }]);
        toast.success(`Added "${movie.title}"`, { duration: 1500 });
    };

    const handleRemoveMovie = (id: number) =>
        setSelectedMovies(selectedMovies.filter(m => m.id !== id));

    const handleSettingsSaved = async () => {
        setShowSettings(false);
        if (storageRoot) {
            const settings = await loadSettings(storageRoot, session.fetch);
            if (settings) {
                setAgeRange(settings.ageRange);
                setSelectedGenres(settings.genres.slice(0, 3));
            }
            toast.success("Settings updated!");
        }
    };

    const handleRate = async (rec: EnrichedRecommendation, ratingValue: number) => {
        if (!storageRoot || !rec.podMovieUrl) {
            toast.error("Cannot save rating: Pod not connected or movie reference missing.");
            return;
        }
        try {
            await saveInteraction(storageRoot, {
                interactionId: uuidv4(),
                movieRef: rec.podMovieUrl,
                action: "rate",
                ratingValue: ratingValue,
                timestamp: new Date()
            }, session.fetch);
            
            toast.success(`Rated ${ratingValue} stars!`);
            setRecommendations(prev => prev.map(r => 
                r.tmdbId === rec.tmdbId ? { ...r, rating: ratingValue } : r
            ));
        } catch (err) {
            console.error("Failed to save rating", err);
            toast.error("Failed to save rating to Pod.");
        }
    };

    const handleSelectMovie = async (rec: EnrichedRecommendation) => {
        if (!storageRoot || !rec.podMovieUrl) {
            toast.error("Cannot select movie: Pod not connected.");
            return;
        }
        try {
            await saveInteraction(storageRoot, {
                interactionId: uuidv4(),
                movieRef: rec.podMovieUrl,
                action: "select",
                timestamp: new Date()
            }, session.fetch);
            
            toast.success("Movie selected! It will appear on your Dashboard.");
            setRecommendations(prev => prev.map(r => 
                r.tmdbId === rec.tmdbId ? { ...r, isSelected: true } : r
            ));
        } catch (err) {
            console.error("Failed to select movie", err);
            toast.error("Failed to save selection to Pod.");
        }
    };

    const isFormValid = selectedMovies.length >= 1 && selectedMovies.length <= 5 && selectedGenres.length > 0 && !!ageRange;
    const isMovieSelected = (movieId: number) => selectedMovies.some(m => m.id === movieId);

    const handleSubmit = async () => {
        if (!storageRoot) { toast.error("Pod not connected!"); return; }

        setLoading(true);
        setRecommendations([]);
        setRagStep("");

        const sessionId = uuidv4();
        setCurrentSessionId(sessionId);
        const startTime = Date.now();
        const selectedModel = llm === "Gemini" ? "gemini-2.5-flash" : llm === "Claude" ? "claude-sonnet-5" : "gpt-3.5-turbo";

        try {
            setRagStep("🎬 Step 0/7: Saving seed movies...");
            const seedMoviesData = selectedMovies.map(m => ({ title: m.title, director: "Various", year: m.year }));
            const seedResults = await saveSeedMovies(storageRoot, seedMoviesData, sessionId, session.fetch);
            const seedUrls = seedResults.map(r => r.seedEntryUrl);

            setRagStep("🔬 Step 1/7: Analyzing movie themes...");
            const finalGenres = selectedGenres;

            setRagStep("🔍 Step 2/7: Searching TMDB database...");
            const tmdbSearchQuery = finalGenres.length > 0 ? finalGenres.join(" ") : "popular";
            let candidates: Movie[] = [];

            if (finalGenres.length > 0) {
                const tmdbSearchUrl = `${TMDB_API_URL}/search/movie?query=${encodeURIComponent(tmdbSearchQuery)}&language=en-US&include_adult=false&page=1`;
                const tmdbRes = await fetch(tmdbSearchUrl, { headers: tmdbHeaders });
                if (tmdbRes.ok) {
                    const tmdbData = await tmdbRes.json();
                    candidates = tmdbData.results || [];
                }
            }

            if (candidates.length === 0) {
                const popularUrl = `${TMDB_API_URL}/movie/popular?language=en-US&page=1`;
                const popularRes = await fetch(popularUrl, { headers: tmdbHeaders });
                if (popularRes.ok) {
                    const popularData = await popularRes.json();
                    candidates = popularData.results || [];
                }
            }

            setRagStep("🎥 Step 3/7: Building prompt...");
            const candidateList = candidates.slice(0, 30).map((m, i) => `[${i}] "${m.title}" (${m.release_date?.substring(0, 4) || "N/A"}) - ${m.overview?.substring(0, 80) || "No overview"}`).join("\n");
            const seedMoviesList = selectedMovies.map(m => `   - "${m.title}" (${m.year})`).join("\n");

            const prompt = `You are an expert movie curator. Select EXACTLY 5 movies from the CANDIDATE POOL that best match the user's taste.

CRITICAL RULE: DO NOT select movies simply because they have the vibe word in their title or overview. Select movies that genuinely embody the *mood, pacing, tone, or emotional feel* described in the DESIRED VIBE.

USER'S SEED MOVIES (ground truth for their taste):
${seedMoviesList}

USER'S PREFERRED GENRES:
${finalGenres.join(", ")}

${theme ? `DESIRED VIBE/ATMOSPHERE: "${theme}" (Focus on the emotional feel, pacing, or tone. For example, if the vibe is "action", look for high-stakes, fast-paced, or thrilling narratives, NOT just movies with "Action" in the title).` : ""}

CANDIDATE POOL:
${candidateList}

OUTPUT INSTRUCTIONS:
Return ONLY a valid JSON array. Do not include markdown formatting.
For the "reason" field, explain WHY this movie fits the user's taste based on its plot, tone, or emotional impact. Keep it under 15 words. Be specific and avoid generic phrases.

JSON FORMAT:
[
  {
    "poolIndex": 0,
    "title": "EXACT TITLE FROM POOL",
    "year": "YYYY",
    "tmdbId": 123,
    "reason": "e.g., Relentless pacing and incredible practical stunt work make it a thrill ride",
    "personalized": true,
    "genreMatch": true
  }
]`;

            setRagStep("🤖 Step 4/7: AI selecting movies...");
            const llmRes = await fetch("/api/chatAPI", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    messages: [
                        { role: "system", content: "Strict movie recommender. Output only valid JSON array." }, 
                        { role: "user", content: prompt }
                    ], 
                    model: selectedModel, 
                    stream: false 
                }),
            });

            if (!llmRes.ok) throw new Error(`LLM API error: ${llmRes.status}`);
            const llmData = await llmRes.json();
            let content = llmData.choices?.[0]?.message?.content || "[]";
            content = content.replace(/```json/g, "").replace(/```/g, "").trim();
            const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
            const jsonString = jsonMatch ? jsonMatch[0] : content;
            
            let llmPicks: any[];
            try { 
                llmPicks = JSON.parse(jsonString); 
            } catch (e) { 
                throw new Error("LLM returned invalid JSON"); 
            }

            setRagStep("✅ Step 5/7: Final verification...");
            const verifiedMovies = await Promise.all(llmPicks.map(async (pick) => {
                const movie = candidates.find(m => m.id === pick.tmdbId || m.title.toLowerCase() === pick.title.toLowerCase());
                if (movie) {
                    return { 
                        ...pick, 
                        tmdbId: movie.id, 
                        year: movie.release_date?.substring(0, 4) || pick.year, 
                        verified: true, 
                        poster: movie.poster_path, 
                        backdrop: movie.backdrop_path, 
                        overview: movie.overview, 
                        rating: movie.vote_average, 
                        matchMethod: "tmdb-verified" 
                    };
                }
                return { ...pick, verified: false };
            }));

            let validRecs = verifiedMovies.filter((m: any) => m.verified);
            if (validRecs.length === 0) {
                validRecs = candidates.slice(0, 5).map(m => ({ 
                    title: m.title, 
                    year: m.release_date?.substring(0, 4) || "N/A", 
                    tmdbId: m.id, 
                    reason: "Highly rated popular movie matching your general taste", 
                    personalized: false, 
                    genreMatch: true, 
                    verified: true, 
                    poster: m.poster_path, 
                    backdrop: m.backdrop_path, 
                    overview: m.overview, 
                    rating: m.vote_average, 
                    matchMethod: "popular-fallback" 
                }));
            }

            setRagStep("🎨 Step 6/7: Fetching metadata...");
            const enrichedRecs: EnrichedRecommendation[] = validRecs.map((rec: any) => ({ 
                title: rec.title, 
                year: rec.year, 
                tmdbId: rec.tmdbId, 
                genre: rec.genre || finalGenres[0], 
                reason: rec.reason, 
                personalized: rec.personalized, 
                genreMatch: rec.genreMatch, 
                verified: rec.verified, 
                matchMethod: rec.matchMethod, 
                poster: rec.poster, 
                backdrop: rec.backdrop, 
                overview: rec.overview, 
                rating: rec.rating 
            }));

            setRagStep("💾 Step 7/7: Saving with standardized linking...");
            const recommendationsFileUrl = `${storageRoot}public/movie-rec-data/recommendations.ttl`;
            const recommendationUrl = `${recommendationsFileUrl}#recommendation-${sessionId}`;

            // ✅ PERBAIKAN: Sertakan tmdbId saat menyimpan ke Solid Pod
            const savedRecommendation = await saveRecommendations(storageRoot, { 
                recordId: sessionId, 
                sessionId, 
                timestamp: new Date(), 
                context: theme || "General Mix", 
                movies: enrichedRecs.map(r => ({ 
                    title: r.title, 
                    director: "Various", 
                    year: r.year, 
                    poster: r.poster ?? undefined, 
                    reason: r.reason,
                    tmdbId: r.tmdbId // ✅ BARU
                })) 
            }, session.fetch);

            await saveSearchSession(storageRoot, { 
                sessionId, 
                query: `${theme} ${finalGenres.join(",")}`.trim(), 
                vibe: theme, 
                originalGenres: selectedGenres, 
                correctedGenres: finalGenres, 
                genresCorrected: false, 
                seedUrls: seedUrls, 
                seedCount: seedUrls.length, 
                recommendationUrl: recommendationUrl, 
                timestamp: new Date(), 
                resultCount: enrichedRecs.length 
            }, session.fetch);

            const recsWithUrls: EnrichedRecommendation[] = enrichedRecs.map((rec, idx) => ({ 
                ...rec, 
                movieUrl: `/movie/${rec.tmdbId}`,
                podMovieUrl: savedRecommendation.movies[idx]?.movieUrl 
            }));
            
            setRecommendations(recsWithUrls);
            setRagStep(`✨ Done! ${enrichedRecs.length} movies ready.`);
            setTimeout(() => setRagStep(""), 3000);

        } catch (error: any) {
            console.error("[RAG Flow ❌]", error);
            toast.error(error.message || "Failed to get recommendations.");
            setRagStep("");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            <Toaster position="bottom-right" toastOptions={{ style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' } }} />
            
            <nav>
                <div className="logo" onClick={() => router.push('/')}>Movie<span>Mind</span></div>
                <div className="flex-1 mx-4 hidden md:block text-[#94a3b8] text-sm italic">
                    Use the search box in Step 2 to find your seed movies.
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowSettings(true)} className="shuffle-btn" style={{ borderRadius: '8px', padding: '10px 16px' }} title="Settings">
                        <Edit2 size={18} />
                    </button>
                </div>
            </nav>

            {showSettings && (
                <SettingsModal storageRoot={storageRoot} isMandatory={false} onClose={() => setShowSettings(false)} onSaveSuccess={handleSettingsSaved} />
            )}

            <main className="container">
                <div className="flex items-center justify-between mb-6">
                    <button onClick={() => router.push("/")} className="back-button flex items-center gap-2">
                        <ArrowLeft size={18} /> <span className="font-medium">Dashboard</span>
                    </button>
                    {storageRoot && (
                        <span className="text-xs text-[#94a3b8] bg-[#1e293b] border border-[#334155] px-3 py-1.5 rounded-full flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            {new URL(storageRoot).hostname}
                        </span>
                    )}
                </div>

                <h2 className="section-title"><Database size={24} className="text-[#ef4444]" /> Find More Movies</h2>
                <p className="text-[#94a3b8] mb-6">
                    <strong>Theme-First + 5-File Linked Architecture:</strong> Your movies define taste.
                    All data traced: <code className="text-xs bg-[#1e293b] px-2 py-1 rounded border border-[#334155]">seeds → sessions → recommendations</code>
                </p>

                {personalization.interactionCount > 0 && (
                    <div className="p-3 bg-[#1e293b] border border-[#334155] rounded-lg flex items-center gap-2 text-[#cbd5e1] text-sm mb-6">
                        <Sparkles size={16} className="text-[#ef4444]" />
                        <span><strong>Personalization active:</strong> Using {personalization.interactionCount} past interactions. {personalization.favoriteDirectors.length > 0 && <> Top directors: {personalization.favoriteDirectors.slice(0, 3).join(", ")}.</>}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                    <div className="md:col-span-2">
                        <div className="p-4 bg-[#1e293b] border border-[#334155] rounded-xl h-full">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <User size={16} className="text-[#ef4444]" />
                                    <p className="font-bold text-white">Step 1: About You</p>
                                </div>
                                <button onClick={() => setShowSettings(true)} className="flex items-center gap-1 text-xs text-[#ef4444] hover:text-[#dc2626] font-medium">
                                    <Edit2 size={12} /> Edit
                                </button>
                            </div>
                            <div className="mb-4">
                                <label className="block text-xs font-semibold text-[#94a3b8] mb-1">Age Range</label>
                                <div className="flex items-center gap-2 px-3 py-2 bg-[#0f172a] rounded-lg border border-[#334155] text-sm text-white">
                                    <span className="font-medium">
                                        {ageRange === "under_12" && "Under 12 years (Children)"}
                                        {ageRange === "13-17" && "13 - 17 years (Teenagers)"}
                                        {ageRange === "18+" && "18+ years (Adults)"}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[#94a3b8] mb-2">Your Genres ({selectedGenres.length})</label>
                                {selectedGenres.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedGenres.map(genre => (
                                            <span key={genre} className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#ef4444] text-white text-xs font-semibold rounded-full shadow-sm">
                                                <Film size={10} /> {genre}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                                        <p className="text-xs text-yellow-200">No genres selected.</p>
                                        <button onClick={() => setShowSettings(true)} className="mt-2 text-xs text-yellow-100 font-semibold underline hover:text-yellow-50">Open Settings →</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-4">
                        <div className="p-4 bg-[#1e293b] border border-[#334155] rounded-xl h-full flex flex-col">
                            <div className="flex items-center justify-between mb-3">
                                <p className="font-bold text-white">Step 2: Choose minimum 1 movie</p>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${selectedMovies.length === 5 ? "bg-green-900/30 text-green-300" : "bg-[#334155] text-[#94a3b8]"}`}>
                                    {selectedMovies.length}/5 selected
                                </span>
                            </div>

                            <div className="relative mb-4">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={18} />
                                <input
                                    type="text"
                                    placeholder="Search movie title (e.g., Inception, The Matrix)..."
                                    value={movieQuery}
                                    onChange={(e) => setMovieQuery(e.target.value)}
                                    className="w-full bg-[#0f172a] border border-[#334155] rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-[#64748b] focus:outline-none focus:ring-2 focus:ring-[#ef4444] focus:border-transparent transition-all"
                                />
                            </div>

                            {searchResults.length > 0 && (
                                <div className="flex flex-wrap gap-3 max-h-64 overflow-y-auto border-b border-[#334155] pb-4 mb-4">
                                    {searchResults.map(movie => {
                                        const isSelected = isMovieSelected(movie.id);
                                        const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : "https://via.placeholder.com/200x300?text=No+Image";
                                        return (
                                            <div key={movie.id} className={`bg-[#0f172a] rounded-lg shadow p-2 w-32 flex flex-col items-center text-center transition-all border ${isSelected ? "ring-2 ring-[#ef4444] border-[#ef4444] bg-[#1e293b]" : "border-[#334155] hover:border-[#ef4444]/50"}`}>
                                                <img src={poster} alt={movie.title} className={`w-full h-36 object-cover rounded mb-2 ${isSelected ? "opacity-60" : ""}`} />
                                                <p className="text-[11px] font-bold truncate w-full text-white mb-1" title={movie.title}>{movie.title}</p>
                                                <p className="text-[10px] text-[#94a3b8] mb-2">{movie.release_date?.substring(0, 4) || "N/A"}</p>
                                                
                                                {isSelected ? (
                                                    <div className="mt-auto bg-green-600 text-white text-[10px] px-2 py-1 rounded w-full flex items-center justify-center gap-1 font-semibold">
                                                        <CheckCircle size={12} /> Added
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => handleAddMovie(movie)}
                                                        disabled={selectedMovies.length >= 5}
                                                        className="mt-auto bg-[#ef4444] text-white text-[10px] px-2 py-1 rounded hover:bg-[#dc2626] w-full font-semibold disabled:bg-[#334155] disabled:text-[#64748b] disabled:cursor-not-allowed transition-colors"
                                                    >
                                                        + Add
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="mt-auto">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[#94a3b8] text-xs font-semibold flex items-center gap-1">
                                        <Sparkles size={12} className="text-[#ef4444]" />
                                        Your Seed Movies:
                                    </p>
                                    {selectedMovies.length > 0 && (
                                        <button onClick={() => setSelectedMovies([])} className="text-xs text-red-400 hover:text-red-300 font-medium flex items-center gap-1">
                                            <X size={12} /> Clear all
                                        </button>
                                    )}
                                </div>
                                
                                <div className="flex flex-wrap gap-3 min-h-[140px] p-4 bg-[#0f172a]/50 rounded-lg border-2 border-dashed border-[#334155]">
                                    {selectedMovies.length === 0 ? (
                                        <div className="w-full flex flex-col items-center justify-center text-[#64748b] text-sm italic py-4">
                                            <Search size={24} className="mb-2 opacity-50" />
                                            Search and add movies above to use as seeds...
                                        </div>
                                    ) : (
                                        selectedMovies.map((movie, idx) => {
                                            const poster = movie.poster ? `https://image.tmdb.org/t/p/w200${movie.poster}` : "https://via.placeholder.com/200x300?text=No+Image";
                                            return (
                                                <div key={movie.id} className="bg-[#1e293b] rounded-lg shadow-md p-2 w-32 flex flex-col items-center text-center relative group border border-[#ef4444]/30 hover:border-[#ef4444] transition-all">
                                                    <div className="absolute -top-2 -left-2 w-6 h-6 bg-[#ef4444] text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md z-10">
                                                        {idx + 1}
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveMovie(movie.id)}
                                                        className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 z-20 transition-opacity shadow-sm"
                                                        title="Remove"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                    <img src={poster} alt={movie.title} className="w-full h-36 object-cover rounded mb-2" />
                                                    <p className="text-[11px] font-bold truncate w-full text-white">{movie.title}</p>
                                                    <p className="text-[10px] text-[#94a3b8]">{movie.year}</p>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="md:col-span-6 flex flex-col gap-4 mt-4">
                        <div className="p-4 bg-[#1e293b] border border-[#334155] rounded-xl">
                            <p className="font-bold text-white mb-2">Step 3: What's the vibe? (Optional)</p>
                            <input 
                                type="text" 
                                placeholder="e.g., mind-bending, cozy rainy day, high-octane adrenaline..." 
                                value={theme} 
                                onChange={(e) => setTheme(e.target.value)} 
                                className="block w-full rounded-lg border-0 py-2.5 px-4 shadow-sm ring-1 ring-inset ring-[#334155] text-sm bg-[#0f172a] text-white placeholder-[#64748b] focus:ring-2 focus:ring-[#ef4444]" 
                            />
                            <p className="text-[#64748b] text-xs mt-2">💡 Tip: Describe the mood or feeling, not just a genre (e.g., "dark and mysterious" instead of just "thriller").</p>
                        </div>

                        <div className="p-4 bg-[#1e293b] border border-[#334155] rounded-xl">
                            <p className="font-bold text-white mb-2">Step 4: Choose your AI</p>
                            <select value={llm} onChange={(e) => setLlm(e.target.value)} className="block w-full rounded-lg border-0 py-2.5 px-4 shadow-sm ring-1 ring-inset ring-[#334155] text-sm bg-[#0f172a] text-white focus:ring-2 focus:ring-[#ef4444]">
                                <option value="GPT">OpenAI GPT</option>
                                <option value="Gemini">Google Gemini</option>
                                <option value="Claude">Anthropic Claude</option>
                            </select>
                        </div>

                        <button onClick={handleSubmit} disabled={!isFormValid || loading} className="w-full py-4 rounded-lg bg-[#ef4444] text-white font-bold text-lg hover:bg-[#dc2626] disabled:bg-[#334155] disabled:text-[#64748b] disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#ef4444]/20 transition-all hover:scale-[1.01]">
                            {loading && <Loader2 className="animate-spin" size={20} />}
                            {loading ? "Processing..." : "🚀 Recommend Me!"}
                        </button>

                        {!isFormValid && !loading && (
                            <p className="text-center text-[#64748b] text-xs">
                                {selectedGenres.length === 0 ? "⚠️ Please set genres in Settings (Step 1)." : selectedMovies.length === 0 ? "⚠️ Select at least 1 movie in Step 2." : "Ready to recommend!"}
                            </p>
                        )}
                    </div>
                </div>

                {ragStep && (
                    <div className="mt-6 p-4 bg-[#1e293b] border border-[#334155] rounded-lg flex items-center gap-3">
                        <Loader2 className="animate-spin text-[#ef4444]" size={20} />
                        <span className="text-sm font-mono text-white">{ragStep}</span>
                    </div>
                )}

                {recommendations.length > 0 && (
                    <div className="mt-10">
                        <h2 className="section-title">
                            <Sparkles className="text-[#ef4444]" size={24} /> Your Recommendations 
                            <span className="text-sm font-normal text-[#94a3b8]">({recommendations.length} movies)</span> 
                        </h2>
                        <div className="movie-grid">
                            {recommendations.map((rec, idx) => {
                                const poster = rec.poster ? `https://image.tmdb.org/t/p/w500${rec.poster}` : "https://via.placeholder.com/500x750?text=No+Image";
                                return (
                                    <div key={idx} className="movie-card cursor-pointer group" onClick={() => router.push(rec.movieUrl || `/movie/${rec.tmdbId}`)}>
                                        <img src={poster} alt={rec.title} className="w-full h-[270px] object-cover" />
                                        <div className="movie-info">
                                            <div className="movie-title" title={rec.title}>{rec.title}</div>
                                            <div className="text-[11px] text-[#ef4444] font-bold mb-2 flex items-center gap-1">
                                                <Sparkles size={12} /> {rec.reason || "Recommended for you"}
                                            </div>
                                            <div className="movie-meta flex flex-col gap-2">
                                                <div className="flex items-center justify-between">
                                                    <span>{rec.year}</span>
                                                    <span className="rating">⭐ {rec.rating?.toFixed(1) || "N/A"}</span>
                                                </div>
                                                
                                                <div 
                                                    className="flex items-center gap-1 mt-2 pt-2 border-t border-[#334155]" 
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <span className="text-[10px] text-[#94a3b8] mr-1">Rate:</span>
                                                    {[1, 2, 3, 4, 5].map((star) => (
                                                        <button
                                                            key={star}
                                                            onClick={() => handleRate(rec, star)}
                                                            className="focus:outline-none transition-transform hover:scale-110"
                                                            title={`Rate ${star} stars`}
                                                        >
                                                            <Star 
                                                                size={16} 
                                                                className={`${
                                                                    (rec.rating || 0) >= star 
                                                                    ? "fill-[#facc15] text-[#facc15]" 
                                                                    : "text-[#475569] group-hover:text-[#facc15]"
                                                                }`} 
                                                            />
                                                        </button>
                                                    ))}
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSelectMovie(rec);
                                                    }}
                                                    disabled={rec.isSelected}
                                                    className={`mt-3 w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                                                        rec.isSelected 
                                                        ? "bg-green-600/20 text-green-400 border border-green-600/50 cursor-default" 
                                                        : "bg-[#ef4444] text-white hover:bg-[#dc2626] shadow-lg shadow-[#ef4444]/20"
                                                    }`}
                                                >
                                                    {rec.isSelected ? (
                                                        <><CheckCircle size={14} /> Selected for Dashboard</>
                                                    ) : (
                                                        <><Sparkles size={14} /> Select for Dashboard</>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </main>

            <footer>
                <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                <p>Data and images provided by The Movie Database (TMDB).</p>
                <p className="mt-2 text-[#ef4444] font-semibold">Powered by Solid POD & Smart Recommendation Algorithm</p>
            </footer>
        </div>
    );
}