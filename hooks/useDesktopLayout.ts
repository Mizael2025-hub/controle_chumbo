"use client";

import { useEffect, useState } from "react";
import { DESKTOP_MIN_WIDTH_PX } from "@/lib/layoutConstants";

export function useDesktopLayout(): boolean {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`);
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return desktop;
}
