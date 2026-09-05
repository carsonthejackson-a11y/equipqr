# Pre-printed QR sticker batches (parked)

The founder parked this feature for launch. It is not deleted — it's gated behind
`FEATURES.batchQr` in `src/lib/features.ts` (env `NEXT_PUBLIC_FEATURE_BATCH_QR`, default
`false`). Set that env var to `true` (or `1`) and redeploy to turn it back on; no code changes
are required for the gated behavior below. Marketing copy was removed outright (see the bottom
of this doc) and will need to be re-added by hand.

**Update (QR hardening, Sept 2026).** The parked code still compiles and still works
exactly as described below, but the ground under it has shifted twice, and neither change
needs anything doing while the flag is off. First, migration 0013 gave every `qr_codes`
row a `short_code` and a lifecycle (`active` / `retired` / `replaced`); batch codes were
backfilled from their own `XXXX-XXXX` token, `generate_qr_code_batch()` now populates
`short_code` alongside `token`, and `claim_qr_code()` only claims codes that are still
`active`. Batch tokens keep resolving forever — see the "codes never break" section of
`docs/QR-LABELS.md`. Second, self-serve printing got good: a company can now print a
real sticker at true size from `/dashboard/equipment/[id]/label` and a full Avery sheet
(5160 / 5163 / 22806) from `/dashboard/equipment/labels`, which covers most of what
ordering a pre-printed batch was for and is the reason there's no urgency to unpark this.
The one shared touchpoint is `PrintButton` (`equipment/[id]/label/print-button.tsx`),
which the admin batch sheet reuses: its `codeId` / `equipmentId` props are optional
precisely so that page — where the codes belong to no single unit — keeps working.
Nothing in this doc's restore checklist changes.

## What the feature is

Platform admins generate a pool of QR codes ("batches"), export them or print a physical sheet,
and ship the stickers to a company. A company's technician later scans one of those stickers on
the `/e/[qrToken]` page and "claims" it — links it to a specific piece of equipment — instead of
generating a fresh code in the dashboard. This is the alternative to "instant" codes, which a
company generates and prints itself on the spot.

## What turning the flag on restores

- **Equipment QR setup UI** — `src/app/dashboard/equipment/new-equipment-dialog.tsx` and
  `src/app/dashboard/equipment/[id]/assign-code-form.tsx` show the "How do you want to set up
  this QR code?" radio group again (Generate a new code now / Use a pre-printed code), including
  the pre-printed code input, the `QrScanButton` camera scanner, and the Pro-plan gating copy
  ("Batch-printed codes are a Pro plan feature") when the company's plan doesn't include
  `batchQr`. With the flag off, both forms only ever submit `codeSource=instant` via a hidden
  field, so equipment always gets an instantly-generated code.
- **The claim flow on a scanned code** — `src/app/e/[qrToken]/page.tsx` resolves an
  `unclaimed` code (one that exists in a batch but isn't linked to equipment yet) to the real
  claim experience: staff of the owning company see `claim-code-card.tsx` and can link the code
  to a piece of equipment; anyone else sees a "not set up yet, contact the service company"
  message. With the flag off, *everyone* sees that same friendly message for an unclaimed code —
  the claim card never renders, even for staff.
- **Platform admin batch tools** — everything under `src/app/admin/` (generate a batch, export
  CSV, print a physical sheet). `src/app/admin/layout.tsx` calls `notFound()` for the whole
  section when the flag is off; `src/app/admin/qr-codes/export/route.ts` (a route handler, not
  covered by the layout) checks the flag itself and 404s too. The "Admin" link is hidden from
  `src/components/dashboard-nav.tsx` / `dashboard-topnav.tsx` (via `dashboard-nav-links.ts`'s
  `adminNavLink`) whenever the flag is off, even for platform admins.
- **Plan-gating text and the pricing comparison row** — `src/app/dashboard/equipment/page.tsx`
  and `[id]/page.tsx` only compute `batchQrEnabled` (from `src/lib/plans.ts`'s `batchQr` plan
  feature, via `hasFeature()`) when the flag is on, so the "Pro plan feature" copy above never
  shows while parked. `src/app/(marketing)/pricing/page.tsx`'s plan comparison table gets its
  "Pre-printed batch QR sticker orders" row back (wired to `plan.features.batchQr`) — that row
  is skipped, not deleted, so it reappears automatically once the flag is on.
- **`src/components/qr-scan-button.tsx`** is untouched either way — it's a camera-scanning
  component only ever rendered by the two forms above, so gating them is sufficient to keep it
  out of the UI while parked.

`src/lib/plans.ts`'s `PlanFeatures.batchQr` key (Pro/Business `true`, Starter `false`) was left
in place regardless of the flag — the billing workstream depends on the shape, and it's already
out of each plan's `highlights` list, so it doesn't appear anywhere in plan-card copy on its
own.

## Marketing copy that was removed (re-add when re-enabling)

Unlike the product UI above, marketing copy was **deleted**, not flag-gated — the founder didn't
want any mention of pre-printed stickers while the feature is parked. Restore these by hand:

- **`src/app/(marketing)/page.tsx`** (home): a feature-grid card, removed from the `features`
  array —
  ```
  {
    icon: Printer, // re-add the Printer import from lucide-react too
    title: "Pre-printed sticker batches",
    description:
      "Print your own QR codes on demand, or order a batch of durable, pre-linked stickers shipped straight to your shop.",
  },
  ```
- **`src/app/(marketing)/features/page.tsx`**: the page `metadata.description` used to end
  "...AI dispatch summaries, and pre-printed sticker batches — everything EquipQR does for
  field-service teams." (now ends at "AI dispatch summaries"). The "Stickers, printed your way"
  card's body used to read: "Generate a QR code the instant you add a unit and print it
  yourself, or order a batch of durable, weatherproof stickers pre-linked and ready to slap on
  before you head out on the route." (now just describes printing your own).
- **`src/app/(marketing)/contact/page.tsx`**: the intro paragraph used to read "Questions about
  pricing, setting up your first guide, or ordering sticker batches — we read every message."
  (now drops "or ordering sticker batches").
- **`src/app/(marketing)/_components/faq-data.ts`** (`productFaqs`, shown on `/`, `/faq`): the
  question "Can I print my own stickers, or do you print them for me?" with answer "Both.
  Download a print-ready SVG or PNG for any QR code from the dashboard, or order a batch of
  pre-printed, pre-linked stickers shipped to you — good for stocking a truck ahead of a route."
  was narrowed to a self-print-only Q&A. The next FAQ's answer ("What does a customer see if a
  sticker hasn't been assigned to a unit yet?") used to end "...If one of your technicians scans
  it while signed in, they can claim it to a piece of equipment on the spot." — that sentence
  was dropped since claiming is unavailable while parked.

Nothing needed changing in `about/page.tsx`, `phone-mock.tsx`, or `site-footer.tsx` — their
"sticker" mentions are about a company's own self-printed labels, not the pre-printed batch
feature, and stay either way.

## Not in scope here

Dropping "onboarding call" from the Business plan (a separate founder request) is unrelated to
this flag — `src/lib/plans.ts` already reads "Priority support", and no marketing copy mentioned
it.
