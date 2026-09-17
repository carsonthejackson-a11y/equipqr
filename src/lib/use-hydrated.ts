import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False during the server render and hydration, true once the component is
 * running in the browser. Use it to gate UI that depends on browser-only
 * state (localStorage drafts, for example), so the first client render
 * matches the server HTML and React never reports a hydration mismatch.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
