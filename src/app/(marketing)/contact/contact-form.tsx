"use client";

import { useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SUPPORT_EMAIL } from "@/lib/site";
import { CheckIcon, Icon } from "../_components/icon";
import { submitContactForm } from "./actions";
import {
  initialContactState,
  validateContactForm,
  type ContactFormValues,
  type ContactState,
} from "./validation";

// docs/design/marketing-2026-09/Contact.dc.html → README "Screens → 7. Contact"
// (form, validation, pending, success, reset). The server action stays
// authoritative; the client pre-check only short-circuits the round trip with
// the same strings (BRIEF §3.5).

const emptyForm: ContactFormValues = { name: "", email: "", company: "", message: "" };

const fieldClass = "flex flex-col gap-[6px]";
// Design labels: 13.5px, weight 400, neutral-300.
const labelClass = "text-[13.5px] leading-[1.4] font-normal text-eq-neutral-300";
// Nocturne `.input` on top of the shadcn Input/Textarea: 44px, 15px, 8px radius,
// surface fill, accent caret, accent border on focus.
const inputClass =
  "h-11 rounded-md border-eq-neutral-800 bg-eq-surface px-[10px] text-[15px] caret-primary hover:border-eq-neutral-600 focus-visible:border-primary md:text-[15px] dark:bg-eq-surface";
const textareaClass =
  "min-h-[150px] resize-y rounded-md border-eq-neutral-800 bg-eq-surface px-[10px] py-[9px] text-[15px] leading-[1.55] caret-primary hover:border-eq-neutral-600 focus-visible:border-primary md:text-[15px] dark:bg-eq-surface";
const inlineLinkClass =
  "text-primary underline underline-offset-[3px] transition-colors duration-150 hover:text-eq-accent-300";

/**
 * Owns the reset: `useActionState` cannot be cleared, so `Send another`
 * remounts the inner form with a fresh key.
 */
export function ContactForm() {
  const [formKey, setFormKey] = useState(0);
  return <ContactFormFields key={formKey} onReset={() => setFormKey((k) => k + 1)} />;
}

function ContactFormFields({ onReset }: { onReset: () => void }) {
  const [state, formAction, isPending] = useActionState(submitContactForm, initialContactState);
  const [values, setValues] = useState<ContactFormValues>(emptyForm);
  const [clientError, setClientError] = useState<string | null>(null);
  // The server result the user has already typed past (README: "clear the
  // error on any change"). Each action call returns a new object, so identity
  // tells a dismissed result from a fresh one.
  const [dismissed, setDismissed] = useState<ContactState | null>(null);

  const serverError = state.status === "error" && state !== dismissed ? state.message : null;
  const error = clientError ?? serverError ?? null;

  const set =
    (key: keyof ContactFormValues) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.target.value;
      setValues((prev) => ({ ...prev, [key]: next }));
      setClientError(null);
      if (state.status === "error") setDismissed(state);
    };

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const message = validateContactForm(values);
    if (message) {
      // Stops the form action from running; the server check is unchanged.
      event.preventDefault();
      setClientError(message);
      return;
    }
    setClientError(null);
  }

  if (state.status === "success") {
    return (
      <div role="status" className="flex min-h-[260px] flex-col justify-center gap-4">
        <div className="grid size-11 place-items-center rounded-full bg-eq-accent-tint-16 text-primary">
          <CheckIcon size={22} />
        </div>
        <h2 className="text-[clamp(22px,2vw,26px)] leading-[1.2] font-medium tracking-[-0.015em]">
          {state.message}
        </h2>
        <p className="max-w-[50ch] text-[15px] leading-[1.6] text-eq-neutral-400">
          Usually within one business day. If it&apos;s urgent, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={inlineLinkClass}>
            {SUPPORT_EMAIL}
          </a>{" "}
          and mention you already sent a message.
        </p>
        <div>
          <Button
            type="button"
            variant="neutral"
            className="h-[42px] px-4 text-[14px]"
            onClick={onReset}
          >
            Send another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-4 max-[560px]:grid-cols-1">
        <div className={fieldClass}>
          <Label htmlFor="contact-name" className={labelClass}>
            Name
          </Label>
          <Input
            id="contact-name"
            name="name"
            type="text"
            autoComplete="name"
            required
            value={values.name}
            onChange={set("name")}
            className={inputClass}
          />
        </div>
        <div className={fieldClass}>
          <Label htmlFor="contact-email" className={labelClass}>
            Email
          </Label>
          <Input
            id="contact-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={values.email}
            onChange={set("email")}
            className={inputClass}
          />
        </div>
      </div>
      <div className={fieldClass}>
        <Label htmlFor="contact-company" className={labelClass}>
          Company <span className="text-eq-neutral-500">(optional)</span>
        </Label>
        <Input
          id="contact-company"
          name="company"
          type="text"
          autoComplete="organization"
          value={values.company}
          onChange={set("company")}
          className={inputClass}
        />
      </div>
      <div className={fieldClass}>
        <Label htmlFor="contact-message" className={labelClass}>
          How can we help?
        </Label>
        <Textarea
          id="contact-message"
          name="message"
          rows={5}
          required
          value={values.message}
          onChange={set("message")}
          className={textareaClass}
        />
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-[10px] rounded-[10px] border border-eq-neutral-700 bg-eq-bg px-[14px] py-3 text-sm leading-[1.5] text-eq-neutral-200"
        >
          <Icon icon={TriangleAlert} size={16} className="mt-[2px] text-primary" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button
          type="submit"
          variant="brand"
          size="xl"
          disabled={isPending}
          className="h-[46px] px-[22px]"
        >
          {isPending ? "Sending…" : "Send message"}
        </Button>
        <span className="text-[13px] text-eq-neutral-500">
          Goes to {SUPPORT_EMAIL}. We reply from there.
        </span>
      </div>
    </form>
  );
}
