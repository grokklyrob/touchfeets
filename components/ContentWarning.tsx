"use client";

import { useState, useEffect } from "react";

/**
 * Informational-only content warning (no gating).
 * Requirements:
 * - Brief rules reminder (no minors; no nudity beyond feet; no hateful/violent content).
 * - Non-blocking (dismissible, stays dismissed via localStorage).
 */
export default function ContentWarning() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const dismissed = globalThis.localStorage?.getItem("cw_dismissed");
    if (dismissed === "1") setOpen(false);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      globalThis.localStorage?.setItem("cw_dismissed", "1");
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <div
      role="region"
      aria-label="Content rules"
      className="card border border-[rgba(225,6,60,0.35)] text-sm max-w-3xl w-full mx-auto p-4 mb-6"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-[var(--color-accent)]">⚠️</div>
        <div className="flex-1">
          <h3 className="font-semibold">Content rules</h3>
          <ul className="list-disc pl-5 mt-2 space-y-1 text-[var(--color-muted)]">
            <li>No minors or faces of minors.</li>
            <li>No nudity beyond feet.</li>
            <li>No violent, hateful, or disrespectful content.</li>
          </ul>
          <p className="mt-2 text-[var(--color-muted)]">
            Uploads may be moderated automatically. Blocked images will include a brief reason and guidance.
          </p>
        </div>
        <button
          onClick={dismiss}
          className="ml-2 rounded-full border border-[rgba(225,6,60,0.35)] px-3 py-1 hover:border-[rgba(225,6,60,0.7)] transition"
          aria-label="Dismiss content rules"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}