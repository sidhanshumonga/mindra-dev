/**
 * Element identity helpers.
 *
 * Element identifiers are derived from live DOM attributes and are then written
 * to durable storage and included in any sync payload. Applications routinely
 * template user data into those attributes (`id={`user-${email}`}`,
 * `id={`order-${orderId}`}`), so identifiers are scrubbed before they are used
 * as keys. Scrubbing happens at every boundary that touches a key, so a value
 * derived from the DOM and a value passed to `useAdaptive` always agree.
 */

/** Upper bound on a stored identifier, so a deep DOM cannot bloat the cache. */
export const MAX_ELEMENT_ID_LENGTH = 256;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Requires at least one digit so ordinary words built from a-f characters
// ("facade", "added") are not mistaken for hashes.
const LONG_HEX = /\b(?=[0-9a-f]*\d)[0-9a-f]{16,}\b/gi;
const DIGIT_RUN = /\d{4,}/g;

/**
 * Replaces values that look like personal or record-identifying data with a
 * stable placeholder. Two users hitting `order-1001` and `order-1002` collapse
 * to the same `order-#`, which is what makes the score meaningful anyway: the
 * familiarity being modelled belongs to the button, not to the row.
 */
export function sanitizeElementId(raw: string): string {
  if (!raw) return "";

  const scrubbed = raw
    .replace(EMAIL, "#")
    .replace(UUID, "#")
    .replace(LONG_HEX, "#")
    .replace(DIGIT_RUN, "#");

  return scrubbed.length > MAX_ELEMENT_ID_LENGTH
    ? scrubbed.slice(0, MAX_ELEMENT_ID_LENGTH)
    : scrubbed;
}

/** Collision-resistant event id, falling back where `crypto` is unavailable. */
export function createEventId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;

  if (c?.randomUUID) return c.randomUUID();

  if (c?.getRandomValues) {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  return Math.random().toString(36).substring(2, 11);
}
