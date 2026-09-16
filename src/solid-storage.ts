import {
    getSolidDataset, saveSolidDatasetAt, createSolidDataset, setThing,
    buildThing, createThing, getThingAll, getThing, getStringNoLocale,
    getStringNoLocaleAll, getUrl, getUrlAll, getInteger, getDatetime, addDatetime, addStringNoLocale, addUrl, addInteger, setInteger
} from '@inrupt/solid-client';
import { v4 as uuidv4 } from 'uuid';

const SCHEMA = "https://schema.org/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

export const POD_FILES = {
    SETTINGS: 'settings.ttl',
    SEEDS: 'seeds.ttl',
    SESSIONS: 'sessions.ttl',
    RECOMMENDATIONS: 'recommendations.ttl',
    BEHAVIOR: 'behavior.ttl'
};

// ═══════════════════════════════════════════════════════════════════
// 🛡️ UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

const normalizeStorageRoot = (storageRoot: string): string => {
    if (!storageRoot) return '';
    return storageRoot.endsWith('/') ? storageRoot : `${storageRoot}/`;
};

const getFileUrl = (storageRoot: string, fileName: string): string => {
    const root = normalizeStorageRoot(storageRoot);
    return `${root}public/movie-rec-data/${fileName}`;
};

const isNotFoundError = (e: any): boolean => {
    if (!e) return false;
    const status = e.statusCode || e.status || e.response?.status;
    const message = (e.message || '').toLowerCase();
    return (
        status === 404 || status === 403 ||
        message.includes('404') || message.includes('403') ||
        message.includes('not found') || message.includes('forbidden')
    );
};

const makeSafeId = (input: string): string => {
    if (!input) return 'unknown';
    return input
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 80) || 'unknown';
};

const normalizeForMatch = (s: string): string => {
    if (!s) return '';
    return s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

const movieFingerprint = (title: string, director: string, year?: string): string => {
    const combined = `${normalizeForMatch(title)}|${normalizeForMatch(director)}|${year || ''}`;
    let hash = 5381;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) + hash) + combined.charCodeAt(i);
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
};

// ═══════════════════════════════════════════════════════════════════
// 🎯 DEDUPLICATION HELPERS (MOVIE SCHEMA)
// ═══════════════════════════════════════════════════════════════════

const findExistingMovie = (dataset: any, title: string, director: string, year?: string): string | null => {
    const targetTitle = normalizeForMatch(title);
    const targetDirector = normalizeForMatch(director);
    const targetYear = year ? normalizeForMatch(year) : '';

    for (const thing of getThingAll(dataset)) {
        const types = getUrlAll(thing, RDF_TYPE) || [];
        if (!types.includes(`${SCHEMA}Movie`)) continue;

        const name = getStringNoLocale(thing, `${SCHEMA}name`) || '';
        if (normalizeForMatch(name) !== targetTitle) continue;

        const directorUrl = getUrl(thing, `${SCHEMA}director`);
        if (!directorUrl) continue;

        const directorThing = getThing(dataset, directorUrl);
        const directorName = directorThing
            ? getStringNoLocale(directorThing, `${SCHEMA}name`) || ''
            : '';
        
        if (normalizeForMatch(directorName) !== targetDirector) continue;

        if (targetYear) {
            const datePublished = getStringNoLocale(thing, `${SCHEMA}datePublished`) || '';
            if (datePublished.includes(targetYear) || datePublished === targetYear) {
                return thing.url;
            }
        } else {
            return thing.url;
        }
    }
    return null;
};

const ensurePerson = (dataset: any, fileUrl: string, personName: string, role: 'Person' | 'Organization' = 'Person'): { dataset: any; personUrl: string } => {
    const personId = makeSafeId(personName);
    const personUrl = `${fileUrl}#${role.toLowerCase()}-${personId}`;

    if (!getThing(dataset, personUrl)) {
        dataset = setThing(
            dataset,
            buildThing(createThing({ url: personUrl }))
                .addUrl(RDF_TYPE, `${SCHEMA}${role}`)
                .addStringNoLocale(`${SCHEMA}name`, personName)
                .build()
        );
    }
    return { dataset, personUrl };
};

