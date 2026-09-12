// WS2 STUB — replaced by WS3 at merge (docs/OWNER-ROADMAP-BRIEF.md §4.2, §4.1
// ownership table: this file belongs to WS3, path
// `src/app/dashboard/requests/[id]/dispatch-panel.tsx`).
//
// WS3 builds the real vendor-dispatch panel here. This placeholder exists
// only so that `feat/owner-dashboard` (WS2's branch) type-checks, lints and
// builds on its own before the workstreams are merged — WS2 does not own
// this file and does not implement dispatch behavior in it.
//
// Frozen props (§4.2): `{ requestId: string; companyKind: CompanyKind }`.

import type { CompanyKind } from "@/lib/types";

export function DispatchPanel({
  requestId,
  companyKind,
}: {
  requestId: string;
  companyKind: CompanyKind;
}) {
  void requestId;
  void companyKind;

  return null;
}
