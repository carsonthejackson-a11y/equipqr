export function LegalHeader({
  title,
  description,
  lastUpdated,
}: {
  title: string;
  description: string;
  lastUpdated: string;
}) {
  return (
    <section className="border-b border-border/80 bg-muted/30">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
        <h1 className="font-heading text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
        <p className="mt-4 text-sm text-muted-foreground">Last updated {lastUpdated}</p>
      </div>
    </section>
  );
}

export function LegalContent({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="[&_h2:first-of-type]:mt-0 [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:leading-relaxed [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:leading-relaxed [&_p+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5"
    >
      {children}
    </div>
  );
}

export function LegalNotice() {
  return (
    <div className="mt-12 rounded-xl border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
      <strong className="text-foreground">Note:</strong> this page is a general template
      provided for convenience and does not constitute legal advice. Have a qualified attorney
      review it before relying on it for your business.
    </div>
  );
}
