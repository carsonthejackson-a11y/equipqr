import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaGallery } from "./media-gallery";

describe("MediaGallery", () => {
  it("renders the sign-off date in the company's timezone, not the server's", () => {
    render(
      <MediaGallery
        items={[]}
        timeZone="America/Chicago"
        signature={{
          url: "https://example.com/signature.png",
          signedByName: "Dana",
          // 02:39 UTC on Sep 16 is 9:39 PM on Sep 15 in Chicago (CDT) — a
          // bare toLocaleDateString() on a UTC server printed Sep 16 here.
          signedAt: "2026-09-16T02:39:00.000Z",
        }}
      />
    );
    expect(screen.getByText(/Signed by Dana on Sep 15, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Sep 16/)).not.toBeInTheDocument();
  });

  it("omits the date when the signature has no timestamp", () => {
    render(
      <MediaGallery
        items={[]}
        timeZone="America/Chicago"
        signature={{ url: "https://example.com/signature.png", signedByName: null, signedAt: null }}
      />
    );
    expect(screen.getByText("Signed by the customer")).toBeInTheDocument();
  });
});
