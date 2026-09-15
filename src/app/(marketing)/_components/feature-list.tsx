import { cn } from "@/lib/utils";
import { CheckIcon } from "./icon";

// README "Feature list rows": 10px gap, 16px accent check with 3px top offset.
// The text size sits on the list so `className="text-[14.5px]"` restyles every
// row (plan cards use 14.5px, the "Who it's for" cards 15px).

export type FeatureListProps = Omit<React.ComponentProps<"ul">, "children"> & {
  items: readonly string[];
};

export function FeatureList({ items, className, ...props }: FeatureListProps) {
  return (
    <ul
      className={cn("flex flex-col gap-[10px] text-[15px] leading-[1.5] text-eq-neutral-300", className)}
      {...props}
    >
      {items.map((item) => (
        <li key={item} className="flex gap-[10px]">
          <CheckIcon size={16} className="mt-[3px] text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
