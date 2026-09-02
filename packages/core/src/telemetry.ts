import { InteractionEvent, EventType } from "./types";
import { sanitizeElementId, createEventId } from "./identity";

/**
 * Resolves a stable, unique identifier path for any HTML element.
 * Prioritizes developer tags but falls back to DOM hierarchical landmarks and tags.
 */
export function resolveElementPath(el: HTMLElement): string {
  const customId = el.getAttribute("data-adaptive-id");
  if (customId) return sanitizeElementId(customId);

  const standardId = el.getAttribute("id");
  if (standardId) return sanitizeElementId(standardId);

  const path: string[] = [];
  let current: HTMLElement | null = el;

  while (current && current !== document.body && current.parentElement) {
    const tagName = current.tagName.toLowerCase();
    const role = current.getAttribute("role");
    const testId = current.getAttribute("data-testid") || current.getAttribute("data-test-id");

    let segment = tagName;

    if (testId) {
      segment += `[data-testid="${testId}"]`;
    } else if (role) {
      segment += `[role="${role}"]`;
    } else {
      // Find sibling tag index to differentiate duplicates
      const siblings = Array.from(current.parentElement.children);
      const taggedSiblings = siblings.filter((s) => s.tagName === current?.tagName);
      if (taggedSiblings.length > 1) {
        const index = taggedSiblings.indexOf(current) + 1;
        segment += `:nth-of-type(${index})`;
      }
    }

    path.unshift(segment);

    // Stop climbing early if a parent container contains an explicit ID
    if (current.getAttribute("data-adaptive-id") || current.getAttribute("id")) {
      break;
    }

    current = current.parentElement;
  }

  return sanitizeElementId(path.join("__"));
}

export class MindraTelemetry {
  private appId: string;
  private onEvent: (event: InteractionEvent) => void;
  private hoverTracker: Map<string, number> = new Map(); // elementId -> enter timestamp
  private listeners: Array<{ type: string; handler: EventListenerOrEventListenerObject }> = [];

  constructor(appId: string, onEvent: (event: InteractionEvent) => void) {
    this.appId = appId;
    this.onEvent = onEvent;
    this.initListeners();
  }

  private trigger(elementId: string, eventType: EventType, duration?: number): void {
    const event: InteractionEvent = {
      eventId: createEventId(),
      timestamp: Date.now(),
      appId: this.appId,
      pagePath: typeof window !== "undefined" ? window.location.pathname : "",
      elementId,
      eventType,
      metadata: duration ? { duration } : undefined,
    };
    this.onEvent(event);
  }

  private initListeners(): void {
    if (typeof window === "undefined" || !window.document) return;

    // 1. Mouse entry listener (start of hover/hesitation)
    const handleMouseOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-adaptive-id], button, input, select, a, [role='button']") as HTMLElement;
      if (!target) return;

      // Ignore internal child crossings
      if (e.relatedTarget && target.contains(e.relatedTarget as Node)) {
        return;
      }

      const elementId = resolveElementPath(target);
      if (!this.hoverTracker.has(elementId)) {
        this.hoverTracker.set(elementId, Date.now());
        this.trigger(elementId, "pointer_entry");
      }
    };

    // 2. Mouse exit listener (exit / abandonment tracker)
    const handleMouseOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-adaptive-id], button, input, select, a, [role='button']") as HTMLElement;
      if (!target) return;

      // Ignore internal child crossings
      if (e.relatedTarget && target.contains(e.relatedTarget as Node)) {
        return;
      }

      const elementId = resolveElementPath(target);
      const enterTime = this.hoverTracker.get(elementId);
      if (enterTime) {
        const hoverDuration = Date.now() - enterTime;
        this.hoverTracker.delete(elementId);
        this.trigger(elementId, "pointer_exit", hoverDuration);
      }
    };

    // 3. Click activations (hesitation calculation)
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("[data-adaptive-id], button, input, select, a, [role='button']") as HTMLElement;
      if (!target) return;

      const elementId = resolveElementPath(target);
      this.trigger(elementId, "activation");
    };

    // 4. Focus tracker
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const elementId = resolveElementPath(target);
      this.trigger(elementId, "focus_entry");
    };

    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("click", handleClick);
    document.addEventListener("focusin", handleFocus);

    this.listeners = [
      { type: "mouseover", handler: handleMouseOver as EventListener },
      { type: "mouseout", handler: handleMouseOut as EventListener },
      { type: "click", handler: handleClick as EventListener },
      { type: "focusin", handler: handleFocus as EventListener },
    ];
  }

  public destroy(): void {
    if (typeof window === "undefined" || !window.document) return;
    this.listeners.forEach(({ type, handler }) => {
      document.removeEventListener(type, handler);
    });
    this.hoverTracker.clear();
  }
}
