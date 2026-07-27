import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  /** Qdrant Cloud cluster URL, e.g. https://xxxx.aws.cloud.qdrant.io */
  QDRANT_URL: z.string().url("QDRANT_URL must be a valid URL"),
  /** Qdrant Cloud API key (required for authenticated clusters) */
  QDRANT_API_KEY: z.string().min(1, "QDRANT_API_KEY is required"),
  OPENAI_API_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is required"),
  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required"),
  /** Supabase project URL + service role key for Storage (server-side only). */
  SUPABASE_URL: z.string().url("SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("sources"),
  /** ElevenLabs — required at podcast generation time. */
  ELEVENLABS_API_KEY: z.string().optional(),
  /** Male host voice (default: Adam). */
  ELEVENLABS_HOST_VOICE_ID: z.string().min(1).default("pNInz6obpgDQGcFmaJgB"),
  /** Female guest voice (default: Sarah). */
  ELEVENLABS_GUEST_VOICE_ID: z.string().min(1).default("EXAVITQu4vr4xnSDxMaL"),
  /** Comma-separated allowed frontends, e.g. https://app.vercel.app,http://localhost:3000 */
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000,https://thought-stack-ai.vercel.app"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
