"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    RefreshCcw, Sparkles, Settings, ArrowRight,
    BarChart3, Mic2, Search, LogOut, Star, Film, CheckCircle2
} from "lucide-react";
import SettingsModal from "./components/settings"; 
import { useSolidSession } from '@/src/contexts/SolidSessionContext';
import { getPodUrlAll } from '@inrupt/solid-client';
import {
    loadBehaveKnowledge,
    loadRecommendations,
    loadSettings,
    loadSearchSessions,
    MovieInteraction,
    RecommendationRecord,
    SearchSession,
    initializePodFiles
} from "../src/solid-storage";
import { generateSmartRecommendations, DashboardInsights } from "../src/lib/dashboardAlgorithm";
import toast, { Toaster } from 'react-hot-toast';

export default function Home() {
    const { session, isLoggedIn, logout } = useSolidSession(); 
    const router = useRouter();
    const [storageRoot, setStorageRoot] = useState<string | null>(null);

    const [sessions, setSessions] = useState<SearchSession[]>([]);
    const [recommendations, setRecommendations] = useState<RecommendationRecord[]>([]);
    const [interactions, setInteractions] = useState<MovieInteraction[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [displayLimit, setDisplayLimit] = useState(5); 
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    useEffect(() => {
        if (!isLoggedIn) router.replace('/sign-in');
    }, [isLoggedIn, router]);

    const loadDashboardData = async (storage: string) => {
        try {
            const [sess, recs, intr] = await Promise.all([
                loadSearchSessions(storage, session.fetch),
                loadRecommendations(storage, session.fetch),
                loadBehaveKnowledge(storage, session.fetch),
            ]);
            setSessions(sess);
            setRecommendations(recs);
            setInteractions(intr);
        } catch (err) {
            console.error("Failed to load dashboard data:", err);
        }
    };

    const insights: DashboardInsights | null = useMemo(() => {
        if (recommendations.length === 0) return null;
        return generateSmartRecommendations(sessions, recommendations, interactions, 50, 0);
    }, [sessions, recommendations, interactions]);

    const uniqueTopMovies = useMemo(() => {
        if (!insights) return [];
        
        const seen = new Set<string>();
        return insights.topMovies.filter(scoredMovie => {
            const uniqueId = scoredMovie.movie.movieUrl || scoredMovie.movie.title;
            if (seen.has(uniqueId)) {
                return false;
            }
            seen.add(uniqueId);
            return true;
        });
    }, [insights]);

    const userRatings = useMemo(() => {
        const ratingsMap = new Map<string, number>();
        interactions.forEach(interaction => {
            if (interaction.action === 'rate' && interaction.ratingValue) {
                ratingsMap.set(interaction.movieRef, interaction.ratingValue);
            }
        });
        return ratingsMap;
    }, [interactions]);

    const userSelections = useMemo(() => {
        const selectionSet = new Set<string>();
        interactions.forEach(interaction => {
            if (interaction.action === 'select') {
                selectionSet.add(interaction.movieRef);
            }
        });
        return selectionSet;
    }, [interactions]);

    const ratedMovies = useMemo(() => {
        const uniqueRated = interactions
            .filter(i => i.action === 'rate' && i.resolvedTitle && i.movieRef)
            .reduce((acc, current) => {
                const exists = acc.find(item => item.movieRef === current.movieRef);
                if (!exists) {
                    return acc.concat([current]);
                }
                return acc;
            }, [] as MovieInteraction[])
            .slice(0, 10);

        return uniqueRated.map(i => {
            let poster = undefined;
            let tmdbId = undefined; // ✅ BARU: Ambil tmdbId juga
            for (const rec of recommendations) {
                const found = rec.movies.find(m => m.movieUrl === i.movieRef);
                if (found) {
                    poster = found.poster;
                    tmdbId = found.tmdbId;
                    break;
                }
            }
            return {
                title: i.resolvedTitle!,
                director: i.resolvedDirector || 'Unknown',
                rating: i.ratingValue || 0,
                movieRef: i.movieRef,
                poster: poster,
                tmdbId: tmdbId // ✅ BARU
            };
        });
    }, [interactions, recommendations]);

    useEffect(() => {
        if (isLoggedIn && session?.info?.webId) {
            (async () => {
                try {
                    let podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
                    if (!podUrls.length) podUrls = [session.info.webId!.replace('/profile/card#me', '/')];
                    const storage = podUrls[0];
                    setStorageRoot(storage);

                    await initializePodFiles(storage, session.fetch);
                    const settings = await loadSettings(storage, session.fetch);

                    if (!settings || (settings as any).genres?.length === 0) {
                        setNeedsOnboarding(true);
                        setShowSettings(true);
                    } else {
                        await loadDashboardData(storage);
                    }
                } catch (err: any) {
                    toast.error('Failed to connect to Solid Pod');
                } finally {
                    setLoading(false);
                }
            })();
        }
    }, [isLoggedIn, session]);

    const handleOnboardingSuccess = async () => {
        setNeedsOnboarding(false);
        setShowSettings(false);
        if (storageRoot) {
            setLoading(true);
            await loadDashboardData(storageRoot);
            setLoading(false);
            toast.success('🎉 Welcome! Ready to generate your first recommendations.');
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push('/sign-in');
    };

    // ✅ HELPER: Buat URL detail berdasarkan tmdbId, fallback ke title
    const getDetailUrl = (movie: { tmdbId?: number; title: string }) => {
        if (movie.tmdbId) {
            return `/movie/${movie.tmdbId}`;
        }
        return `/movie/${encodeURIComponent(movie.title)}`;
    };

    return (
        <div className="min-h-screen bg-[#0f172a] text-white">
            <Toaster position="bottom-right" toastOptions={{
                style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' }
            }} />

            <nav>
                <div className="logo" onClick={() => router.push('/')}>
                    Movie<span>Mind</span>
                </div>
                <div className="search-box">
                    <input
                        type="text"
                        placeholder="Search movies..."
                        onKeyDown={(e) => e.key === 'Enter' && router.push('/findMore')}
                    />
                    <button onClick={() => router.push('/findMore')}>
                        <Search size={16} /> Search
                    </button>
                </div>
                
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLogout}
                        className="shuffle-btn text-red-400 hover:text-red-300 hover:bg-red-900/20 border-red-900/30"
                        style={{ borderRadius: '8px', padding: '10px 16px' }}
                        title="Logout"
                    >
                        <LogOut size={18} />
                    </button>
                    <button
                        onClick={() => setShowSettings(true)}
                        className="shuffle-btn"
                        style={{ borderRadius: '8px', padding: '10px 16px' }}
                        title="Settings"
                    >
                        <Settings size={18} />
                    </button>
                </div>
            </nav>

            <section className="hero">
                <div className="hero-content">
                    <h1>Find Your Next Movie</h1>
                    <p>
                        Find movies that match your taste. Powered by AI that analyzes your search history, 
                        ratings, and interactions on your Solid POD.
                    </p>
                </div>
            </section>

            <main className="container">
                {showSettings && (
                    <SettingsModal
                        storageRoot={storageRoot}
                        isMandatory={needsOnboarding}
                        onClose={() => !needsOnboarding && setShowSettings(false)}
                        onSaveSuccess={handleOnboardingSuccess}
                    />
                )}

                {loading ? (
                    <div className="text-center py-20 animate-pulse text-[#94a3b8] text-lg flex flex-col items-center gap-4">
                        <Sparkles size={48} className="text-[#ef4444]" />
                        Analyzing your taste profile on Solid POD...
                    </div>
                ) : (
                    <>
                        {insights && (insights.topGenres.length > 0 || insights.topDirectors.length > 0) && (
                            <section className="insights-grid">
                                {insights.topGenres.length > 0 && (
                                    <div className="insight-card">
                                        <div className="insight-title">
                                            <BarChart3 size={20} className="text-[#ef4444]" />
                                            Top Genres
                                        </div>
                                        <div className="space-y-3">
                                            {insights.topGenres.slice(0, 5).map((g, i) => {
                                                const maxScore = insights.topGenres[0].score;
                                                const pct = maxScore > 0 ? (g.score / maxScore) * 100 : 0;
                                                return (
                                                    <div key={g.name} className="insight-item">
                                                        <div className="insight-header">
                                                            <span className="insight-name capitalize">#{i + 1} {g.name}</span>
                                                            <span className="insight-score">{g.score.toFixed(1)} pts</span>
                                                        </div>
                                                        <div className="progress-bar-bg">
                                                            <div
                                                                className="progress-bar-fill"
                                                                style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {insights.topDirectors.length > 0 && (
                                    <div className="insight-card">
                                        <div className="insight-title">
                                            <Mic2 size={20} className="text-[#ec4899]" />
                                            Top Directors
                                        </div>
                                        <div className="space-y-3">
                                            {insights.topDirectors.slice(0, 5).map((d, i) => {
                                                const maxScore = insights.topDirectors[0].score;
                                                const pct = maxScore > 0 ? (d.score / maxScore) * 100 : 0;
                                                return (
                                                    <div key={d.name} className="insight-item">
                                                        <div className="insight-header">
                                                            <span className="insight-name truncate">#{i + 1} {d.name}</span>
                                                            <span className="insight-score">{d.score.toFixed(1)} pts</span>
                                                        </div>
                                                        <div className="progress-bar-bg">
                                                            <div
                                                                className="progress-bar-fill"
                                                                style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ec4899, #f43f5e)' }}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </section>
                        )}

                        <div className="controls-bar">
                            <h2 className="section-title" style={{ margin: 0 }}>
                                <Sparkles className="text-[#ef4444]" size={24} />
                                Smart Picks For You
                            </h2>
                            
                            <div className="flex items-center gap-4">
                                {insights && (
                                    <span className="text-xs text-[#94a3b8] bg-[#1e293b] border border-[#334155] px-3 py-1.5 rounded-full">
                                        {insights.totalSessions} sessions · {insights.totalInteractions} interactions
                                    </span>
                                )}
                            </div>
                        </div>

                        {uniqueTopMovies.length > 0 ? (
                            <>
                                <div className="movie-grid">
                                    {uniqueTopMovies.slice(0, displayLimit).map((scored, idx) => {
                                        const userRating = userRatings.get(scored.movie.movieUrl);
                                        const isSelected = userSelections.has(scored.movie.movieUrl);
                                        
                                        const posterUrl = scored.movie.poster 
                                            ? `https://image.tmdb.org/t/p/w500${scored.movie.poster}` 
                                            : "https://via.placeholder.com/500x750?text=No+Image";
                                        
                                        return (
                                            <div 
                                                key={scored.movie.movieUrl || idx} 
                                                className={`movie-card cursor-pointer group relative ${isSelected ? 'ring-2 ring-[#facc15]' : ''}`}
                                                onClick={() => router.push(getDetailUrl(scored.movie))} // ✅ GUNAKAN HELPER
                                            >
                                                {isSelected && (
                                                    <div className="absolute top-2 right-2 z-10 bg-[#facc15] text-black text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 shadow-lg">
                                                        <CheckCircle2 size={12} /> Selected
                                                    </div>
                                                )}

                                                <img
                                                    src={posterUrl}
                                                    alt={scored.movie.title}
                                                    className="w-full h-[270px] object-cover"
                                                />
                                                <div className="movie-info">
                                                    <div className="movie-title" title={scored.movie.title}>
                                                        {scored.movie.title}
                                                    </div>
                                                    
                                                    <div className="text-[11px] text-[#ef4444] font-bold mb-2 flex items-center gap-1">
                                                        <Sparkles size={12} />
                                                        {scored.reasons[0] || "Recommended for you"}
                                                    </div>

                                                    <div className="movie-meta flex flex-col gap-2">
                                                        <div className="flex items-center justify-between">
                                                            <span>{scored.movie.year || "N/A"}</span>
                                                            <span className="rating text-[#94a3b8] text-xs flex items-center gap-1">
                                                                🎬 {scored.movie.director}
                                                            </span>
                                                        </div>
                                                        
                                                        {userRating && (
                                                            <div className="flex items-center gap-1 pt-2 border-t border-[#334155] mt-1">
                                                                <span className="text-[10px] text-[#94a3b8] mr-1">Your Rating:</span>
                                                                {[1, 2, 3, 4, 5].map((star) => (
                                                                    <Star 
                                                                        key={star}
                                                                        size={14} 
                                                                        className={`${
                                                                            userRating >= star 
                                                                            ? "fill-[#facc15] text-[#facc15]" 
                                                                            : "text-[#475569]"
                                                                        }`} 
                                                                    />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {displayLimit < uniqueTopMovies.length && (
                                    <div className="mt-8 flex justify-center">
                                        <button
                                            onClick={() => setDisplayLimit(prev => prev + 5)}
                                            className="flex items-center gap-2 px-6 py-3 bg-[#1e293b] border border-[#334155] hover:bg-[#334155] rounded-lg font-semibold text-white transition-all"
                                        >
                                            Show More
                                            <ArrowRight size={18} />
                                        </button>
                                    </div>
                                )}

                                <div className="mt-6 flex justify-center">
                                    <button
                                        onClick={() => router.push('/findMore')}
                                        className="flex items-center gap-2 px-8 py-3.5 bg-[#ef4444] hover:bg-[#dc2626] rounded-lg font-bold text-white shadow-lg shadow-[#ef4444]/20 transition-all hover:scale-105"
                                    >
                                        <RefreshCcw size={18} />
                                        Generate New Recommendations
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-16 bg-[#1e293b]/30 rounded-xl border border-[#334155] mb-10">
                                <Sparkles size={48} className="mx-auto text-[#ef4444] mb-4" />
                                <h3 className="text-xl font-bold mb-2 text-white">Ready to discover?</h3>
                                <p className="text-[#94a3b8] mb-6 max-w-md mx-auto">
                                    Generate your first AI-curated movie list to start building your taste profile.
                                </p>
                                <button
                                    onClick={() => router.push('/findMore')}
                                    className="px-6 py-3 bg-[#ef4444] hover:bg-[#dc2626] rounded-lg font-bold text-white transition-colors"
                                >
                                    Start First Recommendation
                                </button>
                            </div>
                        )}

                        {ratedMovies.length > 0 && (
                            <div className="mt-16">
                                <h2 className="section-title">
                                    <Star className="text-[#facc15]" size={24} />
                                    Your Rated Movies
                                </h2>
                                <div className="movie-grid">
                                    {ratedMovies.map((movie, idx) => {
                                        const posterUrl = movie.poster 
                                            ? `https://image.tmdb.org/t/p/w500${movie.poster}` 
                                            : "https://via.placeholder.com/500x750?text=No+Image";

                                        return (
                                            <div 
                                                key={idx} 
                                                className="movie-card cursor-pointer group" 
                                                onClick={() => router.push(getDetailUrl(movie))} // ✅ GUNAKAN HELPER
                                            >
                                                <img
                                                    src={posterUrl}
                                                    alt={movie.title}
                                                    className="w-full h-[270px] object-cover"
                                                />
                                                <div className="movie-info">
                                                    <div className="movie-title" title={movie.title}>
                                                        {movie.title}
                                                    </div>
                                                    <div className="text-[11px] text-[#94a3b8] mb-2">
                                                        {movie.director}
                                                    </div>
                                                    <div className="flex items-center gap-1 pt-2 border-t border-[#334155]">
                                                        <span className="text-[10px] text-[#94a3b8] mr-1">Your Rating:</span>
                                                        {[1, 2, 3, 4, 5].map((star) => (
                                                            <Star 
                                                                key={star}
                                                                size={14} 
                                                                className={`${
                                                                    movie.rating >= star 
                                                                    ? "fill-[#facc15] text-[#facc15]" 
                                                                    : "text-[#475569]"
                                                                }`} 
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
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