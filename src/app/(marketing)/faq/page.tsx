import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaqList } from "../_components/faq-item";
import { productFaqs, billingFaqs } from "../_components/faq-data";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers to common questions about how EquipQR works and how billing is handled.",
};

export default function FaqPage() {
  return (
    <>
      <section className="border-b border-border/80 bg-muted/30">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">
            Frequently asked questions
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Can’t find what you’re looking for?{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              Email us
            </a>{" "}
            and we’ll get back to you.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="font-heading text-xl font-semibold">Product</h2>
        <FaqList items={productFaqs} className="mt-6" />

        <h2 className="mt-14 font-heading text-xl font-semibold">Billing</h2>
        <FaqList items={billingFaqs} className="mt-6" />
      </section>

      <section className="border-t border-border/80">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            Still have questions?
          </h2>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button render={<Link href="/contact" />} nativeButton={false} size="lg">
              Contact us
            </Button>
            <Button render={<Link href="/signup" />} nativeButton={false} variant="outline" size="lg">
              Start free trial
              <ArrowRight className="size-4" data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
