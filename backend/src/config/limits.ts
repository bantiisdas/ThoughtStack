/** Assignment submission caps — keep cost and storage bounded. */

/** Max upload size for PDF / TEXT / VTT (20 MB). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Max sources (files + URLs) per notebook. */
export const MAX_SOURCES_PER_NOTEBOOK = 25;

/** Max generated podcasts retained per notebook. */
export const MAX_PODCASTS_PER_NOTEBOOK = 5;

/** Target / hard cap for spoken podcast length (seconds). */
export const MAX_PODCAST_DURATION_SECONDS = 5 * 60;

/** Soft word-count target for a ~4–5 minute host/guest dialogue (~150 wpm). */
export const PODCAST_TARGET_WORD_COUNT = 700;

/** Hard word-count ceiling so TTS stays under the duration cap. */
export const PODCAST_MAX_WORD_COUNT = 750;

/** Human-readable helpers for API error messages. */
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
