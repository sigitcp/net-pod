import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_TOKEN = process.env.TMDB_TOKEN || "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJlYjRhZWRjYjAyNTY1NTdkOTIwNDlkMDE5NWI3ZGM4MCIsIm5iZiI6MTc4ODc2NjAxOC4yNiwic3ViIjoiNmE5ZTY3NDI2NDg2YjVkMDBjNGIyMTU3Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.j2sLcGSvG_AQCSOQ6OK89jh8Q0_Jedy2f8-IZH6QwD8";

const headers = {
    Authorization: `Bearer ${TMDB_TOKEN}`,
    accept: "application/json"
};

interface MovieInput {
    title: string;
    artist: string; // Di konteks film, ini bisa berupa tahun atau direktur dari output LLM
}

interface MovieResult {
    originalTitle: string;
    originalArtist: string;
    found: boolean;
    matchedTitle?: string;
    matchedArtist?: string; 
    genre?: string;
    popularity?: number;
    matchMethod?: 'exact' | 'fuzzy' | 'director-match' | 'none';
    confidence?: 'high' | 'medium' | 'low' | 'none';
    tmdbId?: number;
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║  ✅ MOVIE VALIDATION API - Anti-Hallucination (TMDB) ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    try {
        const { movies }: { movies: MovieInput[] } = await req.json();
        console.log(`📥 Validating ${movies.length} movies from LLM picks`);
        movies.forEach((m, i) => console.log(`   ${i + 1}. "${m.title}" (Context: ${m.artist})`));

        if (!Array.isArray(movies)) {
            return NextResponse.json({ error: 'movies must be an array' }, { status: 400 });
        }

        const results: MovieResult[] = [];

        for (const item of movies) {
            const { title, artist } = item; 
            console.log(`\n🔍 Validating: "${title}" (Context: ${artist})`);

            try {
                // ═══════════════════════════════════════════
                // Strategy 1: TMDB Search by Title
                // ═══════════════════════════════════════════
                const searchUrl = `${TMDB_API_URL}/search/movie?query=${encodeURIComponent(title)}&language=id-ID&include_adult=false&page=1`;
                const searchRes = await fetch(searchUrl, { headers });
                const searchData = await searchRes.json();

                if (searchData.results && searchData.results.length > 0) {
                    const topMatch = searchData.results[0];
                    const matchYear = topMatch.release_date ? topMatch.release_date.substring(0, 4) : "";
                    
                    // Cek apakah "artist" (yang mungkin berisi tahun) cocok
                    const isYearMatch = artist && matchYear && artist.includes(matchYear);
                    const titleSimilarity = topMatch.title.toLowerCase() === title.toLowerCase();

                    if (titleSimilarity && isYearMatch) {
                        console.log(`   ✅ EXACT MATCH → "${topMatch.title}" (${matchYear})`);
                        results.push({
                            originalTitle: title,
                            originalArtist: artist,
                            found: true,
                            matchedTitle: topMatch.title,
                            matchedArtist: matchYear,
                            genre: "Movie", 
                            popularity: topMatch.popularity,
                            matchMethod: 'exact',
                            confidence: 'high',
                            tmdbId: topMatch.id
                        });
                        continue;
                    } else if (titleSimilarity || topMatch.title.toLowerCase().includes(title.toLowerCase())) {
                        console.log(`   ✅ FUZZY MATCH → "${topMatch.title}" (${matchYear})`);
                        results.push({
                            originalTitle: title,
                            originalArtist: artist,
                            found: true,
                            matchedTitle: topMatch.title,
                            matchedArtist: matchYear,
                            popularity: topMatch.popularity,
                            matchMethod: 'fuzzy',
                            confidence: 'medium',
                            tmdbId: topMatch.id
                        });
                        continue;
                    }
                }

                // ═══════════════════════════════════════════
                // Strategy 2: Hallucination Detected
                // ═══════════════════════════════════════════
                console.log(`   ❌ NOT FOUND (Hallucination detected)`);
                results.push({
                    originalTitle: title,
                    originalArtist: artist,
                    found: false,
                    confidence: 'none',
                    matchMethod: 'none'
                });

            } catch (err: any) {
                console.error(`   ⚠️ Validation failed for "${title}": ${err.message}`);
                results.push({
                    originalTitle: title,
                    originalArtist: artist,
                    found: false,
                    confidence: 'none',
                    matchMethod: 'none'
                });
            }
        }

        const foundCount = results.filter(r => r.found).length;
        const hallucinatedCount = results.filter(r => !r.found).length;
        const highConf = results.filter(r => r.confidence === 'high').length;
        const medConf = results.filter(r => r.confidence === 'medium').length;

        console.log(`\n✅ VALIDATION COMPLETE`);
        console.log(`   Found:        ${foundCount}/${results.length}`);
        console.log(`   Hallucinated: ${hallucinatedCount}/${results.length}`);
        console.log(`   Confidence:   high=${highConf}, medium=${medConf}`);
        console.log(`   Latency:      ${Date.now() - startTime}ms`);
        console.log('╔══════════════════════════════════════════════════════╗');

        return NextResponse.json({ 
            results,
            stats: {
                total: results.length,
                found: foundCount,
                hallucinated: hallucinatedCount,
                confidenceBreakdown: { high: highConf, medium: medConf, low: 0 },
                latencyMs: Date.now() - startTime,
            }
        });

    } catch (err: any) {
        console.error('❌ [VALIDATION FATAL]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}