/**
 * Language Plugin
 * Aggregates languages from all streams and determines primary language
 * Uses proper ISO 639 conversion matching @metazla/filename-tools
 */

import ISO6391 from 'iso-639-1';
import { iso6393To2T } from 'iso-639-3';
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
        primaryLanguage: { label: 'Primary Language', type: 'string', readonly: true },
    },
    config: {},
};

// Build ISO 639-1 to ISO 639-3 mapping (matching @metazla/filename-tools)
const iso6391To3: Record<string, string> = {};
for (const key in iso6393To2T) {
    const value = (iso6393To2T as Record<string, string>)[key];
    iso6391To3[value] = key;
}

/**
 * Convert any language format to ISO 639-3
 * Matches anyTo_iso_639_3 from @metazla/filename-tools
 */
function anyTo_iso_639_3(languageName: string): string | null {
    if (!languageName) {
        return null;
    }
    if (languageName.length === 3) {
        // Could be ISO 639-3 or ISO 639-2T or ISO 639-2B
        // All 3 are similar, just return the input
        return languageName;
    }
    if (languageName.length === 2) {
        // Could be ISO 639-1 => validate and convert
        return iso6391To3[languageName] || 'und';
    }

    // Full language name - convert to ISO 639-3
    const code1 = ISO6391.getCode(languageName);
    if (iso6391To3[code1]) {
        return iso6391To3[code1];
    }

    return null;
}

export async function process(
    request: ProcessRequest,
    sendCallback: (payload: CallbackPayload) => Promise<void>
): Promise<void> {
    const startTime = Date.now();
    const metaCore = new MetaCoreClient(request.metaCoreUrl);

    try {
        const { cid, existingMeta } = request;

        const languages = new Set<string>();
        let primaryLanguage: string | null = null;

        // Collect from audio streams (highest priority)
        for (let i = 0; i < 20; i++) {
            const lang = existingMeta?.[`fileinfo/streamdetails/audio/${i}/language`];
            if (!lang) break;
            const computedLanguage = anyTo_iso_639_3(lang);
            if (computedLanguage && computedLanguage !== 'und') {
                languages.add(computedLanguage);
                if (!primaryLanguage) primaryLanguage = computedLanguage;
            }
        }

        // Collect from video streams
        for (let i = 0; i < 20; i++) {
            const lang = existingMeta?.[`fileinfo/streamdetails/video/${i}/language`];
            if (!lang) break;
            const computedLanguage = anyTo_iso_639_3(lang);
            if (computedLanguage && computedLanguage !== 'und') {
                languages.add(computedLanguage);
                if (!primaryLanguage) primaryLanguage = computedLanguage;
            }
        }

        // Collect from subtitle streams
        for (let i = 0; i < 20; i++) {
            const lang = existingMeta?.[`fileinfo/streamdetails/subtitle/${i}/language`];
            if (!lang) break;
            const computedLanguage = anyTo_iso_639_3(lang);
            if (computedLanguage && computedLanguage !== 'und') {
                languages.add(computedLanguage);
                if (!primaryLanguage) primaryLanguage = computedLanguage;
            }
        }

        // Add languages to set
        for (const lang of languages) {
            await metaCore.addToSet(cid, 'languages', lang);
        }

        // Set primary language and title language mapping
        if (primaryLanguage) {
            await metaCore.setProperty(cid, 'primaryLanguage', primaryLanguage);

            const originalTitle = existingMeta?.originalTitle;
            if (originalTitle) {
                await metaCore.setProperty(cid, `titles/${primaryLanguage}`, originalTitle);
            }
        }

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
