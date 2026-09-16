import { 
    SearchSession, 
    RecommendationRecord, 
    MovieInteraction,
    RecommendationMovie 
} from "../solid-storage";

// ═══════════════════════════════════════════════════════════════════
// 🎯 TYPE DEFINITIONS (MOVIE CONTEXT)
// ═══════════════════════════════════════════════════════════════════

export type ScoreMap = Record<string, number>;

export interface ScoredMovie {
    movie: RecommendationMovie;
    recommendationId: string;
    score: number;
    reasons: string[];
    behaviorScore: number;
    assignedGenre: string;
}

export interface DashboardInsights {
    topGenres: Array<{ name: string; score: number; slot: number }>;
    topDirectors: Array<{ name: string; score: number }>;
    topMovies: ScoredMovie[];
    totalSessions: number;
    totalInteractions: number;
    genreSource: ScoreMap;
    directorSource: ScoreMap;
    allocationBreakdown: Array<{ genre: string; picked: number; target: number }>;
}

// ═══════════════════════════════════════════════════════════════════
// ⚙️ SCORING WEIGHTS (MOVIE INTERACTIONS)
// ═══════════════════════════════════════════════════════════════════

const WEIGHTS = {
    sessionGenre: 1,
    sessionDirector: 1,
    sessionRecommendation: 1,
    view_details: 1,
    play_teaser: 2,
    rate_positive: 3,
    rate_negative: -2,
    select: 5, // User explicitly selected for dashboard (Highest priority)
};

const MAX_MOVIES_PER_DIRECTOR = 2;
const GENERAL_BUCKET = '__general__';

// ═══════════════════════════════════════════════════════════════════
// 📊 (1) SEARCH SESSION STATISTICS
// ═══════════════════════════════════════════════════════════════════

function analyzeSessions(sessions: SearchSession[], recommendations: RecommendationRecord[]) {
    const genreScores: ScoreMap = {};
    const directorScores: ScoreMap = {};
    const movieScores: ScoreMap = {};
    
    for (const session of sessions) {
        for (const genre of session.correctedGenres || session.originalGenres || []) {
            const g = genre.toLowerCase().trim();
            if (g) genreScores[g] = (genreScores[g] || 0) + WEIGHTS.sessionGenre;
        }
        
        const recList = recommendations.find(
            r => r.sessionId === session.sessionId || r.recommendationUrl === session.recommendationUrl
        );
        
        if (recList) {
            const directorCount: ScoreMap = {};
            for (const movie of recList.movies) {
                const d = movie.director.toLowerCase().trim();
                directorCount[d] = (directorCount[d] || 0) + 1;
            }
            for (const [director, count] of Object.entries(directorCount)) {
                if (director && director !== 'unknown') {
                    directorScores[director] = (directorScores[director] || 0) + (WEIGHTS.sessionDirector * count);
                }
            }
            
            for (const movie of recList.movies) {
                const key = `${movie.title.toLowerCase()}||${movie.director.toLowerCase()}`;
                movieScores[key] = (movieScores[key] || 0) + WEIGHTS.sessionRecommendation;
            }
        }
    }
    
    return { genreScores, directorScores, movieScores };
}

// ═══════════════════════════════════════════════════════════════════
// ❤️ (2) BEHAVIOR ANALYSIS (RATING & ENGAGEMENT BASED)
// ═══════════════════════════════════════════════════════════════════

