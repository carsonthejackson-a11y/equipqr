import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { MaintenanceSchedule } from "@/lib/types";
import { ScheduleDialog } from "./schedule-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("../equipment/maintenance-actions", () => ({
  createMaintenanceSchedule: vi.fn(),
  updateMaintenanceSchedule: vi.fn(),
}));

function schedule(overrides: Partial<MaintenanceSchedule> = {}): MaintenanceSchedule {
  return {
    id: "sched-1",
    company_id: "company-1",
    equipment_id: "eq-1",
    name: "Descale",
    description: null,
    interval_days: 90,
    lead_days: 14,
    next_due_on: "2026-09-01",
    last_completed_on: null,
    auto_create_request: true,
    notify_customer: true,
    checklist_template_id: null,
    last_generated_for: null,
    last_request_id: null,
    active: true,
    created_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const baseProps = {
  mode: "edit" as const,
  equipmentOptions: [{ id: "eq-1", name: "Espresso machine" }],
  checklistTemplates: [],
  companyTimezone: "America/Chicago",
  trigger: <button type="button">Edit schedule</button>,
};

describe("ScheduleDialog (edit)", () => {
  it("re-reads the schedule prop when it opens, so a refreshed next_due_on isn't overwritten on save", () => {
    const { rerender } = render(<ScheduleDialog {...baseProps} schedule={schedule({ next_due_on: "2026-09-01" })} />);

    // "Mark done" rolled the schedule forward and router.refresh() delivered
    // the new row while this dialog was still closed.
    rerender(
      <ScheduleDialog {...baseProps} schedule={schedule({ next_due_on: "2026-11-30", interval_days: 60 })} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));

    expect(screen.getByLabelText("Next due")).toHaveValue("2026-11-30");
    expect(screen.getByLabelText("Repeat every (days)")).toHaveValue(60);
  });

  it("re-seeds from the row each time it reopens, discarding unsaved edits", () => {
    render(<ScheduleDialog {...baseProps} schedule={schedule({ next_due_on: "2026-09-01" })} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));
    fireEvent.change(screen.getByLabelText("Next due"), { target: { value: "2027-01-15" } });
    expect(screen.getByLabelText("Next due")).toHaveValue("2027-01-15");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit schedule" }));

    expect(screen.getByLabelText("Next due")).toHaveValue("2026-09-01");
  });
});
