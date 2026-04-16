import "@testing-library/jest-dom";
import { vi } from "vitest";

// ─── matchMedia ───────────────────────────────────────────────────────────────
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// ─── URL blob helpers ─────────────────────────────────────────────────────────
let blobCounter = 0;
global.URL.createObjectURL = vi.fn(() => `blob:mock-url-${++blobCounter}`);
global.URL.revokeObjectURL = vi.fn();

// ─── scrollTo ─────────────────────────────────────────────────────────────────
window.HTMLElement.prototype.scrollTo = vi.fn();

// ─── MediaRecorder ────────────────────────────────────────────────────────────
class MockMediaRecorder {
  state: string = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn(() => {
    this.state = "recording";
  });

  stop = vi.fn(() => {
    this.state = "inactive";
    // Simulate data then stop
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  });
}

Object.defineProperty(global, "MediaRecorder", {
  writable: true,
  value: MockMediaRecorder,
});

// ─── navigator.mediaDevices ───────────────────────────────────────────────────
const mockStream = {
  getTracks: () => [{ stop: vi.fn() }],
};

Object.defineProperty(navigator, "mediaDevices", {
  writable: true,
  value: {
    getUserMedia: vi.fn().mockResolvedValue(mockStream),
  },
});

// ─── fetch ────────────────────────────────────────────────────────────────────
global.fetch = vi.fn();

// ─── localStorage ─────────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, "localStorage", {
  writable: true,
  value: localStorageMock,
});

// ─── Reset mocks between tests ────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  blobCounter = 0;
  global.URL.createObjectURL = vi.fn(() => `blob:mock-url-${++blobCounter}`);
  global.URL.revokeObjectURL = vi.fn();
  global.fetch = vi.fn();
  (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockStream);
  localStorage.clear();
});
