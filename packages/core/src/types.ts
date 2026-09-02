export interface MindraAIConfig {
  provider?: "window.ai" | "openai" | "gemini" | "ollama" | "custom" | "server";
  apiKey?: string;     // For OpenAI/Gemini cloud access
  endpoint?: string;   // Ollama base URL (e.g. http://localhost:11434), or the
                       // URL of your own compile endpoint when provider is "server"
  model?: string;      // Model identifier (e.g. gpt-4o, gemini-3.1-flash-lite, llama3)
  customRunner?: (prompt: string) => Promise<string>; // Client custom JS executor callback
}

export interface MindraConfig {
  appId: string;
  /**
   * Identifies whose experience this is. Without it, state is shared by
   * everyone using the browser — two people on one machine build a single
   * familiarity profile between them.
   *
   * The value is hashed before it becomes a storage key, so passing an email or
   * an account id does not write that value into localStorage.
   */
  userId?: string;
  lambda?: number; // Learning coefficient for familiarity decay
  storageKey?: string; // Key prefix for LocalStorage
  syncInterval?: number; // Throttle interval for sync in ms
  onSync?: (events: InteractionEvent[]) => Promise<void>; // Optional sync callback
  ai?: MindraAIConfig; // Configuration settings for AI prompt triggers
}

export type EventType =
  | "pointer_entry"
  | "pointer_exit"
  | "activation"
  | "focus_entry"
  | "completion"
  | "error";

export interface InteractionEvent {
  eventId: string;
  timestamp: number;
  appId: string;
  pagePath: string;
  elementId: string;
  eventType: EventType;
  metadata?: {
    duration?: number;
    hasError?: boolean;
    errorType?: string;
  };
}

export interface ElementStats {
  /** Epoch ms of the last interaction, used to evict the coldest entries. */
  lastSeen?: number;
  clicks: number;
  hovers: number;
  abandonments: number;
  errors: number;
  totalHesitation: number; // accumulated hesitation in ms
  aiCache?: Record<string, string>; // Cached AI generated recommendations/copy per expertise tier
}

export type ExpertiseTier = "novice" | "learning" | "proficient" | "expert";

export type AdaptationSuggestion =
  | "show_tutorial"
  | "inline_details"
  | "show_shortcut"
  | "silent";

export interface AdaptiveState {
  elementId: string;
  familiarity: number; // 0.0 to 1.0
  friction: number; // 0.0 to 1.0
  confidence: number; // 0.0 to 1.0
  expertise: ExpertiseTier;
  suggestion: AdaptationSuggestion;
  aiContent?: string; // Asynchronously resolved local AI suggestion/tip
}
