# QR codes and labels

How a code gets onto a machine, what's printed on the sticker, and what happens
when the sticker is lost, wrong, or replaced.

Related: `src/lib/qr.ts` (codes + rendering), `src/lib/labels/**` (sheet
geometry and PDF rendering), `supabase/migrations/0013_now_roadmap_foundation.sql`
§3 and §11d (schema + lifecycle RPCs), `docs/BATCH-QR.md` (the parked
pre-printed sticker feature).

## Short codes

Every `qr_codes` row has a `short_code`: 8 characters from
`ABCDEFGHJKMNPQRSTUVWXYZ23456789` — no `0`/`O`, no `1`/`I`/`L`, because these
get read aloud over the phone and copied off a scuffed sticker. It is stored
without a dash and displayed as `ABCD-2345` (`formatShortCode`).

The short code does three jobs:

1. **It's the URL token.** For every code created since migration 0013,
   `qr_codes.token === qr_codes.short_code`, so the sticker's URL is
   `https://equipqr.co/e/ABCD2345`. That's ~15 characters shorter than the
   legacy 24-hex token, which is exactly what buys us the error correction
   below.
2. **It's the typed fallback.** The label prints it in large monospace under
   "or enter this code at equipqr.co". A customer whose phone camera won't
   focus, or whose sticker is half scraped off, can still type it in.
3. **It's the staff lookup.** `/dashboard/equipment/find?code=ABCD-2345`
   (search box on the label-sheets page) resolves a code a technician is
   holding to its unit. `qrLookupCandidates()` accepts lower case, a missing
   dash, stray spaces, a legacy token, a batch `AB3D-9F2K` token, or the whole
   pasted `/e/<token>` URL.

Uniqueness is enforced by a DB unique index, not by the app. `generateShortCode()`
produces a candidate and the caller retries on the (very rare) collision.

## EC-H: why the QR looks "busy"

Every QR this app renders uses **error-correction level H** — 30% of the symbol
can be destroyed and it still scans — with a 4-module quiet zone
(`QR_ERROR_CORRECTION` in `src/lib/qr.ts`). Stickers on field equipment get
splashed, scuffed, painted over, and partly peeled; H is what makes a damaged
sticker keep working.

H costs capacity, which is why the short-code URL matters: at ~30 characters
the payload still fits a Version 3 symbol, so the individual modules stay large
enough to scan from a phone at arm's length off a 1-inch label. A 24-hex legacy
token at level H needs a denser symbol and scans noticeably worse at that size.

## Lifecycle: retire vs replace vs move

All three are security-definer RPCs (migration 0013 §11d) that also append the
right `equipment_events` row. The app calls them from
`src/app/dashboard/equipment/[id]/qr-actions.ts`.

| Action | RPC | What happens to the old code | Use it when |
|---|---|---|---|
| **Replace** | `replace_qr_code(id)` | status → `replaced`, **keeps** its `equipment_id`, gains `replaced_by_id`. The unit gets a brand-new active code. | The sticker is damaged or you want a fresh one. The old sticker keeps working, so you can swap the label on your next visit. |
| **Retire** | `retire_qr_code(id)` | status → `retired`, `equipment_id` set to **null**, `retired_at` stamped. | The sticker is gone, or the machine has left the field. A scan now shows "contact the company" — no guide, no service request. |
| **Move** | `reassign_qr_code(id, equipment_id)` | Stays `active`, just points at a different unit. Fails if the target already has an active code. | The sticker went on the wrong machine. |

Two consequences worth knowing:

- A **retired** code no longer points at the unit, so the equipment page can't
  find it by `equipment_id`. `qr-section.tsx` recovers it through the unit's
  `code_retired` / `code_reassigned` timeline events; `previousCodeState()`
  turns the result back into "replaced / retired / moved" from that unit's
  point of view.
- The DB constraint is **one *active* code per unit**
  (`qr_codes_one_active_per_equipment`), not one code per unit. That is what
  lets a replaced code keep its link.

## Codes never break

