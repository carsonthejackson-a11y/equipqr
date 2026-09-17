import { OPEN_REQUEST_STATUSES, CLOSED_REQUEST_STATUSES } from "@/components/status-badge";
import type { DispatchStatus, RequestPriority } from "@/lib/types";

// One definition of the inbox/overview "buckets" (open, unassigned, urgent,
// unread messages, awaiting vendor) so a count tile (dashboard Overview) and
// a filtered list (the requests inbox) can never drift apart the way
// dashboard/page.tsx's counts and requests/page.tsx's filters currently can
// — each recomputes its own predicate today. Every bucket is expressed as
// an "applier": a function that takes a Supabase/PostgREST filter-builder
// chain and returns it with more filters applied, so the SAME function can
// build a `{ count: "exact", head: true }` query and a full row fetch.
//
// ---------------------------------------------------------------------------
// Params the inbox (src/app/dashboard/requests/page.tsx) supports TODAY —
// read directly from that page and its request-filters.tsx before writing
// this module, not guessed:
//   status    — a RequestStatus value, "closed" (the CLOSED_STATUSES set),
//               or absent/"open"/anything unrecognised (the OPEN_STATUSES
//               set, the default landing view).
//   priority  — a single RequestPriority value; absent = any priority.
//   assignee  — "me" | "unassigned" | a member id; absent = anyone.
//   messages  — "1" means `last_customer_message_at IS NOT NULL` (the
//               request has EVER received a customer message) — NOT the
//               same thing as this module's applyUnreadMessages(), which is
//               unread_customer_messages > 0. Don't conflate the two: a
//               resolved request a customer thanked you on matches
//               `messages=1` forever, but drops out of applyUnreadMessages()
//               the moment staff view it.
//   dispatch  — a DispatchStatus value (equipment_owner kind only); absent
//               = any dispatch status.
//   q, page   — free-text search and pagination; irrelevant to buckets.
// None of the above can express an OR across values (e.g. "priority is high
// OR urgent", "dispatch_status in (sent, viewed)"), which applyUrgentOpen()
// and applyAwaitingVendor() below both need — hence `bucket` below.
//
// NEW param this module expects the inbox to add — `bucket`: when present
// and equal to a REQUEST_BUCKETS key, the page should call that bucket's
// `.apply(query)` on its base query INSTEAD OF hand-parsing status/priority/
// assignee/messages/dispatch, so the inbox's filtered rows and any card
// linking to `bucket.href` (e.g. an Overview "Unassigned" tile) are
// guaranteed to use the identical predicate — that guarantee is the entire
// point of this module. `bucket` is additive: the existing discrete params
// above keep working for RequestFilters' free-form filtering; a bucket link
// is a shortcut onto one of the fixed combinations already covered above,
// not a replacement for it.
// ---------------------------------------------------------------------------

/**
 * Statuses that count as "open" in the inbox — re-exported from
 * src/components/status-badge.tsx's own OPEN_REQUEST_STATUSES (the actual
 * source of truth the inbox and its filters already render from) so this
 * module can never drift out of sync with it. Import OPEN_STATUSES here
 * rather than OPEN_REQUEST_STATUSES from status-badge.tsx when what you
 * want is "the set a bucket predicate uses," to make that intent explicit.
 */
export const OPEN_STATUSES = OPEN_REQUEST_STATUSES;

/** The closed counterpart of {@link OPEN_STATUSES} — see its doc comment. */
export const CLOSED_STATUSES = CLOSED_REQUEST_STATUSES;

const URGENT_PRIORITIES: RequestPriority[] = ["high", "urgent"];
const AWAITING_VENDOR_DISPATCH_STATUSES: DispatchStatus[] = ["sent", "viewed"];

/**
 * The subset of a Supabase/PostgREST filter-builder chain the bucket
 * appliers below use. A structural type, not `PostgrestFilterBuilder<...>`
 * itself — this app never types a `Database` schema onto its Supabase
 * client (see src/lib/supabase/server.ts), and typing against the real
 * generic would make this module untestable without a live client. The
 * real `supabase.from("service_requests").select(...)` builder satisfies
 * this structurally (its `.eq/.in/.is/.gt` all return `this`), and so does
 * a small hand-rolled fake in a test — see request-queries.test.ts.
 */
export type RequestFilterBuilder<Self> = {
  eq(column: string, value: string | number | boolean): Self;
  in(column: string, values: readonly (string | number)[]): Self;
  is(column: string, value: null): Self;
  gt(column: string, value: number): Self;
};

/** The base "open inbox" predicate: `status IN (new, in_progress, scheduled, on_hold)`. Every other "…Open" applier below builds on this one. */
export function applyOpen<B extends RequestFilterBuilder<B>>(query: B): B {
  return query.in("status", OPEN_STATUSES);
}

/** Open requests with no assignee — the Overview page's existing "Unassigned" tile / `?assignee=unassigned` filter, expressed as a bucket. */
export function applyUnassignedOpen<B extends RequestFilterBuilder<B>>(query: B): B {
  return applyOpen(query).is("assigned_to", null);
}

