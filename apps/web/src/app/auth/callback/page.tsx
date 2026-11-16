"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
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
        setMessage("Signed in. Returning to Avi…");
        router.replace("/");
        router.refresh();
      }
    }

    void finish().catch(() => {
      if (!cancelled) {
        setMessage("Sign-in could not be completed. Returning to Avi…");
        router.replace("/");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div
        className="w-full max-w-sm rounded-xl border border-line/70 bg-surface/80 p-8 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-accent/30 bg-accent-soft text-accent">
          <ShieldCheck className="size-5" />
        </div>
        <p className="label-caps mt-4 text-subtle">Avi account</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{message}</p>
        <Loader2 className="mx-auto mt-5 size-4 animate-spin text-accent" />
      </div>
    </div>
  );
}
