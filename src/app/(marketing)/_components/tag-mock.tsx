import { LogoMark } from "@/components/logo";
import { cn } from "@/lib/utils";

// Sticker mocks from Features.dc.html ("Your name on the machine" and the
// label sizes). Two looks: `default` is the accent tile with the mark;
// `branded` is the light neutral-100 tile with the customer's logo slot,
// which ships as the dashed empty slot until a real logo exists (BRIEF D7).
// The QR is a fixed 29×29 pattern drawn as SVG, never a real code.

const QR_FINDERS =
  "M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM22 0h7v7h-7zM23 1v5h5V1zM24 2h3v3h-3zM0 22h7v7H0zM1 23v5h5v-5zM2 24h3v3H2z";
const QR_MODULES =
  "M9 0h1v1H9zM11 0h2v1h-2zM15 0h1v2h-1zM18 0h1v1h-1zM9 2h1v1H9zM12 2h1v2h-1zM14 3h2v1h-2zM17 2h2v1h-2zM10 4h1v1h-1zM13 5h1v1h-1zM16 4h1v2h-1zM19 4h1v1h-1zM9 6h1v1H9zM11 6h1v1h-1zM14 6h1v1h-1zM18 6h1v1h-1zM0 9h1v1H0zM2 9h1v1H2zM4 9h2v1H4zM6 10h1v1H6zM1 11h1v1H1zM3 11h1v1H3zM5 12h1v1H5zM0 13h2v1H0zM3 13h1v1H3zM6 13h1v1H6zM1 15h1v1H1zM4 15h2v1H4zM0 17h1v1H0zM2 17h1v1H2zM5 17h2v1H5zM1 19h1v1H1zM3 19h1v1H3zM6 19h1v1H6zM9 9h1v1H9zM11 9h1v1h-1zM13 9h2v1h-2zM16 9h1v1h-1zM18 9h2v1h-2zM10 10h1v1h-1zM12 10h1v1h-1zM15 10h1v1h-1zM19 10h1v1h-1zM9 11h1v1H9zM11 11h1v1h-1zM14 11h1v1h-1zM17 11h1v1h-1zM10 12h1v1h-1zM13 12h1v1h-1zM15 12h2v1h-2zM19 12h1v1h-1zM9 13h1v1H9zM11 13h1v1h-1zM14 13h1v1h-1zM18 13h1v1h-1zM10 14h1v1h-1zM12 14h2v1h-2zM16 14h1v1h-1zM19 14h1v1h-1zM9 15h1v1H9zM11 15h1v1h-1zM15 15h1v1h-1zM17 15h1v1h-1zM10 16h1v1h-1zM13 16h1v1h-1zM16 16h1v1h-1zM18 16h2v1h-2zM9 17h1v1H9zM12 17h1v1h-1zM14 17h1v1h-1zM17 17h1v1h-1zM10 18h1v1h-1zM13 18h1v1h-1zM15 18h1v1h-1zM19 18h1v1h-1zM9 19h1v1H9zM11 19h1v1h-1zM14 19h1v1h-1zM16 19h2v1h-2zM22 9h1v1h-1zM24 9h1v1h-1zM26 9h2v1h-2zM23 10h1v1h-1zM28 10h1v1h-1zM22 11h1v1h-1zM25 11h1v1h-1zM27 11h1v1h-1zM24 12h1v1h-1zM26 12h1v1h-1zM22 13h2v1h-2zM25 13h1v1h-1zM28 13h1v1h-1zM23 14h1v1h-1zM27 14h1v1h-1zM22 15h1v1h-1zM24 15h1v1h-1zM26 15h1v1h-1zM28 15h1v1h-1zM23 16h1v1h-1zM25 16h1v1h-1zM22 17h1v1h-1zM24 17h2v1h-2zM27 17h1v1h-1zM23 18h1v1h-1zM26 18h1v1h-1zM28 18h1v1h-1zM22 19h1v1h-1zM25 19h1v1h-1zM27 19h1v1h-1zM9 22h1v1H9zM11 22h2v1h-2zM14 22h1v1h-1zM16 22h1v1h-1zM18 22h1v1h-1zM10 23h1v1h-1zM13 23h1v1h-1zM15 23h1v1h-1zM19 23h1v1h-1zM9 24h1v1H9zM12 24h1v1h-1zM14 24h1v1h-1zM17 24h1v1h-1zM10 25h1v1h-1zM13 25h1v1h-1zM16 25h1v1h-1zM18 25h1v1h-1zM9 26h1v1H9zM11 26h1v1h-1zM14 26h2v1h-2zM19 26h1v1h-1zM10 27h1v1h-1zM12 27h1v1h-1zM15 27h1v1h-1zM17 27h2v1h-2zM9 28h1v1H9zM11 28h1v1h-1zM13 28h1v1h-1zM16 28h1v1h-1zM18 28h1v1h-1zM20 20h5v5h-5zM21 21v3h3v-3zM22 22h1v1h-1zM26 21h1v1h-1zM28 21h1v1h-1zM27 22h1v1h-1zM26 23h1v1h-1zM28 23h1v1h-1zM27 24h1v1h-1zM20 26h1v1h-1zM22 26h1v1h-1zM24 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM21 27h1v1h-1zM23 27h1v1h-1zM25 27h1v1h-1zM27 27h1v1h-1zM20 28h1v1h-1zM22 28h1v1h-1zM24 28h1v1h-1zM26 28h1v1h-1zM28 28h1v1h-1z";

