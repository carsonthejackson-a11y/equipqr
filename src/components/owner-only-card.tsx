import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function OwnerOnlyCard({
  message = "Only company owners can manage this. Ask an owner if you need something changed here.",
}: {
  message?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <ShieldAlert className="size-5" />
        </div>
        <p className="max-w-sm">{message}</p>
      </CardContent>
    </Card>
  );
}