/** Open requests at high or urgent priority. */
export function applyUrgentOpen<B extends RequestFilterBuilder<B>>(query: B): B {
  return applyOpen(query).in("priority", URGENT_PRIORITIES);
}

/**
 * Requests with at least one unread customer message
 * (`unread_customer_messages > 0`). Deliberately NOT restricted to open
 * requests — matches dashboard/page.tsx's existing "Unread messages" tile,
 * which counts the same way. See the module doc comment for how this
 * differs from the inbox's existing `messages=1` URL param.
 */
export function applyUnreadMessages<B extends RequestFilterBuilder<B>>(query: B): B {
  return query.gt("unread_customer_messages", 0);
}

/**
 * Open requests currently sent to a vendor with no response yet
 * (`dispatch_status IN (sent, viewed)`). equipment_owner kind only in
 * practice — dispatches don't exist for service_provider companies — so
 * gate showing this bucket on `company.kind === "equipment_owner"`, the
 * same way dashboard/page.tsx's "No vendor response" card already does.
 */
export function applyAwaitingVendor<B extends RequestFilterBuilder<B>>(query: B): B {
  return applyOpen(query).in("dispatch_status", AWAITING_VENDOR_DISPATCH_STATUSES);
}

export type RequestBucketKey = "open" | "unassigned" | "urgent" | "unreadMessages" | "awaitingVendor";

export type RequestBucket = {
  key: RequestBucketKey;
  /** Short label for a card/pill/nav item. Generic across both company kinds — kind-specific copy (e.g. "vendor" vs "customer") is the caller's job, via src/lib/vocab.ts. */
  label: string;
  /** Applies this bucket's predicate to a filter-builder chain — the exact same function for a `count`-only query and a full row fetch, so the two can never disagree. */
  apply: <B extends RequestFilterBuilder<B>>(query: B) => B;
  /** The inbox URL that shows exactly this bucket — see the module doc comment for what the inbox needs to do with `?bucket=`. */
  href: string;
};

/**
 * Every bucket a "needs attention" card or inbox shortcut can link to, keyed
 * by {@link RequestBucketKey}. Each entry's `apply` is the matching
 * `apply*` function above — use REQUEST_BUCKETS[key].apply(...) instead of
 * re-selecting the applier by hand once you have a key from `?bucket=`.
 */
export const REQUEST_BUCKETS: Record<RequestBucketKey, RequestBucket> = {
  open: { key: "open", label: "Open", apply: applyOpen, href: "/dashboard/requests?bucket=open" },
  unassigned: {
    key: "unassigned",
    label: "Unassigned",
    apply: applyUnassignedOpen,
    href: "/dashboard/requests?bucket=unassigned",
  },
  urgent: {
    key: "urgent",
    label: "Urgent",
    apply: applyUrgentOpen,
    href: "/dashboard/requests?bucket=urgent",
  },
  unreadMessages: {
    key: "unreadMessages",
    label: "Unread messages",
    apply: applyUnreadMessages,
    href: "/dashboard/requests?bucket=unreadMessages",
  },
  awaitingVendor: {
    key: "awaitingVendor",
    label: "Awaiting vendor",
    apply: applyAwaitingVendor,
    href: "/dashboard/requests?bucket=awaitingVendor",
  },
};

// ---------------------------------------------------------------------------
// Reference-code search (QoL-4 / Q-07). The inbox's free-text search covers
// description/contact/equipment but never `service_requests.public_token`,
// so the short reference a customer is told to quote on the phone
// ("D858-8364", derived from their token by requestReference() in
// src/lib/public-request.ts) can't be looked up from the dashboard. These two
// pure helpers let the inbox recognise a typed reference and turn it into the
// same 8-char lowercase prefix requestReference() derives, for a
// `public_token.ilike.<prefix>%` OR-clause alongside the existing search
// terms — see requests/page.tsx.
// ---------------------------------------------------------------------------

/**
 * True when `term` is shaped like a request reference: 8 alphanumeric
 * characters, optionally grouped 4-4 by a dash, case-insensitive —
 * e.g. "D858-8364", "d8588364", "D8588364". Whitespace around the term is
 * ignored. Mirrors the pattern from Q-07's proposed fix exactly.
 */
export function looksLikeRequestReference(term: string): boolean {
  return /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(term.trim());
}

/**
 * The lowercase, dash-stripped 8-character prefix to match against
 * `public_token` for a typed reference — the inverse of
 * requestReference()'s uppercase 4-4 grouping (public tokens are UUIDs, whose
 * first 8 characters are always the hex digits before the first hyphen, so a
 * plain prefix match against the raw column is correct — no need to strip
 * hyphens out of `public_token` itself). Only meaningful when
 * {@link looksLikeRequestReference} is true for the same input; callers
 * should check that first rather than assuming every search term is a
 * reference.
 */
export function requestReferenceSearchPrefix(term: string): string {
  return term.trim().replace(/-/g, "").toLowerCase();
}