function analyzeBehavior(interactions: MovieInteraction[], recommendations: RecommendationRecord[]) {
    const genreScores: ScoreMap = {};
    const directorScores: ScoreMap = {};
    const movieScores: ScoreMap = {};
    
    const movieLookup = new Map<string, { title: string; director: string; genre?: string }>();
    for (const recList of recommendations) {
        for (const movie of recList.movies) {
            movieLookup.set(movie.movieUrl, {
                title: movie.title,
                director: movie.director,
                genre: (movie as any).genre,
            });
        }
    }
    
    for (const interaction of interactions) {
        let actionScore = 0;
        
        if (interaction.action === 'view_details') {
            actionScore = WEIGHTS.view_details;
        } else if (interaction.action === 'play_teaser') {
            actionScore = WEIGHTS.play_teaser;
        } else if (interaction.action === 'rate' && interaction.ratingValue !== undefined) {
            if (interaction.ratingValue >= 4) actionScore = WEIGHTS.rate_positive;
            else if (interaction.ratingValue <= 2) actionScore = WEIGHTS.rate_negative;
        } else if (interaction.action === 'select') {
            actionScore = WEIGHTS.select;
        }
        
        if (actionScore === 0) continue;
        
        const movieInfo = movieLookup.get(interaction.movieRef) || {
            title: interaction.resolvedTitle || 'Unknown',
            director: interaction.resolvedDirector || 'Unknown',
        };
        
        const director = movieInfo.director.toLowerCase().trim();
        if (director && director !== 'unknown') {
            directorScores[director] = (directorScores[director] || 0) + actionScore;
        }
        
        if (interaction.movieRef) {
            movieScores[interaction.movieRef] = (movieScores[interaction.movieRef] || 0) + actionScore;
        }
        
        if (movieInfo.genre) {
            const g = movieInfo.genre.toLowerCase().trim();
            genreScores[g] = (genreScores[g] || 0) + actionScore;
        }
    }
    
    return { genreScores, directorScores, movieScores };
}

