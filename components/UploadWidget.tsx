"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

type StylePreset = "BYZANTINE" | "GOTHIC" | "CYBERPUNK";
type OutputFormat = "png" | "webp";

type JobStatus = "QUEUED" | "PROCESSING" | "BLOCKED" | "COMPLETED" | "FAILED";

type JobResponse = {
  id: string;
  status: JobStatus;
  inputBlobUrl: string;
  outputBlobUrl?: string;
  style?: StylePreset;
  blockedReason?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

type UploadResult = {
  url: string;
  pathname: string;
  contentType: string;
  size?: number;
};

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

/**
 * Upload & Generate Widget (Task 9)
 *
 * Features:
 * - Drag/drop or click-to-upload image
 * - Inline style selector (Task 10 will extract to a dedicated StyleSelector)
 * - Optional prompt variant
 * - Output format selector (png/webp, default png)
 * - Calls:
 *   - POST /api/upload-url (multipart form-data)
 *   - POST /api/generate (JSON)
 *   - Poll GET /api/jobs/[id]
 *   - Preview and Download via GET /api/download/[id]
 *
 * Notes:
 * - Requires authenticated session (NextAuth). If 401 on generate, prompts to sign in.
 * - Server validates content-type, size, rate limits, quotas, and safety.
 *
 * See server contracts:
 * - Generate: web/app/api/generate/route.ts
 * - Upload: web/app/api/upload-url/route.ts
 * - Jobs: web/app/api/jobs/[id]/route.ts
 * - Download: web/app/api/download/[id]/route.ts
 */
export default function UploadWidget() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [style, setStyle] = useState<StylePreset>("BYZANTINE");
  const [promptVariant, setPromptVariant] = useState("");
  const [format, setFormat] = useState<OutputFormat>("png");

  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    | "idle"
    | "picking"
    | "uploading"
    | "queued"
    | "processing"
    | "blocked"
    | "failed"
    | "completed"
  >("idle");

  const [message, setMessage] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);

  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current as any);
        pollRef.current = null;
      }
    };
  }, []);

  const clearState = useCallback(() => {
    setBusy(false);
    setPhase("idle");
    setMessage(null);
    setJobId(null);
    setDownloadUrl(null);
    setPreviewUrl(null);
    setBlockedReason(null);
    if (pollRef.current) {
      clearInterval(pollRef.current as any);
      pollRef.current = null;
    }
  }, []);

  const onSelectFile = useCallback((f: File) => {
    setFile(f);
    setPhase("picking");
    setMessage(null);
    setJobId(null);
    setDownloadUrl(null);
    setPreviewUrl(null);
    setBlockedReason(null);
  }, []);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onSelectFile(f);
  }, [onSelectFile]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onSelectFile(f);
  }, [onSelectFile]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  async function uploadToBlob(selected: File): Promise<UploadResult> {
    setPhase("uploading");
    setMessage("Uploading...");
    const fd = new FormData();
    fd.append("file", selected);
    const res = await fetch("/api/upload-url", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.error || `Upload failed (${res.status})`);
    }
    return (await res.json()) as UploadResult;
  }

  async function startGeneration(upload: UploadResult): Promise<{ id: string }> {
    setPhase("queued");
    setMessage("Starting generation...");
    const body: any = {
      inputUrl: upload.url,
      style,
      outputFormat: format,
    };
    if (promptVariant.trim().length > 0) {
      body.promptVariant = promptVariant.trim().slice(0, 200);
    }

    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      throw new Error("You must sign in to generate images. Please sign in and try again.");
    }
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.error || `Generate failed (${res.status})`);
    }
    const json = await res.json();
    if (!json?.id) throw new Error("Generate did not return a job id");
    return { id: json.id as string };
  }

  function startPolling(id: string) {
    setPhase("processing");
    setMessage("Processing with Gemini...");
    setJobId(id);

    if (pollRef.current) clearInterval(pollRef.current as any);

    const tick = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) {
          if (res.status === 401) {
            throw new Error("Session expired. Please sign in again.");
          }
          // brief backoff but do not stop
          return;
        }
        const job = (await res.json()) as JobResponse;
        switch (job.status) {
          case "QUEUED":
            setPhase("queued");
            setMessage("Queued...");
            break;
          case "PROCESSING":
            setPhase("processing");
            setMessage("Processing with Gemini...");
            break;
          case "COMPLETED": {
            setPhase("completed");
            setMessage("Completed");
            const dl = `/api/download/${id}`;
            setDownloadUrl(dl);
            setPreviewUrl(dl + "#inline-preview"); // same url; hint not used by server
            if (pollRef.current) {
              clearInterval(pollRef.current as any);
              pollRef.current = null;
            }
            break;
          }
          case "BLOCKED": {
            setPhase("blocked");
            const reason = job.blockedReason || "SAFETY";
            setBlockedReason(reason);
            setMessage(humanBlockedReason(reason));
            if (pollRef.current) {
              clearInterval(pollRef.current as any);
              pollRef.current = null;
            }
            break;
          }
          case "FAILED": {
            setPhase("failed");
            setMessage("Generation failed. Please try another image or later.");
            if (pollRef.current) {
              clearInterval(pollRef.current as any);
              pollRef.current = null;
            }
            break;
          }
          default:
            break;
        }
      } catch (err: any) {
        // keep polling a bit; if repeated, it will stop when user resets
        setMessage(err?.message || "Polling error");
      }
    };

    // Immediate tick then interval
    tick();
    pollRef.current = setInterval(tick, 1500) as any;
  }

  async function onStart() {
    if (!file) {
      setMessage("Please choose an image to upload.");
      return;
    }
    try {
      setBusy(true);
      setMessage(null);
      setPhase("uploading");
      setDownloadUrl(null);
      setPreviewUrl(null);
      setJobId(null);
      const uploaded = await uploadToBlob(file);
      const { id } = await startGeneration(uploaded);
      startPolling(id);
    } catch (err: any) {
      setBusy(false);
      if (err?.message?.includes("sign in")) {
        setPhase("failed");
      } else {
        setPhase("failed");
      }
      setMessage(err?.message || "Unexpected error");
    } finally {
      // busy stays true while polling; will flip on terminal states where appropriate
    }
  }

  function onReset() {
    clearState();
    setFile(null);
  }

  function humanBlockedReason(reason: string): string {
    const r = reason.toUpperCase();
    if (r.includes("SAFETY")) {
      return "Blocked by model safety. Try a different image or less sensitive content.";
    }
    if (r.includes("RATE")) {
      return "You’ve hit the rate limit. Please wait a minute and try again.";
    }
    if (r.includes("QUOTA")) {
      return "Monthly quota exceeded. Upgrade a plan to continue.";
    }
    if (r.includes("UPLOAD_NOT_CONFIGURED")) {
      return "Output storage not configured. Contact support.";
    }
    if (r.includes("MODEL")) {
      return "Model error. Please try again.";
    }
    return "Blocked. Please adjust your input and try again.";
  }

  return (
    <div className="w-full max-w-2xl mx-auto border rounded-lg p-4 bg-white/70 dark:bg-neutral-900/60 shadow-sm">
      <h2 className="text-xl font-semibold mb-3">Upload & Generate</h2>

      {/* Dropzone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={classNames(
          "relative border-2 border-dashed rounded-md p-6 transition-colors",
          dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-neutral-300"
        )}
      >
        <div className="flex flex-col items-center justify-center text-center gap-2">
          <div className="text-sm text-neutral-600 dark:text-neutral-300">
            Drag & drop an image here, or click to select
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="absolute inset-0 opacity-0 cursor-pointer"
            onChange={onFileInput}
            aria-label="Select image"
          />
          {file && (
            <div className="text-xs text-neutral-700 dark:text-neutral-300">
              Selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Style (inline for Task 9; extracted in Task 10) */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Style</span>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value as StylePreset)}
            className="border rounded-md px-2 py-1 bg-white dark:bg-neutral-900"
          >
            <option value="BYZANTINE">Byzantine</option>
            <option value="GOTHIC">Gothic</option>
            <option value="CYBERPUNK">Cyberpunk</option>
          </select>
        </label>

        {/* Output format */}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Output format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as OutputFormat)}
            className="border rounded-md px-2 py-1 bg-white dark:bg-neutral-900"
          >
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
          </select>
        </label>

        {/* Prompt variant */}
        <label className="flex flex-col gap-1 md:col-span-1 md:col-start-3 md:row-start-1">
          <span className="text-sm font-medium">Prompt variant (optional)</span>
          <input
            type="text"
            value={promptVariant}
            onChange={(e) => setPromptVariant(e.target.value)}
            placeholder="e.g. warm golden hour light"
            maxLength={200}
            className="border rounded-md px-2 py-1 bg-white dark:bg-neutral-900"
          />
        </label>
      </div>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={!file || busy || phase === "processing" || phase === "queued"}
          className={classNames(
            "px-4 py-2 rounded-md text-white",
            (!file || busy || phase === "processing" || phase === "queued")
              ? "bg-neutral-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          )}
        >
          {phase === "processing" || phase === "queued" ? "Working..." : "Generate"}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-3 py-2 rounded-md border"
        >
          Reset
        </button>

        {downloadUrl && (
          <a
            href={downloadUrl}
            className="ml-auto px-4 py-2 rounded-md border hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            Download
          </a>
        )}
      </div>

      {/* Status */}
      {(message || phase !== "idle") && (
        <div className="mt-3 text-sm">
          <strong>Status:</strong>{" "}
          <span className={classNames(
            phase === "failed" || phase === "blocked" ? "text-red-600 dark:text-red-400" : "text-neutral-800 dark:text-neutral-200"
          )}>
            {message || phase}
          </span>
          {phase === "blocked" && blockedReason && (
            <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              Reason: {blockedReason}
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {previewUrl && (
        <div className="mt-4">
          <div className="text-sm mb-2">Preview</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Generated result"
            className="max-h-[480px] w-auto border rounded-md"
          />
          <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            Free tier receives visible watermark. Paid tiers are watermark-exempt.
          </div>
        </div>
      )}
    </div>
  );
}

async function safeJson(res: Response): Promise<any | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}