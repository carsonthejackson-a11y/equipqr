"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

// A finger-on-glass signature pad for the close-out and inspection flows.
// Pointer events only (covers touch, pen, mouse), high-DPI aware, no deps.
// The parent calls `toBlob()` through the ref-style `onReady` callback when it
// wants the PNG — the pad itself never uploads anything.

export type SignaturePadHandle = {
  /** PNG of the drawing, or null if nothing has been drawn. */
  toBlob: () => Promise<Blob | null>;
  clear: () => void;
  isEmpty: () => boolean;
};

export function SignaturePad({
  onReady,
  onChange,
  className,
  height = 160,
}: {
  onReady?: (handle: SignaturePadHandle) => void;
  onChange?: (isEmpty: boolean) => void;
  className?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    // Keep existing strokes across a resize by copying them over.
    const previous = document.createElement("canvas");
    previous.width = canvas.width;
    previous.height = canvas.height;
    previous.getContext("2d")?.drawImage(canvas, 0, 0);

    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
    if (previous.width > 0 && previous.height > 0 && hasInk.current) {
      ctx.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, rect.width, rect.height);
    }
  }, []);

  useEffect(() => {
    setupCanvas();
    window.addEventListener("resize", setupCanvas);
    return () => window.removeEventListener("resize", setupCanvas);
  }, [setupCanvas]);

  const markChanged = useCallback(
    (isEmpty: boolean) => {
      hasInk.current = !isEmpty;
      setEmpty(isEmpty);
      onChange?.(isEmpty);
    },
    [onChange]
  );

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    markChanged(true);
  }, [markChanged]);

  useEffect(() => {
    onReady?.({
      toBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || !hasInk.current) return resolve(null);
          // Flatten onto white so the PNG reads on any background.
          const out = document.createElement("canvas");
          out.width = canvas.width;
          out.height = canvas.height;
          const ctx = out.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, out.width, out.height);
          ctx.drawImage(canvas, 0, 0);
          out.toBlob((blob) => resolve(blob), "image/png");
        }),
      clear,
      isEmpty: () => !hasInk.current,
    });
    // onReady is intentionally only re-run when the handle's deps change.
  }, [onReady, clear]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap should still leave a dot.
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    markChanged(false);
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = pointFrom(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onPointerUp(event: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature pad"
          className="w-full touch-none rounded-xl border bg-white"
          style={{ height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-muted-foreground">
            Sign here
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={empty}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <Eraser className="size-4" aria-hidden />
        Clear
      </button>
    </div>
  );
}
