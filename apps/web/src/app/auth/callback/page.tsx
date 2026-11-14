"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const supabase = getSupabase();
      if (!supabase) {
        router.replace("/");
        return;
      }

      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          // Supabase may already have exchanged the code via detectSessionInUrl.
          await supabase.auth.getSession();
        }
      }

      if (!cancelled) {
        setMessage("Signed in. Returning to AeroQuest…");
        router.replace("/");
        router.refresh();
      }
    }

    void finish().catch(() => {
      if (!cancelled) {
        setMessage("Sign-in could not be completed. Returning to AeroQuest…");
        router.replace("/");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#071018] px-6 text-center text-[#EAF6FF]">
      <div className="rounded-2xl border border-[#1E3A4F] bg-[#0D1B27] px-8 py-10">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#00E5FF]">
          AVI AUTH
        </p>
        <p className="mt-4 text-sm text-[#93A9BA]">{message}</p>
      </div>
    </main>
  );
}