const getOrCreateMovie = (
    dataset: any,
    fileUrl: string,
    title: string,
    director: string,
    year?: string,
    genre?: string,
    timestamp?: Date
): { dataset: any; movieUrl: string; isNew: boolean } => {
    const existing = findExistingMovie(dataset, title, director, year);
    if (existing) {
        return { dataset, movieUrl: existing, isNew: false };
    }

    const hash = movieFingerprint(title, director, year);
    let movieUrl = `${fileUrl}#movie-${hash}`;

    let counter = 1;
    let existingThing = getThing(dataset, movieUrl);
    while (existingThing) {
        movieUrl = `${fileUrl}#movie-${hash}-${counter++}`;
        existingThing = getThing(dataset, movieUrl);
    }

    const directorResult = ensurePerson(dataset, fileUrl, director, 'Person');
    dataset = directorResult.dataset;

    let movieBuilder = buildThing(createThing({ url: movieUrl }))
        .addUrl(RDF_TYPE, `${SCHEMA}Movie`)
        .addStringNoLocale(`${SCHEMA}name`, title)
        .addUrl(`${SCHEMA}director`, directorResult.personUrl);

    if (year) movieBuilder.addStringNoLocale(`${SCHEMA}datePublished`, year);
    if (genre) movieBuilder.addStringNoLocale(`${SCHEMA}genre`, genre);
    if (timestamp) movieBuilder.addDatetime(`${SCHEMA}dateCreated`, timestamp);

    dataset = setThing(dataset, movieBuilder.build());

    return { dataset, movieUrl, isNew: true };
};

// ═══════════════════════════════════════════════════════════════════
// 📁 POD INITIALIZATION
// ═══════════════════════════════════════════════════════════════════

export async function initializePodFiles(storageRoot: string, fetch: any): Promise<void> {
    console.log('🚀 Initializing 5 Movie Pod files (lazy creation)...');
    const files = Object.values(POD_FILES);

    for (const fileName of files) {
        const fileUrl = getFileUrl(storageRoot, fileName);
        try {
            await getSolidDataset(fileUrl, { fetch });
        } catch (checkErr: any) {
            if (isNotFoundError(checkErr)) {
                try {
                    const emptyDataset = createSolidDataset();
                    await saveSolidDatasetAt(fileUrl, emptyDataset, { fetch });
                } catch (createErr: any) {
                    console.warn(`⚠️ Could not auto-create ${fileName}: ${createErr.message}`);
                }
            }
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// 1. SETTINGS.TTL — User Profile
// ═══════════════════════════════════════════════════════════════════

export interface UserSettings {
    ageRange: string;
    genres: string[];
    favoriteDirectors: string[];
    favoriteActors: string[];
}

export async function saveSettings(storageRoot: string, settings: UserSettings, fetch: any): Promise<void> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.SETTINGS);
    let dataset = createSolidDataset();
    try { dataset = await getSolidDataset(fileUrl, { fetch }); }
    catch (e: any) { if (!isNotFoundError(e)) throw e; }

    const userThingUrl = `${fileUrl}#user-profile`;
    const existingThing = getThing(dataset, userThingUrl);
    let userBuilder = existingThing
        ? buildThing(existingThing)
        : buildThing(createThing({ url: userThingUrl })).addUrl(RDF_TYPE, `${SCHEMA}Person`);

    userBuilder.setStringNoLocale(`${SCHEMA}typicalAgeRange`, settings.ageRange);
    settings.genres.forEach(g => userBuilder.addStringNoLocale(`${SCHEMA}genre`, g));
    settings.favoriteDirectors.forEach(d => userBuilder.addStringNoLocale(`${SCHEMA}knows`, `director:${d}`));
    settings.favoriteActors.forEach(a => userBuilder.addStringNoLocale(`${SCHEMA}knows`, `actor:${a}`));

    dataset = setThing(dataset, userBuilder.build());
    await saveSolidDatasetAt(fileUrl, dataset, { fetch });
}

export async function loadSettings(storageRoot: string, fetch: any): Promise<UserSettings | null> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.SETTINGS);
    try {
        const dataset = await getSolidDataset(fileUrl, { fetch });
        const userThing = getThingAll(dataset).find(t => t.url.endsWith('#user-profile'));
        if (!userThing) return null;

        const knowsAll = getStringNoLocaleAll(userThing, `${SCHEMA}knows`) || [];
        
        return {
            ageRange: getStringNoLocale(userThing, `${SCHEMA}typicalAgeRange`) || '18',
            genres: getStringNoLocaleAll(userThing, `${SCHEMA}genre`) || [],
            favoriteDirectors: knowsAll.filter(k => k.startsWith('director:')).map(k => k.replace('director:', '')),
            favoriteActors: knowsAll.filter(k => k.startsWith('actor:')).map(k => k.replace('actor:', ''))
        };
    } catch (e: any) {
        if (isNotFoundError(e)) return null;
        throw e;
    }
}

