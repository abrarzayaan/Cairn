"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

export default function ThemeToggle({
  initialTheme,
}: {
  initialTheme?: string;
}) {
  const [theme, setTheme] = useState<ThemeMode>(
    initialTheme === "dark" ? "dark" : "light"
  );

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") {
      setTheme(current);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="inline-flex h-7 items-center rounded border border-border-strong bg-bg px-2 font-mono text-xs text-text-muted hover:bg-bg-subtle hover:text-text"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

