import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { env } from "../config/env.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Node < 22 has no native WebSocket; required by supabase-js Realtime init.
  realtime: { transport: ws as unknown as typeof WebSocket },
});

function bucket() {
  return supabase.storage.from(env.SUPABASE_STORAGE_BUCKET);
}

/** Object key: `{notebookId}/{filename}` */
export function objectKey(notebookId: string, filename: string): string {
  return `${notebookId}/${filename}`;
}

export async function uploadObject(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  const { error } = await bucket().upload(key, data, {
    contentType,
    upsert: true,
  });
  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }
  return key;
}

export async function downloadObject(key: string): Promise<Buffer> {
  const { data, error } = await bucket().download(key);
  if (error || !data) {
    throw new Error(
      `Supabase download failed for ${key}: ${error?.message ?? "missing file"}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

export async function downloadObjectText(key: string): Promise<string> {
  const buf = await downloadObject(key);
  return buf.toString("utf8");
}

export async function deleteObject(key: string): Promise<void> {
  const { error } = await bucket().remove([key]);
  if (error) {
    throw new Error(`Supabase delete failed for ${key}: ${error.message}`);
  }
}
