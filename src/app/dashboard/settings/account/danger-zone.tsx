"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { deleteCompany } from "./actions";

export function DangerZone({ companyName }: { companyName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canConfirm = typedName.trim() === companyName;

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteCompany(typedName);
      if (result?.error) {
        setError(result.error);
        return;
      }

      // The server action already cleared the server-side session; clear the
      // browser client's local copy too before navigating away.
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Company deleted");
      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>Irreversible actions — proceed with caution.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Delete company and all data</p>
            <p className="text-sm text-muted-foreground">
              Permanently deletes {companyName}, every team member, customer, equipment record,
              QR code, and service request. This can&apos;t be undone.
            </p>
          </div>
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (!next) {
                setTypedName("");
                setError(null);
              }
            }}
          >
            <DialogTrigger render={<Button variant="destructive">Delete company</Button>} />
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {companyName}?</DialogTitle>
                <DialogDescription>
                  This permanently deletes your company and everything in it — team members,
                  customers, equipment, QR codes, and service requests. There is no undo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Label htmlFor="confirm-company-name">
                  Type <span className="font-semibold">{companyName}</span> to confirm
                </Label>
                <Input
                  id="confirm-company-name"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <DialogFooter>
                <Button variant="destructive" disabled={!canConfirm || pending} onClick={handleDelete}>
                  {pending ? "Deleting…" : "Delete forever"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
