import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed } from "./activity-feed";
import type { RequestActivity } from "@/lib/types";

function row(overrides: Partial<RequestActivity>): RequestActivity {
  return {
    id: "a1",
    company_id: "c1",
    service_request_id: "r1",
    kind: "note",
    visibility: "internal",
    body: null,
    metadata: {},
    author_kind: "staff",
    author_user_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("ActivityFeed", () => {
  it("labels a vendor dispatch row with the vendor's name, not \"Staff\"", () => {
    // Shape written by migration 0025's /v/<token> RPCs: author_kind
    // "vendor", no author_user_id, vendor_name in metadata.
    render(
      <ActivityFeed
        items={[
          row({
            kind: "dispatch",
            visibility: "customer",
            body: "Metro Refrigeration acknowledged the work order",
            author_kind: "vendor",
            author_user_id: null,
            metadata: { action: "acknowledge", vendor_id: "v1", vendor_name: "Metro Refrigeration" },
          }),
        ]}
        staffNameById={new Map()}
      />
    );
    expect(screen.getByText("Vendor · Metro Refrigeration")).toBeInTheDocument();
    expect(screen.queryByText("Staff")).not.toBeInTheDocument();
  });

  it("falls back to a plain \"Vendor\" label when the row carries no vendor name", () => {
    render(
      <ActivityFeed
        items={[row({ id: "a2", kind: "dispatch", author_kind: "vendor", metadata: {} })]}
        staffNameById={new Map()}
      />
    );
    expect(screen.getByText("Vendor")).toBeInTheDocument();
    expect(screen.queryByText("Staff")).not.toBeInTheDocument();
  });

  it("still resolves staff rows through staffNameById", () => {
    render(
      <ActivityFeed
        items={[row({ id: "a3", author_kind: "staff", author_user_id: "u1", body: "Called the site" })]}
        staffNameById={new Map([["u1", "Dana Tech"]])}
      />
    );
    expect(screen.getByText("Dana Tech")).toBeInTheDocument();
  });
});
