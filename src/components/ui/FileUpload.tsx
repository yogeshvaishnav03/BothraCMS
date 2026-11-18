"use client";

import React, { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { compressImageFile, presetForAttachmentCategory } from "@/lib/image-compression";
import { compressVideoFile } from "@/lib/video-compression";
import { uploadClientMedia } from "@/lib/upload-client";

/** Uploads one PDF, image, or video to /api/attachments and hands back its url. */
export function FileUpload({
  value,
  onChange,
  entityType,
  projectId,
  category = "GENERAL",
  label = "Attach file (Photo, Video, or PDF)",
}: {
  value: { url: string; name: string; fileId?: string } | null;
  onChange: (file: { url: string; name: string; fileId?: string } | null) => void;
  entityType: string;
  projectId?: string | null;
  category?: string;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (rawFile: File | undefined) => {
    if (!rawFile) return;
    setBusy(true);
    setError(null);
    const isVideo = rawFile.type.startsWith("video/") || /\.(mp4|mov|webm|3gp|avi)$/i.test(rawFile.name);
    const file = isVideo
      ? await compressVideoFile(rawFile)
      : await compressImageFile(rawFile, {
          preset: presetForAttachmentCategory(category, entityType),
        });
    try {
      const uploadResult = await uploadClientMedia(file, {
        entityType,
        projectId: projectId || undefined,
        category,
        createAttachment: true,
      });
      if (uploadResult?.url) {
        onChange({ url: uploadResult.url, name: uploadResult.fileName || file.name, fileId: uploadResult.fileId });
      } else {
        setError("Could not upload file. Use JPG, PNG, WebP, Video (MP4/WebM), or PDF under 250 MB.");
      }
    } catch (err: any) {
      setError(err?.message || "Could not upload file. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <div>
      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
          <Paperclip className="h-4 w-4 text-emerald-600" />
          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="rounded p-1 text-slate-400 hover:bg-white" aria-label="Remove file">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3 text-sm font-semibold text-slate-600 hover:border-amber-400 hover:bg-amber-50/40 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} {busy ? "Uploading…" : label}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/*"
        className="sr-only"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
