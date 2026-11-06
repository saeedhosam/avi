"use client";

import { useEffect } from "react";
import { registerPushServiceWorker } from "@/lib/push";

/**
 * Registers /sw.js once per session so Web Push and the home-screen web app
 * manifest work. No-op in browsers without service-worker support.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerPushServiceWorker();
  }, []);
  return null;
}
