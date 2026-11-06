/* ============================================================================
   useIsMobile
   ----------------------------------------------------------------------------
   Responsive breakpoint detector. Returns a boolean indicating whether the
   viewport is currently below the MOBILE_BREAKPOINT. Uses matchMedia for
   low-latency updates; initializes state on mount.
============================================================================= */
import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT); // initial sample
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}
