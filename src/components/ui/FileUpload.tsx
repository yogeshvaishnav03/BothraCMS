"use client";

import React, { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";

/** Uploads one PDF or image to /api/attachments and hands back its url. */
export function FileUpload({
  value,
  onChange,
  entityType,
  projectId,
  category = "GENERAL",
  label = "Attach file (PDF or image)",
}: {
  value: { url: string; name: string } | null;
  onChange: (file: { url: string; name: string } | null) => void;
  entityType: string;
  projectId?: string | null;
  category?: string;
  label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("entityType", entityType);
    if (projectId) form.append("projectId", projectId);
    form.append("category", category);
    try {
      const res = await fetch("/api/attachments", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data?.url) onChange({ url: json.data.url, name: json.data.fileName || file.name });
      else setError(json?.error?.message || "Upload failed");
    } catch {
      setError("Upload failed");
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
      <input ref={ref} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </div>
  );
}
