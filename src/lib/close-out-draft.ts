// Pure helpers for close-out.tsx — Q-04/Q-51/Q-54: a technician's summary,
// photos and signature must never quietly vanish. Two separate, deliberately
// independent concerns live here:
//
//  1. A localStorage draft of the TEXT fields (summary, recommendations,
//     signed-by name, email toggle/address), keyed per request, so a real
//     page reload or an accidentally-closed tab can be recovered from.
//     Photos (File objects) and signature strokes (canvas ink) can't
//     reasonably round-trip through localStorage, so they're out of scope
//     for this file — losing them on a true page reload is an accepted,
//     well-understood limit of a plain file input.
//  2. A pure "is there unsaved work right now" check the dialog uses to
//     decide whether dismissing it (the X button, the backdrop, Escape)
//     needs a "Discard close-out?" confirmation first. This does NOT use
//     the localStorage draft as its baseline — see isCloseOutDirty below.
//
// Every localStorage call is try/catch wrapped: private browsing, a full
// quota, or storage disabled by policy must never break the close-out flow
// itself, only silently drop the "recover my draft" convenience.

export type CloseOutDraft = {
  summary: string;
  recommendations: string;
  signedByName: string;
  sendEmail: boolean;
  emailTo: string;
};

function draftStorageKey(requestId: string): string {
  return `equipqr:close-out-draft:${requestId}`;
}

/** Best-effort read. Returns null on no saved draft, corrupt JSON, or no localStorage at all (private browsing, SSR, disabled storage). */
export function readCloseOutDraft(requestId: string): CloseOutDraft | null {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(requestId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    return {
      summary: typeof p.summary === "string" ? p.summary : "",
      recommendations: typeof p.recommendations === "string" ? p.recommendations : "",
      signedByName: typeof p.signedByName === "string" ? p.signedByName : "",
      sendEmail: typeof p.sendEmail === "boolean" ? p.sendEmail : false,
      emailTo: typeof p.emailTo === "string" ? p.emailTo : "",
    };
  } catch {
    return null;
  }
}

/** Best-effort write. A failure (quota, private browsing, disabled storage) is silently dropped — the in-memory form state is unaffected either way. */
export function writeCloseOutDraft(requestId: string, draft: CloseOutDraft): void {
  try {
    window.localStorage.setItem(draftStorageKey(requestId), JSON.stringify(draft));
  } catch {
    // Best-effort only.
  }
}

/** Called once a close-out is actually saved, or the technician explicitly discards it. */
export function clearCloseOutDraft(requestId: string): void {
  try {
    window.localStorage.removeItem(draftStorageKey(requestId));
  } catch {
    // Best-effort only.
  }
}

// ----------------------------------------------------------------------------
// Dirty-state check (Q-04's "confirm Discard close-out? when dirty")
// ----------------------------------------------------------------------------

export type CloseOutFields = {
  summary: string;
  recommendations: string;
  signedByName: string;
  photoCount: number;
  hasSignature: boolean;
};

/**
 * Is there unsaved work right now? `initial` should always be the PRISTINE
 * defaults a brand-new close-out opens with (summary/recommendations blank,
 * signedByName pre-filled from the contact if any, no photos, no signature)
 * — never the current contents of a restored localStorage draft. That
 * matters: if a draft WAS restored (the technician left and came back), the
 * form already differs from pristine, so this correctly reports dirty and
 * protects that restored work from being dismissed unconfirmed too. Only a
 * dialog nobody has touched (fresh, and nothing was ever saved to restore)
 * reports clean.
 */
export function isCloseOutDirty(current: CloseOutFields, initial: CloseOutFields): boolean {
  return (
    current.summary.trim() !== initial.summary.trim() ||
    current.recommendations.trim() !== initial.recommendations.trim() ||
    current.signedByName.trim() !== initial.signedByName.trim() ||
    current.photoCount !== initial.photoCount ||
    current.hasSignature !== initial.hasSignature
  );
}
