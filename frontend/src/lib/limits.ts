/** Keep in sync with backend/src/config/limits.ts */

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
export const MAX_SOURCES_PER_NOTEBOOK = 25;
export const MAX_PODCASTS_PER_NOTEBOOK = 5;
export const MAX_PODCAST_DURATION_MINUTES = 5;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
