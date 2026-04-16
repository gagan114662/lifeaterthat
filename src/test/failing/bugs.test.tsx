/**
 * FAILING TESTS — Known Bugs (B1–B9)
 * PRD Section 4: Bugs Found in Current Code
 *
 * Every test in this file is EXPECTED TO FAIL until the corresponding bug is fixed.
 * Each test documents what the correct behaviour should be.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ChatScreen from "@/components/ChatScreen";
import CreateMemory from "@/components/CreateMemory";
import Index from "@/pages/Index";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function navigateToStep3(container: HTMLElement) {
  // Step 1: enter name
  await userEvent.type(screen.getByPlaceholderText("Their name..."), "Grandma Betty");
  await userEvent.click(screen.getByText("Continue"));

  // Step 2: upload photo
  const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
  const photoFile = new File(["img"], "photo.jpg", { type: "image/jpeg" });
  fireEvent.change(photoInput, { target: { files: [photoFile] } });
  await userEvent.click(screen.getByText("Continue"));
}

// ─── B1: voiceSample orphaned in Index.tsx ────────────────────────────────────

describe("B1 — voiceSample not passed to ChatScreen", () => {
  it("ChatScreen receives a voiceSample prop after CreateMemory completes", async () => {
    // Complete full flow via CreateMemory and verify ChatScreen shows voice-related UI
    const onComplete = vi.fn();
    const { container } = render(<CreateMemory onComplete={onComplete} onBack={vi.fn()} />);

    await navigateToStep3(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, { target: { files: [new File(["a"], "v.webm", { type: "audio/webm" })] } });
    await userEvent.click(screen.getByText("Start Conversation"));

    const callArg = onComplete.mock.calls[0]?.[0];
    // Verify onComplete received voiceSample (prerequisite for passing it to ChatScreen)
    expect(callArg).toHaveProperty("voiceSample", expect.any(String));

    // Now check Index.tsx actually uses it — render ChatScreen with the returned data
    // and verify voiceSample is in the rendered header or accessible
    render(<ChatScreen name={callArg.name} photo={callArg.photo} onBack={vi.fn()} />);

    // FAILS: ChatScreenProps has no voiceSample; Index.tsx doesn't pass it
    // The test below will fail because ChatScreen has no mechanism to receive/use voiceSample
    expect(screen.getByTestId("voice-id-indicator")).toBeInTheDocument();
  });
});

// ─── B2: Blob URL memory leak ─────────────────────────────────────────────────

describe("B2 — URL.revokeObjectURL never called", () => {
  it("revokes photo blob URL when CreateMemory unmounts", async () => {
    const { container, unmount } = render(
      <CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />
    );

    // Navigate to step 2 and upload photo
    await userEvent.type(screen.getByPlaceholderText("Their name..."), "Grandma");
    await userEvent.click(screen.getByText("Continue"));

    const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    fireEvent.change(photoInput, { target: { files: [new File(["img"], "p.jpg", { type: "image/jpeg" })] } });

    const createdUrl = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.results[0].value;
    unmount();

    // FAILS: revokeObjectURL is never called anywhere in CreateMemory
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });

  it("revokes voice blob URL when CreateMemory unmounts", async () => {
    const { container, unmount } = render(
      <CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />
    );

    await navigateToStep3(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, { target: { files: [new File(["a"], "v.webm", { type: "audio/webm" })] } });

    const createdUrl = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.results.at(-1)!.value;
    unmount();

    // FAILS: revokeObjectURL is never called
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(createdUrl);
  });
});

// ─── B3: AI responses are hardcoded ──────────────────────────────────────────

describe("B3 — Chat responses come from real AI API, not hardcoded strings", () => {
  const HARDCODED = [
    "I remember that too. Those were such beautiful times.",
    "You know, I'm always here whenever you need me.",
    "That means so much to me. Tell me more...",
    "I think about those moments all the time.",
    "You've always been so special to me. Never forget that.",
  ];

  it("calls /api/messages endpoint when a message is sent", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "A unique AI-generated reply." }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello");
    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    // FAILS: sendMessage uses setTimeout, fetch is never called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/messages"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("displays the reply returned by the API, not a hardcoded string", async () => {
    const uniqueReply = "This is a dynamically generated response from the AI.";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: uniqueReply }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Tell me something");

    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    // FAILS: reply will be one of the 5 hardcoded strings, not uniqueReply
    await waitFor(() => {
      expect(screen.getByText(uniqueReply)).toBeInTheDocument();
    });
  });

  it("never displays any of the 5 hardcoded fallback strings", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Custom AI reply." }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hi");
    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    await waitFor(() => screen.getByText("Custom AI reply."));

    // FAILS: one of the hardcoded strings will appear
    for (const hardcoded of HARDCODED) {
      expect(screen.queryByText(hardcoded)).not.toBeInTheDocument();
    }
  });
});

// ─── B4: Typing indicator tied to setTimeout not real async ──────────────────

describe("B4 — Typing indicator is controlled by API promise lifecycle, not setTimeout", () => {
  it("keeps typing indicator visible while API call is still pending", async () => {
    vi.useFakeTimers();

    // A fetch promise that never resolves
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello");

    await act(async () => {
      // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");
    });

    // Advance well past any setTimeout (3 s)
    act(() => { vi.advanceTimersByTime(3000); });

    // FAILS: typing indicator disappears after the hardcoded setTimeout fires,
    // regardless of whether a real API response has arrived.
    expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("hides typing indicator only after API resolves", async () => {
    let resolveApi!: (value: unknown) => void;
    const apiPromise = new Promise((res) => { resolveApi = res; });
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      apiPromise.then(() => ({ ok: true, json: async () => ({ reply: "Hi" }) }))
    );

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello");
    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    // Indicator should still be visible before resolution
    expect(screen.getByTestId("typing-indicator")).toBeInTheDocument();

    // Resolve the API call
    await act(async () => { resolveApi(undefined); });

    // FAILS: typing indicator is removed by setTimeout before the API resolves
    await waitFor(() => {
      expect(screen.queryByTestId("typing-indicator")).not.toBeInTheDocument();
    });
  });
});

// ─── B5: "Online" status is hardcoded ────────────────────────────────────────

describe('B5 — "Online" status reflects real AI service health', () => {
  it('shows "Unavailable" when the AI service health check fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Service down"));

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    await waitFor(() => {
      // FAILS: "Online" is hardcoded — it never changes based on service state
      expect(screen.queryByText("Online")).not.toBeInTheDocument();
    });

    expect(
      screen.getByText(/unavailable|offline|unable to connect/i)
    ).toBeInTheDocument();
  });

  it('shows "Online" when the AI service health check passes', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok" }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    // FAILS: even though fetch succeeds, the status is not derived from it
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/health"),
        expect.anything()
      );
    });
  });
});

// ─── B6: Phone button has no onClick ─────────────────────────────────────────

describe("B6 — Phone button initiates a voice call", () => {
  it("calls onStartCall prop when the phone button is clicked", async () => {
    const onStartCall = vi.fn();
    // FAILS: ChatScreen doesn't accept onStartCall prop, phone button has no handler
    render(
      <ChatScreen
        name="Grandma"
        photo="blob:photo"
        onBack={vi.fn()}
        // @ts-expect-error — prop not yet implemented
        onStartCall={onStartCall}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    expect(onStartCall).toHaveBeenCalledTimes(1);
  });

  it("shows a call-in-progress UI after the phone button is clicked", async () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    // FAILS: nothing happens, no call-interface element exists
    expect(screen.getByTestId("call-interface")).toBeInTheDocument();
  });
});

// ─── B7: Mic button in chat has no onClick ────────────────────────────────────

describe("B7 — Mic button in chat input records a voice message", () => {
  it("starts microphone recording when the chat mic button is clicked", async () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    // The mic button is the one in the input row (not the phone button)
    const micButton = screen.getByRole("button", { name: /record voice message|mic/i });
    await userEvent.click(micButton);

    // FAILS: mic button has no onClick handler; getUserMedia is never called
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("shows recording state after mic button is clicked", async () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    const micButton = screen.getByRole("button", { name: /record voice message|mic/i });
    await userEvent.click(micButton);

    // FAILS: no recording state indicator exists
    expect(screen.getByTestId("recording-indicator")).toBeInTheDocument();
  });

  it("transcribes and populates input after stopping the recording", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: "Hello Grandma" }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    const micButton = screen.getByRole("button", { name: /record voice message|mic/i });

    await userEvent.click(micButton); // start
    await userEvent.click(micButton); // stop

    // FAILS: no transcription logic exists
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Type a message...")).toHaveValue("Hello Grandma");
    });
  });
});

// ─── B8: getUserMedia error swallowed (no UI feedback) ───────────────────────

describe("B8 — Microphone permission error is surfaced to the user", () => {
  it("shows an error message in the UI when microphone access is denied", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError")
    );

    const { container } = render(
      <CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />
    );
    await navigateToStep3(container);

    await userEvent.click(screen.getByText("Tap to record"));

    // FAILS: only console.error is called; the UI never shows an error message
    await waitFor(() => {
      expect(
        screen.getByText(/microphone.*denied|cannot access.*microphone|permission denied/i)
      ).toBeInTheDocument();
    });
  });

  it("does not leave the record button in a broken state after a permission error", async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DOMException("Permission denied", "NotAllowedError")
    );

    const { container } = render(
      <CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />
    );
    await navigateToStep3(container);
    await userEvent.click(screen.getByText("Tap to record"));

    await waitFor(() => {
      // FAILS: isRecording never gets reset in the catch block
      expect(screen.getByText("Tap to record")).toBeInTheDocument();
    });
  });
});

// ─── B9: All state lost on page refresh ──────────────────────────────────────

describe("B9 — App state persists across page refresh", () => {
  it("saves memory data to localStorage when CreateMemory completes", async () => {
    const { container } = render(<Index />);
    await userEvent.click(screen.getByText("Begin"));
    await navigateToStep3(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, { target: { files: [new File(["a"], "v.webm", { type: "audio/webm" })] } });
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: nothing is ever written to localStorage
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "afterlife-memory",
      expect.stringContaining("Grandma Betty")
    );
  });

  it("restores memory data from localStorage on mount (simulated refresh)", async () => {
    localStorage.getItem = vi.fn((key) =>
      key === "afterlife-memory"
        ? JSON.stringify({ name: "Grandma Betty", photo: "blob:photo", voiceSample: "blob:voice" })
        : null
    );

    render(<Index />);

    // FAILS: Index reads only from useState; it never checks localStorage on mount
    await waitFor(() => {
      expect(screen.getByText("Grandma Betty")).toBeInTheDocument();
    });
  });

  it("restores chat history from localStorage on mount", async () => {
    localStorage.getItem = vi.fn((key) =>
      key === "afterlife-messages"
        ? JSON.stringify([{ id: "1", role: "user", content: "Hello" }])
        : null
    );

    render(
      <ChatScreen name="Grandma Betty" photo="blob:photo" onBack={vi.fn()} />
    );

    // FAILS: ChatScreen initialises messages from useState, never from localStorage
    await waitFor(() => {
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });
  });
});