// ═══════════════════════════════════════════════════════════════════
// 2. SEEDS.TTL — Master Data: Seed Movies (DEDUPLICATED)
// ═══════════════════════════════════════════════════════════════════

export interface SeedMovie {
    seedId: string;
    seedUrl: string;
    movieUrl: string;
    title: string;
    director: string;
    year?: string;
    timestamp: Date;
    sourceSessionId?: string;
}

export interface SaveSeedResult {
    seedEntryUrl: string;
    movieUrl: string;
    isNewMovie: boolean;
}

export async function saveSeedMovies(
    storageRoot: string,
    movies: { title: string; director: string; year?: string }[],
    sessionId: string,
    fetch: any
): Promise<SaveSeedResult[]> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.SEEDS);
    let dataset = createSolidDataset();
    try { dataset = await getSolidDataset(fileUrl, { fetch }); }
    catch (e: any) { if (!isNotFoundError(e)) throw e; }

    const timestamp = new Date();
    const results: SaveSeedResult[] = [];

    movies.forEach((movie, i) => {
        const recResult = getOrCreateMovie(dataset, fileUrl, movie.title, movie.director, movie.year, undefined, timestamp);
        dataset = recResult.dataset;

        const seedEntryUrl = `${fileUrl}#seed-${sessionId}-${i}`;
        dataset = setThing(
            dataset,
            buildThing(createThing({ url: seedEntryUrl }))
                .addUrl(RDF_TYPE, `${SCHEMA}ListItem`)
                .addUrl(`${SCHEMA}item`, recResult.movieUrl)
                .addDatetime(`${SCHEMA}dateCreated`, timestamp)
                .addStringNoLocale(`${SCHEMA}identifier`, sessionId)
                .addInteger(`${SCHEMA}position`, i + 1)
                .build()
        );

        results.push({
            seedEntryUrl,
            movieUrl: recResult.movieUrl,
            isNewMovie: recResult.isNew
        });
    });

    await saveSolidDatasetAt(fileUrl, dataset, { fetch });
    return results;
}

