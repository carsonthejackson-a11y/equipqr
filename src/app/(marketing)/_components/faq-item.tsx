import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FaqEntry = { question: string; answer: string };

export function FaqItem({ question, answer }: FaqEntry) {
  return (
    <details className="group rounded-xl border border-border bg-card px-4 open:pb-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-medium text-foreground">
        {question}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <p className="text-sm leading-relaxed text-muted-foreground">{answer}</p>
    </details>
  );
}

export function FaqList({ items, className }: { items: FaqEntry[]; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => (
        <FaqItem key={item.question} {...item} />
      ))}
    </div>
  );
}
