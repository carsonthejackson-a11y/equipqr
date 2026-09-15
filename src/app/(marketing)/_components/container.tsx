import { cn } from "@/lib/utils";

// README "Spacing and layout": max-width 1200px, centered, fluid side padding.
export const containerClass = "mx-auto w-full max-w-[1200px] px-[clamp(20px,5vw,72px)]";

export type ContainerProps = Omit<React.ComponentProps<"div">, "ref"> & {
  as?: "div" | "nav" | "header" | "footer" | "article";
};

export function Container({ as = "div", className, ...props }: ContainerProps) {
  const Tag = as as React.ElementType;
  return <Tag className={cn(containerClass, className)} {...props} />;
}