export async function loadSeedMovies(storageRoot: string, fetch: any): Promise<SeedMovie[]> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.SEEDS);
    try {
        const dataset = await getSolidDataset(fileUrl, { fetch });
        const seeds: SeedMovie[] = [];

        for (const thing of getThingAll(dataset)) {
            const types = getUrlAll(thing, RDF_TYPE) || [];
            if (types.includes(`${SCHEMA}ListItem`)) {
                const sessionId = getStringNoLocale(thing, `${SCHEMA}identifier`);
                if (!sessionId) continue;

                const movieUrl = getUrl(thing, `${SCHEMA}item`);
                if (!movieUrl) continue;

                const movieThing = getThing(dataset, movieUrl);
                if (!movieThing) continue;

                const title = getStringNoLocale(movieThing, `${SCHEMA}name`) || 'Unknown';
                const directorUrl = getUrl(movieThing, `${SCHEMA}director`) || '';
                const directorThing = directorUrl ? getThing(dataset, directorUrl) : null;
                const director = directorThing ? getStringNoLocale(directorThing, `${SCHEMA}name`) || 'Unknown' : 'Unknown';
                const year = getStringNoLocale(movieThing, `${SCHEMA}datePublished`) || undefined;
                const timestamp = getDatetime(thing, `${SCHEMA}dateCreated`) || new Date();

                seeds.push({
                    seedId: thing.url.split('#')[1] || uuidv4(),
                    seedUrl: thing.url,
                    movieUrl,
                    title, director, year,
                    timestamp,
                    sourceSessionId: sessionId
                });
            }
        }
        return seeds.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (e: any) {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════
// 3. SESSIONS.TTL — Search History
// ═══════════════════════════════════════════════════════════════════

export interface SearchSession {
    sessionId: string;
    query: string;
    vibe?: string;
    originalGenres: string[];
    correctedGenres: string[];
    seedUrls: string[];
    seedCount: number;
    recommendationUrl?: string;
    timestamp: Date;
    resultCount: number;
    genresCorrected: boolean;
}

export async function saveSearchSession(
    storageRoot: string,
    searchSession: SearchSession,
    fetch: any
): Promise<void> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.SESSIONS);
    let dataset = createSolidDataset();
    try { dataset = await getSolidDataset(fileUrl, { fetch }); }
    catch (e: any) { if (!isNotFoundError(e)) throw e; }

    const sessionUrl = `${fileUrl}#session-${searchSession.sessionId}`;
    const resultUrl = `${fileUrl}#result-${searchSession.sessionId}`;

    let resultBuilder = buildThing(createThing({ url: resultUrl }))
        .addUrl(RDF_TYPE, `${SCHEMA}SearchResultsPage`)
        .addInteger(`${SCHEMA}numberOfItems`, searchSession.resultCount);

    if (searchSession.recommendationUrl) {
        resultBuilder.addUrl(`${SCHEMA}about`, searchSession.recommendationUrl);
    }
    dataset = setThing(dataset, resultBuilder.build());

    let builder = buildThing(createThing({ url: sessionUrl }))
        .addUrl(RDF_TYPE, `${SCHEMA}SearchAction`)
        .addStringNoLocale(`${SCHEMA}query`, searchSession.query.trim())
        .addDatetime(`${SCHEMA}endTime`, searchSession.timestamp)
        .addInteger(`${SCHEMA}resultCount`, searchSession.resultCount)
        .addUrl(`${SCHEMA}result`, resultUrl);

    searchSession.originalGenres.forEach(g => builder.addStringNoLocale(`${SCHEMA}additionalType`, g));
    searchSession.correctedGenres.forEach(g => builder.addStringNoLocale(`${SCHEMA}genre`, g));
    if (searchSession.genresCorrected) builder.addStringNoLocale(`${SCHEMA}description`, 'genres-corrected');
    searchSession.seedUrls.forEach(seedUrl => builder.addUrl(`${SCHEMA}object`, seedUrl));
    if (searchSession.vibe) builder.addStringNoLocale(`${SCHEMA}keywords`, searchSession.vibe);

    dataset = setThing(dataset, builder.build());
    await saveSolidDatasetAt(fileUrl, dataset, { fetch });
}

