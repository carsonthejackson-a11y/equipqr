"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QrCard({
  qrDataUrl,
  publicUrl,
  equipmentId,
  fileName,
}: {
  qrDataUrl: string;
  publicUrl: string;
  equipmentId: string;
  fileName: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>QR code</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Image
          src={qrDataUrl}
          alt="Equipment QR code"
          width={240}
          height={240}
          unoptimized
          className="rounded-md border"
        />
        <p className="break-all text-center text-xs text-muted-foreground">{publicUrl}</p>
        <div className="flex w-full flex-col gap-2">
          <Button
            render={<a href={qrDataUrl} download={`${fileName}.png`} />}
            nativeButton={false}
            variant="outline"
            className="w-full"
          >
            Download PNG
          </Button>
          <Button
            render={<Link href={`/dashboard/equipment/${equipmentId}/label`} target="_blank" />}
            nativeButton={false}
            variant="outline"
            className="w-full"
          >
            Print label
          </Button>
          <Button
            render={<Link href={publicUrl} target="_blank" />}
            nativeButton={false}
            variant="ghost"
            className="w-full"
          >
            View public page
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
