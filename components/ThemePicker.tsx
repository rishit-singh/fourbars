"use client";

import { useEffect, useState } from "react";

type Theme = "studio" | "midnight" | "graphite";
const storageKey = "fourbars:theme";

function resolveTheme(value: string | null): Theme {
  if (value === "midnight" || value === "darker") return "midnight";
  if (value === "graphite") return "graphite";
  return "studio";
}

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("studio");

  useEffect(() => {
    function apply(value: string | null) {
      const next = resolveTheme(value);
      setTheme(next);
      document.documentElement.dataset.theme = next;
      if (value === "dark" || value === "darker") {
        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // The migrated theme still applies when storage is unavailable.
        }
      }
    }
    try {
      apply(localStorage.getItem(storageKey));
    } catch {
      apply(null);
    }
    function sync(event: StorageEvent) {
      if (event.key === storageKey || event.key === null) apply(event.newValue);
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function change(next: Theme) {
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Theme selection still works when browser storage is unavailable.
    }
  }

  return (
    <label className="theme-picker">
      <span>Appearance</span>
      <select value={theme} onChange={(event) => change(resolveTheme(event.target.value))}>
        <option value="studio">Studio · Amber</option>
        <option value="midnight">Midnight · Blue</option>
        <option value="graphite">Graphite · Violet</option>
      </select>
    </label>
  );
}
