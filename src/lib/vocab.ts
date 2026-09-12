// Dashboard vocabulary for the two company kinds (docs/OWNER-ROADMAP-BRIEF.md
// §3.1.1). A service_provider company services OTHER people's equipment for
// customers; an equipment_owner company services its OWN equipment using
// vendors. Same schema, same routes — just different words on the same
// screens, so the nav/page copy reads naturally for whichever kind the
// signed-in company is.

import type { CompanyKind } from "@/lib/types";

export type Vocab = {
  requestSingular: string;
  requestPlural: string;
  requestsNavLabel: string;
  requestsHref: string;
  counterpartySingular: string;
  counterpartyPlural: string;
  counterpartyHref: string;
  reporterNoun: string;
  assigneeNoun: string;
  siteSingular: string;
  sitePlural: string;
  newRequestVerb: string;
};

export const VOCAB: Record<CompanyKind, Vocab> = {
  service_provider: {
    requestSingular: "Service request",
    requestPlural: "Service requests",
    requestsNavLabel: "Requests",
    requestsHref: "/dashboard/requests",
    counterpartySingular: "Customer",
    counterpartyPlural: "Customers",
    counterpartyHref: "/dashboard/customers",
    reporterNoun: "Customer",
    assigneeNoun: "Technician",
    siteSingular: "Site",
    sitePlural: "Sites",
    newRequestVerb: "Report a problem",
  },
  equipment_owner: {
    requestSingular: "Work order",
    requestPlural: "Work orders",
    requestsNavLabel: "Work Orders",
    requestsHref: "/dashboard/requests",
    counterpartySingular: "Vendor",
    counterpartyPlural: "Vendors",
    counterpartyHref: "/dashboard/vendors",
    reporterNoun: "Staff member",
    assigneeNoun: "Vendor",
    siteSingular: "Location",
    sitePlural: "Locations",
    newRequestVerb: "Report a problem",
  },
};

/** Falls back to service_provider for a null/unknown kind — never throws. */
export function vocabFor(kind: CompanyKind | null | undefined): Vocab {
  return VOCAB[kind ?? "service_provider"] ?? VOCAB.service_provider;
}
