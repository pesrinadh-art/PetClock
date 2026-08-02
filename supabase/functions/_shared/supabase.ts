import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { SERVICE_ROLE_KEY, SUPABASE_URL } from "./env.ts";

/**
 * Service-role client. Bypasses RLS entirely — every function using this is responsible
 * for its own authorization.
 */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL(), SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Guards the cron-driven functions. Only pg_cron (via pg_net, carrying the service-role
 * key from Vault) may invoke them — otherwise anyone who learned the URL could trigger a
 * push storm.
 */
export function assertServiceRole(req: Request): void {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== SERVICE_ROLE_KEY()) {
    throw new HttpError(401, "UNAUTHORIZED", "service role required");
  }
}

/**
 * Resolves the calling user from an optional user JWT. Used only for *attribution* —
 * a tap from the foreground can be credited to a person, one replayed hours later from a
 * cold start may not be. Never used for authorization; the action token does that.
 */
export async function tryResolveUser(
  admin: SupabaseClient,
  authHeader: string | null,
): Promise<string | null> {
  if (!authHeader) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token || token === SERVICE_ROLE_KEY()) return null;
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json(
      { ok: false, error: err.code, message: err.message },
      { status: err.status },
    );
  }
  console.error("unhandled error", err);
  return Response.json(
    { ok: false, error: "SERVER_ERROR" },
    { status: 500 },
  );
}
