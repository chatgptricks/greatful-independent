"use client";

import { useState } from "react";

/**
 * Client component for the /admin/login magic-link form.
 *
 * Submission flow:
 *   1. POST email to /api/admin/send-magic-link.
 *   2. That route checks the email against OWNER_EMAIL server-side.
 *      Any non-matching email gets a silent 200 — we don't reveal
 *      whether an address is on the allowlist.
 *   3. Show a "check your inbox" confirmation regardless of match.
 */
export function AdminLoginForm({ initialError }: { initialError: string | null }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/send-magic-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Could not send link");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-card-border bg-card p-5 text-center text-[14px] leading-[1.65] text-fg">
        Check your inbox. If your email is on the allowlist, a sign-in
        link is on its way.
      </div>
    );
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
        className="w-full rounded-2xl border border-card-border bg-card px-4 py-3 text-[15px] text-fg placeholder:text-muted/70 focus:border-fg/40 focus:outline-none"
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-2xl bg-accent px-4 py-3 text-[15px] font-semibold text-accent-fg transition-opacity disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send sign-in link"}
      </button>
      {error ? (
        <p className="text-center text-[13px] text-red-500">{error}</p>
      ) : null}
    </form>
  );
}
