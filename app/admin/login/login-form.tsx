"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(sent ? "/api/admin/verify-code" : "/api/admin/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sent ? { email: email.trim(), code: code.trim() } : { email: email.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not sign in");
        return;
      }
      if (sent) {
        router.push("/admin/grateful-future");
        router.refresh();
      } else {
        setSent(true);
      }
    } catch {
      setError("Could not connect. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="email"
        required
        autoComplete="email"
        placeholder="you@domain.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={sent}
        className="w-full rounded-2xl border border-card-border bg-card px-4 py-3 text-[15px] text-fg placeholder:text-muted/70 focus:border-fg/40 focus:outline-none disabled:opacity-70"
      />
      {sent ? (
        <>
          <p className="text-[13px] text-muted">Enter the code sent to your email.</p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6,8}"
            maxLength={8}
            placeholder="Email code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-2xl border border-card-border bg-card px-4 py-3 text-[15px] text-fg placeholder:text-muted/70 focus:border-fg/40 focus:outline-none"
          />
        </>
      ) : null}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-2xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg transition-opacity disabled:opacity-50"
      >
        {submitting ? "Please wait..." : sent ? "Sign in" : "Send code"}
      </button>
      {sent ? (
        <button type="button" className="w-full text-[13px] text-muted underline" onClick={() => { setSent(false); setCode(""); setError(null); }}>
          Use a different email
        </button>
      ) : null}
      {error ? <p className="text-center text-[13px] text-red-500">{error}</p> : null}
    </form>
  );
}
