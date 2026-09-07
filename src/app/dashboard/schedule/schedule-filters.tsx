"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDaysToDateOnly, formatWeekdayLabel, startOfWeek } from "@/lib/schedule";
import type { CompanyMember } from "@/lib/types";

const ALL_TECHS = "all";

export function ScheduleFilters({
  weekStart,
  today,
  members,
}: {
  weekStart: string;
  today: string;
  members: CompanyMember[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tech = searchParams.get("tech") ?? ALL_TECHS;

  function goToWeek(nextWeekStart: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("week", nextWeekStart);
    router.push(`${pathname}?${params.toString()}`);
  }

  function setTech(value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === ALL_TECHS) {
      params.delete("tech");
    } else {
      params.set("tech", value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const techItems: Record<string, string> = {
    [ALL_TECHS]: "Everyone",
    ...Object.fromEntries(members.map((m) => [m.id, m.full_name?.trim() || m.email])),
  };

  const weekEnd = addDaysToDateOnly(weekStart, 6);
  const currentWeekStart = startOfWeek(today);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <Button size="icon-sm" variant="outline" onClick={() => goToWeek(addDaysToDateOnly(weekStart, -7))}>
          <ChevronLeft className="size-4" />
        </Button>
        <p className="min-w-40 text-center text-sm font-medium">
          {formatWeekdayLabel(weekStart)} – {formatWeekdayLabel(weekEnd)}
        </p>
        <Button size="icon-sm" variant="outline" onClick={() => goToWeek(addDaysToDateOnly(weekStart, 7))}>
          <ChevronRight className="size-4" />
        </Button>
        {weekStart !== currentWeekStart && (
          <Button size="sm" variant="ghost" onClick={() => goToWeek(currentWeekStart)}>
            This week
          </Button>
        )}
      </div>

      <Select value={tech} onValueChange={setTech} items={techItems}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(techItems).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
