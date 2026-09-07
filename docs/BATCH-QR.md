# Pre-printed QR sticker batches

A "batch" code is a QR sticker that's printed and stuck on a machine *before*
anyone tells EquipQR which unit it belongs to. Someone later scans it — or
picks it from a list in the dashboard — and "claims" it to a specific piece
of equipment. This is the alternative to an "instant" code, which a company
generates and prints itself the moment it adds a unit.

The feature is gated behind `FEATURES.batchQr` in `src/lib/features.ts` (env
`NEXT_PUBLIC_FEATURE_BATCH_QR`, **default `true`**). It was parked for launch
(default `false`) through the Now roadmap; the Next roadmap (Sept 2026)
un-parked it and added a second, faster way to create batch codes plus a
camera-based way to claim one. Set the env var to `false` to turn the whole
feature back off — see "What the flag gates" below for exactly what
disappears.

## Two ways a batch gets made

1. **Platform admin, for a company that ordered physical stickers**
   (`src/app/admin/qr-codes`, unchanged from the original design). An EquipQR
   team member generates a batch for a named company, exports it as CSV for
   a print vendor, or prints a simple sheet in-house
   (`/admin/qr-codes/print`). Uses `generate_qr_code_batch(p_company_id, p_count)`
   (migrations 0004/0013), which any company id can be passed to — it's an
   internal tool, not customer-facing.

2. **Owner self-serve, added in the Next roadmap**
   (`src/app/dashboard/settings/qr-codes` — "Blank codes" in Settings).
   An owner on a plan with the `batchQr` feature (Pro and Business — see
   `src/lib/plans.ts`) generates 1–100 blank codes for *their own* company
   from the dashboard, no admin involved, and prints them on a standard
   Avery sheet (`src/lib/labels/**`, same PDF engine the per-unit label
   sheets use — see `docs/QR-LABELS.md`). Uses
   `generate_company_qr_batch(p_count)` (migration 0019), which resolves the
   caller's company server-side via `get_my_company_id()` and checks
   `is_company_owner()` itself — so even if the app-side plan gate below were
   somehow bypassed, a technician (or another company) still couldn't mint
   codes for a company they don't own.

Both paths write the same `qr_codes` shape: `source = 'batch'`,
`status = 'active'`, `equipment_id = null`, and a `token`/`short_code` pair
generated the same way an instant code's is (see `docs/QR-LABELS.md`'s
"Short codes" section) — there's nothing about a code itself that says which
path made it.

## Claiming a batch code

However a batch code was made, claiming it works the same way, through the
`claim_qr_code(p_token, p_equipment_id)` RPC (migration 0013): it only
claims a code that is `active`, unclaimed, and belongs to the caller's own
company, and it writes a `code_assigned` equipment-timeline event.

There are three ways to reach it:

- **Type it in.** The "Use a pre-printed code" radio option on
  `new-equipment-dialog.tsx` and `assign-code-form.tsx` — type or scan the
  code, submit, done. This has always worked this way.
- **Pick existing equipment.** Scan the sticker while signed in as staff of
  the owning company: `/e/[qrToken]` resolves it as `unclaimed` and renders
  `ClaimCodeCard`, which lists equipment that doesn't have an active code yet
  and links the one you pick.
- **Scan-to-onboard (new).** From that same `ClaimCodeCard`, "Add new
  equipment from this sticker" goes to `/e/[qrToken]/onboard`: photograph the
  nameplate, Claude vision reads off the make/model/serial number (or skip
  and type it by hand), fill in the rest, submit. One server action
  (`onboardEquipment` in `src/app/e/[qrToken]/actions.ts`) creates the unit
  *and* claims this sticker to it, then lands back on the staff scan view.
  This is the point of printing a batch ahead of a route: stick a code on
  every truck-stock unit before you leave the shop, and finish setting each
  one up on-site with a photo instead of typing everything from a clipboard.

Nameplate reading lives in `src/lib/nameplate.ts` (`extractNameplate()`,
called only from `POST /api/nameplate`, staff-authenticated, rate-limited via
`RATE_LIMITS.nameplatePerUser`) — every field is nullable and the UI always
offers "skip, fill in by hand", because a blurry or partly-obscured plate is
a normal outcome, not an error.

## What the flag gates

With `FEATURES.batchQr` on (the default):

- The "How do you want to set up this QR code?" radio group on
  `new-equipment-dialog.tsx` and `assign-code-form.tsx`, including the
  pre-printed code input, the `QrScanButton` camera scanner, and Pro-plan
  gating copy ("Batch-printed codes are a Pro plan feature") when the
  company's plan doesn't include `batchQr`.
- The claim flow on a scanned unclaimed code: staff of the owning company get
  `ClaimCodeCard` (including the onboard button); anyone else still sees the
  plain "not set up yet, contact the service company" message.
- `/e/[qrToken]/onboard`, the scan-to-onboard flow.
- `/dashboard/settings/qr-codes`, the owner self-serve blank-code pool.
- Platform admin batch tools under `/admin/` (unrelated to plan — internal
  tooling stays available to the team regardless of a customer's plan).
- The pricing page's "Pre-printed batch QR sticker orders" comparison row.
- The marketing mentions listed in `docs/` history below (now restored).

With it off, all of the above reverts to the "not set up yet" / instant-code-
only behavior described by the original (Now roadmap) parking of this
feature: both equipment forms only ever submit `codeSource=instant`, an
unclaimed code always shows the generic message regardless of who's signed
in, `/admin` 404s, `/dashboard/settings/qr-codes` and `/e/*/onboard` 404, and
the pricing row and marketing copy disappear again.

`src/lib/plans.ts`'s `PlanFeatures.batchQr` key (Pro/Business `true`, Starter
`false`) is independent of the flag and always present — the billing
workstream depends on the shape.

## Not in scope here

Ordering *physical* pre-printed stickers from a vendor (as opposed to
printing your own on an Avery sheet) is still a platform-admin-mediated
process (`/admin/qr-codes`) — self-serve blank codes are meant for "print it
yourself right now," not a fulfillment pipeline.
