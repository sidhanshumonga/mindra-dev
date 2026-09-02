import { MindraConfig, AdaptiveState, InteractionEvent, ExpertiseTier, ElementStats } from "./types";
import { MindraStorage } from "./storage";
import { MindraTelemetry } from "./telemetry";
import { evaluateElementState } from "./scoring";
import { executeAIPrompt } from "./ai";
import { createEventId } from "./identity";

export * from "./types";
export * from "./identity";
export * from "./scoring";
export * from "./storage";
export * from "./telemetry";
export * from "./ai";

export class MindraRuntime {
  private config: MindraConfig;
  private storage: MindraStorage;
  private telemetry: MindraTelemetry;
  private subscribers: Set<(elementId: string, state: AdaptiveState) => void> = new Set();
  private eventBuffer: InteractionEvent[] = [];
  private syncTimer: any = null;
  private enterTimestamps: Map<string, number> = new Map();
  private activeElements: Set<string> = new Set();
  private elementGroups: Map<string, string> = new Map();

  constructor(config: MindraConfig) {
    this.config = config;

    // Local-first by default. With no `onSync` handler nothing ever leaves
    // the browser; with no `ai` config the runtime is fully deterministic and
    // needs no model, no API key and no network. Both are strictly opt-in.
    this.storage = new MindraStorage(config.appId, config.storageKey, config.userId);
    this.telemetry = new MindraTelemetry(config.appId, (event) => this.handleEvent(event));

    if (this.config.ai) {
      setTimeout(() => this.batchFetchAISuggestions(), 1000);
    }
  }

  private handleEvent(event: InteractionEvent): void {
    const { elementId, eventType, timestamp } = event;

    // Only retain events when a sync target exists. Without this the buffer
    // grows for the lifetime of the page and is never drained.
    if (this.config.onSync) {
      this.eventBuffer.push(event);
    }

    if (eventType === "pointer_entry") {
      this.enterTimestamps.set(elementId, timestamp);
    }

    this.storage.updateStats(elementId, (prev) => {
      const stats = { ...prev };
      if (eventType === "activation") {
        stats.clicks += 1;
        const entry = this.enterTimestamps.get(elementId);
        if (entry) {
          const hesitation = timestamp - entry;
          if (hesitation < 8000) {
            stats.totalHesitation += hesitation;
          }
          this.enterTimestamps.delete(elementId);
        }
      } else if (eventType === "pointer_entry") {
        stats.hovers += 1;
      } else if (eventType === "pointer_exit") {
        if (this.enterTimestamps.has(elementId)) {
          stats.abandonments += 1;
          this.enterTimestamps.delete(elementId);
        }
      } else if (eventType === "error") {
        stats.errors += 1;
      }
      return stats;
    });

    // Notify listeners about element change
    const updatedState = this.getState(elementId);
    this.subscribers.forEach((cb) => cb(elementId, updatedState));

    this.scheduleSync();
  }

  public getState(elementId: string, group?: string): AdaptiveState {
    this.activeElements.add(elementId);
    if (group) {
      this.elementGroups.set(elementId, group);
    }

    let stats = this.storage.getStats(elementId);
    const activeGroup = group || this.elementGroups.get(elementId);

    if (activeGroup) {
      let totalClicks = 0;
      let totalHovers = 0;
      let count = 0;
      this.elementGroups.forEach((gName, id) => {
        if (gName === activeGroup && id !== elementId) {
          const s = this.storage.getStats(id);
          totalClicks += s.clicks;
          totalHovers += s.hovers;
          count++;
        }
      });
      if (count > 0) {
        stats = {
          clicks: Math.max(stats.clicks, Math.round(totalClicks / count)),
          hovers: Math.max(stats.hovers, Math.round(totalHovers / count)),
          abandonments: stats.abandonments,
          errors: stats.errors,
          totalHesitation: stats.totalHesitation
        };
      }
    }

    const state = evaluateElementState(elementId, stats, this.config.lambda || 8);

    if (this.config.ai) {
      const tier = state.expertise;
      const cached = stats.aiCache?.[tier];
      if (cached) {
        state.aiContent = cached;
      }
    }

    return state;
  }

