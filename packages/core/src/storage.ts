import { ElementStats } from "./types";
import { sanitizeElementId, hashIdentifier } from "./identity";

const DEFAULT_STATS: ElementStats = {
  clicks: 0,
  hovers: 0,
  abandonments: 0,
  errors: 0,
  totalHesitation: 0,
};

/**
 * Upper bound on tracked elements. Every element a user ever hovers earns an
 * entry, so an unbounded cache grows for the lifetime of the origin and will
 * eventually exhaust the ~5MB localStorage budget.
 */
const MAX_ELEMENTS = 500;

/** Writes are coalesced over this window rather than serialising per event. */
const FLUSH_DELAY_MS = 500;

export class MindraStorage {
  private cache: Record<string, ElementStats> = {};
  private storageKey: string;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private onPageHide?: () => void;
  private onPersist?: (stats: Record<string, ElementStats>) => void;
  /**
   * The last state handed to `onPersist`, so a flush that changed nothing does
   * not trigger a redundant write to the consumer's storage.
   */
  private lastPersisted: string | null = null;

  constructor(
    appId: string,
    customKeyPrefix?: string,
    userId?: string,
    onPersist?: (stats: Record<string, ElementStats>) => void
  ) {
    const scope = userId ? `_u${hashIdentifier(userId)}` : "";
    this.storageKey = `${customKeyPrefix || "mindra"}_stats_${appId}${scope}`;
    this.onPersist = onPersist;
    this.load();
    this.bindLifecycle();
  }

  private load(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          this.cache = parsed;
        }
      }
    } catch (e) {
      console.warn("Mindra: failed to load experience cache", e);
    }
  }

  /**
   * A debounced cache can lose its last writes when the page goes away, so the
   * pending state is committed on the terminal lifecycle events. `pagehide`
   * covers the bfcache path that `beforeunload` misses on mobile Safari.
   */
  private bindLifecycle(): void {
    if (typeof window === "undefined" || !window.addEventListener) return;

    this.onPageHide = () => this.flush();
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flush();
    });
  }

  /**
   * Drops the coldest entries once the cache exceeds its cap. Entries without a
   * `lastSeen` predate eviction and are treated as coldest.
   */
  private evictIfNeeded(): void {
    const keys = Object.keys(this.cache);
    if (keys.length <= MAX_ELEMENTS) return;

    keys
      .sort((a, b) => (this.cache[a].lastSeen || 0) - (this.cache[b].lastSeen || 0))
      .slice(0, keys.length - MAX_ELEMENTS)
      .forEach((k) => delete this.cache[k]);
  }

  /** Commits pending state to localStorage immediately. */
  public flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (!this.dirty || typeof window === "undefined") return;

    this.evictIfNeeded();

    try {
      const serialized = JSON.stringify(this.cache);
      localStorage.setItem(this.storageKey, serialized);
      this.dirty = false;
      this.notifyPersist(serialized);
    } catch (e) {
      // Almost always a quota error. Shed half the cache and try once more
      // rather than failing every subsequent write for the rest of the session.
      const keys = Object.keys(this.cache);
      if (keys.length > 1) {
        keys
          .sort((a, b) => (this.cache[a].lastSeen || 0) - (this.cache[b].lastSeen || 0))
          .slice(0, Math.ceil(keys.length / 2))
          .forEach((k) => delete this.cache[k]);
        try {
          localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
          this.dirty = false;
          return;
        } catch {
          /* fall through to the warning below */
        }
      }
      console.warn("Mindra: failed to persist experience cache", e);
    }
  }

  /**
   * Hands settled state to the consumer, skipping content identical to what was
   * handed over last time. A consumer that throws must not break local storage,
   * so the callback is isolated.
   */
  private notifyPersist(serialized: string): void {
    if (!this.onPersist || serialized === this.lastPersisted) return;
    this.lastPersisted = serialized;
    try {
      this.onPersist({ ...this.cache });
    } catch (e) {
      console.warn("Mindra: onPersist handler threw", e);
    }
  }

  /** Marks the cache dirty and schedules a coalesced write. */
  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer || typeof window === "undefined") return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DELAY_MS);
  }

  /** @deprecated Prefer `flush()`. Retained so existing callers keep working. */
  public save(): void {
    this.flush();
  }

  public getStats(elementId: string): ElementStats {
    const key = sanitizeElementId(elementId);
    if (!this.cache[key]) {
      return { ...DEFAULT_STATS };
    }
    return { ...this.cache[key] };
  }

  public updateStats(
    elementId: string,
    updater: (prev: ElementStats) => ElementStats
  ): ElementStats {
    const key = sanitizeElementId(elementId);
    const prev = this.getStats(key);
    const updated = updater(prev);
    updated.lastSeen = Date.now();
    this.cache[key] = updated;
    this.scheduleFlush();
    return updated;
  }

  public getAll(): Record<string, ElementStats> {
    return { ...this.cache };
  }

  /**
   * Seeds the cache from state persisted elsewhere — a backend, another device.
   *
   * With `merge`, counters are combined by taking the larger of the two rather
   * than summing. Summing would inflate the score every time the same history
   * was hydrated twice; taking the maximum is idempotent, so re-hydrating is
   * always safe, and familiarity never moves backwards.
   */
  public hydrate(
    stats: Record<string, ElementStats>,
    options: { merge?: boolean } = {}
  ): void {
    for (const [rawId, incoming] of Object.entries(stats || {})) {
      if (!incoming || typeof incoming !== "object") continue;
      const key = sanitizeElementId(rawId);

      if (!options.merge || !this.cache[key]) {
        this.cache[key] = { ...DEFAULT_STATS, ...incoming };
        continue;
      }

      const current = this.cache[key];
      this.cache[key] = {
        clicks: Math.max(current.clicks || 0, incoming.clicks || 0),
        hovers: Math.max(current.hovers || 0, incoming.hovers || 0),
        abandonments: Math.max(current.abandonments || 0, incoming.abandonments || 0),
        errors: Math.max(current.errors || 0, incoming.errors || 0),
        totalHesitation: Math.max(current.totalHesitation || 0, incoming.totalHesitation || 0),
        lastSeen: Math.max(current.lastSeen || 0, incoming.lastSeen || 0),
        aiCache: { ...(current.aiCache || {}), ...(incoming.aiCache || {}) },
      };
    }
    this.lastPersisted = JSON.stringify(this.cache);
    this.scheduleFlush();
  }

  public clear(): void {
    this.cache = {};
    this.dirty = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {}
    }
  }

  /** Commits pending state and releases lifecycle listeners. */
  public destroy(): void {
    this.flush();
    if (typeof window !== "undefined" && this.onPageHide) {
      window.removeEventListener("pagehide", this.onPageHide);
      this.onPageHide = undefined;
    }
  }
}
