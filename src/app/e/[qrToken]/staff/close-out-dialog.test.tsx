import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CloseOutDialog } from "./close-out-dialog";

// The dialog is a client component that leans on the app router, a server
// action module, the browser Supabase client and a <canvas> signature pad —
// none of which exist under jsdom. Everything here is about the localStorage
// draft effect, so those are stubbed to the minimum that lets it mount.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("../staff-actions", () => ({
  assertStaffUploadsAllowed: vi.fn(async () => null),
  closeOutFromScan: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: vi.fn() }) } }),
}));
vi.mock("@/components/signature-pad", () => ({
  SignaturePad: () => <div data-testid="signature-pad" />,
}));
vi.mock("@/lib/env", () => ({
  publicEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  },
}));

const REQUEST_ID = "req-b2";
// Must match draftStorageKey() in src/lib/close-out-draft.ts.
const DRAFT_KEY = `equipqr:close-out-draft:${REQUEST_ID}`;

function renderDialog(props: Partial<Parameters<typeof CloseOutDialog>[0]> = {}) {
  return render(
    <CloseOutDialog
      open={false}
      onOpenChange={() => {}}
      qrToken="ABCD2345"
      requestId={REQUEST_ID}
      companyId="company-1"
      companyName="Acme Service"
      defaultContactName="Dana Reed"
      defaultEmail={null}
      contactPhone={null}
      publicToken="public-token"
      {...props}
    />
  );
}

describe("CloseOutDialog draft autosave (B2)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("does not persist the untouched defaults as a draft on mount", () => {
    // Every open-request card mounts this dialog closed. Writing on mount
    // stored `sendEmail: false` for a customer with no email, and that stored
    // value then outlived the customer adding one — the resolution email was
    // silently skipped on the next close-out.
    renderDialog();
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("still saves a draft once the technician actually types", () => {
    renderDialog({ open: true });
    fireEvent.change(screen.getByLabelText("Summary of work performed"), {
      target: { value: "Replaced the belt" },
    });
    const stored = window.localStorage.getItem(DRAFT_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toMatchObject({ summary: "Replaced the belt", sendEmail: false });
  });

  it("does not re-persist a restored draft on mount either", () => {
    // A draft that was recovered is already stored; the mount run has nothing
    // to add, and must not stomp it with the (identical) restored state.
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        summary: "Half done",
        recommendations: "",
        signedByName: "",
        sendEmail: true,
        emailTo: "dana@example.com",
      })
    );
    const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");
    try {
      renderDialog();
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      setItem.mockRestore();
    }
  });
});
