"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REQUEST_PRIORITY_LABELS, REQUEST_PRIORITY_ORDER } from "@/components/status-badge";
import { vocabFor } from "@/lib/vocab";
import type { CompanyKind, RequestPriority } from "@/lib/types";
import {
  createStaffRequest,
  getStaffRequestContactDefaults,
  searchEquipmentForRequest,
  type EquipmentSearchResult,
} from "./actions";

/** A unit already known to the caller (opened from equipment or customer detail) — skips the search round trip. */
export type PresetUnit = { id: string; name: string };

export function NewRequestSheet({
  kind,
  trigger,
  initialEquipment,
  presetUnits,
  onCreated,
}: {
  kind: CompanyKind;
  /** Custom trigger element (e.g. a smaller inline button on a detail page) — a single element, same as DialogTrigger's own `render`. Defaults to a standard primary button. */
  trigger?: React.ReactElement;
  /** Opened from equipment detail: the unit is fixed, no picker shown. */
  initialEquipment?: PresetUnit;
  /** Opened from customer detail: restrict the picker to this customer's own units instead of a company-wide search. */
  presetUnits?: PresetUnit[];
  /** Called with the new request's id after a successful create, in addition to the default "go to the request" navigation. */
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const vocab = vocabFor(kind);
  const label = `New ${vocab.requestSingular.charAt(0).toLowerCase()}${vocab.requestSingular.slice(1)}`;

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [equipmentId, setEquipmentId] = useState(initialEquipment?.id ?? "");
  const [equipmentName, setEquipmentName] = useState(initialEquipment?.name ?? "");
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<EquipmentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<RequestPriority>("normal");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [wantsVisit, setWantsVisit] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [sendStatusEmail, setSendStatusEmail] = useState(false);

  const usingPresetUnits = !initialEquipment && !!presetUnits;

  function resetForm() {
    setError(null);
    setEquipmentId(initialEquipment?.id ?? "");
    setEquipmentName(initialEquipment?.name ?? "");
    setSearchTerm("");
    setResults([]);
    setDescription("");
    setPriority("normal");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setWantsVisit(false);
    setScheduleDate("");
    setScheduleTime("");
    setSendStatusEmail(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetForm();
  }

  // Company-wide search (only used when neither initialEquipment nor
  // presetUnits was given — i.e. opened from the inbox with no context).
  // "Searching" flips on in the input's own onChange (a real event handler,
  // not this effect) and back off once a debounced result lands — this
  // effect only ever calls setState from inside the timeout callback, never
  // synchronously in its own body (react-hooks/set-state-in-effect). An
  // empty search term schedules nothing; the dropdown below is gated on
  // `searchTerm.trim()` itself, so a stale `results`/`searching` value left
  // over from a previous term is never actually shown once the box clears.
  useEffect(() => {
    if (initialEquipment || usingPresetUnits) return;
    const trimmed = searchTerm.trim();
    if (!trimmed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const matches = await searchEquipmentForRequest(trimmed);
      setResults(matches);
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  async function selectEquipment(id: string, name: string) {
    setEquipmentId(id);
    setEquipmentName(name);
    setShowResults(false);
    setSearchTerm("");
    setResults([]);
    const defaults = await getStaffRequestContactDefaults(id);
    setContactName(defaults.contactName);
    setContactEmail(defaults.contactEmail);
    setContactPhone(defaults.contactPhone);
  }

  function clearEquipment() {
    setEquipmentId("");
    setEquipmentName("");
  }

  const filteredPresetUnits = useMemo(() => presetUnits ?? [], [presetUnits]);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    setError(null);
    formData.set("equipmentId", equipmentId);
    formData.set("sendStatusEmail", sendStatusEmail ? "on" : "off");
    if (!wantsVisit) {
      formData.set("scheduleDate", "");
      formData.set("scheduleTime", "");
    }

    const result = await createStaffRequest(formData);
    setSubmitting(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }

    toast.success(
      result.statusEmailSent
        ? `${vocab.requestSingular} logged — status link emailed`
        : `${vocab.requestSingular} logged`
    );
    handleOpenChange(false);
    onCreated?.(result.id);
    router.push(`/dashboard/requests/${result.id}`);
  }

  const priorityItems = Object.fromEntries(REQUEST_PRIORITY_ORDER.map((p) => [p, REQUEST_PRIORITY_LABELS[p]]));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger ?? <Button>{label}</Button>} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Log a job that came in by phone, email, or someone stopping by the shop.
          </DialogDescription>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="equipment-search">{kind === "equipment_owner" ? "Unit" : "Equipment"}</Label>
            {initialEquipment ? (
              <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium">{initialEquipment.name}</p>
            ) : usingPresetUnits ? (
              filteredPresetUnits.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This {vocab.counterpartySingular.toLowerCase()} has no equipment yet — add a unit first.
                </p>
              ) : (
                <Select
                  value={equipmentId}
                  onValueChange={(value) => {
                    if (!value) return;
                    const unit = filteredPresetUnits.find((u) => u.id === value);
                    if (unit) void selectEquipment(unit.id, unit.name);
                  }}
                  items={Object.fromEntries(filteredPresetUnits.map((u) => [u.id, u.name]))}
                >
                  <SelectTrigger id="equipment-search" className="w-full">
                    <SelectValue placeholder="Pick a unit…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredPresetUnits.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id}>
                        {unit.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            ) : equipmentId ? (
              <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{equipmentName}</span>
                <button
                  type="button"
                  onClick={clearEquipment}
                  aria-label="Clear selected unit"
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="equipment-search"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowResults(true);
                    setSearching(!!e.target.value.trim());
                  }}
                  onFocus={() => setShowResults(true)}
                  placeholder="Search by name, serial or sticker code…"
                  className="pl-8"
                  autoComplete="off"
                />
                {showResults && !!searchTerm.trim() && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                    {searching ? (
                      <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                    ) : results.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">No equipment matches &ldquo;{searchTerm}&rdquo;.</p>
                    ) : (
                      results.map((unit) => (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() => selectEquipment(unit.id, unit.name)}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-medium">{unit.name}</span>
                          {(unit.customerName || unit.location) && (
                            <span className="block text-xs text-muted-foreground">
                              {[unit.customerName, unit.location].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">What&apos;s the problem?</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did they tell you?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={(v) => v && setPriority(v as RequestPriority)} items={priorityItems}>
              <SelectTrigger id="priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_PRIORITY_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {REQUEST_PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="priority" value={priority} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact name</Label>
              <Input
                id="contactName"
                name="contactName"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact phone</Label>
              <Input
                id="contactPhone"
                name="contactPhone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactEmail">Contact email</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="wantsVisit" checked={wantsVisit} onCheckedChange={(c) => setWantsVisit(c === true)} />
              <Label htmlFor="wantsVisit" className="font-normal">
                Schedule a visit now
              </Label>
            </div>
            {wantsVisit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheduleDate">Date</Label>
                  <Input
                    id="scheduleDate"
                    name="scheduleDate"
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduleTime">Time</Label>
                  <Input
                    id="scheduleTime"
                    name="scheduleTime"
                    type="time"
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="sendStatusEmail"
              checked={sendStatusEmail}
              onCheckedChange={(c) => setSendStatusEmail(c === true)}
              disabled={!contactEmail.trim()}
            />
            <Label htmlFor="sendStatusEmail" className="font-normal">
              Email {contactName.trim() || "the customer"} a status link
              {!contactEmail.trim() && <span className="text-muted-foreground"> (needs an email)</span>}
            </Label>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={submitting || !equipmentId || !description.trim()}>
              {submitting ? "Logging…" : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
