/**
 * Language Plugin
 *
 * Adds the record's AUDIO languages to the `languages/<lang3>` key-set
 * (METADATA_KEYS.md §9), read from the ffmpeg plugin's per-stream table.
 *
 * What it writes — and only this:
 *   languages/<code> = "true"      one member per distinct audio-track language
 *
 * ⚠ Stream shape. meta-sort's /process payload is the NESTED document form
 * (`stream: [ '<json>', ... ]`, `fileinfo: { duration }`), not meta-core's flat
 * `stream/{n}` keys; and the legacy `fileinfo/streamdetails/{type}/{i}/language`
 * keys this plugin used to read are written by nobody into the store (ffmpeg
 * only puts `streamdetails` in its local cache JSON). Reading the legacy keys
 * made every task a silent no-op. Both current shapes are accepted here.
 *
 * ⚠ Vocabulary. Codes are folded onto ISO 639-2/B alpha-3 (`fre`, `ger`,
 * `chi`) — the space the `languages:` query filter compares against literally
 * (meta-search `query_eval::languages_filter_matches`), the one meta-watch's
 * `MW_LANG.toLang3` and the feeder SDK's `normalize_lang_code` emit, and what
 * Matroska stream tags already carry. A `fra` member would be dropped by a
 * `languages:fre` filter.
 *
 * ⚠ Audio only as a SOURCE — but it writes two keys, not one. This plugin reads
 * audio tracks, so the codes it finds are audio languages and land in
 * `audioLanguages/<lang3>`; every one of them is ALSO written to
 * `languages/<lang3>`, the union that queries filter on (METADATA_KEYS §9,
 * rule #7 — "a union field is written, never computed"). Nothing reconciles the
 * two after the fact, so a record with the split set and the union unset is
 * invisible to every language filter on every peer. Subtitle-track languages
 * belong to `subtitleLanguages/*` (subtitle-extractor), which owes the union
 * member for the same reason. Title keys are not a source either:
 * `titles/<lang>` names the language of a TITLE (tmdb files `originalTitle`
 * under `original_language`), not of the file's audio.
 *
 * ⚠ No `titles/*` write. The old `titles/{firstAudioLang || 'eng'}` =
 * `originalTitle` guess overwrote better identity (tmdb, jellyfin-nfo,
 * anime-detector own those keys) — the overwrite-regression class.
 *
 * Never writes `und` (registry: an undetermined language is the absence of a
 * member), never deletes, never overwrites a non-`languages/` key.
 */

import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';

export const manifest: PluginManifest = {
    id: 'language',
    name: 'Language Aggregator',
    version: '1.2.0',
    description: 'Adds audio-track languages to the audioLanguages/<lang3> and languages/<lang3> key-sets',
    author: 'MetaMesh',
    dependencies: ['ffmpeg'],
    priority: 40,
    color: '#FF9800',
    defaultQueue: 'fast',
    timeout: 30000,
    schema: {
        audioLanguages: { label: 'Audio languages', type: 'array', readonly: true },
        languages: { label: 'Languages', type: 'array', readonly: true },
    },
    config: {},
};

/** One entry of the ffmpeg plugin's stream table (only the fields read here). */
export interface StreamEntry {
    type?: string;
    index?: number;
    language?: string;
}

/**
 * The ffmpeg stream table out of whichever shape the payload carries.
 *
 * Mirrors still-extractor's `selectPrimaryVideoStream` parsing: the nested
 * `stream` collection (array of JSON strings, array of objects, a JSON string,
 * or an index-keyed object) first, then meta-core's flat `stream/{n}` keys.
 * Malformed entries are skipped, never fatal.
 */
