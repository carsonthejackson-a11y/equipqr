"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

// Q-51: on a phone — where staff scan mode and the close-out flow live —
// sonner's own bottom-right default sits right under a thumb resting on a
// sticky submit button, and is often covered by the on-screen keyboard.
// top-center is the one spot reliably clear there. Desktop dashboard use
// keeps sonner's own bottom-right default untouched.
const MOBILE_QUERY = "(max-width: 640px)"

function subscribeToMobileQuery(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function getIsMobileSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia(MOBILE_QUERY).matches
}

function getIsMobileServerSnapshot(): boolean {
  return false
}

// Same useSyncExternalStore shape as components/relative-time.tsx: the
// server/initial-hydration snapshot must be a fixed value (never read
// matchMedia during SSR, where there is no viewport), and React re-renders
// with the real client value right after hydration and on every change.
function useIsMobileViewport(): boolean {
  return React.useSyncExternalStore(subscribeToMobileQuery, getIsMobileSnapshot, getIsMobileServerSnapshot)
}

const Toaster = ({ position, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const isMobile = useIsMobileViewport()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={position ?? (isMobile ? "top-center" : undefined)}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
