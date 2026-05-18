// v1.1.1 — `prefers-reduced-motion` hook.
//
// Returns true when the OS-level motion-reduction preference is on.
// The Map-view animations (breathing / hover halo / click ripple /
// particle flow / settle / throb) all consume this hook so users with
// vestibular sensitivities see a fully static graph.
//
// The hook subscribes to the matchMedia change events so a user
// flipping the preference at runtime (some OSes let you bind a hotkey
// to "Reduce motion") will immediately stop ongoing animations.

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setReduce(e.matches);
    // Safari < 14 lacks addEventListener on MediaQueryList — fall back
    // to the deprecated addListener so the hook still works there.
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else (mq as { addListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else (mq as { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(onChange);
    };
  }, []);

  return reduce;
}
