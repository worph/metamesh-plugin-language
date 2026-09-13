/**
 * Language plugin unit tests — no network, no meta-core: the writer is injected.
 */

import { describe, it, expect } from 'vitest';
import {
    manifest,
    process as processFile,
    streamsFromMeta,
    toLang3,
    audioLanguagesFromMeta,
    languageWrites,
    type LanguageWriter,
} from '../src/plugin.js';
import type { CallbackPayload, ProcessRequest } from '../src/types.js';

// Trimmed from the real nested /meta document of a dev-stack record
// (1080p AV1 episode: 2 audio, 9 subtitle, cover-art mjpeg).
const REAL_STREAMS: string[] = [
    '{"type":"video","codec":"av1","index":0,"duration":"N/A","forced":false,"default":true,"title":"By Trix","width":1920,"height":1080,"frameRate":"24000/1001"}',
    '{"type":"audio","codec":"aac","index":1,"duration":"N/A","forced":false,"default":true,"language":"jpn","title":"Japanese - AAC 2.0","sampleRate":"44100","channelLayout":"stereo"}',
    '{"type":"audio","codec":"aac","index":2,"duration":"N/A","forced":false,"default":true,"language":"eng","title":"English - AAC 2.0","sampleRate":"44100","channelLayout":"stereo"}',
    '{"type":"subtitle","codec":"ass","index":3,"language":"eng","title":"English (Full) [4de]"}',
    '{"type":"subtitle","codec":"ass","index":5,"language":"fre","title":"French"}',
    '{"type":"subtitle","codec":"ass","index":6,"language":"ger","title":"German"}',
    '{"type":"video","codec":"mjpeg","index":12,"duration":"1433.089","width":230,"height":345}',
];

function nestedDoc(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        fileinfo: { duration: 1433.089, formatName: 'matroska,webm' },
        stream: REAL_STREAMS,
        originalTitle: 'Some Show',
        cids: ['bagacbabaebs63pblr2rsycodkmg4ojn47ol7k4oz6ptcre2bwaguhsib4hjpg'],
        ...extra,
    };
}

class RecordingWriter implements LanguageWriter {
    calls: Array<{ hashId: string; metadata: Record<string, string> }> = [];
    constructor(private ok = true) {}
    async mergeMetadata(hashId: string, metadata: Record<string, string>): Promise<boolean> {
        this.calls.push({ hashId, metadata });
        return this.ok;
    }
}

async function run(existingMeta: Record<string, unknown> | undefined, writer = new RecordingWriter()) {
    let callback: CallbackPayload | null = null;
    const request = {
        taskId: 't1',
        cid: 'cid-1',
        filePath: '/files/watch/Show - 01.mkv',
        callbackUrl: 'http://metasort-app/api/plugins/callback',
        metaCoreUrl: 'http://metasort-app',
        existingMeta,
    } as unknown as ProcessRequest;
    await processFile(request, async (p) => { callback = p; }, writer);
    return { callback: callback as CallbackPayload | null, writer };
}

describe('manifest', () => {
    it('keeps the plugin identity and ffmpeg dependency', () => {
        expect(manifest.id).toBe('language');
        expect(manifest.dependencies).toContain('ffmpeg');
        expect(manifest.priority).toBe(40);
        expect(manifest.schema).toHaveProperty('languages');
    });
});

describe('streamsFromMeta', () => {
    it('reads the nested stream array of JSON strings (meta-sort payload)', () => {
        const streams = streamsFromMeta(nestedDoc());
        expect(streams).toHaveLength(REAL_STREAMS.length);
        expect(streams[1]).toMatchObject({ type: 'audio', language: 'jpn', index: 1 });
    });

    it('reads a nested stream array of objects', () => {
        const streams = streamsFromMeta({ stream: REAL_STREAMS.map((s) => JSON.parse(s)) });
        expect(streams.map((s) => s.index)).toEqual([0, 1, 2, 3, 5, 6, 12]);
    });

    it('reads a nested stream JSON string and an index-keyed object', () => {
        expect(streamsFromMeta({ stream: JSON.stringify(REAL_STREAMS) })).toHaveLength(REAL_STREAMS.length);
        const keyed = Object.fromEntries(REAL_STREAMS.map((s, i) => [String(i), s]));
        expect(streamsFromMeta({ stream: keyed })).toHaveLength(REAL_STREAMS.length);
    });

    it('reads flat stream/{n} keys (meta-core form) in numeric order', () => {
        const flat: Record<string, string> = { 'fileinfo/duration': '1433.089' };
        // insert out of order, with n >= 10 to catch lexical sorting
        flat['stream/10'] = '{"type":"audio","index":10,"language":"spa"}';
        flat['stream/2'] = '{"type":"audio","index":2,"language":"eng"}';
        flat['stream/1'] = '{"type":"audio","index":1,"language":"jpn"}';
        expect(streamsFromMeta(flat).map((s) => s.index)).toEqual([1, 2, 10]);
    });

    it('returns nothing for missing streams and skips malformed entries', () => {
        expect(streamsFromMeta(undefined)).toEqual([]);
        expect(streamsFromMeta({})).toEqual([]);
        expect(streamsFromMeta({ originalTitle: 'x' })).toEqual([]);
        expect(streamsFromMeta({ stream: ['not json', '{"type":"audio","language":"eng"}', null] }))
            .toEqual([{ type: 'audio', language: 'eng' }]);
    });

    it('ignores the legacy fileinfo/streamdetails keys nobody writes', () => {
        expect(streamsFromMeta({ 'fileinfo/streamdetails/audio/0/language': 'eng' })).toEqual([]);
    });
});

