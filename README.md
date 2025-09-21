This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## API

### POST /api/generate
Automatic, prompt-driven inpainting using Gemini 2.5 Flash Image. No manual mask is used or accepted.

- Auth: required (NextAuth session)
- Body (JSON):
  - inputUrl: string (https blob URL returned by /api/upload-url; must include "/uploads/")
  - style: "BYZANTINE" | "GOTHIC" | "CYBERPUNK"
  - promptVariant?: string (<= 200 chars)
  - outputFormat?: "png" | "webp" (default "png")
- Response 200:
  - { id: string } (ImageJob id). Poll job status via GET /api/jobs/{id}.

Implementation:
- Generation endpoint: [web/app/api/generate/route.ts](web/app/api/generate/route.ts:1)
- Gemini integration: [web/lib/gemini.ts](web/lib/gemini.ts:1)
  - Prompt strengthened to require fully automatic masking and seamless inpainting: buildPrompt()
- Job polling: [web/app/api/jobs/[id]/route.ts](web/app/api/jobs/[id]/route.ts:1)
- Download with watermarking for free tier: [web/app/api/download/[id]/route.ts](web/app/api/download/[id]/route.ts:1), watermark via [applyVisibleWatermark()](web/lib/watermark.ts:9)
- Quotas: [decrementQuota()](web/lib/entitlements.ts:181)
- Rate limit: [rateLimitWindow()](web/lib/redis.ts:60)

Notes:
- No maskUrl parameter is accepted; the system performs automatic region selection and inpainting. UI should not include any mask tools.
- Job lifecycle: QUEUED → PROCESSING → COMPLETED | BLOCKED | FAILED; events recorded for traceability.

Example flow (local):
1) Upload input image
   curl -X POST -F "file=@./example.jpg" http://localhost:3000/api/upload-url
   => { "url": "https://&lt;blob&gt;/uploads/...", "contentType": "image/jpeg", ... }

2) Start generation (must be authenticated)
   curl -X POST http://localhost:3000/api/generate \
     -H "Content-Type: application/json" \
     --cookie "next-auth.session-token=YOUR_SESSION_COOKIE" \
     -d '{
       "inputUrl": "https://&lt;blob&gt;/uploads/your-file.jpg",
       "style": "BYZANTINE",
       "promptVariant": "optional extra direction",
       "outputFormat": "png"
     }'
   => { "id": "job_cuid" }

3) Poll status
   curl http://localhost:3000/api/jobs/job_cuid
   => { "status": "PROCESSING" | "COMPLETED" | "BLOCKED" | "FAILED", "outputBlobUrl": "...", ... }

4) Download (watermark applied for free tier)
   curl -L -o out.png http://localhost:3000/api/download/job_cuid

Environment:
- GOOGLE_API_KEY (required)
- GEMINI_IMAGE_MODEL (optional; default "gemini-2.5-flash-image-preview") in [.env.example](web/.env.example:1)
- BLOB_READ_WRITE_TOKEN (required)
- DATABASE_URL (required)
- UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (optional; rate limiter fails open if absent)
