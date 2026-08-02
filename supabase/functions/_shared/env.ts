/**
 * Environment access. Fails loudly at module load rather than producing a confusing
 * runtime error deep inside a push send.
 */

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it with: supabase secrets set ${name}=...`,
    );
  }
  return value;
}

export const SUPABASE_URL = () => requireEnv("SUPABASE_URL");
export const SERVICE_ROLE_KEY = () => requireEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * Signing key for action tokens. Deliberately NOT the Supabase JWT secret — a leak of this
 * one must not become a leak of every user session.
 */
export const ACTION_TOKEN_SECRET = () => requireEnv("ACTION_TOKEN_SECRET");
