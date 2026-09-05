import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import type { ApiKey } from "@/lib/types";
import { SettingsSubnav } from "../settings-subnav";
import { ApiKeysSection } from "./api-keys-section";
import { MAX_ACTIVE_API_KEYS } from "./actions";
import { EXPORT_ENTITIES } from "./export-entities";

export default async function ApiSettingsPage() {
  const ctx = await requireOwner();

  const entitlements = ctx ? await getEntitlements() : null;
  const entitled = hasFeature(entitlements, "exportApi");

  let keys: ApiKey[] = [];
  if (ctx) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .eq("company_id", ctx.company.id)
      .order("created_at", { ascending: false })
      .returns<ApiKey[]>();
    keys = data ?? [];
  }

  return (
    <div className="space-y-6">
      <SettingsSubnav />
      <div>
        <h1 className="text-2xl font-semibold">API</h1>
        <p className="text-muted-foreground">Data export and programmatic access to your account.</p>
      </div>

      {!ctx ? (
        <OwnerOnlyCard message="Only company owners can manage API keys." />
      ) : (
        <div className="space-y-6">
          {!entitled && (
            <Alert>
              <AlertTitle>API access is a Business feature</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>
                  Upgrade to Business for CSV data export and the v1 API. The docs below show
                  what&apos;s available once you do.
                </span>
                <Button size="sm" render={<a href="/dashboard/settings/billing">View plans</a>} />
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Data export</CardTitle>
              <CardDescription>Download your data as CSV, ready for a spreadsheet.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {EXPORT_ENTITIES.map((entity) => (
                  <Button
                    key={entity.value}
                    variant="outline"
                    size="sm"
                    disabled={!entitled}
                    render={<a href={`/api/export/${entity.value}`}>{entity.label}</a>}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <ApiKeysSection keys={keys} entitled={entitled} maxKeys={MAX_ACTIVE_API_KEYS} />

          <Card>
            <CardHeader>
              <CardTitle>API documentation</CardTitle>
              <CardDescription>Every v1 endpoint, authentication, pagination, and rate limits.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                See{" "}
                <a
                  href="https://github.com/carsonthejackson-a11y/equipqr/blob/main/docs/API.md"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  docs/API.md
                </a>{" "}
                in the repository for the full reference and curl examples.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
