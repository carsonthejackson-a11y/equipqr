"use client";

import { useId, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string };

const CREATE_VALUE = "__creatable_combobox_create__";

/**
 * A searchable, single-select combobox that also offers "+ Create '<query>'"
 * when nothing typed matches an existing option. Equipment types and
 * customers are both open-ended lists a field tech shouldn't have to leave
 * the current dialog to grow (docs/QOL-CONTINUITY-BRIEF.md item 1/3).
 *
 * Participates in the surrounding native `<form>`'s FormData submission via
 * Base UI Combobox's `name` prop, the same way the plain `<Select name=.../>`
 * elsewhere in this codebase does — no hidden `<input>` to manage by hand.
 */
export function CreatableCombobox({
  name,
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Select…",
  createLabel,
  emptyLabel = "No matches",
  required,
  disabled,
  id,
  className,
}: {
  name: string;
  options: ComboboxOption[];
  /** Selected option's id, or "" for none. */
  value: string;
  /** Fired on every selection, including right after a successful inline create. */
  onChange: (value: string, option: ComboboxOption | null) => void;
  /** Creates a new option from the typed text. Return `{ error }` to show it inline instead of selecting anything. */
  onCreate: (label: string) => Promise<{ id: string } | { error: string }>;
  placeholder?: string;
  createLabel?: (query: string) => string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const [inputValue, setInputValue] = useState(
    () => options.find((o) => o.value === value)?.label ?? ""
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const query = inputValue.trim().toLowerCase();
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;
  const trimmed = inputValue.trim();
  const exactMatch = query.length > 0 && options.some((o) => o.label.toLowerCase() === query);
  const showCreate = trimmed.length > 0 && !exactMatch;

  const createItem: ComboboxOption | null = showCreate ? { value: CREATE_VALUE, label: trimmed } : null;
  const filteredItems: ComboboxOption[] = createItem ? [...filtered, createItem] : filtered;

  async function handleSelectedValueChange(item: ComboboxOption | null) {
    if (!item) {
      onChange("", null);
      return;
    }

    if (item.value === CREATE_VALUE) {
      setCreating(true);
      setCreateError(null);
      const result = await onCreate(item.label);
      setCreating(false);

      if ("error" in result) {
        setCreateError(result.error);
        return;
      }

      const created: ComboboxOption = { value: result.id, label: item.label };
      onChange(created.value, created);
      setInputValue(created.label);
      return;
    }

    setCreateError(null);
    onChange(item.value, item);
    setInputValue(item.label);
  }

  return (
    <div className={className}>
      <Combobox.Root
        items={options}
        filteredItems={filteredItems}
        inputValue={inputValue}
        onInputValueChange={setInputValue}
        value={selected}
        onValueChange={handleSelectedValueChange}
        itemToStringLabel={(o: ComboboxOption) => o.label}
        itemToStringValue={(o: ComboboxOption) => o.value}
        name={name}
        required={required}
        disabled={disabled || creating}
        autoHighlight
      >
        <Combobox.InputGroup
          className={cn(
            "relative flex h-8 w-full items-center rounded-lg border border-input bg-transparent pr-2 pl-2.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
            (disabled || creating) && "pointer-events-none opacity-50"
          )}
        >
          <Combobox.Input
            id={inputId}
            placeholder={placeholder}
            className="h-full w-full min-w-0 border-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {creating ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Combobox.Trigger
              aria-label={placeholder}
              className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
            >
              <ChevronsUpDown className="size-4" />
            </Combobox.Trigger>
          )}
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner className="isolate z-50 outline-none" sideOffset={4}>
            <Combobox.Popup className="max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <Combobox.Empty className="px-2.5 py-2 text-sm text-muted-foreground">
                {emptyLabel}
              </Combobox.Empty>
              <Combobox.List className="p-1">
                {(item: ComboboxOption) =>
                  item.value === CREATE_VALUE ? (
                    <Combobox.Item
                      key={item.value}
                      value={item}
                      className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-2 pl-2 text-sm font-medium text-primary outline-hidden select-none data-highlighted:bg-accent"
                    >
                      <Plus className="size-3.5 shrink-0" />
                      <span className="truncate">
                        {(createLabel ?? ((q: string) => `Create "${q}"`))(item.label)}
                      </span>
                    </Combobox.Item>
                  ) : (
                    <Combobox.Item
                      key={item.value}
                      value={item}
                      className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                    >
                      <Combobox.ItemIndicator className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                        <Check className="size-4" />
                      </Combobox.ItemIndicator>
                      <span className="truncate">{item.label}</span>
                    </Combobox.Item>
                  )
                }
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {createError && <p className="mt-1 text-sm text-destructive">{createError}</p>}
    </div>
  );
}
