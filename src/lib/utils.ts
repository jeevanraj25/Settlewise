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
