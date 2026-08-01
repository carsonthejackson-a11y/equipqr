"use client";

import { useRouter } from "next/navigation";
import type { Company } from "@/lib/types";

export function CompanyPicker({
  companies,
  selectedId,
}: {
  companies: Company[];
  selectedId?: string;
}) {
  const router = useRouter();

  return (
    <select
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
      defaultValue={selectedId ?? ""}
      onChange={(e) => {
        router.push(e.target.value ? `/admin/qr-codes?company=${e.target.value}` : "/admin/qr-codes");
      }}
    >
      <option value="">Select a company…</option>
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
