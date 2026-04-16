/**
 * Streaming + persistence-scoping tests for Issue #6.
 *
 * Proves:
 *   - SSE chunks from /api/messages/stream render progressively.
 *   - Storage key is scoped per memoryId/name.
 *   - retryLast does not duplicate the user message in history.
 */

import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import ChatScreen from "@/components/ChatScreen";
import { sendMessageStream, buildStorageKey } from "@/lib/streamClient";

function encodeSse(chunks: Array<{ type: string; content: string }>): Uint8Array {
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("");
  return new TextEncoder().encode(text);
}

function sseResponseFromBytes(chunksOfBytes: Uint8Array[]) {
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => {
        let i = 0;
        return {
          read: async () => {
            if (i >= chunksOfBytes.length) return { done: true, value: undefined };
            const value = chunksOfBytes[i++];
            return { done: false, value };
          },
          releaseLock: () => {},
          cancel: async () => {},
        };
      },
    },
  };
}

function mockMessageStream(chunks: Array<{ type: string; content: string }>) {
  const bytes = encodeSse(chunks);
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/health")) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    return Promise.resolve(sseResponseFromBytes([bytes]));
  });
}

async function sendMessage(text: string) {
  await userEvent.type(
    screen.getByPlaceholderText("Type a message..."),
    `${text}{Enter}`,
  );
}

// ─── Storage key scoping ─────────────────────────────────────────────────────

describe("Storage scoping — per memoryId / name", () => {
  it("buildStorageKey prefers memoryId over name", () => {
    expect(buildStorageKey("mem-123", "Grandma")).toBe("afterlife-messages:mem-123");
  });

  it("buildStorageKey falls back to name when memoryId absent", () => {
    expect(buildStorageKey(undefined, "Grandpa")).toBe("afterlife-messages:Grandpa");
  });

  it("ChatScreen for different names reads different storage keys", () => {
    const saved = JSON.stringify([
      { id: "1", role: "user" as const, content: "Only for Grandma" },
    ]);
    localStorage.getItem = vi.fn((key) =>
      key === "afterlife-messages:Grandma" ? saved : null,
    );

    render(<ChatScreen name="Grandpa" photo="blob:photo" onBack={vi.fn()} />);

    // Grandpa should NOT see Grandma's saved text.
    expect(screen.queryByText("Only for Grandma")).not.toBeInTheDocument();
  });

  it("ChatScreen persists under the memoryId-scoped key when memoryId is provided", async () => {
    mockMessageStream([
      { type: "text_delta", content: "ok" },
      { type: "stream_end", content: "" },
    ]);

    render(
      <ChatScreen
        name="Anyone"
        photo="blob:photo"
        onBack={vi.fn()}
        memoryId="mem-xyz"
      />,
    );
    await sendMessage("hey");
    await waitFor(() => screen.getByText("ok"));

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "afterlife-messages:mem-xyz",
      expect.stringContaining("hey"),
    );
    expect(localStorage.setItem).not.toHaveBeenCalledWith(
      "afterlife-messages",
      expect.anything(),
    );
  });
});

// ─── SSE progressive rendering ───────────────────────────────────────────────

describe("SSE streaming — progressive rendering", () => {
  it("POSTs to /api/messages/stream (not the non-streaming endpoint)", async () => {
    mockMessageStream([
      { type: "text_delta", content: "hi" },
      { type: "stream_end", content: "" },
    ]);

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("hello");
    await waitFor(() => screen.getByText("hi"));

    const messageCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("/api/messages"),
    );
    expect(messageCalls[0][0]).toBe("/api/messages/stream");
    expect(messageCalls[0][1].method).toBe("POST");
  });

  it("renders multiple text_delta chunks concatenated, then finalizes on stream_end", async () => {
    const bytes1 = encodeSse([{ type: "text_delta", content: "Hello " }]);
    const bytes2 = encodeSse([{ type: "text_delta", content: "there, " }]);
    const bytes3 = encodeSse([
      { type: "text_delta", content: "love." },
      { type: "stream_end", content: "" },
    ]);
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/health")) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve(sseResponseFromBytes([bytes1, bytes2, bytes3]));
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("hi");

    await waitFor(() => {
      expect(screen.getByText("Hello there, love.")).toBeInTheDocument();
    });
  });

  it("handles an event split across two network chunks", async () => {
    // A single SSE event "data: {json}\n\n" delivered in two reads.
    const full = encodeSse([
      { type: "text_delta", content: "split-ok" },
      { type: "stream_end", content: "" },
    ]);
    const mid = Math.floor(full.length / 2);
    const part1 = full.slice(0, mid);
    const part2 = full.slice(mid);

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/health")) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve(sseResponseFromBytes([part1, part2]));
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("hi");

    await waitFor(() => {
      expect(screen.getByText("split-ok")).toBeInTheDocument();
    });
  });

  it("sendMessageStream (unit) emits onDelta per text_delta and onDone on stream_end", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      sseResponseFromBytes([
        encodeSse([
          { type: "text_delta", content: "a" },
          { type: "text_delta", content: "b" },
          { type: "stream_end", content: "" },
        ]),
      ]),
    );

    const deltas: string[] = [];
    await new Promise<void>((resolve, reject) => {
      sendMessageStream(
        {
          message: "x",
          personName: "P",
          systemPrompt: "s",
          history: [],
        },
        {
          onDelta: (t) => deltas.push(t),
          onDone: () => resolve(),
          onError: (kind) => reject(new Error(`error ${kind}`)),
        },
      );
    });

    expect(deltas).toEqual(["a", "b"]);
  });
});

// ─── Retry payload correctness ───────────────────────────────────────────────

describe("Retry payload — no duplicate user turn", () => {
  it("retryLast sends history WITHOUT the failed user message (which goes in `message`)", async () => {
    // 1) Fail the first send.
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/health")) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Are you there?");
    const retryButton = await screen.findByRole("button", { name: /retry/i });

    // 2) Succeed the retry.
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/health")) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve(
        sseResponseFromBytes([
          encodeSse([
            { type: "text_delta", content: "Yes, sweetheart." },
            { type: "stream_end", content: "" },
          ]),
        ]),
      );
    });

    await act(async () => {
      await userEvent.click(retryButton);
    });
    await waitFor(() => screen.getByText("Yes, sweetheart."));

    const messageCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("/api/messages/stream"),
    );
    const retryBody = JSON.parse(messageCalls[messageCalls.length - 1][1].body);

    expect(retryBody.message).toBe("Are you there?");
    // History must NOT also contain the user's "Are you there?" turn.
    const userTurnsInHistory = (retryBody.history as Array<{ role: string; content: string }>)
      .filter((h) => h.role === "user" && h.content === "Are you there?");
    expect(userTurnsInHistory).toHaveLength(0);
  });

  it("preserves the user's message in the transcript through failure + retry", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/health")) {
        return Promise.resolve({ ok: true, status: 200 });
      }
      return Promise.resolve({ ok: false, status: 500 });
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await sendMessage("Remember the garden?");

    // After failure the user message stays on screen so context isn't lost.
    await screen.findByRole("button", { name: /retry/i });
    expect(screen.getByText("Remember the garden?")).toBeInTheDocument();

    // And localStorage was updated with the user message, so a refresh recovers it.
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "afterlife-messages:Grandma",
      expect.stringContaining("Remember the garden?"),
    );
  });
});
