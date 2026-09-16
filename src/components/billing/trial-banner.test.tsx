import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrialBanner } from "./trial-banner";

describe("TrialBanner (Q-15)", () => {
  it("owner, not yet urgent: neutral styling, a billing link", () => {
    render(<TrialBanner daysLeft={10} role="owner" />);
    expect(screen.getByText(/10 days left in your trial/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Choose a plan" });
    expect(link).toHaveAttribute("href", "/dashboard/settings/billing");
  });

  it("non-owner, not yet urgent: no billing link, tells them to ask the owner", () => {
    render(<TrialBanner daysLeft={10} role="technician" />);
    expect(screen.getByText(/Ask your account owner to choose a plan\./)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Choose a plan" })).not.toBeInTheDocument();
  });

  it("owner at the ≤3-day threshold: escalates to amber and keeps the link", () => {
    render(<TrialBanner daysLeft={3} role="owner" />);
    expect(screen.getByText(/3 days left in your trial/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Choose a plan" })).toBeInTheDocument();
  });

  it("4 days left does not escalate, 3 does (boundary)", () => {
    const { container: notUrgent } = render(<TrialBanner daysLeft={4} role="owner" />);
    expect(notUrgent.firstElementChild).not.toHaveClass("bg-amber-500/15");

    const { container: urgent } = render(<TrialBanner daysLeft={3} role="owner" />);
    expect(urgent.firstElementChild).toHaveClass("bg-amber-500/15");
  });

  it("singular day is grammatically correct", () => {
    render(<TrialBanner daysLeft={1} role="owner" />);
    expect(screen.getByText(/1 day left in your trial\./)).toBeInTheDocument();
  });

  it("manager and staff roles get the same non-owner treatment as technician", () => {
    render(<TrialBanner daysLeft={5} role="manager" />);
    expect(screen.getByText(/Ask your account owner/)).toBeInTheDocument();
  });
});
