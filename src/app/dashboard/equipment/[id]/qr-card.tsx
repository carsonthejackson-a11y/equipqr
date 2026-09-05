"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatRelativeTime } from "@/lib/format";
import type { EquipmentScanStats } from "@/lib/types";
// Type-only import: erased at compile time, so this never pulls @/lib/qr's
// `qrcode` dependency into the client bundle.
import type { PreviousCodeState } from "@/lib/qr";
import { reassignQrCode, replaceQrCode, retireQrCode } from "./qr-actions";

/** A superseded code, already formatted for display by qr-section.tsx. */
export type PreviousCode = {
  id: string;
  shortCode: string;
  state: PreviousCodeState;
};

const PREVIOUS_CODE_LABELS: Record<PreviousCodeState, string> = {
  replaced: "Replaced — old sticker still works",
  retired: "Retired — sticker says “contact us”",
  moved: "Moved to another unit",
};

type OpenDialog = "replace" | "retire" | "move" | null;

export function QrCard({
  qrDataUrl,
  publicUrl,
  equipmentId,
  codeId,
  shortCode,
  previousCodes,
  moveTargets,
  stats,
}: {
  qrDataUrl: string;
  publicUrl: string;
  equipmentId: string;
  codeId: string;
  /** Already formatted as ABCD-2345. */
  shortCode: string;
  previousCodes: PreviousCode[];
  /** Units of this company that have no active code, so this one can move to them. */
  moveTargets: { id: string; name: string }[];
  stats: EquipmentScanStats | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [pending, startTransition] = useTransition();

  /** Runs one lifecycle action: toast on failure, close + refresh on success. */
  function run(
    action: () => Promise<{ error: string } | { success: true; shortCode?: string }>,
    onOk: (result: { shortCode?: string }) => void
  ) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setDialog(null);
      onOk(result);
      router.refresh();
    });
  }

  const downloadBase = `/dashboard/equipment/${equipmentId}/qr`;

  return (
    <div className="space-y-3 lg:w-80">
      <Card>
        <CardHeader>
          <CardTitle>QR code</CardTitle>
          <CardAction>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm">
                    <Settings2 />
                    Manage code
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDialog("replace")}>
                  Replace code
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setDialog("move")}
                  disabled={moveTargets.length === 0}
                >
                  Move to another unit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setDialog("retire")}>
                  Retire code
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col items-center gap-4">
          <Image
            src={qrDataUrl}
            alt={`QR code ${shortCode}`}
            width={240}
            height={240}
            unoptimized
            className="rounded-md border"
          />

          <div className="w-full space-y-1 text-center">
            <p className="font-mono text-xl font-semibold tracking-[0.12em]">{shortCode}</p>
            <p className="text-xs text-muted-foreground">
              Customers can type this code instead of scanning.
            </p>
            <p className="break-all pt-1 text-xs text-muted-foreground">{publicUrl}</p>
          </div>

          <ScanStats stats={stats} />

          <div className="flex w-full flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                render={<a href={`${downloadBase}/png`} />}
                nativeButton={false}
                variant="outline"
              >
                Download PNG
              </Button>
              <Button
                render={<a href={`${downloadBase}/svg`} />}
                nativeButton={false}
                variant="outline"
              >
                Download SVG
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                render={<Link href={`/dashboard/equipment/${equipmentId}/label`} target="_blank" />}
                nativeButton={false}
                variant="outline"
              >
                Print label
              </Button>
              <Button
                render={<Link href="/dashboard/equipment/labels" />}
                nativeButton={false}
                variant="outline"
              >
                Label sheet
              </Button>
            </div>
            <Button
              render={<Link href={publicUrl} target="_blank" />}
              nativeButton={false}
              variant="ghost"
              className="w-full"
            >
              View public page
            </Button>
          </div>

          {previousCodes.length > 0 && <PreviousCodes codes={previousCodes} />}
        </CardContent>
      </Card>

      {/* Replace ------------------------------------------------------- */}
      <Dialog open={dialog === "replace"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace this QR code?</DialogTitle>
            <DialogDescription>
              This unit gets a brand-new code and short code to print. The old sticker keeps
              working — {shortCode} still scans through to this unit, so you can swap the label
              whenever you&apos;re next on site rather than rushing out to it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(
                  () => replaceQrCode(codeId, equipmentId),
                  (result) => toast.success(`New code ${result.shortCode ?? ""} ready to print`)
                )
              }
            >
              {pending ? "Replacing..." : "Replace code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire -------------------------------------------------------- */}
      <Dialog open={dialog === "retire"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retire {shortCode}?</DialogTitle>
            <DialogDescription>
              The code stops pointing at this unit — from now on the sticker will show
              &ldquo;contact the company&rdquo; instead of the troubleshooting guide, and no one
              can raise a service request from it. Use this when the sticker is gone or the
              machine has left the field. This unit will have no active code until you assign a
              new one.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => retireQrCode(codeId, equipmentId),
                  () => toast.success(`${shortCode} retired`)
                )
              }
            >
              {pending ? "Retiring..." : "Retire code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move ---------------------------------------------------------- */}
      <Dialog open={dialog === "move"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {shortCode} to another unit</DialogTitle>
            <DialogDescription>
              For when a sticker went on the wrong machine. From now on this code resolves to the
              unit you pick, and this unit is left without an active code. Only units that
              don&apos;t already have a code are listed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="moveTargetId">Move to</Label>
            <Select
              value={moveTargetId}
              onValueChange={(value) => setMoveTargetId(value ?? "")}
              items={Object.fromEntries(moveTargets.map((t) => [t.id, t.name]))}
            >
              <SelectTrigger id="moveTargetId" className="w-full">
                <SelectValue placeholder="Choose a unit" />
              </SelectTrigger>
              <SelectContent>
                {moveTargets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)} disabled={pending}>
              Cancel
            </Button>
            <Button
              disabled={pending || !moveTargetId}
              onClick={() =>
                run(
                  () => reassignQrCode(codeId, equipmentId, moveTargetId),
                  () => toast.success(`${shortCode} moved`)
                )
              }
            >
              {pending ? "Moving..." : "Move code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ScanStats({ stats }: { stats: EquipmentScanStats | null }) {
  const total = stats?.total ?? 0;

  return (
    <div className="w-full rounded-lg border bg-muted/30 p-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="All time" value={total} />
        <Stat label="30 days" value={stats?.last_30_days ?? 0} />
        <Stat label="7 days" value={stats?.last_7_days ?? 0} />
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {stats?.last_scanned_at
          ? `Last scanned ${formatRelativeTime(stats.last_scanned_at)}`
          : "Not scanned yet"}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold leading-tight tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * Native <details> rather than a Collapsible primitive — there isn't one in
 * src/components/ui, and this is a rarely-opened footnote.
 */
function PreviousCodes({ codes }: { codes: PreviousCode[] }) {
  return (
    <details className="group w-full rounded-lg border px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm text-muted-foreground marker:content-none hover:text-foreground">
        <span>
          {codes.length} previous code{codes.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-2 space-y-2 border-t pt-2">
        {codes.map((code) => (
          <li key={code.id} className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-sm">{code.shortCode}</span>
            <span className="text-right text-xs text-muted-foreground">
              {PREVIOUS_CODE_LABELS[code.state]}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
