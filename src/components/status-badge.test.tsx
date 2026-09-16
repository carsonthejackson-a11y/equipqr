import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  StatusBadge,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_ORDER,
  OPEN_REQUEST_STATUSES,
  CLOSED_REQUEST_STATUSES,
  REQUEST_PRIORITY_LABELS,
  REQUEST_PRIORITY_ORDER,
} from "./status-badge";

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

  it("uses the darker teal-800 text for the New badge, not text-primary (Q-26)", () => {
    // text-primary alone (teal-700 in globals.css) is AA against white, but
    // this badge's text sits on a lighter bg-primary/15 fill, not solid
    // white — teal-800 keeps headroom rather than relying on --primary.
    render(<StatusBadge status="new" />);
    const badge = screen.getByText("New");
    expect(badge).toHaveClass("text-teal-800");
    expect(badge).not.toHaveClass("text-primary");
  });
});

describe("REQUEST_STATUS_ORDER", () => {
  it("lists every status exactly once, matching REQUEST_STATUS_LABELS", () => {
    const labelKeys = Object.keys(REQUEST_STATUS_LABELS).sort();
    expect([...REQUEST_STATUS_ORDER].sort()).toEqual(labelKeys);
    expect(new Set(REQUEST_STATUS_ORDER).size).toBe(REQUEST_STATUS_ORDER.length);
  });

  it("partitions exactly into OPEN_REQUEST_STATUSES + CLOSED_REQUEST_STATUSES", () => {
    expect([...OPEN_REQUEST_STATUSES, ...CLOSED_REQUEST_STATUSES].sort()).toEqual(
      [...REQUEST_STATUS_ORDER].sort()
    );
  });
});

describe("REQUEST_PRIORITY_ORDER", () => {
  it("lists every priority exactly once, low to urgent", () => {
    expect(REQUEST_PRIORITY_ORDER).toEqual(["low", "normal", "high", "urgent"]);
    expect([...REQUEST_PRIORITY_ORDER].sort()).toEqual(Object.keys(REQUEST_PRIORITY_LABELS).sort());
  });
});