describe('toLang3', () => {
    it('keeps 639-2/B codes', () => {
        for (const c of ['eng', 'jpn', 'fre', 'ger', 'chi', 'spa']) expect(toLang3(c)).toBe(c);
    });

    it('folds 639-2/T onto 639-2/B (the filter vocabulary)', () => {
        expect(toLang3('fra')).toBe('fre');
        expect(toLang3('deu')).toBe('ger');
        expect(toLang3('zho')).toBe('chi');
        expect(toLang3('nld')).toBe('dut');
        expect(toLang3('ces')).toBe('cze');
    });

    it('maps 639-1 and BCP-47 tags (the old normaliser returned und for all 2-letter codes)', () => {
        expect(toLang3('en')).toBe('eng');
        expect(toLang3('fr')).toBe('fre');
        expect(toLang3('ja')).toBe('jpn');
        expect(toLang3('pt-BR')).toBe('por');
        expect(toLang3('EN_us')).toBe('eng');
        expect(toLang3(' JPN ')).toBe('jpn');
    });

    it('never yields und and drops no-language spellings', () => {
        for (const c of ['und', 'UND', 'zxx', 'mis', '', undefined, null, 'unknown']) expect(toLang3(c)).toBe('');
    });

    it('keeps mul and unknown 3-letter codes, drops unknown 2-letter and full names', () => {
        expect(toLang3('mul')).toBe('mul');
        expect(toLang3('xyz')).toBe('xyz');
        expect(toLang3('xx')).toBe('');
        expect(toLang3('French')).toBe('');
        expect(toLang3('e1g')).toBe('');
    });
});

describe('audioLanguagesFromMeta', () => {
    it('takes audio tracks only — subtitle languages are not audio languages', () => {
        expect(audioLanguagesFromMeta(nestedDoc())).toEqual(['jpn', 'eng']);
    });

    it('dedupes after normalisation and skips und/untagged audio', () => {
        const meta = {
            stream: [
                { type: 'audio', language: 'fra' },
                { type: 'audio', language: 'fre' },
                { type: 'audio', language: 'fr' },
                { type: 'audio', language: 'und' },
                { type: 'audio' },
                { type: 'video', language: 'eng' },
            ],
        };
        expect(audioLanguagesFromMeta(meta)).toEqual(['fre']);
    });
});

describe('languageWrites', () => {
    it('skips members already present in the flat or nested form', () => {
        expect(languageWrites(nestedDoc({ 'languages/jpn': 'true' }))).toEqual({ 'languages/eng': 'true' });
        expect(languageWrites(nestedDoc({ languages: { eng: 'true', jpn: true } }))).toEqual({});
    });
});

describe('process', () => {
    it('writes the audio languages/* key-set from the nested payload in one merge', async () => {
        const { callback, writer } = await run(nestedDoc());
        expect(callback?.status).toBe('completed');
        expect(writer.calls).toEqual([
            { hashId: 'cid-1', metadata: { 'languages/jpn': 'true', 'languages/eng': 'true' } },
        ]);
    });

    it('writes from flat stream/{n} keys too', async () => {
        const flat = Object.fromEntries(REAL_STREAMS.map((s, i) => [`stream/${i}`, s]));
        const { callback, writer } = await run(flat);
        expect(callback?.status).toBe('completed');
        expect(writer.calls[0].metadata).toEqual({ 'languages/jpn': 'true', 'languages/eng': 'true' });
    });

    it('never writes titles/* or any non-languages key, even with originalTitle and title keys', async () => {
        const { writer } = await run(nestedDoc({ 'titles/eng/Better Title': 'true', titles: { jpn: { '番組': 'true' } } }));
        const keys = writer.calls.flatMap((c) => Object.keys(c.metadata));
        expect(keys.length).toBeGreaterThan(0);
        expect(keys.every((k) => k.startsWith('languages/'))).toBe(true);
        expect(keys.some((k) => k.startsWith('titles'))).toBe(false);
    });

    it('does not derive languages from title keys', async () => {
        const { callback, writer } = await run({ originalTitle: 'x', 'titles/jpn/y': 'true', 'titles/jpl/z': 'true' });
        expect(callback?.status).toBe('completed');
        expect(writer.calls).toEqual([]);
    });

    it('completes without writing when there are no streams or no tagged audio', async () => {
        for (const meta of [undefined, {}, { stream: [] }, { stream: [{ type: 'audio', language: 'und' }] }]) {
            const { callback, writer } = await run(meta);
            expect(callback?.status).toBe('completed');
            expect(writer.calls).toEqual([]);
        }
    });

    it('is idempotent: a re-run over a record that already has the members writes nothing', async () => {
        const { writer } = await run(nestedDoc({ 'languages/jpn': 'true', 'languages/eng': 'true' }));
        expect(writer.calls).toEqual([]);
    });

    it('fails the task when the write is rejected', async () => {
        const { callback } = await run(nestedDoc(), new RecordingWriter(false));
        expect(callback?.status).toBe('failed');
        expect(callback?.error).toContain('languages/jpn');
    });
});
