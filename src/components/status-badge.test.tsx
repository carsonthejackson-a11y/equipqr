import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders the human-readable label for each status", () => {
    const { rerender } = render(<StatusBadge status="new" />);
    expect(screen.getByText("New")).toBeInTheDocument();

    rerender(<StatusBadge status="in_progress" />);
    expect(screen.getByText("In progress")).toBeInTheDocument();

    rerender(<StatusBadge status="resolved" />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
  });

  it("applies the resolved-status styling", () => {
    render(<StatusBadge status="resolved" />);
    expect(screen.getByText("Resolved")).toHaveClass("bg-emerald-500/15");
  });
});
