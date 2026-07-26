"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquipmentGuideResponse } from "@/lib/types";

type Guide = NonNullable<EquipmentGuideResponse>;

export function GuideWalkthrough({ guide }: { guide: Guide }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [resolved, setResolved] = useState(false);

  const steps = guide.steps;
  const step = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;
  const requestHref = `/e/${guide.equipment.qr_token}/request`;

  function handleStillNotWorking() {
    if (isLastStep) {
      router.push(requestHref);
    } else {
      setStepIndex((i) => i + 1);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">{guide.company.name}</p>
        <h1 className="text-xl font-semibold">{guide.equipment.name}</h1>
        <p className="text-sm text-muted-foreground">{guide.equipment_type.name}</p>
      </div>

      {resolved ? (
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Glad that fixed it!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Thanks for troubleshooting. If the problem comes back, you can start over anytime by
              scanning the QR code again.
            </p>
            <Link href={requestHref} className="text-sm underline">
              Actually, still need help? Submit a service request
            </Link>
          </CardContent>
        </Card>
      ) : steps.length === 0 ? (
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
        <Card className="flex-1">
          <CardHeader>
            <p className="text-sm text-muted-foreground">
              Step {stepIndex + 1} of {steps.length}
            </p>
            <CardTitle>{step.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="whitespace-pre-wrap text-muted-foreground">{step.instructions}</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setResolved(true)}>That fixed it!</Button>
              <Button variant="outline" onClick={handleStillNotWorking}>
                Still not working
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
