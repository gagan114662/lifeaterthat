/**
 * FAILING TESTS — AI Chat Features (CH9–CH12, CH17–CH21)
 * PRD Section 3.3
 *
 * All tests here are EXPECTED TO FAIL. They document the real behaviour
 * required once a backend + AI API is wired in.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatScreen from "@/components/ChatScreen";


// ─── Helpers ──────────────────────────────────────────────────────────────────

function encodeSse(chunks: Array<{ type: string; content: string }>): Uint8Array {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
  return new TextEncoder().encode(text);
}

function sseResponse(chunks: Array<{ type: string; content: string }>) {
  const bytes = encodeSse(chunks);
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          releaseLock: () => {},
          cancel: async () => {},
        };
      },
    },
  };
}

function mockApiSuccess(reply: string) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/health")) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    return Promise.resolve(
      sseResponse([
        { type: "text_delta", content: reply },
        { type: "stream_end", content: "" },
      ]),
    );
  });
}

function mockApiFailure(status = 500) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/health")) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    return Promise.resolve({ ok: false, status });
  });
}

async function sendMessage(text: string) {
  // Use Enter key — the code already supports this and avoids needing aria-label on send button
  await userEvent.type(screen.getByPlaceholderText("Type a message..."), `${text}{Enter}`);
}

interface RequestBody {
  message: string;
  personName: string;
  systemPrompt: string;
  history: Array<{ role: string; content: string }>;
  memoryId?: string;
}

function messageCallBody(index = 0): RequestBody {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
    (c) => typeof c[0] === "string" && c[0].includes("/api/messages/stream"),
  );
  return JSON.parse(calls[index][1].body) as RequestBody;
}

// ─── CH9: Real AI API call ───────────────────────────────────────────────────

describe("CH9 — Real LLM API integration", () => {
  it("POSTs to /api/messages with the user's message", async () => {
    mockApiSuccess("I love you too.");
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("I love you");

    // FAILS: sendMessage uses setTimeout internally; fetch is never called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/messages"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining("I love you"),
      })
    );
  });

  it("renders the API reply in the chat", async () => {
    const aiReply = "Every day I think about your smile.";
    mockApiSuccess(aiReply);
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Do you miss me?");

    // FAILS: reply is one of 5 hardcoded strings, not the API value
    await waitFor(() => {
      expect(screen.getByText(aiReply)).toBeInTheDocument();
    });
  });

  it("does not call fetch more than once per sent message", async () => {
    mockApiSuccess("Reply.");
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hello");
    await waitFor(() => screen.getByText("Reply."));

    // FAILS: fetch is never called at all
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

// ─── CH10: Persona-aware system prompt ───────────────────────────────────────

describe("CH10 — AI persona includes person's name and relationship context", () => {
  it("sends person name in the API request body", async () => {
    mockApiSuccess("Yes, I remember.");
    render(<ChatScreen name="Grandma Betty" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Do you remember our garden?");

    const body = messageCallBody(0);
    expect(body.personName).toBe("Grandma Betty");
  });

  it("sends a system prompt that references the deceased person's name", async () => {
    mockApiSuccess("I love you.");
    render(<ChatScreen name="Grandma Betty" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hi");

    const body = messageCallBody(0);
    expect(body.systemPrompt).toContain("Grandma Betty");
  });

  it("welcome message body (not just header) references the person's name", () => {
    render(<ChatScreen name="Grandma Betty" photo="blob:photo" onBack={vi.fn()} />);

    // Must find the name inside the welcome greeting itself, not only the header.
    expect(
      screen.getByText(
        (content) => /Grandma Betty/i.test(content) && /hear from you/i.test(content),
      ),
    ).toBeInTheDocument();
  });
});

// ─── CH11: Conversation history sent to API ───────────────────────────────────

describe("CH11 — Full conversation history sent with each API request", () => {
  it("sends all previous messages in the second API call", async () => {
    let streamCount = 0;
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/health")) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      streamCount++;
      return Promise.resolve(
        sseResponse([
          { type: "text_delta", content: `Reply ${streamCount}` },
          { type: "stream_end", content: "" },
        ]),
      );
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    await sendMessage("First message");
    await waitFor(() => screen.getByText("Reply 1"));

    await sendMessage("Second message");
    await waitFor(() => screen.getByText("Reply 2"));

    const messageCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("/api/messages/stream"),
    );
    const secondCallBody = JSON.parse(messageCalls[1][1].body);
    expect(secondCallBody.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "First message" }),
        expect.objectContaining({ role: "assistant", content: "Reply 1" }),
      ]),
    );
  });

  it("includes the welcome message as the first assistant turn in history", async () => {
    mockApiSuccess("I am here.");
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hello");

    const body = messageCallBody(0);
    expect(body.history[0]).toMatchObject({
      role: "assistant",
      content: expect.stringContaining("good to hear from you"),
    });
  });
});

// ─── CH12: System prompt built from memory data ───────────────────────────────

describe("CH12 — API request includes a persona system prompt built from memory", () => {
  it("request body contains a systemPrompt field", async () => {
    mockApiSuccess("Reply.");
    render(
      <ChatScreen
        name="Grandma Betty"
        photo="blob:photo"
        // @ts-expect-error — prop not yet implemented
        voiceSample="blob:voice"
        memoryId="mem-123"
        onBack={vi.fn()}
      />
    );
    await sendMessage("Hello");

    const body = messageCallBody(0);
    expect(body.systemPrompt).toBeDefined();
    expect(typeof body.systemPrompt).toBe("string");
    expect(body.systemPrompt.length).toBeGreaterThan(50);
  });

  it("system prompt instructs the model to speak as the named person", async () => {
    mockApiSuccess("Reply.");
    render(
      <ChatScreen
        name="Grandma Betty"
        photo="blob:photo"
        onBack={vi.fn()}
      />
    );
    await sendMessage("Hello");

    const body = messageCallBody(0);
    expect(body.systemPrompt.toLowerCase()).toContain("grandma betty");
  });
});

// ─── CH17: Online status tied to service health ───────────────────────────────

describe("CH17 — Online status reflects AI service availability", () => {
  it("calls a health endpoint on mount", async () => {
    mockApiSuccess("ok");
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    // FAILS: no health check fetch on mount
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/health"),
        expect.anything()
      );
    });
  });

  it('shows "Unavailable" when health endpoint returns 503', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 503 });
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    // FAILS: status is hardcoded as "Online"
    await waitFor(() => {
      expect(screen.queryByText("Online")).not.toBeInTheDocument();
      expect(screen.getByText(/unavailable|offline/i)).toBeInTheDocument();
    });
  });
});

// ─── CH18: Error state when AI API fails ─────────────────────────────────────

describe("CH18 — Error handling when the AI API fails", () => {
  it("shows an inline error message when the API returns 500", async () => {
    mockApiFailure(500);
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hello");

    // FAILS: fetch is never called; no error handling exists
    await waitFor(() => {
      expect(
        screen.getByText(/something went wrong|try again|error/i)
      ).toBeInTheDocument();
    });
  });

  it("shows an error when the network is offline", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new TypeError("Failed to fetch")
    );

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hello");

    // FAILS: no network error handling exists
    await waitFor(() => {
      expect(screen.getByText(/no connection|network error|offline/i)).toBeInTheDocument();
    });
  });

  it("allows retrying the failed message", async () => {
    mockApiFailure(500);
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hello");

    // FAILS: no retry button exists
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });

  it("disables the send button while a request is in flight", async () => {
    let resolveApi!: (v: unknown) => void;
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((res) => { resolveApi = res; })
    );

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello{Enter}");
    });

    // FAILS: send button is only disabled when input is empty; no loading state exists
    // The button element (found by position — it follows the input) should be disabled while fetching
    const allButtons = screen.getAllByRole("button");
    const sendBtn = allButtons[allButtons.length - 1]; // last button is the send button
    expect(sendBtn).toBeDisabled();

    await act(async () => {
      resolveApi({ ok: true, json: async () => ({ reply: "Hi" }) });
    });
  });
});

// ─── CH19: Conversation history persistence ───────────────────────────────────

describe("CH19 — Messages persist across navigation and page refresh", () => {
  it("saves messages to a per-persona localStorage key after each reply", async () => {
    mockApiSuccess("I'm here.");
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Hello");

    await waitFor(() => screen.getByText("I'm here."));

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "afterlife-messages:Grandma",
      expect.stringContaining("Hello"),
    );
  });

  it("loads saved messages from localStorage on mount using the persona-scoped key", () => {
    const saved = JSON.stringify([
      { id: "1", role: "user" as const, content: "Saved message" },
      { id: "2", role: "assistant" as const, content: "Saved reply" },
    ]);
    localStorage.getItem = vi.fn((key) =>
      key === "afterlife-messages:Grandma" ? saved : null,
    );

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    expect(screen.getByText("Saved message")).toBeInTheDocument();
    expect(screen.getByText("Saved reply")).toBeInTheDocument();
  });
});

// ─── CH21: Typing indicator tied to real async ───────────────────────────────

describe("CH21 — Typing indicator lifecycle follows API promise, not setTimeout", () => {
  it("shows typing indicator immediately after send", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    await act(async () => {
      await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello{Enter}");
    });

    // FAILS: typing indicator will disappear after setTimeout fires
    expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();
  });

  it("typing indicator has aria-live='polite' for accessibility", () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    // FAILS: typing indicator has no aria-live attribute
    expect(screen.getByTestId("typing-indicator")).toHaveAttribute("aria-live", "polite");
  });
});
