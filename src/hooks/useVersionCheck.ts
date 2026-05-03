import { useState, useEffect, useCallback } from "react";

declare const __BUILD_VERSION__: string;

const CURRENT_VERSION = typeof __BUILD_VERSION__ !== "undefined" ? __BUILD_VERSION__ : "dev";
const CHECK_INTERVAL_MS = 60_000; // 60 seconds
const DISMISSED_KEY = "flowforge_dismissed_version";

export function useVersionCheck() {
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Don't poll in dev mode (Vite dev server won't have version.json)
    if (CURRENT_VERSION === "dev") return;

    let timer: ReturnType<typeof setInterval>;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string };
        if (data.version && data.version !== CURRENT_VERSION) {
          // Don't show banner if user already dismissed or relaunched this version
          const dismissedVersion = localStorage.getItem(DISMISSED_KEY);
          if (dismissedVersion === data.version) return;
          setNewVersion(data.version);
        }
      } catch {
        // Network error — silently ignore
      }
    }

    // First check after a short delay, then every 60s
    const initial = setTimeout(() => {
      void check();
      timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    }, 10_000);

    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);

  const relaunch = useCallback(async () => {
    // Remember this version so banner doesn't reappear after reload
    if (newVersion) localStorage.setItem(DISMISSED_KEY, newVersion);

    // Hard refresh: clear all browser caches + unregister service workers
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch { /* Cache API may not be available */ }
    try {
      const registrations = await navigator.serviceWorker?.getRegistrations();
      if (registrations) await Promise.all(registrations.map((r) => r.unregister()));
    } catch { /* SW API may not be available */ }

    window.location.reload();
  }, [newVersion]);

  const dismiss = useCallback(() => {
    if (newVersion) localStorage.setItem(DISMISSED_KEY, newVersion);
    setDismissed(true);
  }, [newVersion]);

  return {
    currentVersion: CURRENT_VERSION,
    updateAvailable: !!newVersion && !dismissed,
    newVersion,
    relaunch,
    dismiss,
  };
}
