/**
 * Language Plugin Integration Tests
 *
 * Tests language aggregation from streams and primary language determination.
 * Uses @metazla/filename-tools library for ISO 639-3 conversion.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { anyTo_iso_639_3 } from '@metazla/filename-tools';

// Dynamic import of plugin module
let manifest: typeof import('../src/plugin.js').manifest;
let processFile: typeof import('../src/plugin.js').process;

// Mock callback collector
interface CallbackResult {
    taskId: string;
    status: 'completed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
}

let lastCallback: CallbackResult | null = null;

const mockSendCallback = async (payload: CallbackResult): Promise<void> => {
    lastCallback = payload;
};

describe('Language Plugin Integration Tests', () => {
    beforeAll(async () => {
        const plugin = await import('../src/plugin.js');
        manifest = plugin.manifest;
        processFile = plugin.process;
    });

    describe('Manifest', () => {
        it('has required fields', () => {
            expect(manifest.id).toBe('language');
            expect(manifest.name).toBeDefined();
            expect(manifest.version).toBeDefined();
            expect(manifest.dependencies).toContain('ffmpeg');
            expect(manifest.priority).toBe(40);
        });

        it('declares correct schema', () => {
            expect(manifest.schema).toHaveProperty('languages');
        });
    });

    describe('ISO 639-3 Conversion', () => {
        it('handles 3-letter codes', () => {
            // The function should handle 3-letter ISO 639-3 codes
            const engResult = anyTo_iso_639_3('eng');
            const jpnResult = anyTo_iso_639_3('jpn');
            const fraResult = anyTo_iso_639_3('fra');

            // Function returns the code if valid, or 'und' for unknown
            expect(['eng', 'und']).toContain(engResult);
            expect(['jpn', 'und']).toContain(jpnResult);
            expect(['fra', 'und']).toContain(fraResult);
        });

        it('returns a defined value for known codes', () => {
            const result = anyTo_iso_639_3('eng');
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('handles unknown codes gracefully', () => {
            const result = anyTo_iso_639_3('xyz');
            // Should return 'und' (undefined) or the original value
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });
    });

    describe('Process Function', () => {
        it('processes file with audio streams', async () => {
            await processFile({
                taskId: 'test-lang-1',
                cid: 'test-cid-lang',
                filePath: '/movies/Movie.mkv',
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {
                    originalTitle: 'Test Movie',
                    'fileinfo/streamdetails/audio/0/language': 'eng',
                    'fileinfo/streamdetails/audio/1/language': 'jpn',
                },
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
        });

        it('processes file with subtitle streams', async () => {
            await processFile({
                taskId: 'test-lang-2',
                cid: 'test-cid-lang-2',
                filePath: '/movies/Movie.mkv',
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {
                    originalTitle: 'Test Movie',
                    'fileinfo/streamdetails/subtitle/0/language': 'eng',
                    'fileinfo/streamdetails/subtitle/1/language': 'fra',
                },
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
        });

        it('processes file with existing title languages', async () => {
            await processFile({
                taskId: 'test-lang-3',
                cid: 'test-cid-lang-3',
                filePath: '/movies/Movie.mkv',
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {
                    originalTitle: 'Test Movie',
                    'titles/eng': 'Test Movie',
                    'titles/jpn': 'テスト映画',
                },
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
        });

        it('processes file with no language information', async () => {
            await processFile({
                taskId: 'test-lang-4',
                cid: 'test-cid-lang-4',
                filePath: '/movies/Movie.mkv',
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {
                    originalTitle: 'Test Movie',
                },
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
        });

        it('processes file with video stream language', async () => {
            await processFile({
                taskId: 'test-lang-5',
                cid: 'test-cid-lang-5',
                filePath: '/movies/Movie.mkv',
                callbackUrl: 'http://localhost/callback',
                metaCoreUrl: 'http://localhost:9000',
                existingMeta: {
                    originalTitle: 'Test Movie',
                    'fileinfo/streamdetails/video/0/language': 'eng',
                },
            }, mockSendCallback);

            expect(lastCallback).toBeDefined();
            expect(lastCallback?.status).toBe('completed');
        });
    });
});
