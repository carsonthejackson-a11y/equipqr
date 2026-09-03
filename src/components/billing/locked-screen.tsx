import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LockedScreen({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="flex flex-1 items-center justify-center py-16">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Your trial has ended</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {isOwner
              ? "Choose a plan to keep managing equipment, guides, and service requests."
              : "Your company's trial has ended. Ask your account owner to choose a plan to keep going."}
          </p>
          {isOwner && (
            <Button render={<Link href="/dashboard/settings/billing" />} nativeButton={false}>
              Choose a plan
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
