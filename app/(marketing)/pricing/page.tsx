import PricingTable from "@/components/PricingTable";

export const metadata = {
  title: "Pricing — TouchFeets.com",
  description: "Choose a subscription for more monthly generations and watermark-free downloads.",
};

export default function PricingPage() {
  return (
    <main className="min-h-screen px-6 py-16 flex flex-col items-center">
      <section className="text-center max-w-3xl">
        <h1 className="text-4xl sm:text-5xl font-bold neon-crimson">Pricing</h1>
        <p className="mt-4 text-base sm:text-lg text-[var(--color-muted)]">
          Free users receive 5 watermarked generations each month. Subscriptions unlock higher monthly quotas and watermark-free downloads.
        </p>
      </section>

      <section className="mt-12 w-full max-w-6xl">
        <PricingTable />
      </section>

      <footer className="mt-20 text-xs text-[var(--color-muted)]">
        <p>Subscriptions are anchored to the 1st of each month UTC with prorations applied on signup.</p>
      </footer>
    </main>
  );
}