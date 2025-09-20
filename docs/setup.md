# Touchfeets Setup and Deployment Guide

This guide walks through configuring all external services, environment variables, local development, and production deployment on Vercel for the image-generation MVP.

Refer to source-of-truth code while you configure:
- API generate: [web/app/api/generate/route.ts](web/app/api/generate/route.ts:1)
- Gemini helper: [web/lib/gemini.ts](web/lib/gemini.ts:1)
- Upload endpoint (Vercel Blob): [web/app/api/upload-url/route.ts](web/app/api/upload-url/route.ts:1)
- Jobs polling: [web/app/api/jobs/[id]/route.ts](web/app/api/jobs/[id]/route.ts:1)
- Download with watermark: [web/app/api/download/[id]/route.ts](web/app/api/download/[id]/route.ts:1)
- Quotas + watermark policy: [web/lib/entitlements.ts](web/lib/entitlements.ts:1)
- Stripe webhook: [web/app/api/stripe/webhook/route.ts](web/app/api/stripe/webhook/route.ts:1)
- Prisma schema: [web/prisma/schema.prisma](web/prisma/schema.prisma:1)
- Env template: [web/.env.example](web/.env.example:1)

## 1) Prerequisites

- Vercel account with access to create projects
- Stripe account (test mode is fine)
- Google Cloud account for Google AI Studio (Gemini) and Google OAuth
- Postgres database (Neon or Vercel Postgres recommended)
- Optional: Upstash Redis for rate limiting
- Optional: PostHog for product analytics

## 2) Clone and install

- Clone repo and install web app dependencies:

  ```
  cd web
  npm install
  ```

## 3) Environment variables

Create web/.env.local during local dev and fill based on [web/.env.example](web/.env.example:1). In Vercel, set these on the Project → Settings → Environment Variables.

Required for local and production:
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- DATABASE_URL
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- BLOB_READ_WRITE_TOKEN
- GOOGLE_API_KEY

Optional:
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- POSTHOG_KEY
- POSTHOG_HOST
- GEMINI_IMAGE_MODEL (defaults to gemini-2.5-flash-image)

See also: [web/README.md](web/README.md:1)

## 4) Database (Postgres)

Use Neon or Vercel Postgres.

- Provision a Postgres database.
- Copy the connection string into DATABASE_URL (include sslmode=require when needed).
- Example from [web/.env.example](web/.env.example:9)

Generate Prisma client and apply schema locally:

```
cd web
npm run prisma:generate
npm run prisma:migrate:dev
```

The schema models are defined in [web/prisma/schema.prisma](web/prisma/schema.prisma:1) and the Prisma client singleton is [web/lib/prisma.ts](web/lib/prisma.ts:1).

For production (Vercel), use:

```
cd web
npm run prisma:generate
npm run prisma:deploy
```

Tip: If you need to reset local db:

```
npm run prisma:migrate:reset
```

## 5) Authentication (NextAuth with Google)

Files: [web/app/api/auth/[...nextauth]/route.ts](web/app/api/auth/[...nextauth]/route.ts:1)

Steps:
- Create a Google OAuth Client (OAuth 2.0) in Google Cloud Console.
- Authorized redirect URI (local): http://localhost:3000/api/auth/callback/google
- Authorized redirect URI (prod): https://your-vercel-domain/api/auth/callback/google
- Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
- Set NEXTAUTH_URL to http://localhost:3000 locally and your Vercel domain in production.
- Generate a strong NEXTAUTH_SECRET.

## 6) Google AI Studio (Gemini 2.5 Flash Image)

Files: [web/lib/gemini.ts](web/lib/gemini.ts:1), [web/app/api/generate/route.ts](web/app/api/generate/route.ts:1)

Steps:
- Create an API key at Google AI Studio.
- Set GOOGLE_API_KEY in env.
- Optionally set GEMINI_IMAGE_MODEL (default gemini-2.5-flash-image).
- The prompt builder enforces automatic inpainting: buildPrompt() in [web/lib/gemini.ts](web/lib/gemini.ts:39).

## 7) Storage (Vercel Blob)

Files: [web/app/api/upload-url/route.ts](web/app/api/upload-url/route.ts:1), [web/app/api/generate/route.ts](web/app/api/generate/route.ts:1)

Steps:
- In Vercel dashboard, add the Blob integration (Storage → Blob).
- Create a Read-Write token and copy it to BLOB_READ_WRITE_TOKEN.
- Ensure your project has access to that Blob store in the same Vercel team.
- Upload endpoint expects multipart/form-data with field "file".

