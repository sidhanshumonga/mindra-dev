import { MindraAIConfig } from "./types";

/**
 * Executes a text prompt against the configured AI model provider.
 * Supports window.ai, OpenAI endpoints, Ollama local services, and custom JS runners.
 */
export async function executeAIPrompt(prompt: string, config: MindraAIConfig): Promise<string> {
  const provider = config.provider || "window.ai";

  if (provider === "custom" && config.customRunner) {
    return await config.customRunner(prompt);
  }

  if (provider === "window.ai") {
    if (typeof window === "undefined") {
      throw new Error("window.ai requires a browser environment");
    }

    const winAI = (window as any).ai;
    if (!winAI || !winAI.assistant) {
      throw new Error("window.ai / Gemini assistant is not enabled in this browser");
    }

    const assistant = await winAI.assistant.create();
    const result = await assistant.prompt(prompt);
    return result ? result.trim() : "";
  }

  if (provider === "openai") {
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error("OpenAI API key is missing in config");
    }

    const modelName = config.model || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API failed with status ${response.status}: ${errText}`);
    }

    const json = await response.json();
    return json.choices?.[0]?.message?.content?.trim() || "";
  }

  if (provider === "gemini") {
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error("Gemini API key is missing in config");
    }

    const modelName = config.model || "gemini-3.1-flash-lite";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API failed with status ${response.status}: ${errText}`);
    }

    const json = await response.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  }

  if (provider === "ollama") {
    const endpoint = config.endpoint || "http://localhost:11434";
    const modelName = config.model || "llama3";

    const response = await fetch(`${endpoint}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        prompt: prompt,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama API failed with status ${response.status}: ${errText}`);
    }

    const json = await response.json();
    return json.response?.trim() || "";
  }

  throw new Error(`Unsupported AI model provider: ${provider}`);
}
