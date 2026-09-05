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
