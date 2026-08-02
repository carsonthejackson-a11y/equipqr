"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { QrScanButton } from "@/components/qr-scan-button";
import { normalizeQrCode } from "@/lib/qr";
import { assignQrCode } from "../actions";

export function AssignCodeForm({
  equipmentId,
  companyId,
}: {
  equipmentId: string;
  companyId: string;
}) {
  const router = useRouter();
  const [codeSource, setCodeSource] = useState("instant");
  const [preprintedCode, setPreprintedCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    const result = await assignQrCode(equipmentId, companyId, formData);
    setSubmitting(false);

    if (result?.error) {
      toast.error(result.error);
      return;
    }

    toast.success("QR code linked");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>QR code</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          This equipment doesn&apos;t have a QR code yet.
        </p>
        <form action={handleSubmit} className="space-y-4">
          <RadioGroup name="codeSource" value={codeSource} onValueChange={setCodeSource}>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="instant" id="assign-instant" className="mt-0.5" />
              <Label htmlFor="assign-instant" className="flex-1 font-normal">
                <span className="block font-medium text-foreground">Generate a new code now</span>
              </Label>
            </div>
            <div className="flex items-start gap-2">
              <RadioGroupItem value="preprinted" id="assign-preprinted" className="mt-0.5" />
              <Label htmlFor="assign-preprinted" className="flex-1 font-normal">
                <span className="block font-medium text-foreground">Use a pre-printed code</span>
              </Label>
            </div>
          </RadioGroup>
          {codeSource === "preprinted" && (
            <div className="flex gap-2">
              <Input
                name="preprintedCode"
                placeholder="e.g. AB3D-9F2K"
                className="font-mono uppercase"
                value={preprintedCode}
                onChange={(e) => setPreprintedCode(e.target.value)}
              />
              <QrScanButton onScan={(code) => setPreprintedCode(normalizeQrCode(code))} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Linking..." : "Link code"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
