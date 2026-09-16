import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_TOKEN = process.env.TMDB_TOKEN || "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYjRhZWRjYjAyNTY1NTdkOTIwNDlkMDE5NWI3ZGM4MCIsIm5iZiI6MTc4ODc2NjAxOC4yNiwic3ViIjoiNmE5ZTY3NDI2NDg2YjVkMDBjNGIyMTU3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.j2sLcGSvG_AQCSOQ6OK89jh8Q0_Jedy2f8-IZH6QwD8";

const headers = {
    Authorization: `Bearer ${TMDB_TOKEN}`,
    accept: "application/json"
};

// Mapping Genre ID TMDB ke Nama (untuk scoring)
const GENRE_MAP: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy",
    80: "Crime", 99: "Documentary", 18: "Drama", 10751: "Family",
    14: "Fantasy", 36: "History", 27: "Horror", 10402: "Music",
    9648: "Mystery", 10749: "Romance", 878: "Sci-Fi", 53: "Thriller",
    10752: "War", 37: "Western"
};

function getGenreNames(genreIds: number[] = []): string[] {
    return genreIds.map(id => GENRE_MAP[id]).filter(Boolean);
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  🔍 MOVIE SEARCH API - TMDB + Scoring Priority       ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    try {
        const body = await req.json();
        const {
            keywords = [],
            genres = [],
            likedDirectors = [], // Sebelumnya: likedArtists
            filteredDirectors = [], // Sebelumnya: filteredArtists
            limit = 500,
            excludeMovies = [], // Sebelumnya: excludeSongs
        } = body;

        // 🎯 PRIORITY: Gabungkan semua direktur/keyword prioritas
        const priorityTermsSet = new Set<string>();
        [...likedDirectors, ...filteredDirectors, ...keywords].forEach(term => {
            if (term && typeof term === 'string') {
                priorityTermsSet.add(term.toLowerCase().trim());
            }
        });
        const priorityTerms = Array.from(priorityTermsSet);

        console.log('📥 Input parameters:');
        console.log(`   Keywords:           ${JSON.stringify(keywords)}`);
        console.log(`   Genres:             ${JSON.stringify(genres)}`);
        console.log(`   Priority Terms:     ${priorityTerms.slice(0, 5).join(', ')}${priorityTerms.length > 5 ? '...' : ''}`);
        console.log(`   Limit:              ${limit}`);

        const candidates: any[] = [];
        const seen = new Set<number>(); // Gunakan TMDB ID untuk deduplikasi
        const strategyStats: Record<string, number> = {
            'priority-search': 0,
            'genre-discover': 0,
            'keyword-search': 0,
            'popular-fill': 0,
        };

        const addIfNew = (movie: any, baseScore: number = 0, source: string = '', forcePriority: boolean = false) => {
            if (!movie?.id || seen.has(movie.id)) return;
            
            const isExcluded = excludeMovies.some(
                (ex: any) => ex?.title?.toLowerCase() === movie.title?.toLowerCase()
            );
            if (isExcluded) return;

            seen.add(movie.id);

            // 🎯 SCORING: priorityBonus (300) + baseScore + popularityBonus (0-100)
            const lowerTitle = movie.title?.toLowerCase() || "";
            const lowerOverview = movie.overview?.toLowerCase() || "";
            
            const isPriority = forcePriority || priorityTerms.some(term => 
                lowerTitle.includes(term) || lowerOverview.includes(term)
            );
            
            const priorityBonus = isPriority ? 300 : 0;
            const popBonus = Math.min(100, Math.max(0, movie.popularity || 0));
            const finalScore = priorityBonus + baseScore + popBonus;

            const genreNames = getGenreNames(movie.genre_ids);

            candidates.push({
                movie_id: movie.id.toString(), // ✅ Diubah dari track_id
                title: movie.title,            // ✅ Diubah dari track_name
                year: movie.release_date ? movie.release_date.substring(0, 4) : "Unknown", // ✅ Diubah dari artist_name
                director: "Unknown",           // Placeholder (TMDB basic search tidak mengembalikan director)
                genre: genreNames.join(", "),
                popularity: movie.popularity,
                overview: movie.overview,
                poster_path: movie.poster_path,
                backdrop_path: movie.backdrop_path,
                vote_average: movie.vote_average,
                _score: finalScore,
                _baseScore: baseScore,
                _popBonus: popBonus,
                _priorityBonus: priorityBonus, // ✅ Diubah dari _artistBonus
                _isPriority: isPriority,
                _source: source,
                tmdbId: movie.id
            });
        };

        // ═══════════════════════════════════════════════════════════
        // 🎯 STRATEGY 0: PRIORITY SEARCH (Keywords + Directors)
        // ═══════════════════════════════════════════════════════════
        console.log('\n🎯 [STRATEGY 0] Priority Search');
        if (priorityTerms.length > 0) {
            const query = priorityTerms.slice(0, 3).join(" "); // Max 3 terms untuk query TMDB
            try {
                const url = `${TMDB_API_URL}/search/movie?query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
                const res = await fetch(url, { headers });
                const data = await res.json();
                
                data.results?.slice(0, 50).forEach((m: any) => addIfNew(m, 100, 'priority-search', true));
                strategyStats['priority-search'] = data.results?.length || 0;
                console.log(`   ✅ Priority search "${query}": ${strategyStats['priority-search']} matches`);
            } catch (err: any) {
                console.warn(`   ⚠️ Priority search failed: ${err.message}`);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // STRATEGY 1: GENRE DISCOVER
        // ═══════════════════════════════════════════════════════════
        console.log('\n🎵 [STRATEGY 1] Genre Discover');
        if (genres.length > 0) {
            const genreNameToId: Record<string, number> = {
                "action": 28, "adventure": 12, "animation": 16, "comedy": 35, 
                "crime": 80, "documentary": 99, "drama": 18, "family": 10751,
                "fantasy": 14, "history": 36, "horror": 27, "music": 10402,
                "mystery": 9648, "romance": 10749, "sci-fi": 878, "thriller": 53,
                "war": 10752, "western": 37
            };
            const genreIds = genres.map((g: string) => genreNameToId[g.toLowerCase()]).filter(Boolean).join(",");
            
            if (genreIds) {
                try {
                    const url = `${TMDB_API_URL}/discover/movie?with_genres=${genreIds}&language=en-US&sort_by=popularity.desc&page=1`;
                    const res = await fetch(url, { headers });
                    const data = await res.json();
                    
                    data.results?.slice(0, 100).forEach((m: any) => addIfNew(m, 40, 'genre-discover'));
                    strategyStats['genre-discover'] = data.results?.length || 0;
                    console.log(`   ✅ Genre discover: ${strategyStats['genre-discover']} matches`);
                } catch (err: any) {
                    console.warn(`   ⚠️ Genre discover failed: ${err.message}`);
                }
            }
        }

        // ═══════════════════════════════════════════════════════════
        // STRATEGY 2: KEYWORD SEARCH (Fallback)
        // ═══════════════════════════════════════════════════════════
        console.log('\n🔎 [STRATEGY 2] Keyword Search');
        if (keywords.length > 0 && candidates.length < limit / 2) {
            const query = keywords.join(" ");
            try {
                const url = `${TMDB_API_URL}/search/movie?query=${encodeURIComponent(query)}&language=en-US&include_adult=false&page=1`;
                const res = await fetch(url, { headers });
                const data = await res.json();
                
                data.results?.slice(0, 50).forEach((m: any) => addIfNew(m, 50, 'keyword-search'));
                strategyStats['keyword-search'] = data.results?.length || 0;
                console.log(`   ✅ Keyword search: ${strategyStats['keyword-search']} matches`);
            } catch (err: any) {
                console.warn(`   ⚠️ Keyword search failed: ${err.message}`);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // STRATEGY 3: POPULAR FILL
        // ═══════════════════════════════════════════════════════════
        if (candidates.length < limit / 2) {
            console.log('\n🔥 [STRATEGY 3] Popular Fill');
            try {
                const url = `${TMDB_API_URL}/movie/popular?language=en-US&page=1`;
                const res = await fetch(url, { headers });
                const data = await res.json();
                
                const needed = Math.min(100, limit - candidates.length);
                data.results?.slice(0, needed).forEach((m: any) => addIfNew(m, 5, 'popular-fill'));
                strategyStats['popular-fill'] = data.results?.slice(0, needed).length || 0;
                console.log(`   ✅ Popular fill: ${strategyStats['popular-fill']} matches`);
            } catch (err: any) {
                console.warn(`   ⚠️ Popular fill failed: ${err.message}`);
            }
        }

        // ═══════════════════════════════════════════════════════════
        // 🏆 FINAL SORTING
        // ═══════════════════════════════════════════════════════════
        console.log('\n📊 [FINAL] Sorting by (priorityBonus + base + popularity)...');
        const sorted = candidates.sort((a, b) => {
            const scoreDiff = (b._score || 0) - (a._score || 0);
            if (scoreDiff !== 0) return scoreDiff;
            return (b.popularity || 0) - (a.popularity || 0);
        });
        
        const finalResults = sorted.slice(0, limit).map((c, idx) => ({
            ...c,
            poolIndex: idx,
        }));

        console.log(`\n✅ SEARCH COMPLETE`);
        console.log(`   Total candidates: ${finalResults.length}`);
        console.log(`   Strategy stats:   ${JSON.stringify(strategyStats)}`);
        console.log(`   Latency: ${Date.now() - startTime}ms`);
        console.log('╔══════════════════════════════════════════════════════╗');

        return NextResponse.json({
            movies: finalResults.map(({ _score, _baseScore, _popBonus, _priorityBonus, _isPriority, _source, ...rest }) => rest), // ✅ Diubah dari 'songs'
            stats: {
                total: finalResults.length,
                strategies: strategyStats,
                latencyMs: Date.now() - startTime,
            }
        });

    } catch (err: any) {
        console.error('❌ [SEARCH FATAL]', err);
        return NextResponse.json(
            { error: err.message, movies: [], debug: { message: err.message } }, // ✅ Diubah dari 'songs'
            { status: 500 }
        );
    }
}