export async function loadSearchSessions(storageRoot: string, fetch: any): Promise<SearchSession[]> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.SESSIONS);
    try {
        const dataset = await getSolidDataset(fileUrl, { fetch });
        return getThingAll(dataset)
            .filter(t => getUrl(t, RDF_TYPE) === `${SCHEMA}SearchAction`)
            .map(t => {
                const resultUrl = getUrl(t, `${SCHEMA}result`);
                const resultThing = resultUrl ? getThing(dataset, resultUrl) : null;
                const resultCount = resultThing ? getInteger(resultThing, `${SCHEMA}numberOfItems`) || 0 : 0;
                const recommendationUrl = resultThing ? (getUrl(resultThing, `${SCHEMA}about`) || undefined) : undefined;
                const seedUrls = getUrlAll(t, `${SCHEMA}object`) || [];
                const correctedGenres = getStringNoLocaleAll(t, `${SCHEMA}genre`) || [];
                const originalGenres = getStringNoLocaleAll(t, `${SCHEMA}additionalType`) || [];
                const description = getStringNoLocale(t, `${SCHEMA}description`) || '';

                return {
                    sessionId: t.url.split('#session-')[1] || uuidv4(),
                    query: getStringNoLocale(t, `${SCHEMA}query`) || '',
                    vibe: getStringNoLocale(t, `${SCHEMA}keywords`) || undefined,
                    originalGenres,
                    correctedGenres,
                    genresCorrected: description === 'genres-corrected' || JSON.stringify(originalGenres) !== JSON.stringify(correctedGenres),
                    seedUrls,
                    seedCount: seedUrls.length,
                    recommendationUrl,
                    timestamp: getDatetime(t, `${SCHEMA}endTime`) || new Date(),
                    resultCount: getInteger(t, `${SCHEMA}resultCount`) || resultCount
                };
            })
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (e: any) {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════
// 4. RECOMMENDATIONS.TTL — Master Data: Recommendations
// ═══════════════════════════════════════════════════════════════════

export interface RecommendationMovie {
    movieUrl: string;
    title: string;
    director: string;
    year?: string;
    poster?: string;
    reason?: string;
    tmdbId?: number; // ✅ BARU
    position: number;
}

export interface RecommendationRecord {
    recordId: string;
    recommendationUrl: string;
    sessionId?: string;
    timestamp: Date;
    context?: string;
    movies: RecommendationMovie[];
}

export interface MovieToSave {
    title: string;
    director: string;
    year?: string;
    poster?: string;
    reason?: string;
    tmdbId?: number; // ✅ BARU
}

export async function saveRecommendations(
    storageRoot: string,
    record: {
        recordId: string;
        sessionId?: string;
        timestamp: Date;
        context?: string;
        movies: MovieToSave[];
    },
    fetch: any
): Promise<RecommendationRecord> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.RECOMMENDATIONS);
    let dataset = createSolidDataset();
    try { dataset = await getSolidDataset(fileUrl, { fetch }); }
    catch (e: any) { if (!isNotFoundError(e)) throw e; }

    const recommendationUrl = `${fileUrl}#recommendation-${record.recordId}`;
    const sessionsFileUrl = getFileUrl(storageRoot, POD_FILES.SESSIONS);

    let recordBuilder = buildThing(createThing({ url: recommendationUrl }))
        .addUrl(RDF_TYPE, `${SCHEMA}ItemList`)
        .addDatetime(`${SCHEMA}dateCreated`, record.timestamp)
        .addStringNoLocale(`${SCHEMA}name`, `MovieMind List ${record.recordId.substring(0, 8)}`)
        .addInteger(`${SCHEMA}numberOfItems`, record.movies.length);

    if (record.sessionId) {
        recordBuilder.addUrl(`${SCHEMA}about`, `${sessionsFileUrl}#session-${record.sessionId}`);
    }
    if (record.context) {
        recordBuilder.addStringNoLocale(`${SCHEMA}description`, record.context);
    }

    const savedMovies: RecommendationMovie[] = [];

    record.movies.forEach((movie, i) => {
        const recResult = getOrCreateMovie(dataset, fileUrl, movie.title, movie.director, movie.year, undefined);
        dataset = recResult.dataset;

        const trackEntryUrl = `${fileUrl}#item-${record.recordId}-${i}`;
        let trackBuilder = buildThing(createThing({ url: trackEntryUrl }))
            .addUrl(RDF_TYPE, `${SCHEMA}ListItem`)
            .addUrl(`${SCHEMA}item`, recResult.movieUrl)
            .addInteger(`${SCHEMA}position`, i + 1);

        if (movie.reason) trackBuilder.addStringNoLocale(`${SCHEMA}reviewBody`, movie.reason);
        if (movie.poster) trackBuilder.addStringNoLocale(`${SCHEMA}image`, movie.poster);
        if (movie.tmdbId) trackBuilder.addInteger(`${SCHEMA}identifier`, movie.tmdbId); // ✅ BARU: Simpan TMDB ID

        dataset = setThing(dataset, trackBuilder.build());
        recordBuilder.addUrl(`${SCHEMA}itemListElement`, trackEntryUrl);

        savedMovies.push({
            movieUrl: recResult.movieUrl,
            title: movie.title,
            director: movie.director,
            year: movie.year,
            poster: movie.poster,
            reason: movie.reason,
            tmdbId: movie.tmdbId, // ✅ BARU
            position: i + 1
        });
    });

    dataset = setThing(dataset, recordBuilder.build());
    await saveSolidDatasetAt(fileUrl, dataset, { fetch });

    return {
        recordId: record.recordId,
        recommendationUrl,
        sessionId: record.sessionId,
        timestamp: record.timestamp,
        context: record.context,
        movies: savedMovies
    };
}

