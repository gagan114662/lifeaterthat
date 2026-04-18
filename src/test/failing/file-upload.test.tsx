/**
 * FAILING TESTS — Cloud File Upload (C5–C7, C11–C12)
 * PRD Section 3.2
 *
 * All tests are EXPECTED TO FAIL. They specify the behaviour required
 * when files are uploaded to cloud storage instead of held as blob URLs.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import CreateMemory from "@/components/CreateMemory";


// ─── Helpers ──────────────────────────────────────────────────────────────────

async function navigateToStep2() {
  fireEvent.change(screen.getByPlaceholderText("Their name..."), {
    target: { value: "Grandma Betty" },
  });
  await userEvent.click(screen.getByText("Continue"));
}

async function uploadPhoto(container: HTMLElement) {
  const photoInput = container.querySelector('input[accept="image/*"]') as HTMLInputElement;
  fireEvent.change(photoInput, {
    target: { files: [new File(["img"], "photo.jpg", { type: "image/jpeg" })] },
  });
}

async function waitForPhotoUpload() {
  await waitFor(() => {
    expect(screen.getByAltText("Uploaded")).toBeInTheDocument();
    expect(screen.getByText("Continue")).not.toBeDisabled();
  });
}

async function uploadVoice(
  container: HTMLElement,
  file = new File(["audio"], "voice.webm", { type: "audio/webm" }),
) {
  const voiceInput = container.querySelector('input[accept="audio/*"]') as HTMLInputElement;
  fireEvent.change(voiceInput, {
    target: { files: [file] },
  });
}

async function waitForVoiceUpload() {
  await waitFor(() => {
    expect(screen.getByText("Voice sample ready")).toBeInTheDocument();
    expect(screen.getByText("Start Conversation")).not.toBeDisabled();
  });
}

async function navigateToStep3(container: HTMLElement) {
  await navigateToStep2();
  await uploadPhoto(container);
  await waitForPhotoUpload();
  await userEvent.click(screen.getByText("Continue"));
  await waitFor(() => {
    expect(screen.getByText("Tap to record")).toBeInTheDocument();
  });
}

// ─── C5: Photo uploaded to cloud storage ─────────────────────────────────────

describe("C5 — Photo is uploaded to cloud storage", () => {
  it("POSTs the photo file to /api/upload/photo", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
    });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: handlePhotoUpload only calls URL.createObjectURL; no fetch/upload
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/upload/photo"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("uses the CDN URL returned by the API, not a local blob URL", async () => {
    const cdnUrl = "https://cdn.example.com/photos/abc.jpg";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: cdnUrl }),
    });

    const onComplete = vi.fn();
    const { container } = render(<CreateMemory onComplete={onComplete} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await uploadVoice(container, new File(["a"], "v.webm", { type: "audio/webm" }));
    await waitForVoiceUpload();
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: onComplete receives a blob: URL, not a CDN URL
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ photo: cdnUrl })
      );
    });
  });

  it("does not use URL.createObjectURL for the final photo URL sent onComplete", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
    });

    const onComplete = vi.fn();
    const { container } = render(<CreateMemory onComplete={onComplete} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await uploadVoice(container, new File(["a"], "v.webm", { type: "audio/webm" }));
    await waitForVoiceUpload();
    await userEvent.click(screen.getByText("Start Conversation"));

    await waitFor(() => {
      const { photo } = onComplete.mock.calls[0][0];
      // FAILS: photo will be a blob: URL
      expect(photo).not.toMatch(/^blob:/);
    });
  });
});

// ─── C6: Voice sample uploaded to cloud storage ──────────────────────────────

describe("C6 — Voice sample is uploaded to cloud storage", () => {
  it("POSTs the audio file to /api/upload/audio", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/audio/voice.webm" }),
      });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await uploadVoice(container);

    // FAILS: handleVoiceUpload only calls URL.createObjectURL; no fetch/upload
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/upload/audio"),
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("also uploads audio recorded via MediaRecorder to cloud", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/audio/recorded.webm" }),
      });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await userEvent.click(screen.getByRole("button", { name: /tap to record/i }));
    await userEvent.click(screen.getByRole("button", { name: /recording... tap to stop/i }));

    // FAILS: onstop handler only calls URL.createObjectURL on the Blob, never uploads
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/upload/audio"),
        expect.anything()
      );
    });
  });
});

// ─── C7: Memory record saved to database ─────────────────────────────────────

describe("C7 — Memory is persisted to the backend database", () => {
  it("POSTs to /api/memories when the wizard completes", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/audio/voice.webm" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "mem-001",
          name: "Grandma Betty",
          photoUrl: "https://cdn.example.com/photos/abc.jpg",
          voiceUrl: "https://cdn.example.com/audio/voice.webm",
        }),
      });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await uploadVoice(container, new File(["a"], "v.webm", { type: "audio/webm" }));
    await waitForVoiceUpload();
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: no /api/memories call; onComplete fires immediately with blob URLs
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/memories"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Grandma Betty"),
        })
      );
    });
  });

  it("passes the database memory ID to onComplete", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/audio/voice.webm" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "mem-001", name: "Grandma Betty" }),
      });

    const onComplete = vi.fn();
    const { container } = render(<CreateMemory onComplete={onComplete} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await uploadVoice(container, new File(["a"], "v.webm", { type: "audio/webm" }));
    await waitForVoiceUpload();
    await userEvent.click(screen.getByText("Start Conversation"));

    // FAILS: onComplete receives no memoryId field
    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({ memoryId: "mem-001" })
      );
    });
  });
});

// ─── C11: Upload progress indicator ──────────────────────────────────────────

describe("C11 — Upload progress is shown while files are being uploaded", () => {
  it("shows an upload progress bar while the photo is uploading", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: no progress UI exists; file is held as a blob URL immediately
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows percentage text during upload", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: no upload progress state exists
    expect(screen.getByText(/uploading|%/i)).toBeInTheDocument();
  });

  it("disables Continue while upload is in progress", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: Continue becomes enabled as soon as a file is chosen (blob URL)
    expect(screen.getByText("Continue")).toBeDisabled();
  });
});

// ─── C12: Error state when upload fails ──────────────────────────────────────

describe("C12 — Upload errors are surfaced to the user", () => {
  it("shows an error when the photo upload fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 413 });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: no upload error handling; photo is always accepted
    await waitFor(() => {
      expect(screen.getByText("Upload failed. Please try again.")).toBeInTheDocument();
    });
  });

  it("shows an error when the audio upload fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: "https://cdn.example.com/photos/abc.jpg" }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep3(container);

    await uploadVoice(container, new File(["a"], "v.webm", { type: "audio/webm" }));

    // FAILS: no upload error handling
    await waitFor(() => {
      expect(screen.getByText("Upload failed. Please try again.")).toBeInTheDocument();
    });
  });

  it("allows the user to retry after a failed upload", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: no retry mechanism exists
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry|try again/i })).toBeInTheDocument();
    });
  });

  it("clears the photo and shows the upload button again after a failed upload", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    const { container } = render(<CreateMemory onComplete={vi.fn()} onBack={vi.fn()} />);
    await navigateToStep2();
    await uploadPhoto(container);

    // FAILS: no upload error state; the preview is shown regardless
    await waitFor(() => {
      expect(screen.queryByAltText("Uploaded")).not.toBeInTheDocument();
      expect(screen.getByText("Tap to upload")).toBeInTheDocument();
    });
  });
});
