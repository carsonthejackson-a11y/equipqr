"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Printed QR stickers encode the full scan URL (".../e/AB3D-9F2K"), not the
// bare code, so this pulls the token back out of whatever jsQR decodes.
function extractCode(decodedText: string) {
  try {
    const url = new URL(decodedText);
    const segments = url.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (segments.at(-2) === "e" && last) return last;
  } catch {
    // Not a URL — fall through and treat the raw text as the code.
  }
  return decodedText;
}

export function QrScanButton({ onScan }: { onScan: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const canvas = document.createElement("canvas");
    const canvasCtx = canvas.getContext("2d", { willReadFrequently: true });

    function tick() {
      const video = videoRef.current;
      if (!video || !canvasCtx || video.readyState !== video.HAVE_ENOUGH_DATA) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvasCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvasCtx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);

      if (result?.data) {
        onScan(extractCode(result.data));
        setOpen(false);
        return;
      }

      frameRef.current = requestAnimationFrame(tick);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        frameRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't access the camera. Check your browser's camera permission.");
      });

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open, onScan]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button type="button" variant="outline">
            <ScanLine className="size-4" />
            Scan code
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan QR code</DialogTitle>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : (
          <div className="overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="aspect-square w-full object-cover" />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Point your camera at one of your pre-printed QR stickers.
        </p>
      </DialogContent>
    </Dialog>
  );
}
