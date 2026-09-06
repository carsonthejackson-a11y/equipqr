import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { Button } from "./button";

// Base UI's useButton applies `type="button"` when it believes it is driving a
// native <button>, and `role="button"` when it is not. Those attributes are the
// observable result of the `nativeButton` flag the wrapper infers.
describe("Button nativeButton inference", () => {
  it("renders a native <button> by default", () => {
    render(<Button>Save</Button>);
    const el = screen.getByRole("button", { name: "Save" });
    expect(el.tagName).toBe("BUTTON");
    expect(el).toHaveAttribute("type", "button");
    expect(el).not.toHaveAttribute("role");
  });

  it("treats render={<a>} as a non-native button", () => {
    render(<Button render={<a href="https://example.com/plans">View plans</a>} />);
    const el = screen.getByRole("button", { name: "View plans" });
    expect(el.tagName).toBe("A");
    expect(el).toHaveAttribute("href", "https://example.com/plans");
    expect(el).toHaveAttribute("role", "button");
    expect(el).not.toHaveAttribute("type");
  });

  it("treats render={<Link>} as a non-native button", () => {
    render(<Button render={<Link href="/signup" />}>Sign up</Button>);
    const el = screen.getByRole("button", { name: "Sign up" });
    expect(el.tagName).toBe("A");
    expect(el).toHaveAttribute("href", "/signup");
    expect(el).toHaveAttribute("role", "button");
    expect(el).not.toHaveAttribute("type");
  });

  it("keeps render={<button>} native", () => {
    render(<Button render={<button type="submit" />}>Submit</Button>);
    const el = screen.getByRole("button", { name: "Submit" });
    expect(el.tagName).toBe("BUTTON");
    expect(el).not.toHaveAttribute("role");
  });

  it("lets an explicit nativeButton prop win over inference", () => {
    render(<Button nativeButton render={<a href="https://example.com/x">Forced</a>} />);
    const el = screen.getByText("Forced");
    expect(el).toHaveAttribute("type", "button");
    expect(el).not.toHaveAttribute("role");
  });

  it("marks a disabled link-button as aria-disabled", () => {
    render(<Button disabled render={<a href="https://example.com/export.csv">Equipment</a>} />);
    expect(screen.getByText("Equipment")).toHaveAttribute("aria-disabled", "true");
  });
});
