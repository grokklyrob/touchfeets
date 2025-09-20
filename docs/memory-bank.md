# Memory Bank

Purpose: codified defaults, policies, and pointers for the image generation MVP.

Scope: back end generation, quotas, watermarking, and operational defaults.

## Policies and defaults

- Generation engine: Google AI Studio Gemini 2.5 Flash Image (configurable)
- Model env override: GEMINI_IMAGE_MODEL (default gemini-2.5-flash-image)
- Automatic inpainting: fully automatic masking and inpainting; no user mask input anywhere
- Prompt style presets: Byzantine, Gothic, Cyberpunk
- Input pre-processing: resize to maxEdge 1024px, fit inside, no enlargement
- Output format: default png; webp supported
- Rate limit: 10 requests per 60 seconds per user
- Quotas: decremented per generation; paid first then free; free-only users fail when freeRemaining==0
- Watermark policy: free tier receives visible watermark on download; paid tiers are watermark-exempt
- Moderation: externalized to Google model safety; map safety blocks to job status BLOCKED with reason SAFETY
- Storage: Vercel Blob, public access; generated assets at generated/{jobId}.{ext}
- Job lifecycle: QUEUED → PROCESSING → COMPLETED | BLOCKED | FAILED with GenerationEvent audit trail

## Source-of-truth references

- Generate POST route: [web/app/api/generate/route.ts](web/app/api/generate/route.ts:1)
- Prompt builder enforcing automatic inpainting: [buildPrompt()](web/lib/gemini.ts:39)
- Gemini invocation helper: [web/lib/gemini.ts](web/lib/gemini.ts:1)
- Quota decrement and watermark policy: [decrementQuota()](web/lib/entitlements.ts:181), [isWatermarkExempt()](web/lib/entitlements.ts:205)
- Download with watermarking: [web/app/api/download/[id]/route.ts](web/app/api/download/[id]/route.ts:1), [applyVisibleWatermark()](web/lib/watermark.ts:9)
- Rate limit utility: [rateLimitWindow()](web/lib/redis.ts:60)

## API contract (summary)

- POST /api/generate
  - inputUrl: https blob URL returned by /api/upload-url (must include /uploads/)
  - style: BYZANTINE | GOTHIC | CYBERPUNK
  - promptVariant?: string ≤ 200 chars
  - outputFormat?: png | webp (default png)
  - Response: { id } then poll /api/jobs/{id}

## Operational defaults and env

- GOOGLE_API_KEY: required
- GEMINI_IMAGE_MODEL: optional override, defaults to gemini-2.5-flash-image
- BLOB_READ_WRITE_TOKEN: required for server-side uploads
- DATABASE_URL: Postgres (Neon/Vercel Postgres)
- UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN: optional; limiter fails open if absent

### Example env

