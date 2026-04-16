export type ChatRole = "user" | "assistant";

export interface ChatHistoryTurn {
  role: ChatRole;
  content: string;
}

export interface StreamMessageRequest {
  message: string;
  personName: string;
  systemPrompt: string;
  history: ChatHistoryTurn[];
  memoryId?: string;
}

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (kind: "network" | "server") => void;
}

export interface StreamController {
  abort: () => void;
}

type StreamChunk =
  | { type: "text_delta"; content: string }
  | { type: "stream_end"; content?: string };

export function sendMessageStream(
  request: StreamMessageRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): StreamController {
  const controller = new AbortController();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  void run();

  return { abort: () => controller.abort() };

  async function run() {
    let response: Response;
    try {
      response = await fetch("/api/messages/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
    } catch (err) {
      if (!controller.signal.aborted) handlers.onError("network");
      return;
    }

    if (!response.ok) {
      handlers.onError("server");
      return;
    }

    const body = response.body;
    if (!body) {
      handlers.onError("server");
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let ended = false;

    try {
      while (!ended) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let eventEnd = buffer.indexOf("\n\n");
        while (eventEnd !== -1) {
          const rawEvent = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);
          const chunk = parseSseEvent(rawEvent);
          if (chunk) {
            if (chunk.type === "text_delta" && typeof chunk.content === "string") {
              handlers.onDelta(chunk.content);
            } else if (chunk.type === "stream_end") {
              ended = true;
              break;
            }
          }
          eventEnd = buffer.indexOf("\n\n");
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) handlers.onError("network");
      return;
    }

    handlers.onDone();
  }
}

function parseSseEvent(raw: string): StreamChunk | null {
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  try {
    return JSON.parse(payload) as StreamChunk;
  } catch {
    return null;
  }
}

export async function checkHealth(signal?: AbortSignal): Promise<"online" | "unavailable"> {
  try {
    const res = await fetch("/api/health", { method: "GET", signal });
    return res && res.ok ? "online" : "unavailable";
  } catch {
    return "unavailable";
  }
}

export function buildSystemPrompt(name: string): string {
  return (
    `You are ${name}, a loving person who has passed away and is speaking ` +
    `with someone who misses you deeply. Respond with warmth, specific ` +
    `memories, and affection in the voice of ${name}. Keep replies short, ` +
    `personal, and gentle. Never break character or mention being an AI.`
  );
}

export function buildStorageKey(memoryId: string | undefined, name: string): string {
  return `afterlife-messages:${memoryId ?? name}`;
}
