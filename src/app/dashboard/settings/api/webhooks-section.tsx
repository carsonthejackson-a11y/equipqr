"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Plus, Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RelativeTime } from "@/components/relative-time";
import type { WebhookDeliverySummary, WebhookEndpointPublic } from "@/lib/types";
import {
  createWebhookEndpoint,
  deleteWebhookEndpoint,
  retryWebhookDelivery,
  rotateWebhookSecret,
  sendWebhookTest,
  setWebhookEndpointActive,
  updateWebhookEndpoint,
} from "./webhook-actions";

/**
 * One subscribable event type with its label. Passed in from the server
 * component (page.tsx) rather than imported from src/lib/webhook-signing.ts,
 * which pulls in node:crypto for the HMAC — this file must stay
 * browser-bundle-safe.
 */
export type WebhookEventOption = { type: string; label: string };

/**
 * Fast, client-side pre-check for the URL field. The server action runs the
 * authoritative webhookUrlError() (internal hosts, length, …) and the
 * database CHECK enforces https again, so this only has to catch the
 * obvious typos before a round trip.
 */
function quickUrlError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Enter a full URL, e.g. https://example.com/hooks/equipqr";
  }
  if (url.protocol !== "https:") return "Webhook URLs must use https://";
  if (url.username || url.password) return "Don't put credentials in the URL — use the signing secret instead";
  return null;
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const s = `${u.host}${path}`;
    return s.length > 48 ? `${s.slice(0, 45)}…` : s;
  } catch {
    return url.length > 48 ? `${url.slice(0, 45)}…` : url;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DeliveryStatusBadge({ status }: { status: WebhookDeliverySummary["status"] }) {
  if (status === "delivered") return <Badge variant="secondary">Delivered</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export function WebhooksSection({
  endpoints,
  deliveries,
  entitled,
  maxEndpoints,
  eventOptions,
}: {
  endpoints: WebhookEndpointPublic[];
  deliveries: WebhookDeliverySummary[];
  entitled: boolean;
  maxEndpoints: number;
  eventOptions: WebhookEventOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<WebhookEndpointPublic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointPublic | null>(null);
  const [rotateTarget, setRotateTarget] = useState<WebhookEndpointPublic | null>(null);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);

  const activeCount = endpoints.filter((e) => e.is_active).length;
  const atLimit = activeCount >= maxEndpoints;
  const endpointById = new Map(endpoints.map((e) => [e.id, e]));
  const labelFor = new Map(eventOptions.map((o) => [o.type, o.label]));
  const eventLabel = (type: string) => labelFor.get(type) ?? (type === "webhook.test" ? "Test event" : type);

  function runRowAction(id: string, work: () => Promise<{ error?: string } | undefined | void>, onDone?: () => void) {
    setPendingId(id);
    startTransition(async () => {
      try {
        const result = await work();
        if (result && "error" in result && result.error) {
          toast.error(result.error);
          return;
        }
        onDone?.();
        router.refresh();
      } finally {
        setPendingId(null);
      }
    });
  }

  function handleSendTest(endpoint: WebhookEndpointPublic) {
    runRowAction(endpoint.id, async () => {
      const result = await sendWebhookTest(endpoint.id);
      if (!("success" in result)) return { error: result.error };
      if (result.queued) {
        toast.success("Test event queued — it'll go out with the next delivery run (within 5 minutes)");
      } else if (result.delivered) {
        toast.success(`Delivered (${result.status})`);
      } else {
        toast.error(`Failed: ${result.error ?? "no response"}`);
      }
      return undefined;
    });
  }

  function handleToggleActive(endpoint: WebhookEndpointPublic) {
    const next = !endpoint.is_active;
    runRowAction(
      endpoint.id,
      () => setWebhookEndpointActive(endpoint.id, next),
      () => toast.success(next ? "Endpoint enabled" : "Endpoint disabled")
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    runRowAction(
      target.id,
      () => deleteWebhookEndpoint(target.id),
      () => {
        setDeleteTarget(null);
        toast.success("Endpoint deleted");
      }
    );
  }

  function handleRotate() {
    if (!rotateTarget) return;
    const target = rotateTarget;
    runRowAction(target.id, async () => {
      const result = await rotateWebhookSecret(target.id);
      if ("error" in result) return result;
      setRotatedSecret(result.secret ?? null);
      toast.success("Signing secret rotated");
      return undefined;
    });
  }

  function handleRetry(delivery: WebhookDeliverySummary) {
    runRowAction(
      delivery.id,
      () => retryWebhookDelivery(delivery.id),
      () => toast.success("Delivery re-queued")
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              {activeCount} / {maxEndpoints} active endpoints. Signed POSTs to your systems when equipment
              or requests change.
            </CardDescription>
          </div>
          <Dialog
            open={createOpen}
            onOpenChange={(next) => {
              setCreateOpen(next);
              if (!next) setCreatedSecret(null);
            }}
          >
            <DialogTrigger
              render={
                <Button size="sm" disabled={!entitled || atLimit}>
                  <Plus />
                  Add endpoint
                </Button>
              }
            />
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add webhook endpoint</DialogTitle>
                <DialogDescription>
                  EquipQR will POST a JSON event to this URL and sign it with a secret shown once, right
                  after creation.
                </DialogDescription>
              </DialogHeader>
              {createdSecret ? (
                <SecretReveal secret={createdSecret} onDone={() => setCreateOpen(false)} />
              ) : (
                <EndpointForm
                  eventOptions={eventOptions}
                  submitLabel="Add endpoint"
                  onSubmit={async (formData) => {
                    const result = await createWebhookEndpoint(formData);
                    if ("error" in result) return result.error ?? "Something went wrong";
                    setCreatedSecret(result.secret ?? null);
                    toast.success("Endpoint added");
                    router.refresh();
                    return null;
                  }}
                />
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          {!entitled && (
            <p className="text-sm text-muted-foreground">
              Webhooks are part of the Business plan. Existing endpoints stay listed here; upgrade to add
              new ones.
            </p>
          )}
          {endpoints.length === 0 ? (
            <EmptyState
              icon={Webhook}
              message="No webhook endpoints yet. Add one to get notified the moment a request comes in or a unit changes."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Events</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last delivery</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {endpoints.map((endpoint) => {
                    const rowBusy = isPending && pendingId === endpoint.id;
                    return (
                      <TableRow key={endpoint.id} className={endpoint.is_active ? undefined : "opacity-70"}>
                        <TableCell>
                          <div className="font-mono text-xs" title={endpoint.url}>
                            {shortenUrl(endpoint.url)}
                          </div>
                          {endpoint.description && (
                            <div className="text-xs text-muted-foreground">{endpoint.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {endpoint.events.length === 0 ? (
                              <Badge variant="secondary">All events</Badge>
                            ) : (
                              endpoint.events.map((type) => (
                                <Badge key={type} variant="outline" title={type}>
                                  {eventLabel(type)}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {endpoint.is_active ? (
                            <Badge variant="secondary">Active</Badge>
                          ) : (
                            <Badge
                              variant="destructive"
                              title={
                                endpoint.disabled_at
                                  ? `Disabled after 20 consecutive failures (${formatDateTime(endpoint.disabled_at)})`
                                  : "Disabled"
                              }
                            >
                              Disabled
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {endpoint.last_delivery_at ? (
                            <span title={formatDateTime(endpoint.last_delivery_at)}>
                              <RelativeTime iso={endpoint.last_delivery_at} />
                              {endpoint.last_delivery_status !== null && (
                                <span className="ml-1 font-mono text-xs">· HTTP {endpoint.last_delivery_status}</span>
                              )}
                            </span>
                          ) : (
                            "Never"
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {endpoint.failure_count > 0 ? (
                            <span className="text-destructive">{endpoint.failure_count}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={
                                <Button type="button" variant="ghost" size="icon-sm" disabled={rowBusy}>
                                  <MoreHorizontal />
                                  <span className="sr-only">Actions for {shortenUrl(endpoint.url)}</span>
                                </Button>
                              }
                            />
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleSendTest(endpoint)} disabled={!endpoint.is_active}>
                                Send test
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleActive(endpoint)}>
                                {endpoint.is_active ? "Disable" : "Enable"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setEditTarget(endpoint)} disabled={!entitled}>
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRotateTarget(endpoint)} disabled={!entitled}>
                                Rotate secret
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(endpoint)}>
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {endpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent deliveries</CardTitle>
            <CardDescription>
              The last {deliveries.length} events sent to your endpoints. Failed deliveries retry
              automatically (1m, 5m, 30m, 2h); after five attempts they stop and can be retried here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing sent yet. Use &quot;Send test&quot; on an endpoint to try it out.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Attempts</TableHead>
                      <TableHead>Response</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deliveries.map((delivery) => {
                      const endpoint = endpointById.get(delivery.endpoint_id);
                      const rowBusy = isPending && pendingId === delivery.id;
                      return (
                        <TableRow key={delivery.id}>
                          <TableCell>
                            <div className="font-medium">{eventLabel(delivery.event_type)}</div>
                            <div className="font-mono text-xs text-muted-foreground">{delivery.event_type}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground" title={endpoint?.url}>
                            {endpoint ? shortenUrl(endpoint.url) : "—"}
                          </TableCell>
                          <TableCell>
                            <DeliveryStatusBadge status={delivery.status} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{delivery.attempts}</TableCell>
                          <TableCell className="max-w-xs">
                            {delivery.response_status !== null && (
                              <span className="font-mono text-xs">HTTP {delivery.response_status}</span>
                            )}
                            {delivery.last_error && (
                              <div className="truncate text-xs text-muted-foreground" title={delivery.last_error}>
                                {delivery.last_error.length > 80
                                  ? `${delivery.last_error.slice(0, 80)}…`
                                  : delivery.last_error}
                              </div>
                            )}
                            {delivery.response_status === null && !delivery.last_error && (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            <span title={formatDateTime(delivery.delivered_at ?? delivery.created_at)}>
                              <RelativeTime iso={delivery.delivered_at ?? delivery.created_at} />
                            </span>
                          </TableCell>
                          <TableCell>
                            {delivery.status === "failed" && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={rowBusy || !endpoint?.is_active}
                                title={endpoint?.is_active ? "Queue this delivery again" : "Enable the endpoint first"}
                                onClick={() => handleRetry(delivery)}
                              >
                                {rowBusy ? "Retrying…" : "Retry"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Edit */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit endpoint</DialogTitle>
            <DialogDescription>
              Changing the URL keeps the same signing secret. Use &quot;Rotate secret&quot; to issue a new one.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <EndpointForm
              key={editTarget.id}
              initial={editTarget}
              eventOptions={eventOptions}
              submitLabel="Save changes"
              onSubmit={async (formData) => {
                const result = await updateWebhookEndpoint(editTarget.id, formData);
                if ("error" in result) return result.error ?? "Something went wrong";
                setEditTarget(null);
                toast.success("Endpoint updated");
                router.refresh();
                return null;
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Rotate secret */}
      <Dialog
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRotateTarget(null);
            setRotatedSecret(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate signing secret?</DialogTitle>
            <DialogDescription>
              The current secret for {rotateTarget ? shortenUrl(rotateTarget.url) : "this endpoint"} stops
              verifying immediately. Update your receiver with the new one before any more events fire.
            </DialogDescription>
          </DialogHeader>
          {rotatedSecret ? (
            <SecretReveal
              secret={rotatedSecret}
              onDone={() => {
                setRotateTarget(null);
                setRotatedSecret(null);
              }}
            />
          ) : (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRotateTarget(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleRotate} disabled={isPending}>
                {isPending && pendingId === rotateTarget?.id ? "Rotating…" : "Rotate secret"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete endpoint?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? shortenUrl(deleteTarget.url) : "This endpoint"} will stop receiving events and
              its delivery history is removed. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
              {isPending && pendingId === deleteTarget?.id ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Shared create/edit form. `events` are posted as repeated hidden inputs; "All events" posts `allEvents=on`. */
function EndpointForm({
  initial,
  eventOptions,
  submitLabel,
  onSubmit,
}: {
  initial?: Pick<WebhookEndpointPublic, "url" | "description" | "events">;
  eventOptions: WebhookEventOption[];
  submitLabel: string;
  /** Returns an error message to show inline, or null on success. */
  onSubmit: (formData: FormData) => Promise<string | null>;
}) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [allEvents, setAllEvents] = useState(!initial || initial.events.length === 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial?.events ?? []));
  const [urlError, setUrlError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleEvent(type: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(type);
      else next.delete(type);
      return next;
    });
  }

  async function handleSubmit(formData: FormData) {
    const quick = quickUrlError(url);
    if (quick) {
      setUrlError(quick);
      return;
    }
    if (!allEvents && selected.size === 0) {
      setError("Pick at least one event, or choose “All events”");
      return;
    }
    setSubmitting(true);
    setError(null);
    const message = await onSubmit(formData);
    setSubmitting(false);
    if (message) setError(message);
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="webhookUrl">URL</Label>
        <Input
          id="webhookUrl"
          name="url"
          type="url"
          inputMode="url"
          placeholder="https://example.com/hooks/equipqr"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (urlError) setUrlError(null);
          }}
          onBlur={() => setUrlError(url ? quickUrlError(url) : null)}
          aria-invalid={!!urlError}
          required
        />
        {urlError && <p className="text-xs text-destructive">{urlError}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="webhookDescription">Description (optional)</Label>
        <Input
          id="webhookDescription"
          name="description"
          placeholder="Zapier — new request alerts"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
      </div>
      <div className="space-y-2">
        <Label>Events</Label>
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <Checkbox name="allEvents" checked={allEvents} onCheckedChange={(checked) => setAllEvents(checked === true)} />
          All events
        </label>
        <div className={`grid gap-1.5 sm:grid-cols-2 ${allEvents ? "opacity-50" : ""}`}>
          {eventOptions.map((option) => (
            <label key={option.type} className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={allEvents || selected.has(option.type)}
                disabled={allEvents}
                onCheckedChange={(checked) => toggleEvent(option.type, checked === true)}
              />
              <span>
                {option.label}
                <span className="ml-1 font-mono text-xs text-muted-foreground">{option.type}</span>
              </span>
            </label>
          ))}
        </div>
        {!allEvents && [...selected].map((type) => <input key={type} type="hidden" name="events" value={type} />)}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** The one-time secret reveal, same treatment as a freshly created API key. */
function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  async function copySecret() {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — copy it from the field instead");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
        <span className="font-medium">Copy this signing secret now</span> — it won&apos;t be shown again. Your
        receiver uses it to verify the <code className="font-mono text-xs">X-EquipQR-Signature</code> header.
      </div>
      <div className="flex items-center gap-2">
        <Input readOnly value={secret} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={copySecret}>
          <Copy />
          <span className="sr-only">Copy secret</span>
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
