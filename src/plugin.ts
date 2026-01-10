/**
 * Language Plugin
 *
 * Aggregates languages from all streams (audio, video, subtitle)
 * and converts them to ISO 639-3 format.
 * Determines the primary language based on first audio > video > subtitle stream.
 *
 * Matches old LanguageProcessor output:
 * - languages (add)
 * - titles/{lang} (set originalTitle)
 */

import { anyTo_iso_639_3 } from '@metazla/filename-tools';
import type { PluginManifest, ProcessRequest, CallbackPayload } from './types.js';
import { MetaCoreClient } from './meta-core-client.js';

export const manifest: PluginManifest = {
    id: 'language',
    name: 'Language Aggregator',
    version: '1.0.0',
    description: 'Aggregates languages from all streams and determines primary language',
    author: 'MetaMesh',
    dependencies: ['ffmpeg'],
    priority: 40,
    color: '#FF9800',
    defaultQueue: 'fast',
    timeout: 30000,
    schema: {
        languages: { label: 'Languages', type: 'array', readonly: true },
    },
    config: {},
};

export async function process(
    request: ProcessRequest,
    sendCallback: (payload: CallbackPayload) => Promise<void>
): Promise<void> {
    const startTime = Date.now();
    const metaCore = new MetaCoreClient(request.metaCoreUrl);

    try {
        const { cid, existingMeta } = request;

        let streamLanguage: string | null = null;

        // Collect languages from title keys (if existingMeta has titles/*)
        for (const key of Object.keys(existingMeta || {})) {
            if (key.startsWith('titles/')) {
                const langCode = key.substring(7); // Remove 'titles/' prefix
                const normalized = anyTo_iso_639_3(langCode);
                if (normalized) {
                    await metaCore.addToSet(cid, 'languages', normalized);
                }
            }
        }

        // Collect languages from audio streams (highest priority for primary)
        for (let i = 0; i < 20; i++) {
            const lang = existingMeta?.[`fileinfo/streamdetails/audio/${i}/language`];
            if (!lang) break;
            const computedLanguage = anyTo_iso_639_3(lang);
            if (computedLanguage) {
                await metaCore.addToSet(cid, 'languages', computedLanguage);
                if (!streamLanguage) {
                    streamLanguage = computedLanguage;
                }
            }
        }

        // Collect languages from video streams
        for (let i = 0; i < 20; i++) {
            const lang = existingMeta?.[`fileinfo/streamdetails/video/${i}/language`];
            if (!lang) break;
            const computedLanguage = anyTo_iso_639_3(lang);
            if (computedLanguage) {
                await metaCore.addToSet(cid, 'languages', computedLanguage);
                if (!streamLanguage) {
                    streamLanguage = computedLanguage;
                }
            }
        }

        // Collect languages from subtitle streams
        for (let i = 0; i < 20; i++) {
            const lang = existingMeta?.[`fileinfo/streamdetails/subtitle/${i}/language`];
            if (!lang) break;
            const computedLanguage = anyTo_iso_639_3(lang);
            if (computedLanguage) {
                await metaCore.addToSet(cid, 'languages', computedLanguage);
                if (!streamLanguage) {
                    streamLanguage = computedLanguage;
                }
            }
        }

        // Determine the language of the media file based on:
        // 1st audio stream, 2nd video stream, 3rd subtitle stream (first found)
        // Assume original title is one of the stream languages or English if not found
        const originalTitle = existingMeta?.originalTitle;
        if (originalTitle) {
            await metaCore.setProperty(cid, `titles/${streamLanguage || 'eng'}`, originalTitle);
        }

        console.log(`[language] Aggregated languages, primary: ${streamLanguage || 'none'}`);

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
