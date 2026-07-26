import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardOverviewPage() {
  const supabase = await createClient();

  const [{ count: equipmentCount }, { count: typeCount }, { count: openRequestCount }] =
    await Promise.all([
      supabase.from("equipment").select("*", { count: "exact", head: true }),
      supabase.from("equipment_types").select("*", { count: "exact", head: true }),
      supabase
        .from("service_requests")
        .select("*", { count: "exact", head: true })
        .neq("status", "resolved"),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="text-muted-foreground">A quick snapshot of your account.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/dashboard/requests">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open service requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{openRequestCount ?? 0}</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/equipment">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Equipment units
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{equipmentCount ?? 0}</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/dashboard/equipment-types">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Equipment types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{typeCount ?? 0}</p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
