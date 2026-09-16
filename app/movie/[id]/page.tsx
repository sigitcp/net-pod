"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Star, Users, Calendar, Clock, AlertCircle, Play } from "lucide-react";

// TMDB Configuration
const API_URL = "https://api.themoviedb.org/3";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYjRhZWRjYjAyNTY1NTdkOTIwNDlkMDE5NWI3ZGM4MCIsIm5iZiI6MTc4ODc2NjAxOC4yNiwic3ViIjoiNmE5ZTY3NDI2NDg2YjVkMDBjNGIyMTU3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.j2sLcGSvG_AQCSOQ6OK89jh8Q0_Jedy2f8-IZH6QwD8";

const headers = {
    Authorization: `Bearer ${TOKEN}`,
    accept: "application/json",
};

export default function MovieDetailPage() {
    const router = useRouter();
    const params = useParams();
    const movieId = params?.id as string;

    const [movie, setMovie] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!movieId) {
            setError("Movie ID not found.");
            setLoading(false);
            return;
        }
        loadDetail(movieId);
    }, [movieId]);

    const loadDetail = async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            // Fetch data in parallel for better performance
            const [movieRes, creditsRes, videosRes, recommendationsRes] = await Promise.all([
                fetch(`${API_URL}/movie/${id}?language=en-US`, { headers }).then(res => res.json()),
                fetch(`${API_URL}/movie/${id}/credits?language=en-US`, { headers }).then(res => res.json()).catch(() => ({ cast: [], crew: [] })),
                fetch(`${API_URL}/movie/${id}/videos?language=en-US`, { headers }).then(res => res.json()).catch(() => ({ results: [] })),
                fetch(`${API_URL}/movie/${id}/recommendations?language=en-US&page=1`, { headers }).then(res => res.json()).catch(() => ({ results: [] }))
            ]);

            if (movieRes.status_code === 401 || movieRes.status_code === 7) {
                throw new Error("Invalid TMDB token or movie ID not found.");
            }

            setMovie({
                ...movieRes,
                credits: creditsRes,
                videos: videosRes,
                recommendations: recommendationsRes.results || []
            });
        } catch (err: any) {
            console.error("Failed to fetch movie details:", err);
            setError(err.message || "Failed to fetch movie details.");
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        if (!amount || amount <= 0) return "Not available";
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0f172a] flex items-center justify-center text-[#94a3b8]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ef4444] mx-auto mb-4"></div>
                    <p>🎬 Loading movie details...</p>
                </div>
            </div>
        );
    }

    if (error || !movie) {
        return (
            <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
                <div className="bg-[#1e293b] border border-[#334155] rounded-xl p-8 text-center max-w-md">
                    <AlertCircle className="mx-auto text-[#ef4444] mb-4" size={48} />
                    <h2 className="text-xl font-bold text-white mb-2">An Error Occurred</h2>
                    <p className="text-[#94a3b8] mb-6">{error || "Movie data not found."}</p>
                    <button 
                        onClick={() => router.push('/')} 
                        className="px-6 py-2.5 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg font-semibold transition-colors flex items-center gap-2 mx-auto"
                    >
                        <ArrowLeft size={18} /> Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // --- Data Processing ---
    const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : "https://via.placeholder.com/500x750?text=No+Image";
    const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : "";
    
    const year = movie.release_date ? movie.release_date.substring(0, 4) : "-";
    const rating = movie.vote_average != null ? Number(movie.vote_average).toFixed(1) : "0.0";
    const voteCount = movie.vote_count != null ? movie.vote_count.toLocaleString("en-US") : "0";
    const runtime = movie.runtime ? `${movie.runtime} min` : "-";
    
    // ✅ Fixed typo: slice(0, 10) instead of slice(0PV, 10)
    const directors = movie.credits?.crew?.filter((p: any) => p.job === "Director") || [];
    const writers = movie.credits?.crew?.filter((p: any) => p.department === "Writing") || [];
    const mainCast = movie.credits?.cast?.slice(0, 10) || [];
    
    const trailer = movie.videos?.results?.find((v: any) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"));

    return (
        <div 
            id="detailPage" 
            className="min-h-screen bg-[#0f172a] text-white"
            style={backdrop ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.92), rgba(15,23,42,0.98)), url("${backdrop}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' } : {}}
        >
            <div className="detail-container px-4 md:px-8 py-8">
                {/* ✅ BACK TO DASHBOARD BUTTON */}
                <button 
                    className="flex items-center gap-2 mb-8 text-[#cbd5e1] hover:text-white hover:bg-[#334155] px-4 py-2 rounded-lg transition-colors w-fit" 
                    onClick={() => router.push('/')}
                >
                    <ArrowLeft size={18} /> Back to Dashboard
                </button>

                {/* DETAIL CONTENT */}
                <div id="detailContent" className="max-w-[1300px] mx-auto">
                    
                    {/* 1. MAIN DETAILS */}
                    <div className="detail-main grid grid-cols-1 md:grid-cols-[300px_1fr] gap-8 md:gap-12">
                        <div>
                            <img className="detail-poster w-full rounded-xl shadow-2xl border border-[#334155]" src={poster} alt={movie.title} />
                        </div>

                        <div className="detail-content flex flex-col justify-center">
                            <h1 className="text-4xl md:text-5xl font-bold mb-3 leading-tight">{movie.title}</h1>
                            
                            {movie.tagline && (
                                <div className="tagline text-lg text-[#94a3b8] italic mb-5">"{movie.tagline}"</div>
                            )}

                            <div className="detail-meta flex flex-wrap gap-3 mb-6">
                                <div className="meta-item meta-rating flex items-center gap-1.5 px-3 py-1.5 bg-[#1e293b] rounded-lg border border-[#334155]">
                                    <Star size={16} className="fill-[#facc15] text-[#facc15]" /> {rating}
                                </div>
                                <div className="meta-item flex items-center gap-1.5 px-3 py-1.5 bg-[#1e293b] rounded-lg border border-[#334155]">
                                    <Users size={16} /> {voteCount} votes
                                </div>
                                <div className="meta-item flex items-center gap-1.5 px-3 py-1.5 bg-[#1e293b] rounded-lg border border-[#334155]">
                                    <Calendar size={16} /> {year}
                                </div>
                                <div className="meta-item flex items-center gap-1.5 px-3 py-1.5 bg-[#1e293b] rounded-lg border border-[#334155]">
                                    <Clock size={16} /> {runtime}
                                </div>
                                <div className="meta-item px-3 py-1.5 bg-[#1e293b] rounded-lg border border-[#334155]">
                                    {movie.status || "Unknown"}
                                </div>
                            </div>

                            <div className="genres flex flex-wrap gap-2 mb-6">
                                {movie.genres?.length > 0 ? (
                                    movie.genres.map((genre: any) => (
                                        <span key={genre.id} className="genre px-3 py-1.5 bg-[#334155] text-[#cbd5e1] rounded-full text-sm border border-[#475569]">
                                            {genre.name}
                                        </span>
                                    ))
                                ) : (
                                    <span className="text-[#94a3b8]">No genres listed</span>
                                )}
                            </div>

                            <p className="detail-description text-[#cbd5e1] text-base leading-relaxed mb-8 max-w-3xl">
                                {movie.overview || "No synopsis available."}
                            </p>

                            {trailer && (
                                <a 
                                    className="watch-button inline-flex items-center gap-2 px-6 py-3 bg-[#ef4444] hover:bg-[#dc2626] text-white rounded-lg font-bold transition-colors w-fit shadow-lg shadow-[#ef4444]/20"
                                    href={`https://www.youtube.com/watch?v=${trailer.key}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Play size={18} fill="white" /> Watch Trailer on YouTube
                                </a>
                            )}
                        </div>
                    </div>

                    {/* 2. MOVIE INFO GRID */}
                    <div className="detail-section mt-16">
                        <h2 className="text-2xl font-bold mb-6 border-l-4 border-[#ef4444] pl-3">📋 Movie Information</h2>
                        <div className="info-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <InfoBox label="Original Title" value={movie.original_title || "-"} />
                            <InfoBox label="Original Language" value={movie.original_language?.toUpperCase() || "-"} />
                            <InfoBox label="Budget" value={formatCurrency(movie.budget)} />
                            <InfoBox label="Revenue" value={formatCurrency(movie.revenue)} />
                            <InfoBox label="Production Countries" value={movie.production_countries?.map((c: any) => c.name).join(", ") || "-"} />
                            <InfoBox label="Production Companies" value={movie.production_companies?.map((c: any) => c.name).join(", ") || "-"} />
                        </div>
                    </div>

                    {/* 3. DIRECTOR & WRITERS */}
                    <div className="detail-section mt-16 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <h2 className="text-2xl font-bold mb-6 border-l-4 border-[#ef4444] pl-3">🎥 Director(s)</h2>
                            <div className="crew-list flex flex-wrap gap-3">
                                {directors.length > 0 ? directors.map((p: any) => (
                                    <div key={p.id} className="crew-item px-4 py-3 bg-[#1e293b] border border-[#334155] rounded-lg">
                                        <strong className="text-white block">{p.name}</strong>
                                        <div className="crew-role text-[#94a3b8] text-xs mt-1">Director</div>
                                    </div>
                                )) : <div className="crew-item px-4 py-3 bg-[#1e293b] border border-[#334155] rounded-lg text-[#94a3b8]">Not available</div>}
                            </div>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold mb-6 border-l-4 border-[#ef4444] pl-3">✍️ Writer(s)</h2>
                            <div className="crew-list flex flex-wrap gap-3">
                                {writers.slice(0, 5).length > 0 ? writers.slice(0, 5).map((p: any) => (
                                    <div key={p.id} className="crew-item px-4 py-3 bg-[#1e293b] border border-[#334155] rounded-lg">
                                        <strong className="text-white block">{p.name}</strong>
                                        <div className="crew-role text-[#94a3b8] text-xs mt-1">{p.job || "Writer"}</div>
                                    </div>
                                )) : <div className="crew-item px-4 py-3 bg-[#1e293b] border border-[#334155] rounded-lg text-[#94a3b8]">Not available</div>}
                            </div>
                        </div>
                    </div>

                    {/* 4. TOP CAST */}
                    {mainCast.length > 0 && (
                        <div className="detail-section mt-16">
                            <h2 className="text-2xl font-bold mb-6 border-l-4 border-[#ef4444] pl-3">🎭 Top Cast</h2>
                            <div className="cast-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                                {mainCast.map((actor: any) => {
                                    const actorImage = actor.profile_path 
                                        ? `https://image.tmdb.org/t/p/w300${actor.profile_path}` 
                                        : "https://via.placeholder.com/300x450?text=No+Photo";
                                    return (
                                        <div key={actor.id} className="cast-card bg-[#1e293b] rounded-xl overflow-hidden border border-[#334155] hover:border-[#ef4444] transition-colors group">
                                            <img src={actorImage} alt={actor.name} className="w-full h-[220px] object-cover group-hover:scale-105 transition-transform duration-300" />
                                            <div className="cast-info p-3">
                                                <div className="cast-name font-bold text-sm text-white mb-1 truncate">{actor.name}</div>
                                                <div className="cast-character text-[#94a3b8] text-xs leading-tight truncate">{actor.character || "-"}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 5. TRAILER EMBED */}
                    {trailer && (
                        <div className="detail-section mt-16">
                            <h2 className="text-2xl font-bold mb-6 border-l-4 border-[#ef4444] pl-3">🎬 Official Trailer</h2>
                            <div className="trailer-container relative w-full max-w-4xl mx-auto aspect-video rounded-xl overflow-hidden shadow-2xl border border-[#334155]">
                                <iframe
                                    src={`https://www.youtube.com/embed/${trailer.key}`}
                                    title={trailer.name}
                                    className="w-full h-full border-none"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                    allowFullScreen
                                />
                            </div>
                        </div>
                    )}

                    {/* 6. RECOMMENDATIONS */}
                    {movie.recommendations && movie.recommendations.length > 0 && (
                        <div className="detail-section mt-16 mb-10">
                            <h2 className="text-2xl font-bold mb-6 border-l-4 border-[#ef4444] pl-3">✨ Recommended For You</h2>
                            <div className="movie-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                                {movie.recommendations.slice(0, 5).map((rec: any) => {
                                    const recPoster = rec.poster_path ? `https://image.tmdb.org/t/p/w300${rec.poster_path}` : "https://via.placeholder.com/300x450?text=No+Image";
                                    const recYear = rec.release_date ? rec.release_date.substring(0, 4) : "-";
                                    const recRating = rec.vote_average != null ? Number(rec.vote_average).toFixed(1) : "0.0";
                                    
                                    return (
                                        <div 
                                            key={rec.id} 
                                            className="movie-card cursor-pointer"
                                            onClick={() => router.push(`/movie/${rec.id}`)}
                                        >
                                            <img src={recPoster} alt={rec.title} className="w-full h-[270px] object-cover" />
                                            <div className="movie-info">
                                                <div className="movie-title" title={rec.title}>{rec.title}</div>
                                                <div className="movie-meta">
                                                    <span>{recYear}</span>
                                                    <span className="rating">⭐ {recRating}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {/* ✅ Fixed syntax error: removed the stray '0}' that was here */}
                            </div>
                        </div>
                    )}

                </div>

                {/* FOOTER */}
                <footer className="text-center py-10 mt-16 border-t border-[#1e293b] text-[#64748b] text-sm leading-relaxed">
                    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                    <p>Data and images provided by The Movie Database (TMDB).</p>
                </footer>
            </div>
        </div>
    );
}

// Helper Component for Info Box
function InfoBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="info-box p-5 bg-[#1e293b]/80 rounded-xl border border-[#334155] hover:border-[#ef4444]/50 transition-colors">
            <div className="info-label text-[#94a3b8] text-xs mb-2 uppercase tracking-wider font-semibold">{label}</div>
            <div className="info-value text-white font-semibold leading-snug">{value}</div>
        </div>
    );
}