export async function loadRecommendations(storageRoot: string, fetch: any): Promise<RecommendationRecord[]> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.RECOMMENDATIONS);
    try {
        const dataset = await getSolidDataset(fileUrl, { fetch });
        const records: RecommendationRecord[] = [];

        for (const thing of getThingAll(dataset)) {
            if (getUrl(thing, RDF_TYPE) !== `${SCHEMA}ItemList`) continue;

            const itemUrls = getUrlAll(thing, `${SCHEMA}itemListElement`) || [];
            const movies: RecommendationMovie[] = [];

            for (const itemUrl of itemUrls) {
                const itemThing = getThing(dataset, itemUrl);
                if (!itemThing) continue;

                const movieUrl = getUrl(itemThing, `${SCHEMA}item`);
                if (!movieUrl) continue;

                const movieThing = getThing(dataset, movieUrl);
                if (!movieThing) continue;

                const title = getStringNoLocale(movieThing, `${SCHEMA}name`) || 'Unknown';
                const directorUrl = getUrl(movieThing, `${SCHEMA}director`) || '';
                const directorThing = directorUrl ? getThing(dataset, directorUrl) : null;
                const director = directorThing ? getStringNoLocale(directorThing, `${SCHEMA}name`) || 'Unknown' : 'Unknown';
                const year = getStringNoLocale(movieThing, `${SCHEMA}datePublished`) || undefined;
                const position = getInteger(itemThing, `${SCHEMA}position`) || movies.length + 1;
                const reason = getStringNoLocale(itemThing, `${SCHEMA}reviewBody`) || undefined;
                const poster = getStringNoLocale(itemThing, `${SCHEMA}image`) || undefined;
                const tmdbId = getInteger(itemThing, `${SCHEMA}identifier`) || undefined; // ✅ BARU: Baca TMDB ID

                movies.push({ movieUrl, title, director, year, poster, reason, tmdbId, position });
            }

            movies.sort((a, b) => a.position - b.position);
            const sessionUrl = getUrl(thing, `${SCHEMA}about`) || undefined;
            const sessionId = sessionUrl ? sessionUrl.split('#session-')[1] : undefined;

            records.push({
                recordId: thing.url.split('#recommendation-')[1] || uuidv4(),
                recommendationUrl: thing.url,
                sessionId,
                timestamp: getDatetime(thing, `${SCHEMA}dateCreated`) || new Date(),
                context: getStringNoLocale(thing, `${SCHEMA}description`) || undefined,
                movies
            });
        }
        return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (e: any) {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════
// 5. BEHAVIOR.TTL — PERSONALIZATION & INTERACTIONS (RATING BASED)
// ═══════════════════════════════════════════════════════════════════

export type InteractionType = 'view_details' | 'play_teaser' | 'search' | 'rate' | 'select';

export interface MovieInteraction {
    interactionId: string;
    movieRef: string;
    action: InteractionType;
    ratingValue?: number;
    searchQuery?: string;
    timestamp: Date;
    resolvedTitle?: string;
    resolvedDirector?: string;
}

export async function saveInteraction(
    storageRoot: string,
    interaction: {
        interactionId: string;
        movieRef?: string;
        action: InteractionType;
        ratingValue?: number;
        searchQuery?: string;
        timestamp: Date;
    },
    fetch: any
): Promise<void> {
    const fileUrl = getFileUrl(storageRoot, POD_FILES.BEHAVIOR);
    let dataset = createSolidDataset();
    try { dataset = await getSolidDataset(fileUrl, { fetch }); }
    catch (e: any) { if (!isNotFoundError(e)) throw e; }

    const interactionUrl = `${fileUrl}#interaction-${interaction.interactionId}`;
    const existing = getThing(dataset, interactionUrl);

    let builder = existing
        ? buildThing(existing)
        : buildThing(createThing({ url: interactionUrl }));

    builder.addDatetime(`${SCHEMA}startTime`, interaction.timestamp);

    if (interaction.action === 'search') {
        builder.addUrl(RDF_TYPE, `${SCHEMA}SearchAction`)
               .addStringNoLocale(`${SCHEMA}query`, interaction.searchQuery || '');
    } else {
        if (interaction.movieRef) {
            builder.addUrl(`${SCHEMA}object`, interaction.movieRef);
        }

        if (interaction.action === 'rate' && interaction.ratingValue) {
            builder.addUrl(RDF_TYPE, `${SCHEMA}Rating`)
                   .setInteger(`${SCHEMA}ratingValue`, interaction.ratingValue)
                   .setInteger(`${SCHEMA}bestRating`, 5)
                   .setInteger(`${SCHEMA}worstRating`, 1);
        } else if (interaction.action === 'view_details') {
            builder.addUrl(RDF_TYPE, `${SCHEMA}ViewAction`);
        } else if (interaction.action === 'play_teaser') {
            builder.addUrl(RDF_TYPE, `${SCHEMA}WatchAction`);
        } else if (interaction.action === 'select') {
            builder.addUrl(RDF_TYPE, `${SCHEMA}LikeAction`);
        }
    }

    dataset = setThing(dataset, builder.build());
    await saveSolidDatasetAt(fileUrl, dataset, { fetch });
}

export async function loadInteractions(storageRoot: string, fetch: any): Promise<MovieInteraction[]> {
    const behaviorFileUrl = getFileUrl(storageRoot, POD_FILES.BEHAVIOR);
    const seedsFileUrl = getFileUrl(storageRoot, POD_FILES.SEEDS);
    const recsFileUrl = getFileUrl(storageRoot, POD_FILES.RECOMMENDATIONS);

    try {
        const [behaviorDataset, seedsDataset, recsDataset] = await Promise.all([
            getSolidDataset(behaviorFileUrl, { fetch }).catch(() => createSolidDataset()),
            getSolidDataset(seedsFileUrl, { fetch }).catch(() => createSolidDataset()),
            getSolidDataset(recsFileUrl, { fetch }).catch(() => createSolidDataset())
        ]);

        const interactions: MovieInteraction[] = [];

        for (const thing of getThingAll(behaviorDataset) as any[]) {
            const types = getUrlAll(thing, RDF_TYPE) || [];
            const timestamp = getDatetime(thing, `${SCHEMA}startTime`) || new Date();
            const interactionId = thing.url.split('#interaction-')[1] || uuidv4();

            let action: InteractionType = 'view_details';
            let ratingValue: number | undefined;
            let searchQuery: string | undefined;
            let movieRef = getUrl(thing, `${SCHEMA}object`);

            if (types.includes(`${SCHEMA}SearchAction`)) {
                action = 'search';
                searchQuery = getStringNoLocale(thing, `${SCHEMA}query`) || '';
            } else if (types.includes(`${SCHEMA}Rating`)) {
                action = 'rate';
                ratingValue = getInteger(thing, `${SCHEMA}ratingValue`) || undefined;
            } else if (types.includes(`${SCHEMA}WatchAction`)) {
                action = 'play_teaser';
            } else if (types.includes(`${SCHEMA}ViewAction`)) {
                action = 'view_details';
            } else if (types.includes(`${SCHEMA}LikeAction`)) {
                action = 'select';
            }

            let resolvedTitle = 'Unknown';
            let resolvedDirector = 'Unknown';

            if (movieRef) {
                const resolveFromDataset = (ds: any, url: string) => {
                    let targetThing = getThing(ds, url);
                    if (targetThing) {
                        const itemUrl = getUrl(targetThing, `${SCHEMA}item`);
                        if (itemUrl) targetThing = getThing(ds, itemUrl);
                    }
                    if (!targetThing) return null;
                    
                    const title = getStringNoLocale(targetThing, `${SCHEMA}name`) || 'Unknown';
                    const directorUrl = getUrl(targetThing, `${SCHEMA}director`);
                    let director = 'Unknown';
                    if (directorUrl) {
                        const dirThing = getThing(ds, directorUrl);
                        director = dirThing ? getStringNoLocale(dirThing, `${SCHEMA}name`) || 'Unknown' : 'Unknown';
                    }
                    return { title, director };
                };

                const resolved = resolveFromDataset(recsDataset, movieRef) || resolveFromDataset(seedsDataset, movieRef);
                if (resolved) {
                    resolvedTitle = resolved.title;
                    resolvedDirector = resolved.director;
                }
            }

            interactions.push({
                interactionId,
                movieRef: movieRef || '',
                action,
                ratingValue,
                searchQuery,
                timestamp,
                resolvedTitle,
                resolvedDirector
            });
        }

        return interactions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (e: any) {
        return [];
    }
}

export async function loadBehaveKnowledge(storageRoot: string, fetch: any): Promise<MovieInteraction[]> {
    return await loadInteractions(storageRoot, fetch);
}

export async function getPersonalizationStats(storageRoot: string, fetch: any) {
    const interactions = await loadInteractions(storageRoot, fetch);
    
    const ratedMovies = interactions.filter(i => i.action === 'rate' && i.ratingValue !== undefined);
    const highRated = ratedMovies.filter(i => (i.ratingValue || 0) >= 4);
    const searches = interactions.filter(i => i.action === 'search');

    const directorCounts: Record<string, number> = {};
    highRated.forEach(i => {
        if (i.resolvedDirector && i.resolvedDirector !== 'Unknown') {
            directorCounts[i.resolvedDirector] = (directorCounts[i.resolvedDirector] || 0) + 1;
        }
    });

    return {
        totalInteractions: interactions.length,
        totalRatings: ratedMovies.length,
        averageRating: ratedMovies.length > 0 
            ? (ratedMovies.reduce((sum, i) => sum + (i.ratingValue || 0), 0) / ratedMovies.length).toFixed(2) 
            : 0,
        topDirectors: Object.entries(directorCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
            .map(([director, count]) => ({ director, count })),
        recentSearches: searches.slice(0, 5).map(s => s.searchQuery),
        highRatedMovies: highRated.map(i => ({ title: i.resolvedTitle, director: i.resolvedDirector, rating: i.ratingValue }))
    };
}