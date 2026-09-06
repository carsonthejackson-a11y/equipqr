import { requireOwner } from "@/lib/auth";
import { getEntitlements, hasFeature } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OwnerOnlyCard } from "@/components/owner-only-card";
import { SettingsSubnav } from "../settings-subnav";
import { ApiKeysSection, type PublicApiKey } from "./api-keys-section";
import { MAX_ACTIVE_API_KEYS } from "@/lib/api-auth";
import { EXPORT_ENTITIES } from "./export-entities";
import { WebhooksSection, type WebhookEventOption } from "./webhooks-section";
import { MAX_WEBHOOK_ENDPOINTS, SUBSCRIBABLE_WEBHOOK_EVENTS, WEBHOOK_EVENT_TYPES } from "@/lib/webhook-signing";
import type { WebhookDeliverySummary, WebhookEndpointPublic } from "@/lib/types";

/** How many recent webhook deliveries the page lists. Keeps the RSC payload small. */
const RECENT_DELIVERIES = 20;

const WEBHOOK_EVENT_OPTIONS: WebhookEventOption[] = SUBSCRIBABLE_WEBHOOK_EVENTS.map((type) => ({
  type,
  label: WEBHOOK_EVENT_TYPES[type],
}));

export default async function ApiSettingsPage() {
  const ctx = await requireOwner();

  const entitlements = ctx ? await getEntitlements() : null;
  const entitled = hasFeature(entitlements, "exportApi");

  // Explicit column list, NOT `*`: `api_keys.key_hash` is the sha256 of the
  // plaintext key and this row is serialised into a client component, so
  // selecting it would ship every key's hash to the browser. Nothing in the
  // UI needs it — the displayed identity is `key_prefix`.
  let keys: PublicApiKey[] = [];
  if (ctx) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("api_keys")
      .select("id, company_id, name, key_prefix, scopes, created_by, last_used_at, revoked_at, created_at")
      .eq("company_id", ctx.company.id)
      .order("created_at", { ascending: false })
      .returns<PublicApiKey[]>();
    keys = data ?? [];
  }

  // Same rule for webhook endpoints: `secret` is the HMAC signing key and is
  // shown exactly once (from the create / rotate actions). The list never
  // selects it. Deliveries skip `payload` — the UI only needs the outcome.
  let endpoints: WebhookEndpointPublic[] = [];
  let deliveries: WebhookDeliverySummary[] = [];
  if (ctx) {
    const supabase = await createClient();
    const [endpointResult, deliveryResult] = await Promise.all([
      supabase
        .from("webhook_endpoints")
        .select(
          "id, company_id, url, description, events, is_active, failure_count, disabled_at, last_delivery_at, last_delivery_status, created_by, created_at, updated_at"
        )
        .eq("company_id", ctx.company.id)
        .order("created_at", { ascending: false })
        .returns<WebhookEndpointPublic[]>(),
      supabase
        .from("webhook_deliveries")
        .select(
          "id, company_id, endpoint_id, event_type, status, attempts, next_attempt_at, last_attempt_at, response_status, last_error, delivered_at, created_at"
        )
        .eq("company_id", ctx.company.id)
        .order("created_at", { ascending: false })
        .limit(RECENT_DELIVERIES)
        .returns<WebhookDeliverySummary[]>(),
    ]);
    endpoints = endpointResult.data ?? [];
    deliveries = deliveryResult.data ?? [];
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
                  Upgrade to Business for CSV data export, the v1 API, and outbound webhooks. The docs
                  below show what&apos;s available once you do.
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

          <WebhooksSection
            endpoints={endpoints}
            deliveries={deliveries}
            entitled={entitled}
            maxEndpoints={MAX_WEBHOOK_ENDPOINTS}
            eventOptions={WEBHOOK_EVENT_OPTIONS}
          />

          <Card>
            <CardHeader>
              <CardTitle>API documentation</CardTitle>
              <CardDescription>
                Every v1 endpoint, authentication, pagination, rate limits, and the webhook event catalogue
                and signature scheme.
              </CardDescription>
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
