import crypto from "crypto";

/** Generate a cryptographically random token of given byte length, URL-safe base64 */
export function generateToken(byteLength = 18): string {
  // 18 bytes → 24 base64 chars; 24 bytes → 32 chars
  return crypto.randomBytes(byteLength).toString("base64url");
}

/** Generate a sequential invoice number per user: INV-0001, INV-0002, … */
export function formatInvoiceNumber(seq: number): string {
  return `INV-${String(seq).padStart(4, "0")}`;
}

/**
 * Single source of truth for the application's base URL.
 * Automatically handles:
 * 1. APP_URL from .env
 * 2. NEXTAUTH_URL from .env
 * 3. Vercel auto-injected production URL (VERCEL_PROJECT_PRODUCTION_URL)
 * 4. Vercel deployment URL (VERCEL_URL)
 * 5. Localhost fallback
 */
export function getBaseUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }
  if (process.env.NEXTAUTH_URL) {
    return process.env.NEXTAUTH_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL.replace(/\/+$/, "")}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/+$/, "")}`;
  }
  return "http://localhost:3000";
}