**A code that has ever been printed keeps resolving unless someone explicitly
retires it.** This is the promise the whole feature rests on: a sticker is a
physical object on someone else's property, and we cannot assume anyone will
ever go back and change it.

Concretely:

- Legacy 24-hex instant tokens and batch `XXXX-XXXX` tokens still resolve.
  `resolve_qr_code(p_token)` matches on `token` **or** `short_code`, in any
  case, with or without the dash.
- Replacing a code does not break the old one — it stays pointed at the same
  unit.
- The QR for a legacy code still encodes its original `token`, never its
  newer short code, so re-printing an old unit's label produces a sticker
  identical to the one already on the machine (`qrValue: code.token` in the
  PDF route and the label page).
- The only way to stop a code resolving is **Retire**, and that path is a
  confirm dialog that says so in plain language.

## Printing: one sticker

`/dashboard/equipment/[id]/label` renders a real sticker at true physical size
and sets `@page { size: <w>in <h>in; margin: 0 }` so the browser's print dialog
defaults to the right paper. Print at 100% scale, not "fit to page".

Sizes come from `src/lib/labels/sticker-sizes.ts` via `?size=`:

| `?size=` | Sticker | Layout |
|---|---|---|
| `2x2` (default) | 2" × 2" | Full: logo or company name, QR, unit name, "Scan for help & service", short code + "or enter this code at …", "Call …", Location |
| `3x2` | 3" × 2" | Full, with more room for the name and contact line |
| `1x1` | 1" × 1" | Minimal: QR and short code only |

The company logo is used when `companies.logo_path` is set (public
`company-assets` bucket, via `companyAssetUrl()`), falling back to the company
name. Unlike customer-facing surfaces this is **not** plan-gated — it's the
company printing its own sticker.

The Location line prints `equipment.location` when set, and otherwise a blank
rule to write on.

Clicking Print stamps `qr_codes.label_printed_at` (best-effort — printing must
never block on bookkeeping).

## Printing: Avery sheets

`/dashboard/equipment/labels` lists every unit with an active code, filterable
by customer, with per-row checkboxes and a select-all that applies to the
current filter. "Download PDF" POSTs the selection to
`/dashboard/equipment/labels/pdf`, which renders with **pdf-lib** (pure JS, so
it runs unchanged on Vercel's Node runtime) and stamps `label_printed_at` on
every code included.

| Template | Sheet | Per sheet | Grid | Cell contents |
|---|---|---|---|---|
| Avery 5160 | 2.625" × 1" | 30 | 3 × 10 | QR, unit name, prompt, short code |
| Avery 5163 | 4" × 2" | 10 | 2 × 5 | QR, company name, unit name, prompt, short code, "Call …" |
| Avery 22806 | 2" × 2" square | 12 | 3 × 4 | QR above unit name, short code, phone |

All geometry lives in `src/lib/labels/templates.ts` as pure functions over PDF
points (72 per inch, origin bottom-left) — `cellRect()`, `labelSlots()`,
`sheetCount()` — and is covered by `templates.test.ts`, which asserts that
margins + labels + gutters add up to exactly 8.5" × 11" for every template. If
you add a template, add it there and the invariant tests will tell you whether
the numbers are self-consistent.

Two rules the renderer enforces:

- **Nothing below 6pt.** Smaller than that and toner spread makes the short
  code unreadable, which defeats the point of printing it.
- **Everything is sanitised for WinAnsi** (`src/lib/labels/text.ts`). pdf-lib's
  standard fonts *throw* on characters they can't encode, and equipment names
  are free text — a unit called "冷蔵庫 A" would otherwise 500 the whole sheet.

A selection is capped at 300 labels per request so one accidental select-all on
a large account can't tie up a serverless function.

## Downloads

`/dashboard/equipment/[id]/qr/png` (1200px) and `.../qr/svg` (vector, for a
sign shop) serve the active code as an attachment named
`<unit-slug>-<shortcode>.<ext>`. Both go through the RLS server client and 404
— rather than 403 — on anything the signed-in user can't see, so they can't be
used to probe for another company's units.