## 8) Rate limiting (Upstash Redis, optional)

Files: [web/lib/redis.ts](web/lib/redis.ts:1)

Steps:
- Create a Redis database in Upstash.
- Copy REST URL and REST TOKEN into UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
- If absent, limiter fails open, and the app still works.

## 9) Payments (Stripe)

Files: [web/app/api/stripe/webhook/route.ts](web/app/api/stripe/webhook/route.ts:1), [web/lib/entitlements.ts](web/lib/entitlements.ts:1)

Steps:
- Create a Stripe API secret key (test mode for development), set STRIPE_SECRET_KEY.
- Create three recurring Prices (USD) and capture their IDs:
  - PRICE_ID_BASIC_50 (2 USD / 50 credits)
  - PRICE_ID_PLUS_200 (5 USD / 200 credits)
  - PRICE_ID_PRO_1000 (10 USD / 1000 credits)
- Set these in env to map to plan tiers: planFromStripePriceId() in [web/lib/entitlements.ts](web/lib/entitlements.ts:24).
- In Stripe, add webhook endpoint:
  - URL (local via stripe cli): http://localhost:3000/api/stripe/webhook
  - URL (prod): https://your-vercel-domain/api/stripe/webhook
  - Events to send: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed
- Copy the signed secret into STRIPE_WEBHOOK_SECRET.

Local development with Stripe CLI:

```
# From another terminal
stripe listen --forward-to localhost:3000/api/stripe/webhook
# Read the webhook signing secret printed by the CLI and set STRIPE_WEBHOOK_SECRET
```

## 10) Analytics

- Vercel Web Analytics: enable in Vercel project settings.
- PostHog (optional): set POSTHOG_KEY and POSTHOG_HOST; add client events in UI components later.
- Layout file for analytics insertion: [web/app/layout.tsx](web/app/layout.tsx:1)

## 11) Local development flow

1. Create web/.env.local from [web/.env.example](web/.env.example:1) and fill values.
2. Ensure DATABASE_URL is reachable.
3. Run Prisma:

   ```
   cd web
   npm run prisma:generate
   npm run prisma:migrate:dev
   ```

4. Start the dev server:

   ```
   npm run dev
   ```

5. Test the APIs (must be authenticated):
- Upload: POST /api/upload-url with multipart form file
- Generate: POST /api/generate with inputUrl + style
- Poll job: GET /api/jobs/{id}
- Download: GET /api/download/{id}

See examples in [web/README.md](web/README.md:39).

## 12) Deploy on Vercel

1. Create a new Vercel Project from the repository, set Framework to Next.js in /web.
2. Add all env vars in Project Settings → Environment Variables (Production, Preview, Development).
3. Ensure Build Command (default): next build and Output Directory: .next for [web/next.config.ts](web/next.config.ts:1).
4. Set up Blob integration and map BLOB_READ_WRITE_TOKEN.
5. Set up Stripe webhook to your production URL and STRIPE_WEBHOOK_SECRET.
6. Set NEXTAUTH_URL to your production domain.
7. Run a production deployment; then run Prisma migrations via npm run prisma:deploy (or set a Vercel Postgres migration step in build/cron).
8. Verify E2E flow (upload → generate → poll → download) as described below.

## 13) Verify end-to-end after deployment

- Sign in with Google.
- Upload a small image (<= 20MB).
- Start a generation with style "BYZANTINE".
- Poll job id until COMPLETED.
- Download; if on FREE tier the visible watermark should be present.
- Check quotas in DB for decrements; see functions like decrementQuota() in [web/lib/entitlements.ts](web/lib/entitlements.ts:181).
- Inspect Stripe customer/subscription/price mapping if using paid tiers; see applyEntitlementsForSubscription() in [web/lib/entitlements.ts](web/lib/entitlements.ts:78).

## 14) Notes and next work

- Cron tasks and cleanup (Blob retention, quota resets) will use vercel.json scheduled functions and admin routes to be added later:
  - [web/vercel.json](web/vercel.json:1)
  - [web/app/api/admin/reset-quotas/route.ts](web/app/api/admin/reset-quotas/route.ts:1)
  - [web/app/api/admin/blob-cleanup/route.ts](web/app/api/admin/blob-cleanup/route.ts:1)
- UI components (UploadWidget, StyleSelector, GenerationResult) will be added under [web/components](web/components:1) and wired into [web/app/page.tsx](web/app/page.tsx:1).

With these services configured and env variables set, the app runs locally and can be deployed on Vercel with working authentication, storage, model generation, quotas, and payments.