import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PM_DUE_SOON_DAYS, pmState } from "@/lib/equipment";
import { addDays, todayDateOnly } from "@/lib/pm-reminders";
import { cn } from "@/lib/utils";
import type { Customer, Equipment } from "@/lib/types";

/** How many upcoming units the card lists before pointing at the filtered list. */
const PREVIEW_LIMIT = 5;

type DueUnit = Pick<Equipment, "id" | "name" | "customer_id" | "location" | "next_service_due_on">;

// Plain helper so the `new Date()` stays out of the component body (same
// pattern as getDateWindows() on the overview page).
function window() {
  const today = todayDateOnly();
  return { today, yesterday: addDays(today, -1), horizon: addDays(today, PM_DUE_SOON_DAYS) };
}

function dueLabel(dueOn: string | null): { text: string; overdue: boolean } {
  const state = pmState(dueOn);
  switch (state.state) {
    case "overdue":
      return { text: `overdue by ${state.days} ${state.days === 1 ? "day" : "days"}`, overdue: true };
    case "due_soon":
      return {
        text: state.days === 0 ? "due today" : `due in ${state.days} ${state.days === 1 ? "day" : "days"}`,
        overdue: false,
      };
    default:
      return { text: dueOn ?? "", overdue: false };
  }
}

/**
 * Overview card: how many units are overdue / due within 14 days, and the
 * next few by date. Self-contained (does its own RLS-scoped queries) so the
 * overview page only has to mount it. Retired units are never "due".
 */
export async function MaintenanceDueCard() {
  const supabase = await createClient();
  const { yesterday, today, horizon } = window();

  const [{ count: overdueCount }, { count: dueSoonCount }, { data: upcoming }] = await Promise.all([
    supabase
      .from("equipment")
      .select("id", { count: "exact", head: true })
      .neq("status", "retired")
      .lte("next_service_due_on", yesterday),
    supabase
      .from("equipment")
      .select("id", { count: "exact", head: true })
      .neq("status", "retired")
      .gte("next_service_due_on", today)
      .lte("next_service_due_on", horizon),
    supabase
      .from("equipment")
      .select("id, name, customer_id, location, next_service_due_on")
      .neq("status", "retired")
      .lte("next_service_due_on", horizon)
      .order("next_service_due_on", { ascending: true })
      .limit(PREVIEW_LIMIT)
      .returns<DueUnit[]>(),
  ]);

  const customerIds = [
    ...new Set((upcoming ?? []).map((u) => u.customer_id).filter((id): id is string => !!id)),
  ];
  const { data: customers } =
    customerIds.length > 0
      ? await supabase
          .from("customers")
          .select("id, name")
          .in("id", customerIds)
          .returns<Pick<Customer, "id" | "name">[]>()
      : { data: [] as Pick<Customer, "id" | "name">[] };
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.name]));

  const overdue = overdueCount ?? 0;
  const dueSoon = dueSoonCount ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <CalendarRange className="size-4 text-muted-foreground" />
          Maintenance due
        </CardTitle>
        <CardAction>
          <Link
            href="/dashboard/equipment?pm=due_soon"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className={cn("text-2xl font-bold", overdue > 0 && "text-destructive")}>{overdue}</p>
            <p className="text-xs text-muted-foreground">Overdue</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{dueSoon}</p>
            <p className="text-xs text-muted-foreground">Due within {PM_DUE_SOON_DAYS} days</p>
          </div>
        </div>

        {upcoming && upcoming.length > 0 ? (
          <ul className="divide-y">
            {upcoming.map((unit) => {
              const due = dueLabel(unit.next_service_due_on);
              const where = [
                unit.customer_id ? customerName.get(unit.customer_id) : null,
                unit.location,
              ].filter(Boolean);
              return (
                <li key={unit.id}>
                  <Link
                    href={`/dashboard/equipment/${unit.id}`}
                    className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-foreground"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{unit.name}</p>
                      {where.length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">{where.join(" · ")}</p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-xs",
                        due.overdue ? "text-destructive" : "text-muted-foreground"
                      )}
                      title={unit.next_service_due_on ?? undefined}
                    >
                      {due.text}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nothing due in the next {PM_DUE_SOON_DAYS} days.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
