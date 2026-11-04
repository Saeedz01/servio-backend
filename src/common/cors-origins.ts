const DEFAULT_ORIGINS =
  'http://localhost:3000,https://serveo-frontend.vercel.app';

/** Parse FRONTEND_URL (comma-separated) into a CORS origin value. */
export function parseFrontendOrigins(
  raw: string | undefined = process.env.FRONTEND_URL,
): string | string[] {
  const origins = (raw ?? DEFAULT_ORIGINS)
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (origins.length === 0) {
    return 'http://localhost:3000';
  }
  return origins.length === 1 ? origins[0]! : origins;
}
