"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { smsHref } from "@/lib/contact-links";

/**
 * Q-34: "status link Copy and Text" — a technician standing in front of the
 * customer can hand over the public tracking link without reading it aloud
 * or retyping it: Copy puts it on the clipboard, Text (only shown when
 * there's a phone to send it to) opens the device's messaging app with the
 * link pre-filled, same pattern as site-pin-card.tsx's clipboard copy.
 */
export function StatusLinkActions({ url, contactPhone }: { url: string; contactPhone?: string | null }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Status link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — copy it from the link above instead");
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={handleCopy}>
        <Copy className="size-3.5" />
        {copied ? "Copied" : "Copy link"}
      </Button>
      {contactPhone && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          render={<a href={smsHref(contactPhone, `Track your request here: ${url}`)} />}
        >
          <MessageSquare className="size-3.5" />
          Text link
        </Button>
      )}
    </div>
  );
}
