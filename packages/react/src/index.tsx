"use client";

import React, { createContext, useContext, useEffect, useRef, useState, cloneElement, isValidElement } from "react";
import { MindraRuntime, MindraConfig, AdaptiveState, ExpertiseTier } from "@mindra/core";

const AdaptiveContext = createContext<MindraRuntime | null>(null);

interface AdaptiveProviderProps extends MindraConfig {
  children: React.ReactNode;
}

export function AdaptiveProvider({ children, ...config }: AdaptiveProviderProps) {
  const runtimeRef = useRef<MindraRuntime | null>(null);

  if (!runtimeRef.current) {
    runtimeRef.current = new MindraRuntime(config);
  }

  useEffect(() => {
    return () => {
      if (runtimeRef.current) {
        runtimeRef.current.destroy();
        runtimeRef.current = null;
      }
    };
  }, []);

  return (
    <AdaptiveContext.Provider value={runtimeRef.current}>
      {children}
    </AdaptiveContext.Provider>
  );
}

export interface UseAdaptiveOptions {
  mode?: "optimistic" | "passive";
  group?: string;
}

export function useAdaptive(
  elementId: string,
  options?: UseAdaptiveOptions
): AdaptiveState {
  const runtime = useContext(AdaptiveContext);

  // Server-safe default structure matching initial zero-interaction state
  const defaultState: AdaptiveState = {
    elementId,
    familiarity: 0,
    friction: 0.7,
    confidence: 0.12,
    expertise: "novice",
    suggestion: "show_tutorial",
  };

  const [state, setState] = useState<AdaptiveState>(defaultState);
  const mode = options?.mode || "optimistic";

  useEffect(() => {
    if (!runtime) {
      return;
    }

    // Load actual browser-side telemetry stats after mounting
    setState(runtime.getState(elementId, options?.group));

    // If mode is passive, do not subscribe to live updates during this mount session to prevent jarring UX shifts
    if (mode === "passive") {
      return;
    }

    const unsubscribe = runtime.subscribe((updatedId, updatedState) => {
      if (updatedId === elementId) {
        setState(updatedState);
      }
    });

    return unsubscribe;
  }, [runtime, elementId, mode, options?.group]);

  return state;
}

export function useTrackError() {
  const runtime = useContext(AdaptiveContext);

  return (elementId: string) => {
    if (runtime) {
      runtime.trackError(elementId);
    }
  };
}

export interface AdaptiveProps extends UseAdaptiveOptions {
  id: string;
  children: React.ReactNode;
  /** Content used when no tier variant matches and no AI content is available. */
  fallback?: string;
  /** Content shown to users with no established familiarity with this element. */
  novice?: string;
  learning?: string;
  proficient?: string;
  /** Content shown once the user is fluent with this element. */
  expert?: string;
}

const TIER_LADDER: ExpertiseTier[] = ["novice", "learning", "proficient", "expert"];

/**
 * Resolves the copy for the current tier, walking *down* the ladder to the
 * nearest variant the developer actually supplied. This means partial
 * specification behaves sensibly: given only `novice` and `expert`, a
 * "proficient" user still sees the novice copy rather than nothing, because
 * the interface should not simplify until the developer says it may.
 */
function resolveTierVariant(
  tier: ExpertiseTier,
  variants: Partial<Record<ExpertiseTier, string>>
): string | undefined {
  for (let i = TIER_LADDER.indexOf(tier); i >= 0; i--) {
    const candidate = variants[TIER_LADDER[i]];
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function parseHighlightedText(text: string): React.ReactNode {
  const lines = text.split("\n");
  const parsedLines = lines.map((line, lineIdx) => {
    const regex = /\{([^}]+)\}/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      const plainText = line.substring(lastIndex, match.index);
      if (plainText) {
        parts.push(plainText);
      }
      const highlight = match[1];
      parts.push(
        <span key={match.index} style={{ color: "#4B39EF" }}>
          {`{${highlight}}`}
        </span>
      );
      lastIndex = regex.lastIndex;
    }

    const remaining = line.substring(lastIndex);
    if (remaining) {
      parts.push(remaining);
    }

    const content = parts.length > 0 ? <>{parts}</> : line;
    
    return (
      <React.Fragment key={lineIdx}>
        {content}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });

  return <>{parsedLines}</>;
}

export function Adaptive({
  id,
  children,
  fallback,
  novice,
  learning,
  proficient,
  expert,
  ...options
}: AdaptiveProps) {
  const state = useAdaptive(id, options);

  // Developer-authored copy wins over generated copy, which wins over the
  // static fallback. This keeps the deterministic path fully usable with no
  // model configured.
  const contentOverride =
    resolveTierVariant(state.expertise, { novice, learning, proficient, expert }) ??
    state.aiContent ??
    fallback;

  // Content is always rendered visible. The server and the first client render
  // both produce the novice variant, so hydration matches; the resolved tier is
  // applied in an effect immediately after. Hiding the element until then would
  // leave it permanently invisible wherever scripts fail or are disabled.
  if (!isValidElement(children)) {
    return (
      <span data-adaptive-id={id} data-adaptive-tier={state.expertise}>
        {contentOverride ? parseHighlightedText(contentOverride) : children}
      </span>
    );
  }

  const childProps = children.props as any;
  const props: any = {
    // Close the loop with the telemetry layer. Without this attribute the
    // runtime resolves a positional DOM path instead of `id`, so the element
    // this component adapts is not the element it collects events for.
    "data-adaptive-id": childProps["data-adaptive-id"] ?? id,
    // Exposed so consumers can drive transitions from their own stylesheet
    // instead of this component imposing inline styles on their element.
    "data-adaptive-tier": state.expertise,
  };

  if (contentOverride) {
    if (children.type === "input") {
      props.placeholder = contentOverride;
    } else {
      props.children = parseHighlightedText(contentOverride);
    }
  }

  return cloneElement(children as React.ReactElement, props);
}
