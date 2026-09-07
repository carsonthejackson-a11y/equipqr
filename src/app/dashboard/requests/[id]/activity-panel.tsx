"use client";

import { useRef } from "react";
import { MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ActivityFeed } from "./activity-feed";
import { AddNoteForm, type AddNoteFormHandle } from "./add-note-form";
import type { RequestActivity } from "@/lib/types";

/**
 * Wraps the activity timeline + note form together so "Reply to customer"
 * can drive the form (pre-check "visible to customer", focus the textarea)
 * without lifting that state up into the server-rendered page. Everything
 * that used to sit directly in requests/[id]/page.tsx's Activity card body
 * now lives here.
 */
export function ActivityPanel({
  items,
  staffNameById,
  requestId,
}: {
  items: RequestActivity[];
  staffNameById: Map<string, string>;
  requestId: string;
}) {
  const formRef = useRef<AddNoteFormHandle>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => formRef.current?.replyToCustomer()}
        >
          <MessageSquareReply className="size-3.5" />
          Reply to customer
        </Button>
      </div>
      <ActivityFeed items={items} staffNameById={staffNameById} />
      <Separator />
      <AddNoteForm ref={formRef} requestId={requestId} />
    </div>
  );
}