export function streamsFromMeta(existingMeta: Record<string, unknown> | undefined): StreamEntry[] {
    if (!existingMeta) return [];

    const raw: unknown[] = [];

    const nested = existingMeta['stream'];
    if (nested) {
        try {
            const parsed = typeof nested === 'string' ? JSON.parse(nested) : nested;
            if (Array.isArray(parsed)) raw.push(...parsed);
            else if (parsed && typeof parsed === 'object') raw.push(...Object.values(parsed as Record<string, unknown>));
        } catch {
            // fall through to the namespaced form
        }
    }

    if (raw.length === 0) {
        const flat = Object.entries(existingMeta)
            .filter(([key]) => /^stream\/\d+$/.test(key))
            .sort(([a], [b]) => Number(a.slice(7)) - Number(b.slice(7)));
        for (const [, value] of flat) raw.push(value);
    }

    const streams: StreamEntry[] = [];
    for (const entry of raw) {
        let stream: unknown;
        try {
            stream = typeof entry === 'string' ? JSON.parse(entry) : entry;
        } catch {
            continue;
        }
        if (stream && typeof stream === 'object' && !Array.isArray(stream)) {
            streams.push(stream as StreamEntry);
        }
    }
    return streams;
}

// ISO 639-2/T → 639-2/B, the only codes where the two disagree. MP4's `mdhd`
// speaks T, Matroska speaks B, ffmpeg passes through either. Mirrors
// meta-watch `ui/js/lang-codes.js` T2B.
const T2B: Record<string, string> = {
    sqi: 'alb', hye: 'arm', eus: 'baq', mya: 'bur', ces: 'cze',
    zho: 'chi', cym: 'wel', deu: 'ger', nld: 'dut', ell: 'gre', fas: 'per',
    fra: 'fre', kat: 'geo', isl: 'ice', mkd: 'mac', msa: 'may',
    ron: 'rum', slk: 'slo',
};

// ISO 639-1 → 639-2/B. Mirrors meta-watch `lang-codes.js` (its `a1` column plus
// the legacy/regional two-letter aliases).
const A1: Record<string, string> = {
    en: 'eng', fr: 'fre', de: 'ger', es: 'spa', it: 'ita', pt: 'por', nl: 'dut',
    sv: 'swe', no: 'nor', da: 'dan', fi: 'fin', is: 'ice', pl: 'pol', cs: 'cze',
    sk: 'slo', sl: 'slv', hu: 'hun', ro: 'rum', bg: 'bul', ru: 'rus', uk: 'ukr',
    be: 'bel', sr: 'srp', hr: 'hrv', bs: 'bos', mk: 'mac', sq: 'alb', el: 'gre',
    tr: 'tur', he: 'heb', ar: 'ara', fa: 'per', ur: 'urd', hi: 'hin', bn: 'ben',
    ta: 'tam', te: 'tel', ml: 'mal', kn: 'kan', mr: 'mar', gu: 'guj', pa: 'pan',
    ne: 'nep', si: 'sin', th: 'tha', lo: 'lao', km: 'khm', my: 'bur', vi: 'vie',
    id: 'ind', ms: 'may', tl: 'tgl', ja: 'jpn', ko: 'kor', zh: 'chi', mn: 'mon',
    kk: 'kaz', uz: 'uzb', az: 'aze', ka: 'geo', hy: 'arm', et: 'est', lv: 'lav',
    lt: 'lit', ca: 'cat', gl: 'glg', eu: 'baq', cy: 'wel', ga: 'gle', af: 'afr',
    sw: 'swa', am: 'amh', zu: 'zul', la: 'lat', eo: 'epo', yi: 'yid', jv: 'jav',
    // legacy / regional
    nb: 'nor', nn: 'nor', iw: 'heb', in: 'ind', ji: 'yid', jw: 'jav',
};

// "This track has no language" spellings. Never written (registry §9).
const NONE = new Set(['und', 'zxx', 'mis', 'unknown', 'none', '']);

/**
 * Canonical 639-2/B alpha-3 for a stream-tag language code; `''` when the
 * track declares no language. Accepts 639-1 (`ja`), 639-2/B (`jpn`), 639-2/T
 * (`deu` → `ger`) and BCP-47 (`pt-BR` → `por`). An unrecognised 3-letter code
 * passes through lowercased (still a distinguishable language); anything else
 * is dropped rather than guessed. `mul` is kept — it is a valid member.
 * Same rules as meta-watch `MW_LANG.toLang3`.
 */
