"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ApiKey } from "@/lib/types";
import { createApiKey, revokeApiKey } from "./actions";

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function ApiKeysSection({
  keys,
  entitled,
  maxKeys,
}: {
  keys: ApiKey[];
  entitled: boolean;
  maxKeys: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [writeScope, setWriteScope] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const atLimit = activeKeys.length >= maxKeys;

  function resetCreateDialog() {
    setName("");
    setWriteScope(false);
    setCreateError(null);
    setPlaintext(null);
  }

  async function handleCreate(formData: FormData) {
    setCreating(true);
    setCreateError(null);
    const result = await createApiKey(formData);
    setCreating(false);

    if (result?.error) {
      setCreateError(result.error);
      return;
    }

    setPlaintext(result?.plaintext ?? null);
    toast.success("API key created");
    router.refresh();
  }

  async function copyPlaintext() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Couldn't copy — copy it from the field instead");
    }
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setPendingId(target.id);
    startTransition(async () => {
      const result = await revokeApiKey(target.id);
      setPendingId(null);
      setRevokeTarget(null);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Revoked "${target.name}"`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>API keys</CardTitle>
          <CardDescription>
            {activeKeys.length} / {maxKeys} active keys. Used to authenticate against the v1 API.
          </CardDescription>
        </div>
        <Dialog
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next);
            if (!next) resetCreateDialog();
          }}
        >
          <DialogTrigger
            render={
              <Button size="sm" disabled={!entitled || atLimit}>
                <Plus />
                Create key
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                The plaintext key is shown once, right after creation. Store it somewhere safe — EquipQR
                never stores or displays it again.
              </DialogDescription>
            </DialogHeader>

            {plaintext ? (
              <div className="space-y-4">
                <PlaintextWarning>
                  <span className="font-medium">Copy this key now.</span> You won&apos;t be able to see it
                  again.
                </PlaintextWarning>
                <div className="flex items-center gap-2">
                  <Input readOnly value={plaintext} className="font-mono text-xs" />
                  <Button type="button" variant="outline" size="icon" onClick={copyPlaintext}>
                    <Copy />
                    <span className="sr-only">Copy key</span>
                  </Button>
                </div>
                <DialogFooter>
                  <Button type="button" onClick={() => setCreateOpen(false)}>
                    Done
                  </Button>
                </DialogFooter>
              </div>
            ) : (
              <form action={handleCreate} className="space-y-4">
                {createError && <p className="text-sm text-destructive">{createError}</p>}
                <div className="space-y-2">
                  <Label htmlFor="keyName">Name</Label>
                  <Input
                    id="keyName"
                    name="name"
                    placeholder="Zapier integration"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox checked disabled />
                    Read — list and view equipment, customers, and requests
                  </label>
                  <label className="flex items-center gap-2.5 text-sm">
                    <Checkbox
                      name="scopeWrite"
                      checked={writeScope}
                      onCheckedChange={(checked) => setWriteScope(checked === true)}
                    />
                    Write — also update service request status, priority, and assignee
                  </label>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating}>
                    {creating ? "Creating…" : "Create key"}
                  </Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {keys.length === 0 ? (
          <EmptyState icon={KeyRound} message="No API keys yet. Create one to start using the v1 API." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const revoked = !!key.revoked_at;
                const rowBusy = isPending && pendingId === key.id;
                return (
                  <TableRow key={key.id} className={revoked ? "opacity-60" : undefined}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {key.key_prefix}…
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="secondary">
                            {scope}
                          </Badge>
                        ))}
                        {revoked && <Badge variant="outline">Revoked</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(key.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(key.last_used_at)}</TableCell>
                    <TableCell>
                      {!revoked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={rowBusy}
                          title="Revoke key"
                          onClick={() => setRevokeTarget(key)}
                        >
                          <Trash2 className="text-destructive" />
                          <span className="sr-only">Revoke {key.name}</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key?</DialogTitle>
            <DialogDescription>
              &quot;{revokeTarget?.name}&quot; will stop working immediately. Any integration using it will
              start getting 401 responses. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleRevoke} disabled={isPending}>
              {isPending ? "Revoking…" : "Revoke"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PlaintextWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
      {children}
    </div>
  );
}
