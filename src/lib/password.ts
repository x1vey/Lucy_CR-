import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Password hashing with scrypt (built into Node — no extra dependency).
// Format: scrypt$<saltHex>$<hashHex>. Deterministic given salt, so it's safe to
// use synchronously for seed data and in server actions.

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, salt, KEYLEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// A fixed hash for the seeded demo admin (password: "admin1234"). Precomputed so
// the in-memory seed is stable across restarts and doesn't depend on runtime
// randomness. Regenerate with hashPassword if you change the demo password.
export const DEMO_ADMIN_HASH =
  "scrypt$0a1b2c3d4e5f60718293a4b5c6d7e8f9$" +
  // hash of "admin1234" with the salt above
  "9337eeb9b566f6a4c21f98b2124ffad8f66fec0f792a5ca8790dcd0734f4e3cd" +
  "c53ced1e7cd70eca75235da02c764020c60c74185673eedc383db46c3cabcb98";