export function toLang3(code: unknown): string {
    const s = String(code ?? '').trim().toLowerCase();
    if (!s) return '';
    const primary = s.split(/[-_]/)[0];
    if (NONE.has(primary)) return '';
    if (!/^[a-z]+$/.test(primary)) return '';
    if (primary.length === 2) return A1[primary] ?? '';
    if (primary.length === 3) return T2B[primary] ?? primary;
    return '';
}

/** Distinct canonical audio-track languages, in stream order. */
export function audioLanguagesFromMeta(existingMeta: Record<string, unknown> | undefined): string[] {
    const out: string[] = [];
    for (const stream of streamsFromMeta(existingMeta)) {
        if (stream.type !== 'audio') continue;
        const lang = toLang3(stream.language);
        if (lang && !out.includes(lang)) out.push(lang);
    }
    return out;
}

/**
 * Whether the record already carries `<field>/<code>`, in either shape: the flat
 * key, or the nested `<field>: { <code>: ... }` object meta-sort's reconstructed
 * document holds.
 */
function hasMember(
    existingMeta: Record<string, unknown> | undefined,
    field: string,
    code: string,
): boolean {
    if (!existingMeta) return false;
    if (existingMeta[`${field}/${code}`] !== undefined) return true;
    const nested = existingMeta[field];
    return !!nested && typeof nested === 'object' && !Array.isArray(nested)
        && (nested as Record<string, unknown>)[code] !== undefined;
}

/**
 * The members to add — never one the record already has.
 *
 * Each audio code is written TWICE: once to `audioLanguages/<code>` (what this
 * plugin actually observed — a spoken track) and once to `languages/<code>`
 * (the union every query filters on). METADATA_KEYS §9 rule #7 makes the second
 * write mandatory, not a convenience: the union is stored, never computed, and
 * a query cannot ask for `audioLanguages OR subtitleLanguages` — the gateway
 * wire ANDs across keys, so an OR of the splits would return strictly less.
 */
export function languageWrites(existingMeta: Record<string, unknown> | undefined): Record<string, string> {
    const writes: Record<string, string> = {};
    for (const code of audioLanguagesFromMeta(existingMeta)) {
        if (!hasMember(existingMeta, 'audioLanguages', code)) {
            writes[`audioLanguages/${code}`] = 'true';
        }
        if (!hasMember(existingMeta, 'languages', code)) {
            writes[`languages/${code}`] = 'true';
        }
    }
    return writes;
}

/** The subset of the meta-core client this plugin uses (injectable for tests). */
export interface LanguageWriter {
    mergeMetadata(hashId: string, metadata: Record<string, string>): Promise<boolean>;
}

export async function process(
    request: ProcessRequest,
    sendCallback: (payload: CallbackPayload) => Promise<void>,
    writer: LanguageWriter = new MetaCoreClient(request.metaCoreUrl),
): Promise<void> {
    const startTime = Date.now();

    try {
        const { cid } = request;
        const existingMeta = request.existingMeta as Record<string, unknown> | undefined;
        const found = audioLanguagesFromMeta(existingMeta);
        const writes = languageWrites(existingMeta);

        if (Object.keys(writes).length > 0) {
            // One PATCH (merge) carrying only the new members: additive and
            // idempotent, touches no other key.
            const ok = await writer.mergeMetadata(cid, writes);
            if (!ok) throw new Error(`failed to write ${Object.keys(writes).join(', ')}`);
        }

        console.log(`[language] ${cid}: audio languages [${found.join(', ') || 'none'}], added [${Object.keys(writes).join(', ') || 'none'}]`);

        await sendCallback({
            taskId: request.taskId,
            status: 'completed',
            duration: Date.now() - startTime,
        });
    } catch (error) {
        await sendCallback({
            taskId: request.taskId,
            status: 'failed',
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
