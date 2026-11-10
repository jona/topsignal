import { Buffer } from "node:buffer";
import {
  hasSecrets,
  isCredentialKey,
  redactSecrets,
} from "../local/secrets.js";

const MAX_SCREENED_FILE_BYTES = 1024 * 1024;
declare const screenedPrompt: unique symbol;
export type PreparedPrompt = string & { readonly [screenedPrompt]: true };

/** Omit a whole file when it contains recognized credential material. */
export function screenOutboundFile(
  text: string | null | undefined
): string | null {
  if (!text || Buffer.byteLength(text, "utf-8") > MAX_SCREENED_FILE_BYTES) {
    return null;
  }
  return hasSecrets(text) ? null : text;
}

/** Redact recognized credentials in metadata and in rendered prompts. */
export function redactOutboundText(text: string): string {
  return redactSecrets(text);
}

/** Mark the redacted text so the approved bytes can be sent unchanged. */
export function prepareOutboundPrompt(text: string): PreparedPrompt {
  return redactOutboundText(text) as PreparedPrompt;
}

/** Redact JSON-shaped data before rendering, truncating, or serializing it. */
export function sanitizeOutboundValue<T>(value: T): T;
export function sanitizeOutboundValue(value: unknown): unknown {
  if (typeof value === "string") return redactOutboundText(value);
  if (Array.isArray(value)) return value.map(sanitizeOutboundValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        redactOutboundText(key),
        isCredentialKey(key) && entry != null
          ? "[REDACTED]"
          : sanitizeOutboundValue(entry),
      ])
    );
  }
  return value;
}

export function screenOutboundPackageJson(
  text: string | null | undefined
): string | null {
  const screened = screenOutboundFile(text);
  if (!screened) return null;

  try {
    const manifest = JSON.parse(screened);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return null;
    }
    delete manifest.author;
    delete manifest.contributors;
    delete manifest.publishConfig;
    delete manifest.bugs;
    return JSON.stringify(manifest, null, 2);
  } catch {
    return null;
  }
}
