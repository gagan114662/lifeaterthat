/**
 * FAILING TESTS — Memory Management & Gallery (M1–M7)
 * PRD Section 3.4
 *
 * All tests are EXPECTED TO FAIL. No memory gallery or CRUD layer exists yet.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import Index from "@/pages/Index";


// ─── Seed helpers ─────────────────────────────────────────────────────────────

const MEMORIES = [
  { id: "m1", name: "Grandma Betty", photoUrl: "https://cdn.example.com/betty.jpg" },
  { id: "m2", name: "Grandpa Joe", photoUrl: "https://cdn.example.com/joe.jpg" },
  { id: "m3", name: "Uncle Dave", photoUrl: "https://cdn.example.com/dave.jpg" },
];

function seedMemories() {
  localStorage.getItem = vi.fn((key) =>
    key === "afterlife-memories" ? JSON.stringify(MEMORIES) : null
  );

  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: async () => ({ memories: MEMORIES }),
  });
}

// ─── M2: Multiple memories per user ──────────────────────────────────────────

describe("M2 — Multiple memories per user", () => {
  it("renders a gallery card for each saved memory", async () => {
    seedMemories();
    render(<Index />);

    // FAILS: Index only manages one memory in useState; no gallery screen exists
    await waitFor(() => {
      expect(screen.getByText("Grandma Betty")).toBeInTheDocument();
      expect(screen.getByText("Grandpa Joe")).toBeInTheDocument();
      expect(screen.getByText("Uncle Dave")).toBeInTheDocument();
    });
  });

  it("shows each memory's photo in the gallery", async () => {
    seedMemories();
    render(<Index />);

    // FAILS: no gallery screen exists
    await waitFor(() => {
      const images = screen.getAllByRole("img");
      const srcs = images.map((img) => img.getAttribute("src"));
      expect(srcs).toContain("https://cdn.example.com/betty.jpg");
    });
  });

  it("shows a memory count badge ('3 memories')", async () => {
    seedMemories();
    render(<Index />);

    // FAILS: no gallery or count display exists
    await waitFor(() => {
      expect(screen.getByText(/3 memories/i)).toBeInTheDocument();
    });
  });

  it("navigates to chat when a gallery card is clicked", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getByText("Grandma Betty"));
    await userEvent.click(screen.getByText("Grandma Betty"));

    // FAILS: no gallery → chat navigation exists
    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
  });
});

// ─── M3: Memory gallery screen ────────────────────────────────────────────────

describe("M3 — Memory gallery screen", () => {
  it("renders a gallery/home screen (not the hero) for returning users", async () => {
    seedMemories();
    render(<Index />);

    // FAILS: hero screen is always shown; no gallery route exists
    await waitFor(() => {
      expect(screen.queryByText("Begin")).not.toBeInTheDocument();
      expect(screen.getByTestId("memory-gallery")).toBeInTheDocument();
    });
  });

  it("includes a 'Add memory' button in the gallery", async () => {
    seedMemories();
    render(<Index />);

    // FAILS: no gallery screen exists
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add memory|new memory|\+/i })
      ).toBeInTheDocument();
    });
  });

  it("clicking 'Add memory' opens the CreateMemory wizard", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getByTestId("memory-gallery"));
    await userEvent.click(screen.getByRole("button", { name: /add memory|new memory|\+/i }));

    // FAILS: no gallery; no add-memory button
    expect(screen.getByText("Who would you like to remember?")).toBeInTheDocument();
  });

  it("shows most recently created memory first", async () => {
    const memories = [
      { id: "m1", name: "Oldest", createdAt: "2024-01-01T00:00:00Z", photoUrl: "" },
      { id: "m2", name: "Newest", createdAt: "2025-06-01T00:00:00Z", photoUrl: "" },
    ];

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ memories }),
    });

    render(<Index />);

    await waitFor(() => {
      const cards = screen.getAllByTestId("memory-card");
      // FAILS: no gallery; no ordering
      expect(cards[0]).toHaveTextContent("Newest");
    });
  });
});

// ─── M4: Switch between memories ─────────────────────────────────────────────

describe("M4 — User can switch between memories", () => {
  it("shows a back button in ChatScreen that returns to the gallery", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getByText("Grandma Betty"));
    await userEvent.click(screen.getByText("Grandma Betty"));

    // FAILS: back from chat goes to CreateMemory, not gallery
    await waitFor(() => {
      const backBtn = screen.getByRole("button", { name: /back|gallery/i });
      expect(backBtn).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: /back|gallery/i }));
    expect(screen.getByTestId("memory-gallery")).toBeInTheDocument();
  });

  it("loads the correct name and photo for each selected memory", async () => {
    seedMemories();
    render(<Index />);

    // Select Grandpa Joe
    await waitFor(() => screen.getByText("Grandpa Joe"));
    await userEvent.click(screen.getByText("Grandpa Joe"));

    // FAILS: no gallery; all memory selection flows through CreateMemory
    await waitFor(() => {
      expect(screen.getByText("Grandpa Joe")).toBeInTheDocument();
      expect(screen.getByAltText("Grandpa Joe")).toHaveAttribute(
        "src",
        "https://cdn.example.com/joe.jpg"
      );
    });
  });
});

// ─── M5: Delete a memory ─────────────────────────────────────────────────────

describe("M5 — User can delete a memory", () => {
  it("shows a delete button on each gallery card", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getByText("Grandma Betty"));

    // FAILS: no gallery cards or delete buttons exist
    expect(screen.getAllByRole("button", { name: /delete|remove/i })).toHaveLength(3);
  });

  it("calls DELETE /api/memories/:id when delete is confirmed", async () => {
    seedMemories();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ memories: MEMORIES }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<Index />);

    await waitFor(() => screen.getByText("Grandma Betty"));
    const deleteButtons = screen.getAllByRole("button", { name: /delete|remove/i });
    await userEvent.click(deleteButtons[0]);

    // Show confirmation dialog
    await userEvent.click(screen.getByRole("button", { name: /confirm|yes, delete/i }));

    // FAILS: no delete functionality exists
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/memories/m1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("removes the deleted card from the gallery without a page reload", async () => {
    seedMemories();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ memories: MEMORIES }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    render(<Index />);

    await waitFor(() => screen.getByText("Grandma Betty"));
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);
    await userEvent.click(screen.getByRole("button", { name: /confirm|yes/i }));

    // FAILS: no gallery or delete handling
    await waitFor(() => {
      expect(screen.queryByText("Grandma Betty")).not.toBeInTheDocument();
    });
  });

  it("shows a confirmation dialog before deleting", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getAllByRole("button", { name: /delete/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /delete/i })[0]);

    // FAILS: no delete flow exists
    expect(
      screen.getByText(/are you sure|this cannot be undone/i)
    ).toBeInTheDocument();
  });
});

// ─── M6: Edit a memory ───────────────────────────────────────────────────────

describe("M6 — User can edit a memory", () => {
  it("shows an edit button on each gallery card", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getByText("Grandma Betty"));

    // FAILS: no gallery or edit buttons
    expect(screen.getAllByRole("button", { name: /edit/i })).toHaveLength(3);
  });

  it("opens a pre-filled edit wizard when the edit button is clicked", async () => {
    seedMemories();
    render(<Index />);

    await waitFor(() => screen.getAllByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /edit/i })[0]);

    // FAILS: no edit flow; CreateMemory always starts empty
    await waitFor(() => {
      expect(screen.getByDisplayValue("Grandma Betty")).toBeInTheDocument();
    });
  });

  it("calls PATCH /api/memories/:id with updated data", async () => {
    seedMemories();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ memories: MEMORIES }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "m1" }) });

    render(<Index />);

    await waitFor(() => screen.getAllByRole("button", { name: /edit/i }));
    await userEvent.click(screen.getAllByRole("button", { name: /edit/i })[0]);

    await userEvent.clear(screen.getByDisplayValue("Grandma Betty"));
    await userEvent.type(screen.getByPlaceholderText("Their name..."), "Betty Smith");
    await userEvent.click(screen.getByText("Save Changes"));

    // FAILS: no edit functionality or PATCH call
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/memories/m1"),
      expect.objectContaining({ method: "PATCH" })
    );
  });
});

// ─── M7: Memories persist across page refresh ─────────────────────────────────

describe("M7 — Memory gallery state persists across page refreshes", () => {
  it("loads memories from the API (not localStorage) on mount", async () => {
    localStorage.getItem = vi.fn(() => null);

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ memories: MEMORIES }),
    });

    render(<Index />);

    // FAILS: no API fetch on mount; only useState
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/memories"),
        expect.anything()
      );
    });
  });

  it("shows previously created memories after simulated remount", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ memories: MEMORIES }),
    });

    const { unmount } = render(<Index />);
    await waitFor(() => screen.getByText("Grandma Betty"));

    // Simulate page refresh by unmounting and remounting
    unmount();

    render(<Index />);

    // FAILS: no API call; state is lost on remount
    await waitFor(() => {
      expect(screen.getByText("Grandma Betty")).toBeInTheDocument();
    });
  });

  it("shows a loading skeleton while memories are being fetched", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    render(<Index />);

    // FAILS: no loading state; hero screen is shown immediately
    expect(screen.getByTestId("gallery-loading-skeleton")).toBeInTheDocument();
  });

  it("shows an error state when the memories API fails", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 });

    render(<Index />);

    // FAILS: no API call and no error state
    await waitFor(() => {
      expect(screen.getByText(/failed to load|try again|error loading/i)).toBeInTheDocument();
    });
  });
});