/** The fake QR pattern, in `currentColor`. */
export function FakeQr({ size = 78, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 29 29"
      width={size}
      height={size}
      className={cn("block shrink-0 [shape-rendering:crispEdges]", className)}
      aria-hidden="true"
      focusable="false"
    >
      <g fill="currentColor">
        <path d={QR_FINDERS} fillRule="evenodd" />
        <path d={QR_MODULES} />
      </g>
    </svg>
  );
}

/** Dashed "Your logo" placeholder (README "Fidelity": empty until a real asset exists). */
function LogoSlot({ height, label = "Your logo" }: { height: number; label?: string }) {
  return (
    <div
      className="grid w-full place-items-center rounded-[4px] border border-dashed border-current/30 text-[9px] opacity-70"
      style={{ height }}
    >
      {label}
    </div>
  );
}

export type TagMockVariant = "default" | "branded";

export type TagMockProps = {
  variant?: TagMockVariant;
  /** Service company on the sticker. */
  company: string;
  /** Shown on the branded tile's "Service by …" line. */
  phone?: string;
  /** Unit line under the headline on the default tile. */
  unit?: string;
  className?: string;
};

const tile = "flex shrink-0 flex-col justify-between rounded-[12px] p-[14px] shadow-eq-md";
const tileDefault = "bg-eq-accent text-[#0a2a1d]";
const tileBranded = "bg-eq-neutral-100 text-eq-bg";

/** 176px square sticker. */
export function TagMock({ variant = "default", company, phone = "(214) 555-0142", unit = "Dish machine · Unit 3", className }: TagMockProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(tile, "size-[176px]", variant === "branded" ? tileBranded : tileDefault, className)}
    >
      {variant === "branded" ? (
        <LogoSlot height={22} />
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium">{company}</span>
          <LogoMark className="size-4" />
        </div>
      )}
      <FakeQr size={78} className="self-center" />
      <div>
        <div className="text-[10.5px] leading-[1.25] font-medium">
          {variant === "branded" ? "Problem? Scan me first." : "Scan for help with this machine"}
        </div>
        <div className="mt-[2px] text-[9px] opacity-80">
          {variant === "branded" ? `Service by ${company} · ${phone}` : unit}
        </div>
      </div>
    </div>
  );
}

export type TagStripMockProps = Omit<TagMockProps, "unit"> & {
  /** Unit line on the default strip. */
  unit?: string;
};

/** 176×88 strip label. */
export function TagStripMock({ variant = "default", company, phone = "(214) 555-0142", unit = "Ice machine · Bar", className }: TagStripMockProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-[88px] w-[176px] shrink-0 items-center gap-[10px] rounded-[10px] p-[10px] shadow-eq-md",
        variant === "branded" ? tileBranded : tileDefault,
        className
      )}
    >
      {variant === "branded" ? (
        <>
          <div className="flex h-full min-w-0 flex-1 flex-col justify-between">
            <LogoSlot height={26} />
            <div className="text-[9px] leading-[1.2] font-medium">Problem? Scan me first.</div>
            <div className="text-[8px] opacity-75">{phone}</div>
          </div>
          <FakeQr size={66} />
        </>
      ) : (
        <>
          <FakeQr size={66} />
          <div className="flex h-full min-w-0 flex-col justify-between">
            <div className="flex items-center gap-1">
              <LogoMark className="size-[11px]" />
              <span className="text-[8.5px] leading-[1.15] font-medium">{company}</span>
            </div>
            <div className="text-[9.5px] leading-[1.2] font-medium">Scan for help with this machine</div>
            <div className="text-[8px] opacity-85">{unit}</div>
          </div>
        </>
      )}
    </div>
  );
}