// ═══════════════════════════════════════════════════════════════════
// 🎯 HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function seededShuffle<T>(arr: T[], seed: number): T[] {
    const a = [...arr];
    let s = (seed + 1) >>> 0;
    for (let i = a.length - 1; i > 0; i--) {
        s = Math.imul(s, 1664525) + 1013904223 >>> 0;
        const j = s % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function mergeScores(a: ScoreMap, b: ScoreMap): ScoreMap {
    const merged = { ...a };
    for (const [key, val] of Object.entries(b)) {
        merged[key] = (merged[key] || 0) + val;
    }
    return merged;
}

function rankScores(map: ScoreMap): Array<{ name: string; score: number }> {
    return Object.entries(map)
        .map(([name, score]) => ({ name, score }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);
}

function allocateGenreSlots(
    topGenres: Array<{ name: string; score: number }>, 
    limit: number
): Map<string, number> {
    const slots = new Map<string, number>();
    const totalScore = topGenres.reduce((sum, g) => sum + Math.max(g.score, 0), 0);
    
    if (totalScore === 0 || topGenres.length === 0) return slots;
    
    const exactSlots = topGenres.map(g => ({ genre: g.name, exact: (g.score / totalScore) * limit }));
    
    let allocated = 0;
    const fractional: Array<{ genre: string; frac: number }> = [];
    
    for (const slot of exactSlots) {
        const rounded = Math.floor(slot.exact);
        slots.set(slot.genre, rounded);
        allocated += rounded;
        fractional.push({ genre: slot.genre, frac: slot.exact - rounded });
    }
    
    let remaining = limit - allocated;
    fractional.sort((a, b) => b.frac - a.frac);
    
    for (const item of fractional) {
        if (remaining <= 0) break;
        slots.set(item.genre, (slots.get(item.genre) || 0) + 1);
        remaining--;
    }
    
    return slots;
}

function pickWithDirectorDiversity(
    pool: ScoredMovie[],
    count: number,
    directorCounts: Map<string, number>,
    maxPerDirector: number = MAX_MOVIES_PER_DIRECTOR
): { picked: ScoredMovie[]; remaining: ScoredMovie[] } {
    const picked: ScoredMovie[] = [];
    const remaining: ScoredMovie[] = [];
    
    for (const movie of pool) {
        const director = movie.movie.director.toLowerCase().trim();
        const currentCount = directorCounts.get(director) || 0;
        
        if (picked.length < count && currentCount < maxPerDirector) {
            picked.push(movie);
            directorCounts.set(director, currentCount + 1);
        } else {
            remaining.push(movie);
        }
    }
    
    return { picked, remaining };
}

function assignGenreToMovie(movie: RecommendationMovie, sessionGenreLookup: Map<string, string>): string {
    const metaGenre = (movie as any).genre;
    if (metaGenre && typeof metaGenre === 'string') {
        const g = metaGenre.toLowerCase().trim();
        if (g) return g;
    }
    const fromSession = sessionGenreLookup.get(movie.movieUrl);
    if (fromSession) return fromSession;
    return GENERAL_BUCKET;
}

// ═══════════════════════════════════════════════════════════════════
// 🎯 MAIN ALGORITHM (DIPERBAIKI: GARANSI FILM TERPILIH MUNCUL)
// ═══════════════════════════════════════════════════════════════════

export function generateSmartRecommendations(
    sessions: SearchSession[],
    recommendations: RecommendationRecord[],
    interactions: MovieInteraction[],
    limit: number = 5,
    shuffleSeed: number = 0
): DashboardInsights {
    
    const sessionStats = analyzeSessions(sessions, recommendations);
    const behaviorStats = analyzeBehavior(interactions, recommendations);
    
    const finalGenres = mergeScores(sessionStats.genreScores, behaviorStats.genreScores);
    const finalDirectors = mergeScores(sessionStats.directorScores, behaviorStats.directorScores);
    
    const topGenres = rankScores(finalGenres);
    const topDirectors = rankScores(finalDirectors);
    
    // ✅ 1. Identifikasi film yang secara eksplisit di-"Select" oleh user
    const selectedMovieUrls = new Set<string>();
    interactions.forEach(i => {
        if (i.action === 'select' && i.movieRef) {
            selectedMovieUrls.add(i.movieRef);
        }
    });

    const movieToSessionGenre = new Map<string, string>();
    for (const session of sessions) {
        const recList = recommendations.find(
            r => r.sessionId === session.sessionId || r.recommendationUrl === session.recommendationUrl
        );
        if (!recList) continue;
        
        const sessionGenre = (session.correctedGenres?.[0] || session.originalGenres?.[0] || '').toLowerCase().trim();
        if (!sessionGenre) continue;
        
        for (const movie of recList.movies) {
            if (!movieToSessionGenre.has(movie.movieUrl)) {
                movieToSessionGenre.set(movie.movieUrl, sessionGenre);
            }
        }
    }
    
    const allMovies: ScoredMovie[] = [];
    const selectedMovies: ScoredMovie[] = []; // ✅ Pisahkan film yang dipilih user
    
    for (const recList of recommendations) {
        for (const movie of recList.movies) {
            const key = `${movie.title.toLowerCase()}||${movie.director.toLowerCase()}`;
            
            const sessionScore = sessionStats.movieScores[key] || 0;
            const behaviorScore = behaviorStats.movieScores[movie.movieUrl] || 0;
            const totalScore = sessionScore + behaviorScore;
            
            const assignedGenre = assignGenreToMovie(movie, movieToSessionGenre);
            const reasons: string[] = [];
            
            if (behaviorScore >= WEIGHTS.select) {
                reasons.push("You selected this for your dashboard");
            } else if (behaviorScore >= WEIGHTS.rate_positive) {
                reasons.push("You rated this highly");
            } else if (behaviorScore >= WEIGHTS.play_teaser) {
                reasons.push("You watched the teaser");
            } else if (behaviorScore >= WEIGHTS.view_details) {
                reasons.push("You viewed the details");
            }
            
            const director = movie.director.toLowerCase().trim();
            const directorInteractionCount = finalDirectors[director] || 0;
            if (directorInteractionCount >= 2 && reasons.length === 0) {
                reasons.push(`You like director ${movie.director}`);
            }
            
            if (assignedGenre !== GENERAL_BUCKET && reasons.length === 0) {
                reasons.push(`Based on your ${assignedGenre} taste`);
            }
            
            if (sessionScore > 0 && reasons.length === 0) {
                reasons.push("From your search history");
            }
            
            if (reasons.length === 0) {
                reasons.push("Recommended for you");
            }
            
            const scoredMovie = {
                movie,
                recommendationId: recList.recordId,
                score: totalScore,
                reasons,
                behaviorScore,
                assignedGenre,
            };

            // ✅ Masukkan ke array yang sesuai
            if (selectedMovieUrls.has(movie.movieUrl)) {
                selectedMovies.push(scoredMovie);
            } else {
                allMovies.push(scoredMovie);
            }
        }
    }
    
    // ✅ 2. Urutkan film pilihan user berdasarkan skor (tertinggi di atas)
    selectedMovies.sort((a, b) => b.score - a.score);
    
    // ✅ 3. Urutkan kandidat reguler
    const candidates = seededShuffle(
        allMovies.filter(m => m.score >= 0),
        shuffleSeed
    ).sort((a, b) => b.score - a.score);
    
    const picked: ScoredMovie[] = [];
    const directorCounts = new Map<string, number>();
    const allocationBreakdown: Array<{ genre: string; picked: number; target: number }> = [];
    
    // ✅ 4. GARANSI: Masukkan SEMUA film yang dipilih user ke urutan paling atas
    // (Membypass batasan MAX_MOVIES_PER_DIRECTOR untuk pilihan eksplisit user)
    for (const m of selectedMovies) {
        picked.push(m);
        const director = m.movie.director.toLowerCase().trim();
        directorCounts.set(director, (directorCounts.get(director) || 0) + 1);
    }
    
    // ✅ 5. Isi sisa slot limit dengan rekomendasi algoritma
    const remainingLimit = Math.max(0, limit - picked.length);
    const genreSlots = allocateGenreSlots(topGenres, remainingLimit);
    
    const orderedGenres = [...topGenres]
        .filter(g => genreSlots.has(g.name))
        .sort((a, b) => b.score - a.score);
    
    const usedMovies = new Set<string>();
    selectedMovies.forEach(m => usedMovies.add(m.movie.movieUrl)); // Tandai film pilihan agar tidak diproses ulang
    
    for (const { name: genre } of orderedGenres) {
        const target = genreSlots.get(genre) || 0;
        if (target === 0) continue;
        
        const genrePool = candidates.filter(m => 
            m.assignedGenre === genre && !usedMovies.has(m.movie.movieUrl)
        );
        
        const { picked: genrePicked } = pickWithDirectorDiversity(genrePool, target, directorCounts);
        
        for (const m of genrePicked) {
            picked.push(m);
            usedMovies.add(m.movie.movieUrl);
        }
        
        allocationBreakdown.push({ genre, picked: genrePicked.length, target });
    }
    
    // ✅ 6. Backfill jika masih ada sisa slot
    if (picked.length < limit) {
        const remaining = candidates.filter(m => !usedMovies.has(m.movie.movieUrl));
        const { picked: extra } = pickWithDirectorDiversity(remaining, limit - picked.length, directorCounts);
        picked.push(...extra);
        
        const generalEntry = allocationBreakdown.find(b => b.genre === GENERAL_BUCKET);
        if (generalEntry) {
            generalEntry.picked += extra.length;
        } else if (extra.length > 0) {
            allocationBreakdown.push({ genre: 'other', picked: extra.length, target: extra.length });
        }
    }
    
    // Hitung slot genre untuk UI (berdasarkan limit penuh)
    const fullGenreSlots = allocateGenreSlots(topGenres, limit);
    const topGenresWithSlots = topGenres.slice(0, 5).map(g => ({
        name: g.name,
        score: g.score,
        slot: fullGenreSlots.get(g.name) || 0,
    }));
    
    return {
        topGenres: topGenresWithSlots,
        topDirectors: topDirectors.slice(0, 5),
        topMovies: picked, // ✅ Kembalikan array yang sudah diurutkan (Pilihan User di atas, lalu rekomendasi)
        totalSessions: sessions.length,
        totalInteractions: interactions.length,
        genreSource: finalGenres,
        directorSource: finalDirectors,
        allocationBreakdown,
    };
}