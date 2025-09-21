"use client";

import { useState } from "react";

type Plan = {
  slug: "basic" | "plus" | "pro";
  name: string;
  priceLabel: string;
  quota: string;
  features: string[];
};

const plans: Plan[] = [
  {
    slug: "basic",
    name: "Basic",
    priceLabel: "$2 / mo",
    quota: "50 generations / month",
    features: ["50/mo generations", "Full-res downloads", "No visible watermark"],
  },
  {
    slug: "plus",
    name: "Plus",
    priceLabel: "$5 / mo",
    quota: "200 generations / month",
    features: ["200/mo generations", "Full-res downloads", "No visible watermark", "Priority queue"],
  },
  {
    slug: "pro",
    name: "Pro",
    priceLabel: "$10 / mo",
    quota: "1,000 generations / month",
    features: ["1,000/mo generations", "Full-res downloads", "No visible watermark", "Priority queue", "Early access styles"],
  },
];

export default function PricingTable() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (plan: Plan) => {
    try {
      setLoadingPlan(plan.name);
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.slug }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Checkout failed: ${txt}`);
      }
      const { url } = (await res.json()) as { url: string };
      if (url) window.location.href = url;
    } catch (err: unknown) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {plans.map((p) => (
        <div key={p.slug} className="card p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-xl font-semibold">{p.name}</h3>
            <p className="mt-2 text-2xl neon-crimson">{p.priceLabel}</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{p.quota}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-[var(--color-accent)]">✚</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
          <button
            onClick={() => handleCheckout(p)}
            disabled={loadingPlan !== null}
            className="btn-accent mt-6 px-5 py-3 font-semibold disabled:opacity-60"
          >
            {loadingPlan === p.name ? "Redirecting..." : "Subscribe"}
          </button>
        </div>
      ))}
    </div>
  );
}