```env
GOOGLE_API_KEY=...
GEMINI_IMAGE_MODEL=gemini-2.5-flash-image
BLOB_READ_WRITE_TOKEN=...
DATABASE_URL=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## End-to-end flow

1. Upload image via /api/upload-url
2. POST /api/generate with inputUrl and style
3. Poll /api/jobs/{id} until COMPLETED/BLOCKED/FAILED
4. GET /api/download/{id} to retrieve result (watermarked for free tier)

## Non-goals

- No manual masking UI or API parameters
- No separate moderation layer beyond model safety for MVP

## Maintenance notes

- Any changes to quotas or watermark policy should update: [web/lib/entitlements.ts](web/lib/entitlements.ts:1) and [web/app/api/download/[id]/route.ts](web/app/api/download/[id]/route.ts:1)
- If model family changes, update env variable and prompt builder: [getGeminiModelId()](web/lib/gemini.ts:32), [buildPrompt()](web/lib/gemini.ts:39)

## Current Next Task

- 10) Implement Style Selector — NEXT: Build [StyleSelector.tsx](web/components/StyleSelector.tsx:1) and integrate it into [UploadWidget.tsx](web/components/UploadWidget.tsx:1) replacing the inline select. Ensure presets: Byzantine, Gothic, Cyberpunk; wire through to POST [generate](web/app/api/generate/route.ts:1).

## Remaining Tasks (from project TODO 7–20)

7) Verify jobs polling
- Ensure the client polls and reflects status/output transitions correctly.
- Source of truth:
  - [jobs GET](web/app/api/jobs/[id]/route.ts:1)
  - [ImageJob model](web/prisma/schema.prisma:135)

8) Smoke test end-to-end
- Steps: upload → generate → poll → download.
- Endpoints:
  - [upload-url POST](web/app/api/upload-url/route.ts:1)
  - [generate POST](web/app/api/generate/route.ts:1)
  - [jobs GET](web/app/api/jobs/[id]/route.ts:1)
  - [download GET](web/app/api/download/[id]/route.ts:1)

9) Implement Upload/Generate Widget — COMPLETED (2025-09-19)
- Implemented [UploadWidget.tsx](web/components/UploadWidget.tsx:1) providing:
  - Drag/drop and click-to-upload to [upload-url POST](web/app/api/upload-url/route.ts:1)
  - Inline style selector (temporary until Task 10), output format, optional promptVariant
  - Invoke [generate POST](web/app/api/generate/route.ts:1) and poll [jobs GET](web/app/api/jobs/[id]/route.ts:1)
  - Preview and Download via [download GET](web/app/api/download/[id]/route.ts:1)
  - Error handling for safety blocks, rate limit, quota, and auth
- Next up: Extract dedicated [StyleSelector.tsx](web/components/StyleSelector.tsx:1) (Task 10), then implement [GenerationResult.tsx](web/components/GenerationResult.tsx:1) (Task 11).
10) Implement Style Selector
- Presets: Byzantine, Gothic, Cyberpunk.
- Target:
  - [StyleSelector.tsx](web/components/StyleSelector.tsx:1)

11) Implement Generation Result
- Show generated image, watermarked preview for free, download button for paid.
- Targets:
  - [GenerationResult.tsx](web/components/GenerationResult.tsx:1)
  - Watermark logic: [applyVisibleWatermark()](web/lib/watermark.ts:9), [download GET](web/app/api/download/[id]/route.ts:1)

12) Update Homepage UI
- Hero + tagline, 3-step explainer, centered widget, pricing row, FAQ links, footer w/ SynthID note.
- Status: Upload widget integrated on homepage in [page.tsx](web/app/page.tsx:1) replacing the placeholder.
- Targets:
  - [page.tsx](web/app/page.tsx:1)
  - [ContentWarning.tsx](web/components/ContentWarning.tsx:1)
  - Pricing page for links: [pricing/page.tsx](web/app/(marketing)/pricing/page.tsx:1)

13) Create FAQ page
- Cover safety rules, watermarking, subscriptions, refunds, content policies, error guidance.
- Target file:
  - [faq/page.tsx](web/app/(marketing)/faq/page.tsx:1)

14) Prisma migration and DB setup
- Initialize and run migrations; connect to Neon/Vercel Postgres.
- References:
  - [schema.prisma](web/prisma/schema.prisma:1)
  - [prisma client](web/lib/prisma.ts:1)
  - Env: [DATABASE_URL](web/.env.example:9)

15) Stripe Price IDs
- Configure price IDs and verify entitlements mapping.
- References:
  - [PRICE_ID_*](web/.env.example:15)
  - [planFromStripePriceId()](web/lib/entitlements.ts:24)
  - Stripe webhook already present: [webhook route](web/app/api/stripe/webhook/route.ts:1)

16) Analytics integration
- Add PostHog events client+API; Vercel Analytics in layout.
- Targets:
  - [layout.tsx](web/app/layout.tsx:1)
  - PostHog env: [POSTHOG_*](web/.env.example:30)

17) Cron jobs and cleanup
- vercel.json scheduled tasks; admin routes; 1-hour retention for generated images.
- Targets to add:
  - [vercel.json](web/vercel.json:1)
  - [admin/reset-quotas](web/app/api/admin/reset-quotas/route.ts:1)
  - [admin/blob-cleanup](web/app/api/admin/blob-cleanup/route.ts:1)

18) Error states and guidance
- UI feedback for safety blocks, API limits, quota exceeded, retries.
- References:
  - API error mapping: [generate POST](web/app/api/generate/route.ts:1)
  - UI components to surface messages: [UploadWidget.tsx](web/components/UploadWidget.tsx:1), [GenerationResult.tsx](web/components/GenerationResult.tsx:1)

19) Accessibility and performance
- Add prefers-reduced-motion, dark contrast, semantic headings, lazy-loading.
- Likely touchpoints:
  - [globals.css](web/app/globals.css:1)
  - [layout.tsx](web/app/layout.tsx:1)
  - [page.tsx](web/app/page.tsx:1) and components under web/components

20) Testing
- Minimal unit tests for webhooks, moderation mapping, quotas, and UI smoke.
- References and targets:
  - Webhook: [stripe/webhook](web/app/api/stripe/webhook/route.ts:1)
  - Entitlements: [applyEntitlementsForSubscription()](web/lib/entitlements.ts:78), [decrementQuota()](web/lib/entitlements.ts:181)
  - Suggested test files:
    - [web/__tests__/webhook.test.ts](web/__tests__/webhook.test.ts:1)
    - [web/__tests__/entitlements.test.ts](web/__tests__/entitlements.test.ts:1)
    - [web/__tests__/ui-smoke.test.tsx](web/__tests__/ui-smoke.test.tsx:1)
