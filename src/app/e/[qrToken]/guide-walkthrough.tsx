"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EquipmentGuide } from "@/lib/types";

type PathEntry = { question: string; answer: string };
type WalkthroughOption = EquipmentGuide["steps"][number]["options"][number];
type ChatMessage = { role: "assistant" | "user"; text: string };

function pathStorageKey(qrToken: string) {
  return `troubleshooting-path-${qrToken}`;
}

function Bubble({ role, text }: ChatMessage) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm",
          role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
        )}
      >
        {text}
      </div>
    </div>
  );
}

export function GuideWalkthrough({
  guide,
  qrToken,
  aiChatEnabled,
}: {
  guide: EquipmentGuide;
  qrToken: string;
  aiChatEnabled: boolean;
}) {
  const router = useRouter();
  const [currentStepId, setCurrentStepId] = useState(guide.root_step_id);
  const [path, setPath] = useState<PathEntry[]>([]);
  const [resolved, setResolved] = useState(false);
  const [clarifyMessages, setClarifyMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const requestHref = `/e/${qrToken}/request`;

  useEffect(() => {
    if (path.length === 0) {
      sessionStorage.removeItem(pathStorageKey(qrToken));
    } else {
      sessionStorage.setItem(pathStorageKey(qrToken), JSON.stringify(path));
    }
  }, [path, qrToken]);

  const step = guide.steps.find((s) => s.id === currentStepId);

  function advance(option: WalkthroughOption, answerText: string) {
    if (!step) return;
    setPath((current) => [...current, { question: step.title, answer: answerText }]);
    setClarifyMessages([]);

    if (option.outcome === "resolved") {
      setResolved(true);
      return;
    }

    if (option.outcome === "continue" && option.next_step_id) {
      setCurrentStepId(option.next_step_id);
      return;
    }

    // "escalate", or a "continue" pointing at a deleted step — either way,
    // the safest move is to hand the customer to a real person.
    router.push(requestHref);
  }

  async function handleSend() {
    const text = inputValue.trim();
    if (!step || !text || sending) return;

    setInputValue("");
    setSending(true);

    try {
      const response = await fetch("/api/guide-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrToken, stepId: step.id, message: text }),
      });
      const data = await response.json().catch(() => ({}));
      const matched = step.options.find((o) => o.id === data.matchedOptionId);

      if (matched) {
        advance(matched, text);
      } else {
        setClarifyMessages((current) => [
          ...current,
          { role: "user", text },
          { role: "assistant", text: "Didn't quite catch that — could you pick one of the options below?" },
        ]);
      }
    } catch {
      setClarifyMessages((current) => [
        ...current,
        { role: "user", text },
        { role: "assistant", text: "Something went wrong — could you pick one of the options below?" },
      ]);
    } finally {
      setSending(false);
    }
  }

  const historyMessages: ChatMessage[] = path.flatMap((entry) => [
    { role: "assistant", text: entry.question },
    { role: "user", text: entry.answer },
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{guide.company.name}</p>
        <h1 className="text-xl font-semibold">{guide.equipment.name}</h1>
        <p className="text-sm text-muted-foreground">{guide.equipment_type.name}</p>
      </div>

      {!step && !resolved ? (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>No troubleshooting steps yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              This company hasn&apos;t added a guide for this equipment yet. You can submit a
              service request directly.
            </p>
            <Button render={<Link href={requestHref} />} nativeButton={false} className="w-full">
              Submit a service request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="flex flex-1 flex-col">
          <CardContent className="flex flex-1 flex-col gap-4 py-4">
            <div className="flex flex-1 flex-col gap-3">
              {historyMessages.map((msg, i) => (
                <Bubble key={i} role={msg.role} text={msg.text} />
              ))}

              {resolved ? (
                <Bubble
                  role="assistant"
                  text="Glad that fixed it! If the problem comes back, you can start over anytime by scanning the QR code again."
                />
              ) : (
                step && (
                  <Bubble
                    role="assistant"
                    text={step.instructions ? `${step.title}\n${step.instructions}` : step.title}
                  />
                )
              )}

              {clarifyMessages.map((msg, i) => (
                <Bubble key={`clarify-${i}`} role={msg.role} text={msg.text} />
              ))}
            </div>

            {resolved ? (
              <Link href={requestHref} className="text-center text-sm underline">
                Actually, still need help? Submit a service request
              </Link>
            ) : (
              step && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {step.options.map((option) => (
                      <Button
                        key={option.id}
                        variant="outline"
                        size="sm"
                        className="h-auto rounded-full py-1.5 whitespace-normal"
                        onClick={() => advance(option, option.label)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  {aiChatEnabled && (
                    <div className="flex gap-2">
                      <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Or tell me what's happening..."
                        disabled={sending}
                      />
                      <Button
                        type="button"
                        size="icon"
                        onClick={handleSend}
                        disabled={sending || !inputValue.trim()}
                      >
                        <Send className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
