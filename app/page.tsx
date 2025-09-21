import UploadWidget from "@/components/UploadWidget";
import Link from "next/link";
import ContentWarning from "@/components/ContentWarning";


export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      <section className="text-center max-w-3xl">
        <h1 className="text-4xl sm:text-6xl font-bold neon-crimson">TouchFeets.com</h1>
        <p className="mt-4 text-lg sm:text-xl text-[var(--color-muted)]">Let the Savior Touch Your Soles</p>
        <div className="mt-8 flex gap-3 justify-center flex-wrap">
          <Link href="/api/auth/signin" className="btn-accent px-6 py-3 text-sm font-semibold">Sign in with Google</Link>
          <a href="#generate" className="rounded-full px-6 py-3 border border-[rgba(225,6,60,0.35)] hover:border-[rgba(225,6,60,0.7)] transition">Generate now</a>
          <Link href="/pricing" className="rounded-full px-6 py-3 border border-[rgba(225,6,60,0.35)] hover:border-[rgba(225,6,60,0.7)] transition">Pricing</Link>
        </div>
      </section>

      <div className="w-full max-w-5xl mt-10">
        <ContentWarning />
      </div>

      <section className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-5 w-full max-w-5xl">
        <div className="card p-5">
          <h3 className="text-lg font-semibold">1. Upload</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Upload a photo with bare feet. No minors, no nudity beyond feet.</p>
        </div>
        <div className="card p-5">
          <h3 className="text-lg font-semibold">2. Generate</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Choose Byzantine, Gothic, or Cyberpunk style. We add a reverent touch.</p>
        </div>
        <div className="card p-5">
          <h3 className="text-lg font-semibold">3. Download</h3>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Preview with watermark on free tier. Subscribers get full-res downloads.</p>
        </div>
      </section>

      <section id="generate" className="mt-16 w-full max-w-3xl">
        <div className="card p-6">
          <UploadWidget />
        </div>
      </section>

      <footer className="mt-20 text-xs text-[var(--color-muted)]">
        <p>All images include invisible SynthID watermark per Google policy.</p>
      </footer>
    </main>
  );
}
