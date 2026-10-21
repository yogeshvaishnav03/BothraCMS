"use client";

import React, { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

export interface PickedPhoto {
  url: string;
  name: string;
}

/**
 * Uploads photos to /api/attachments as soon as they are picked and hands
 * back their urls. On a phone the button opens the camera.
 */
export function PhotoPicker({
  value,
  onChange,
  entityType,
  entityId,
  projectId,
  max = 6,
  label = "Add photos",
}: {
  value: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  entityType: string;
  entityId?: string;
  projectId?: string | null;
  max?: number;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const room = Math.max(0, max - value.length);
    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) setError(`Up to ${max} photos per update.`);

    setUploading(picked.length);
    const added: PickedPhoto[] = [];
    for (const file of picked) {
      const form = new FormData();
      form.append("file", file);
      form.append("entityType", entityType);
      if (entityId) form.append("entityId", entityId);
      if (projectId) form.append("projectId", projectId);
      form.append("category", "PHOTO");
      try {
        const res = await fetch("/api/attachments", { method: "POST", body: form });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.data?.url) {
          added.push({ url: json.data.url, name: json.data.fileName || file.name });
        } else {
          setError(json?.error?.message || json?.message || `Could not upload ${file.name}`);
        }
      } catch {
        setError(`Could not upload ${file.name}`);
      }
      setUploading((n) => n - 1);
    }
    if (added.length) onChange([...value, ...added]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((p) => (
          <div key={p.url} className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x.url !== p.url))}
              className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 p-0.5 text-white hover:bg-slate-900"
              aria-label={`Remove ${p.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {Array.from({ length: uploading }).map((_, i) => (
          <div key={`up-${i}`} className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-amber-300 bg-amber-50">
            <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
          </div>
        ))}
        {value.length + uploading < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-16 min-w-16 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 text-[11px] font-semibold text-slate-500 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700"
          >
            <Camera className="h-4 w-4" />
            {label}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}
