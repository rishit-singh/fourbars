"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "darker";
const storageKey = "fourbars:theme";

export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    function apply(value: string | null) {
      const next = value === "darker" ? "darker" : "dark";
      setTheme(next);
      document.documentElement.dataset.theme = next;
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
      <select value={theme} onChange={(event) => change(event.target.value as Theme)}>
        <option value="dark">Dark</option>
        <option value="darker">Darker</option>
      </select>
    </label>
  );
}
