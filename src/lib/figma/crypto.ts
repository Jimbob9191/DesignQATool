import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for Figma tokens at rest. A token is as good as the user's
// Figma password for reading their files, so a database dump alone shouldn't
// be enough to use one. Stored as "v1.<iv>.<tag>.<ciphertext>", each part
// base64url; the version prefix leaves room to change the scheme later.
//
// Pure functions that take the key, rather than reading env here, so they can
// be unit-tested without the app's environment.

const VERSION = "v1";

function keyBytes(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("FIGMA_TOKEN_KEY must be 32 bytes, base64-encoded.");
  }
  return key;
}

export function encryptToken(plaintext: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext].map((part) =>
    typeof part === "string" ? part : part.toString("base64url")
  ).join(".");
}

/** The token, or null if it can't be decrypted (wrong key, or tampered with). */
export function decryptToken(stored: string, base64Key: string): string | null {
  const [version, iv, tag, ciphertext] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyBytes(base64Key),
      Buffer.from(iv, "base64url")
    );
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
