import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCloseOutDraft,
  isCloseOutDirty,
  readCloseOutDraft,
  writeCloseOutDraft,
  type CloseOutFields,
} from "@/lib/close-out-draft";

const PRISTINE: CloseOutFields = {
  summary: "",
  recommendations: "",
  signedByName: "",
  photoCount: 0,
  hasSignature: false,
};

describe("readCloseOutDraft / writeCloseOutDraft / clearCloseOutDraft", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when nothing was ever saved for this request", () => {
    expect(readCloseOutDraft("req-1")).toBeNull();
  });

  it("round-trips exactly what was written", () => {
    const draft = {
      summary: "Replaced the belt",
      recommendations: "Check again in 6 months",
      signedByName: "Dana Lee",
      sendEmail: true,
      emailTo: "dana@example.com",
    };
    writeCloseOutDraft("req-1", draft);
    expect(readCloseOutDraft("req-1")).toEqual(draft);
  });

  it("keeps drafts for different requests separate", () => {
    writeCloseOutDraft("req-1", { summary: "A", recommendations: "", signedByName: "", sendEmail: false, emailTo: "" });
    writeCloseOutDraft("req-2", { summary: "B", recommendations: "", signedByName: "", sendEmail: false, emailTo: "" });
    expect(readCloseOutDraft("req-1")?.summary).toBe("A");
    expect(readCloseOutDraft("req-2")?.summary).toBe("B");
  });

  it("clear removes only that request's draft", () => {
    writeCloseOutDraft("req-1", { summary: "A", recommendations: "", signedByName: "", sendEmail: false, emailTo: "" });
    writeCloseOutDraft("req-2", { summary: "B", recommendations: "", signedByName: "", sendEmail: false, emailTo: "" });
    clearCloseOutDraft("req-1");
    expect(readCloseOutDraft("req-1")).toBeNull();
    expect(readCloseOutDraft("req-2")?.summary).toBe("B");
  });

  it("treats corrupt JSON as no draft instead of throwing", () => {
    window.localStorage.setItem("equipqr:close-out-draft:req-1", "{not json");
    expect(readCloseOutDraft("req-1")).toBeNull();
  });

  it("fills in defaults for a partially-shaped stored value instead of throwing", () => {
    window.localStorage.setItem("equipqr:close-out-draft:req-1", JSON.stringify({ summary: "Only this" }));
    expect(readCloseOutDraft("req-1")).toEqual({
      summary: "Only this",
      recommendations: "",
      signedByName: "",
      sendEmail: false,
      emailTo: "",
    });
  });

  it("treats a stored non-object (e.g. a bare string) as no draft", () => {
    window.localStorage.setItem("equipqr:close-out-draft:req-1", JSON.stringify("just a string"));
    expect(readCloseOutDraft("req-1")).toBeNull();
  });
});

describe("isCloseOutDirty", () => {
  it("is clean when nothing differs from pristine", () => {
    expect(isCloseOutDirty(PRISTINE, PRISTINE)).toBe(false);
  });

  it("is clean when the only 'difference' is surrounding whitespace", () => {
    expect(isCloseOutDirty({ ...PRISTINE, summary: "   " }, PRISTINE)).toBe(false);
  });

  it("is dirty once a summary is typed", () => {
    expect(isCloseOutDirty({ ...PRISTINE, summary: "Replaced the belt" }, PRISTINE)).toBe(true);
  });

  it("is dirty once a photo is added, even with no text typed", () => {
    expect(isCloseOutDirty({ ...PRISTINE, photoCount: 1 }, PRISTINE)).toBe(true);
  });

  it("is dirty once a signature is drawn", () => {
    expect(isCloseOutDirty({ ...PRISTINE, hasSignature: true }, PRISTINE)).toBe(true);
  });

  it("is not fooled by a pre-filled signedByName matching the initial value", () => {
    const initial: CloseOutFields = { ...PRISTINE, signedByName: "Dana Lee" };
    expect(isCloseOutDirty({ ...initial }, initial)).toBe(false);
  });

  it("is dirty when the pre-filled signedByName is edited", () => {
    const initial: CloseOutFields = { ...PRISTINE, signedByName: "Dana Lee" };
    expect(isCloseOutDirty({ ...initial, signedByName: "Dana L." }, initial)).toBe(true);
  });

  it("is dirty when a restored draft differs from pristine, even with no new edits this session", () => {
    // The scenario this guards: a technician left mid-close-out, comes back,
    // and the form is repopulated from localStorage. Dismissing right away
    // (without typing anything further) must still be treated as dirty —
    // the restored text is real unsaved work, not a "clean" starting point.
    const restored: CloseOutFields = { ...PRISTINE, summary: "Restored from an earlier visit" };
    expect(isCloseOutDirty(restored, PRISTINE)).toBe(true);
  });
});
