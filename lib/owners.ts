/**
 * Who may sign in to the studio. OWNER_EMAIL takes one address or a
 * comma-separated list, so several collaborators can share one deploy.
 */
export function ownerEmails(): string[] {
  return (process.env.OWNER_EMAIL ?? "")
    .split(",")
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ownerEmails().includes(email.toLowerCase().trim());
}
