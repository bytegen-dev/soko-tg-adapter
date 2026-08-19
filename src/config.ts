import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_IDS: z
    .string()
    .optional()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  SOKOSUMI_API_KEY: z.string().min(1),
  SOKOSUMI_ORG_SLUG: z.string().min(1),
  SOKOSUMI_CORE_BASE_URL: z
    .string()
    .url()
    .default("https://api.sokosumi.com"),
  SOKOSUMI_WEB_BASE_URL: z
    .string()
    .url()
    .default("https://app.sokosumi.com"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(2000).max(60000).default(3000),
  /** Directory for state.json (mount a Railway volume here in production). */
  STATE_DATA_DIR: z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error(
        "[config] Missing or invalid environment variables.\n" +
          "  Required: TELEGRAM_BOT_TOKEN, SOKOSUMI_API_KEY, SOKOSUMI_ORG_SLUG\n" +
          "  Local: cp .env.example .env then pnpm dev\n" +
          "  Railway: set variables in the service dashboard",
      );
    }
    throw error;
  }
}
