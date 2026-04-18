import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

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

let blobCounter = 0;
globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-url-${++blobCounter}`);
globalThis.URL.revokeObjectURL = vi.fn();

window.HTMLElement.prototype.scrollTo = vi.fn();

class MockMediaRecorder {
  state = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start = vi.fn(() => {
    this.state = "recording";
  });

  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  });
}

Object.defineProperty(globalThis, "MediaRecorder", {
  writable: true,
  value: MockMediaRecorder,
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  writable: true,
  value: localStorageMock,
});

function createMockStream() {
  return {
    getTracks: () => [{ stop: vi.fn() }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  blobCounter = 0;

  globalThis.URL.createObjectURL = vi.fn(() => `blob:mock-url-${++blobCounter}`);
  globalThis.URL.revokeObjectURL = vi.fn();
  globalThis.fetch = vi.fn();

  Object.defineProperty(navigator, "mediaDevices", {
    writable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(createMockStream()),
    },
  });

  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
