"use client";

import { useEffect, useState } from "react";

/**
 * Thin accent reading progress bar pinned below the sticky 48px navbar.
 */
export default function ReadingProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      if (scrollHeight <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100)));
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 right-0 top-12 z-30 h-[2px] bg-transparent"
    >
      <div
        className="h-full bg-accent transition-[width] duration-75 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
