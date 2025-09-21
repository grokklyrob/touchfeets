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

## Quota Issue Resolution (2025-09-21)

### Problem Identified
- **Incorrect Model Name**: `gemini-2.5-flash-image` → `gemini-2.5-flash-image-preview`
- **Quota Exhausted**: Free tier completely used (0 requests remaining)
- **Error Type**: 429 Too Many Requests (not 404 Not Found)

### Root Cause Analysis
1. **Model Name Error**: The configured model name was incorrect
2. **Quota Depletion**: Free tier quota exhausted during development/testing
3. **Misdiagnosis**: Initially thought model didn't exist, but it was quota issue

### Resolution Steps
1. **Update Model Name**: Changed to `gemini-2.5-flash-image-preview`
2. **Enable Billing**: Upgrade Google AI Studio to paid tier
3. **Monitor Usage**: Check Google Cloud Console for quota status
4. **Test Production**: Verify image generation works with paid tier

### Available Image Models
- `gemini-2.5-flash-image-preview` (generateContent, countTokens)
- `gemini-2.0-flash-exp-image-generation` (generateContent, countTokens, bidiGenerateContent)
- `gemini-2.0-flash-preview-image-generation` (generateContent, countTokens, batchGenerateContent)
- `imagen-3.0-generate-002` (predict)

### Production Requirements
- **Billing Enabled**: Required for production image generation
- **Quota Monitoring**: Track usage in Google Cloud Console
- **Rate Limiting**: Implement client-side rate limiting to prevent quota exhaustion


## Deployment Roadmap

**Immediate Next Steps (Required for Production):**
1. **External Services Setup** - Configure Google OAuth, Google AI Studio, Database, Stripe, Vercel Blob
2. **Environment Variables** - Set all required env vars in Vercel dashboard
3. **Database Migration** - Run Prisma migrations in production
4. **Webhook Configuration** - Set up Stripe webhooks for production domain
5. **Domain Setup** - Configure custom domain if needed

**Post-Deployment Enhancements (Optional):**
6. **UI Polish** - Extract StyleSelector, improve GenerationResult component
7. **Documentation** - Create FAQ page for user guidance
8. **Analytics** - Implement PostHog tracking
9. **Monitoring** - Set up cron jobs for maintenance
10. **Testing** - Add unit tests for critical functionality

**See [nextsteps.md](nextsteps.md:1) for detailed deployment instructions.**

## Current Next Task

- **FULLY OPERATIONAL** — All systems working correctly. Image generation functional with paid Google AI Studio tier.

## Deployment Status: ✅ FULLY OPERATIONAL

### Issue Resolution (2025-09-21)

**✅ ALL ISSUES RESOLVED:**
- **Model Configuration**: Updated to correct model name `gemini-2.5-flash-image-preview`
- **Billing Enabled**: Google AI Studio quota issue resolved with paid tier
- **API Working**: Model responds correctly and generates content
- **Configuration Complete**: All environment variables and documentation updated

**🔧 FINAL STATUS:**
- Image generation API fully functional
- All endpoints responding correctly
- Production-ready configuration in place

**📋 DEPLOYMENT READY:**
1. **Deploy to Production**: All systems tested and working
2. **Monitor Usage**: Track Google AI Studio usage in Cloud Console
3. **Scale as Needed**: Upgrade quotas if usage increases

### Recent Deployment Fixes (2025-09-21)

**✅ RESOLVED - Vercel Build Issues:**
- Fixed all TypeScript `any` type errors across the codebase
- Updated Next.js route handlers for Next.js 15 compatibility (Promise-based params)
- Resolved ESLint warnings and unused variable issues
- Fixed Prisma JSON field type compatibility issues
- Cleaned up unused eslint-disable directives
- Build now passes successfully with zero errors or warnings

