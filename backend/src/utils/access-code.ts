import crypto from "crypto";

// No 0/O/1/I/L to avoid confusion when codes are read aloud or retyped.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateAccessCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

export function normalizeAccessCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== CODE_LENGTH) return null;
  return code;
}

/** Only admins receive the plain code; everyone else just sees whether one exists. */
export function toPublicConfirmationUser<T extends { accessCode?: string | null }>(
  user: T,
  isAdmin: boolean
): Omit<T, "accessCode"> & { hasAccessCode: boolean; accessCode?: string | null } {
  const { accessCode, ...rest } = user;
  return {
    ...rest,
    hasAccessCode: Boolean(accessCode),
    ...(isAdmin ? { accessCode: accessCode ?? null } : {}),
  };
}