  private async batchFetchAISuggestions(): Promise<void> {
    if (!this.config.ai || this.activeElements.size === 0) return;

    const itemsToFetch: { elementId: string; tier: ExpertiseTier }[] = [];
    
    this.activeElements.forEach(elementId => {
      const stats = this.storage.getStats(elementId);
      const state = evaluateElementState(elementId, stats, this.config.lambda || 8);
      const tier = state.expertise;
      const cached = stats.aiCache?.[tier];
      if (!cached) {
        itemsToFetch.push({ elementId, tier });
      }
    });

    if (itemsToFetch.length === 0) return;

    if (this.config.ai.provider === "server") {
      const endpoint = this.config.ai.endpoint;
      if (!endpoint) {
        console.warn(
          "Mindra: ai.provider is \"server\" but no ai.endpoint was configured. " +
          "Set it to the URL of your own rule-compilation endpoint."
        );
        return;
      }

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.config.appId
          },
          body: JSON.stringify({
            appId: this.config.appId,
            elements: itemsToFetch.map(item => ({
              elementId: item.elementId,
              tier: item.tier
            }))
          })
        });

        if (res.ok) {
          const parsed = await res.json();
          itemsToFetch.forEach(item => {
            const val = parsed[item.elementId];
            if (val) {
              this.storage.updateStats(item.elementId, (prev) => {
                const stats = { ...prev };
                if (!stats.aiCache) stats.aiCache = {};
                stats.aiCache[item.tier] = val.trim();
                return stats;
              });
              const updatedState = this.getState(item.elementId);
              this.subscribers.forEach((cb) => cb(item.elementId, updatedState));
            }
          });
        }
      } catch (e) {
        console.warn("Mindra AI: failed to fetch server adaptations", e);
      }
      return;
    }

    try {
      const itemsDescription = itemsToFetch.map(item => {
        let constraint = "very short button action label or input placeholder (1-3 words)";
        if (item.elementId.endsWith("-title")) {
          constraint = "adapted headline or title variant (4-8 words) that keeps the original meaning but adapts the tone (e.g. more technical/concise for experts, more educational for novices)";
        } else if (item.elementId.endsWith("-desc")) {
          constraint = "concise sub-heading or paragraph description (10-25 words) that explains the concept in a tone matching their expertise";
        }
        return `- '${item.elementId}' (tier: ${item.tier}): must be a ${constraint}`;
      }).join("\n");

      const prompt = `You are a professional UX copywriting assistant.
For each of the following interface elements, suggest an adapted copywriting variation targeted to the user's expertise tier:
${itemsDescription}

Return the results strictly as a JSON object matching this structure:
{
  ${itemsToFetch.map(item => `"${item.elementId}": "adapted text here"`).join(",\n  ")}
}
Do not include markdown tags, quotes, backticks, or any conversational greetings. Return raw JSON text only.`;

      const resultText = await executeAIPrompt(prompt, this.config.ai);
      let cleaned = resultText.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```json\s*/, "").replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleaned);
      
      itemsToFetch.forEach(item => {
        const val = parsed[item.elementId];
        if (val) {
          this.storage.updateStats(item.elementId, (prev) => {
            const stats = { ...prev };
            if (!stats.aiCache) stats.aiCache = {};
            stats.aiCache[item.tier] = val.trim();
            return stats;
          });
          const updatedState = this.getState(item.elementId);
          this.subscribers.forEach((cb) => cb(item.elementId, updatedState));
        }
      });
    } catch (e) {
      console.warn("Mindra AI: failed to batch generate adaptation copy", e);
    }
  }

  /**
   * The full experience state, ready to persist wherever you keep user data.
   * Pair with `hydrate` to carry familiarity across devices; the library itself
   * stores nothing beyond this browser.
   */
  public exportStats(): Record<string, ElementStats> {
    return this.storage.getAll();
  }

  /** Seeds state persisted elsewhere. See MindraStorage.hydrate for merge semantics. */
  public hydrate(
    stats: Record<string, ElementStats>,
    options: { merge?: boolean } = {}
  ): void {
    this.storage.hydrate(stats, options);
    this.activeElements.forEach((elementId) => {
      const state = this.getState(elementId);
      this.subscribers.forEach((cb) => cb(elementId, state));
    });
  }

  public trackError(elementId: string): void {
    const event: InteractionEvent = {
      eventId: createEventId(),
      timestamp: Date.now(),
      appId: this.config.appId,
      pagePath: typeof window !== "undefined" ? window.location.pathname : "",
      elementId,
      eventType: "error",
    };
    this.handleEvent(event);
  }

  public subscribe(cb: (elementId: string, state: AdaptiveState) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private scheduleSync(): void {
    if (!this.config.onSync || this.syncTimer) return;
    const interval = this.config.syncInterval || 5000;
    this.syncTimer = setTimeout(async () => {
      this.syncTimer = null;
      if (this.eventBuffer.length === 0) return;
      const batch = [...this.eventBuffer];
      this.eventBuffer = [];
      try {
        await this.config.onSync!(batch);
      } catch (e) {
        console.warn("Mindra: sync failed, restoring buffer queue", e);
        this.eventBuffer = [...batch, ...this.eventBuffer];
      }
    }, interval);
  }

  public destroy(): void {
    this.telemetry.destroy();
    this.storage.destroy();
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.subscribers.clear();
    this.enterTimestamps.clear();
    this.activeElements.clear();
  }
}
