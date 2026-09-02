/**
 * Password login with a signed cookie. One operator, one password — no user
 * table, no provider, nothing to leak. Runs on the Edge runtime so middleware
 * can verify it, which is why this uses Web Crypto rather than node:crypto.
 */
const COOKIE = "poach_session";
const TTL_MS = 12 * 60 * 60 * 1000;

function secret(): string {
  return process.env.SESSION_SECRET ?? "";
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function issueSession(): Promise<{ name: string; value: string; maxAge: number }> {
  const expires = Date.now() + TTL_MS;
  const value = `${expires}.${await sign(String(expires))}`;
  return { name: COOKIE, value, maxAge: Math.floor(TTL_MS / 1000) };
}

export async function verifySession(value: string | undefined): Promise<boolean> {
  if (!value || !secret()) return false;
  const [rawExpires, signature] = value.split(".");
  if (!rawExpires || !signature) return false;
  if (Number(rawExpires) < Date.now()) return false;

  const expected = await sign(rawExpires);
  // Constant-time compare — lengths are fixed, so a simple XOR fold is enough.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export const SESSION_COOKIE = COOKIE;