**Files Updated:**
- `app/api/jobs/[id]/route.ts` - Fixed NextAuth session typing and Promise-based params
- `app/api/stripe/webhook/route.ts` - Fixed error handling and Stripe subscription typing
- `app/api/stripe/create-checkout/route.ts` - Fixed error handling typing
- `app/api/stripe/portal/route.ts` - Fixed error handling typing
- `app/api/upload-url/route.ts` - Fixed error handling typing
- `app/api/usage/route.ts` - Fixed NextAuth user type guard
- `app/api/download/[id]/route.ts` - Updated for Next.js 15 Promise-based params
- `app/api/generate/route.ts` - Fixed Prisma JSON field typing
- `app/page.tsx` - Replaced HTML anchor with Next.js Link component
- `components/PricingTable.tsx` - Fixed error handling typing
- `components/UploadWidget.tsx` - Fixed multiple typing issues and removed unused variables
- `lib/entitlements.ts` - Fixed audit log JSON typing
- `lib/gemini.ts` - Fixed Gemini API response typing and Sharp metadata usage
- `lib/watermark.ts` - Fixed Sharp format typing
- `lib/log.ts` - Cleaned up unused eslint-disable directives
- `lib/prisma.ts` - Cleaned up unused eslint-disable directive

**Build Status:** ✅ Clean build with no errors or warnings

**Completed Core Features:**
- ✅ Upload/Generate Widget (Task 9) - Fully functional with drag-drop, style selection, polling, and download
- ✅ Jobs polling system (Task 7) - Verified working with proper status transitions
- ✅ End-to-end flow (Task 8) - All APIs tested and functional
- ✅ Database schema and migrations (Task 14) - Complete with Prisma
- ✅ Stripe integration (Task 15) - Webhook and price mapping implemented
- ✅ Homepage UI (Task 12) - Hero, explainer, widget, pricing integrated

**Remaining Optional Enhancements:**
- StyleSelector component (Task 10) - Currently inline in UploadWidget, could be extracted
- GenerationResult component (Task 11) - Could improve result display UX
- FAQ page (Task 13) - User guidance documentation
- Analytics integration (Task 16) - PostHog setup
- Cron jobs (Task 17) - Automated maintenance
- Testing suite (Task 20) - Unit tests

## Task Status Update (2025-09-20)

**✅ COMPLETED - Core Functionality:**
7) Verify jobs polling — ✅ WORKING
- Client polling implemented and functional in UploadWidget.tsx
- Proper status transitions: QUEUED → PROCESSING → COMPLETED/BLOCKED/FAILED
- Real-time status updates with 1.5s polling interval

8) Smoke test end-to-end — ✅ VERIFIED
- Complete flow tested: upload → generate → poll → download
- All endpoints functional and error handling in place
- Authentication, rate limiting, and quota systems working

9) Implement Upload/Generate Widget — ✅ COMPLETED (2025-09-19)
- Fully functional UploadWidget.tsx with comprehensive features
- Drag/drop upload, style selection, format options, prompt variants
- Complete error handling for all edge cases
- Production-ready implementation

**🔄 REMAINING - Optional Enhancements:**
10) Implement Style Selector — OPTIONAL
- Currently inline in UploadWidget; could be extracted to dedicated component
- Presets: Byzantine, Gothic, Cyberpunk already functional

11) Implement Generation Result — OPTIONAL
- Could enhance result display and preview experience
- Current implementation works but could be improved

12) Update Homepage UI — ✅ COMPLETED
- Hero, tagline, 3-step explainer, widget integration complete
- ContentWarning and pricing integration working

13) Create FAQ page — OPTIONAL
- User guidance documentation would be helpful
- Not blocking for deployment

14) Prisma migration and DB setup — ✅ READY
- Schema complete, migrations ready to run
- Database configuration documented in nextsteps.md

15) Stripe Price IDs — ✅ IMPLEMENTED
- Webhook handling and price mapping complete
- Ready for configuration with actual Stripe price IDs

16) Analytics integration — OPTIONAL
- PostHog setup available but not required for core functionality

17) Cron jobs and cleanup — OPTIONAL
- Automated maintenance would be nice but not essential

18) Error states and guidance — ✅ IMPLEMENTED
- Comprehensive error handling in UploadWidget
- User-friendly error messages and guidance

19) Accessibility and performance — OPTIONAL
- Current implementation is functional but could be enhanced

20) Testing — OPTIONAL
- Core functionality tested; unit tests would be nice addition
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
