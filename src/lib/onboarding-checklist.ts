// Pure completion rule for the Overview page's "Getting started" checklist
// (src/app/dashboard/page.tsx, src/app/dashboard/getting-started-checklist.tsx).
// Kept separate from src/lib/checklists.ts, which is the unrelated
// checklist_templates/inspections (PM checklist) domain.

export type OnboardingChecklistItem = { done: boolean; optional?: boolean };

/**
 * Whether every required (non-optional) item is done. Optional items — like
 * "Invite a teammate" — are a bonus and never gate this, so a solo owner who
 * has finished everything else isn't stuck seeing the checklist forever.
 */
export function requiredChecklistItemsDone(items: OnboardingChecklistItem[]): boolean {
  return items.filter((item) => !item.optional).every((item) => item.done);
}
