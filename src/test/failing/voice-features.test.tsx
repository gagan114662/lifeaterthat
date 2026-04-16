/**
 * FAILING TESTS — Voice Features (C8–C10, CH13–CH16)
 * PRD Sections 3.2 and 3.3
 *
 * All tests here are EXPECTED TO FAIL. They specify the complete voice
 * pipeline: validation → cloning → synthesis → playback → call.
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CreateMemory from "@/components/CreateMemory";
import ChatScreen from "@/components/ChatScreen";


// ─── Helpers ──────────────────────────────────────────────────────────────────

async function navigateToStep2() {
  await userEvent.type(screen.getByPlaceholderText("Their name..."), "Grandma Betty");
  await userEvent.click(screen.getByText("Continue"));
}

async function uploadPhotoAndAdvance(container: HTMLElement) {
  await navigateToStep2();
  const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
  fireEvent.change(photoInput, {
    target: { files: [new File(["img-data"], "photo.jpg", { type: "image/jpeg" })] },
  });
  await userEvent.click(screen.getByText("Continue"));
}

// ─── C8: Photo face validation ────────────────────────────────────────────────

describe("C8 — Photo must contain a detectable human face", () => {
  it("calls face-detection API when a photo is uploaded", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ hasFace: true }),
    });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();

    const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    fireEvent.change(photoInput, {
      target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] },
    });

    // FAILS: no face-detection call is made; photo is used as-is
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/validate/face"),
        expect.anything()
      );
    });
  });

  it("shows an error and disables Continue when no face is detected", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ hasFace: false }),
    });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();

    const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    fireEvent.change(photoInput, {
      target: { files: [new File(["img"], "blank.jpg", { type: "image/jpeg" })] },
    });

    // FAILS: no validation exists; Continue is always enabled after a file is chosen
    await waitFor(() => {
      expect(screen.getByText(/no face detected|please use a photo/i)).toBeInTheDocument();
      expect(screen.getByText("Continue")).toBeDisabled();
    });
  });

  it("shows a loading spinner while face detection is running", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();

    const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
    fireEvent.change(photoInput, {
      target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] },
    });

    // FAILS: no loading state exists
    expect(screen.getByTestId("face-detection-loading")).toBeInTheDocument();
  });
});

// ─── C9: Audio speech validation ─────────────────────────────────────────────

describe("C9 — Voice sample must contain detectable speech", () => {
  it("calls audio-validation API when a voice file is uploaded", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ hasSpeech: true, durationSeconds: 5 }),
    });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await uploadPhotoAndAdvance(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, {
      target: { files: [new File(["audio"], "voice.webm", { type: "audio/webm" })] },
    });

    // FAILS: no audio validation API call exists
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/validate/audio"),
        expect.anything()
      );
    });
  });

  it("shows an error when the audio contains no speech (e.g. music or silence)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ hasSpeech: false }),
    });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await uploadPhotoAndAdvance(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, {
      target: { files: [new File(["music"], "music.webm", { type: "audio/webm" })] },
    });

    // FAILS: no validation; voice sample ready shown for any audio
    await waitFor(() => {
      expect(screen.getByText(/no speech detected|please upload a voice recording/i)).toBeInTheDocument();
    });
  });

  it("shows an error when the audio clip is too short (< 3 seconds)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ hasSpeech: true, durationSeconds: 1.5 }),
    });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await uploadPhotoAndAdvance(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, {
      target: { files: [new File(["short"], "short.webm", { type: "audio/webm" })] },
    });

    // FAILS: no duration validation exists
    await waitFor(() => {
      expect(screen.getByText(/too short|at least 3 seconds/i)).toBeInTheDocument();
    });
  });
});

// ─── C10: Voice cloning ───────────────────────────────────────────────────────

describe("C10 — Voice cloning from uploaded sample", () => {
  it("calls the voice-cloning API when CreateMemory completes", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ voiceId: "voice-abc-123" }),
    });

    const onComplete = vi.fn();
    const { container } = render(<CreateMemory onComplete={onComplete} onBack={vi.fn()} />);
    await uploadPhotoAndAdvance(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, {
      target: { files: [new File(["audio"], "voice.webm", { type: "audio/webm" })] },
    });
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: no voice-cloning call; onComplete is called immediately with blob URLs
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/voice/clone"),
        expect.anything()
      );
    });
  });

  it("passes the cloned voiceId to onComplete, not the raw blob URL", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ voiceId: "voice-abc-123" }),
    });

    const onComplete = vi.fn();
    const { container } = render(<CreateMemory onComplete={onComplete} onBack={vi.fn()} />);
    await uploadPhotoAndAdvance(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, {
      target: { files: [new File(["audio"], "voice.webm", { type: "audio/webm" })] },
    });
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: onComplete is called with raw blob URL, not a voiceId
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ voiceId: "voice-abc-123" })
      );
    });
  });

  it("shows a 'Cloning voice...' progress screen while the API processes", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await uploadPhotoAndAdvance(container);

    const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
    fireEvent.change(voiceInput, {
      target: { files: [new File(["audio"], "voice.webm", { type: "audio/webm" })] },
    });
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: no loading screen; component immediately calls onComplete
    expect(screen.getByText(/cloning voice|preparing|please wait/i)).toBeInTheDocument();
  });
});

// ─── CH13: Voice synthesis for AI replies ─────────────────────────────────────

describe("CH13 — AI replies are synthesised into audio using the cloned voice", () => {
  it("calls /api/tts with the AI reply text and the voiceId", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: "I love you." }) })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["audio"], { type: "audio/mpeg" }) });

    render(
      <ChatScreen
        name="Grandma"
        photo="blob:photo"
        // @ts-expect-error — prop not yet implemented
        voiceId="voice-abc-123"
        onBack={vi.fn()}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello");
    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    // FAILS: no TTS call; responses use hardcoded strings via setTimeout
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/tts"),
        expect.objectContaining({
          body: expect.stringContaining("I love you."),
        })
      );
    });
  });
});

// ─── CH14: Audio playback of spoken replies ──────────────────────────────────

describe("CH14 — Synthesised audio is played after each AI reply", () => {
  it("creates an Audio element and plays it after a reply", async () => {
    const mockPlay = vi.fn().mockResolvedValue(undefined);
    const MockAudio = vi.fn(() => ({ play: mockPlay, src: "", onended: null }));
    vi.stubGlobal("Audio", MockAudio);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "I'm here.", audioUrl: "blob:audio-reply" }),
    });

    render(
      <ChatScreen
        name="Grandma"
        photo="blob:photo"
        // @ts-expect-error — prop not yet implemented
        voiceId="voice-abc-123"
        onBack={vi.fn()}
      />
    );
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello");
    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    // FAILS: no Audio instantiation or play() call exists
    await waitFor(() => {
      expect(MockAudio).toHaveBeenCalled();
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  it("shows a playback indicator while audio is playing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "I love you.", audioUrl: "blob:audio" }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "Hello");
    // Send via Enter key (button has no aria-label yet)
    await userEvent.type(screen.getByPlaceholderText("Type a message..."), "{Enter}");

    // FAILS: no audio playback indicator exists
    await waitFor(() => {
      expect(screen.getByTestId("audio-playing-indicator")).toBeInTheDocument();
    });
  });

  it("allows muting audio playback", () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    // FAILS: no mute control exists
    expect(screen.getByRole("button", { name: /mute|toggle audio/i })).toBeInTheDocument();
  });
});

// ─── CH15: Voice message input in chat ───────────────────────────────────────

describe("CH15 — Mic button in chat records a voice message and sends it as text", () => {
  it("requests microphone access when the chat mic button is clicked", async () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    const micBtn = screen.getByRole("button", { name: /record voice message|mic/i });
    await userEvent.click(micBtn);

    // FAILS: mic button has no onClick handler
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("shows a recording duration timer while recording", async () => {
    vi.useFakeTimers();
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);

    const micBtn = screen.getByRole("button", { name: /record voice message|mic/i });
    await userEvent.click(micBtn);
    act(() => { vi.advanceTimersByTime(3000); });

    // FAILS: no recording state or timer in the UI
    expect(screen.getByText(/0:03|recording/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("transcribes the recording via /api/transcribe and populates the input", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: "Do you remember the garden?" }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    const micBtn = screen.getByRole("button", { name: /record voice message|mic/i });

    await userEvent.click(micBtn); // start
    await userEvent.click(micBtn); // stop

    // FAILS: no transcription API call; mic button has no handler
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/transcribe"),
        expect.anything()
      );
      expect(screen.getByPlaceholderText("Type a message...")).toHaveValue(
        "Do you remember the garden?"
      );
    });
  });
});

// ─── CH16: Phone button starts a real-time voice call ────────────────────────

describe("CH16 — Phone button initiates a real-time voice call", () => {
  it("transitions to a call screen when phone button is clicked", async () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    // FAILS: phone button has no onClick; no call screen exists
    expect(screen.getByTestId("call-interface")).toBeInTheDocument();
  });

  it("requests microphone access to establish the call", async () => {
    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    // FAILS: no handler; getUserMedia never called
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it("calls /api/call/start to initiate the WebRTC session", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: "call-xyz", iceServers: [] }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    // FAILS: no API call; button has no handler
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/call/start"),
        expect.anything()
      );
    });
  });

  it("shows a call duration timer during an active call", async () => {
    vi.useFakeTimers();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: "call-xyz", iceServers: [] }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    act(() => { vi.advanceTimersByTime(65_000); });

    // FAILS: no call UI exists
    expect(screen.getByText(/1:05|00:65|call duration/i)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows an end-call button and returns to chat on click", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: "call-xyz", iceServers: [] }),
    });

    render(<ChatScreen name="Grandma" photo="blob:photo" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /phone|call/i }));

    // FAILS: no call interface exists
    const endBtn = screen.getByRole("button", { name: /end call|hang up/i });
    await userEvent.click(endBtn);

    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });
});
