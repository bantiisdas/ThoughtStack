/** Assignment submission caps — keep cost and storage bounded. */

/** Max upload size for PDF / TEXT / VTT (20 MB). */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Max sources (files + URLs) per notebook. */
export const MAX_SOURCES_PER_NOTEBOOK = 25;

/** Human-readable helpers for API error messages. */
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
