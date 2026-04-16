/**
 * FAILING TESTS — Authentication (H3, H4)
 * PRD Section 3.1
 *
 * All tests are EXPECTED TO FAIL. No auth layer exists yet.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "@/App";


function renderApp(route = "/") {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// ─── H3: User authentication ─────────────────────────────────────────────────

describe("H3 — User authentication", () => {
  it("shows a sign-up / log-in screen instead of the hero when unauthenticated", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Unauthenticated" }),
    });

    renderApp();

    // FAILS: there is no auth check; HeroScreen is always shown
    expect(screen.getByRole("heading", { name: /sign up|log in|welcome back/i })).toBeInTheDocument();
    expect(screen.queryByText("Begin")).not.toBeInTheDocument();
  });

  it("redirects to hero after successful login", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "jwt-abc", user: { id: "u1", email: "test@example.com" } }),
    });

    renderApp("/login");

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    await userEvent.type(emailInput, "test@example.com");
    await userEvent.type(passwordInput, "password123");
    await userEvent.click(screen.getByRole("button", { name: /log in|sign in/i }));

    // FAILS: no login page or auth logic exists
    await waitFor(() => {
      expect(screen.getByText("Begin")).toBeInTheDocument();
    });
  });

  it("shows a validation error for an invalid email on sign-up", async () => {
    renderApp("/signup");

    const emailInput = screen.getByLabelText(/email/i);
    await userEvent.type(emailInput, "not-an-email");
    await userEvent.tab(); // blur

    // FAILS: no sign-up page exists
    expect(screen.getByText(/invalid email|please enter a valid email/i)).toBeInTheDocument();
  });

  it("POSTs to /api/auth/signup with email and password", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "jwt-abc" }),
    });

    renderApp("/signup");

    await userEvent.type(screen.getByLabelText(/email/i), "new@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /sign up|create account/i }));

    // FAILS: no auth page or API call
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/signup"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("stores the auth token in localStorage after login", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ token: "jwt-abc" }),
    });

    renderApp("/login");

    await userEvent.type(screen.getByLabelText(/email/i), "test@example.com");
    await userEvent.type(screen.getByLabelText(/password/i), "password123");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    // FAILS: no auth logic; nothing stored in localStorage
    await waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith("afterlife-token", "jwt-abc");
    });
  });

  it("protects the chat route — redirects unauthenticated users to login", async () => {
    localStorage.getItem = vi.fn(() => null); // no token

    renderApp("/chat");

    // FAILS: no route guard exists
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /log in|sign in/i })).toBeInTheDocument();
    });
  });

  it("shows a logout button in the app header", () => {
    renderApp();

    // FAILS: no header or logout button exists
    expect(screen.getByRole("button", { name: /log out|sign out/i })).toBeInTheDocument();
  });

  it("clears token and redirects to login when logging out", async () => {
    localStorage.getItem = vi.fn((key) => (key === "afterlife-token" ? "jwt-abc" : null));

    renderApp();
    await userEvent.click(screen.getByRole("button", { name: /log out|sign out/i }));

    // FAILS: no logout button or token clearing
    await waitFor(() => {
      expect(localStorage.removeItem).toHaveBeenCalledWith("afterlife-token");
      expect(screen.getByRole("heading", { name: /log in/i })).toBeInTheDocument();
    });
  });
});

// ─── H4: Returning user sees their memory gallery ────────────────────────────

describe("H4 — Authenticated returning user is taken to their memory gallery", () => {
  it("skips the hero screen and shows the memory gallery for logged-in users", async () => {
    localStorage.getItem = vi.fn((key) => (key === "afterlife-token" ? "jwt-abc" : null));

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        memories: [{ id: "m1", name: "Grandma Betty", photoUrl: "https://cdn.example.com/photo.jpg" }],
      }),
    });

    renderApp();

    // FAILS: hero is always shown regardless of auth state
    await waitFor(() => {
      expect(screen.queryByText("Begin")).not.toBeInTheDocument();
      expect(screen.getByText("Grandma Betty")).toBeInTheDocument();
    });
  });

  it("fetches the user's memories from /api/memories on mount", async () => {
    localStorage.getItem = vi.fn((key) => (key === "afterlife-token" ? "jwt-abc" : null));

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ memories: [] }),
    });

    renderApp();

    // FAILS: no /api/memories fetch on mount
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/memories"),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "Bearer jwt-abc" }),
        })
      );
    });
  });

  it("shows a 'Create your first memory' prompt when the gallery is empty", async () => {
    localStorage.getItem = vi.fn((key) => (key === "afterlife-token" ? "jwt-abc" : null));

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ memories: [] }),
    });

    renderApp();

    // FAILS: no gallery screen exists
    await waitFor(() => {
      expect(
        screen.getByText(/create your first memory|no memories yet/i)
      ).toBeInTheDocument();
    });
  });
});
