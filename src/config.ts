import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_ALLOWED_CHAT_IDS: z
    .string()
    .min(1)
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
    .default("https://core.sokosumi.com"),
  SOKOSUMI_WEB_BASE_URL: z
    .string()
    .url()
    .default("https://app.sokosumi.com"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(2000).max(60000).default(3000),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(): Config {
  return envSchema.parse(process.env);
}
