"use client";

import React, { useState, useEffect } from "react";
import {
  Paperclip,
  Upload,
  Image as ImageIcon,
  FileText,
  Trash2,
  ExternalLink,
  X,
  AlertCircle,
  Camera,
  CheckCircle2,
} from "lucide-react";
import { formatFileSize } from "@/lib/formatters";

interface AttachmentItem {
  id: string;
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  category: string;
  notes?: string;
  uploadedBy: string;
  createdAt: string;
  url: string;
}

interface AttachmentManagerProps {
  entityType: string; // PAYMENT, BILL, PARTY, MATERIAL, STOCK_MOVEMENT, ATTENDANCE, TASK, PROJECT_DOCUMENT
  entityId: string;
  projectId?: string;
  folderId?: string;
  title?: string;
  allowUpload?: boolean;
  highlightMissing?: boolean;
  missingLabel?: string;
  categoryDefault?: string;
  compact?: boolean;
}

export default function AttachmentManager({
  entityType,
  entityId,
  projectId,
  folderId,
  title = "Photographs & Documents",
  allowUpload = true,
  highlightMissing = false,
  missingLabel = "No bills/challans uploaded",
  categoryDefault = "PHOTO",
  compact = false,
}: AttachmentManagerProps) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState(categoryDefault);
  const [notes, setNotes] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAttachments = async () => {
    if (!entityId) return;
    try {
      setLoading(true);
      const url = `/api/attachments?entityType=${entityType}&entityId=${entityId}${
        projectId ? `&projectId=${projectId}` : ""
      }${folderId ? `&folderId=${folderId}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.success) {
        setAttachments(data.data || []);
      }
    } catch {
      // Ignore network errors on passive load
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId, entityType, folderId]);

  const uploadSingleFile = async (file: File, fileCategory: string) => {
    try {
      // 1. Attempt authorized presigned direct upload (bypasses serverless bandwidth)
      const presignRes = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          category: fileCategory,
          entityType,
          entityId,
          projectId,
          folderId,
        }),
      });

      const presignJson = await presignRes.json().catch(() => null);

      if (presignRes.ok && presignJson?.success && presignJson.data?.directUploadSupported) {
        const { uploadUrl, storageKey, fileId } = presignJson.data;

        // Direct PUT to object storage (Cloudflare R2 / S3)
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Direct storage upload failed with status ${uploadRes.status}`);
        }

        // Verify and finalize in database
        const completeRes = await fetch("/api/uploads/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId,
            storageKey,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            category: fileCategory,
            entityType,
            entityId,
            projectId,
            folderId,
            notes,
          }),
        });

        const completeJson = await completeRes.json().catch(() => null);
        if (!completeRes.ok || !completeJson?.success) {
          throw new Error(completeJson?.error?.message || "Failed to finalize uploaded attachment");
        }

        return;
      }
    } catch (directErr) {
      console.warn("Direct presigned upload unavailable, using server fallback:", directErr);
    }

    // Fallback: Standard multipart upload through /api/attachments
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityType", entityType);
    formData.append("entityId", entityId);
    if (projectId) formData.append("projectId", projectId);
    if (folderId) formData.append("folderId", folderId);
    formData.append("category", fileCategory);
    if (notes) formData.append("notes", notes);

    const res = await fetch("/api/attachments", {
      method: "POST",
      body: formData,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error?.message || "Failed to upload file");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      for (let i = 0; i < files.length; i++) {
        await uploadSingleFile(files[i], category);
      }

      setStatusMsg("Attachment(s) uploaded successfully!");
      setNotes("");
      loadAttachments();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to upload file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleReplaceUpload = async (
    oldId: string,
    oldCategory: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      await uploadSingleFile(file, oldCategory || category);

      // Delete the old attachment record
      await fetch(`/api/attachments/${oldId}`, { method: "DELETE" });

      setStatusMsg("Document re-uploaded & replaced successfully!");
      loadAttachments();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to replace file");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete attachment "${fileName}"?`)) return;

    try {
      const res = await fetch(`/api/attachments/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.error?.message || "Failed to delete attachment");
        return;
      }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      alert(`Network error: ${err.message || "Delete failed"}`);
    }
  };

  return (
    <div className={`space-y-3 ${compact ? "p-3 bg-slate-50/70 rounded-xl border border-slate-200" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-amber-500 shrink-0" />
          <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{title}</h4>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700">
            {attachments.length}
          </span>
        </div>

        {highlightMissing && attachments.length === 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3 h-3 text-amber-600" />
            <span>{missingLabel}</span>
          </span>
        )}
      </div>

      {statusMsg && (
        <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Gallery / List of Attachments */}
      {loading ? (
        <div className="h-16 bg-slate-100 animate-pulse rounded-lg" />
      ) : attachments.length === 0 ? (
        <div className="text-center py-4 text-slate-400 text-xs italic bg-white/60 rounded-lg border border-slate-100">
          No photos or documents uploaded yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
          {attachments.map((att) => {
            const isImage = att.mimeType.startsWith("image/");
            return (
              <div
                key={att.id}
                className="group relative bg-white border border-slate-200 rounded-xl p-2 hover:border-amber-400 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <div>
                  {isImage ? (
                    <div
                      onClick={() => setPreviewImage(att.url)}
                      className="w-full h-24 bg-slate-100 rounded-lg overflow-hidden cursor-pointer relative mb-1.5 group-hover:opacity-90 flex items-center justify-center"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.url}
                        alt={att.fileName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (!target.dataset.triedFallback) {
                            target.dataset.triedFallback = "true";
                            target.src = `/api/uploads/${att.fileId}?t=${Date.now()}`;
                          }
                        }}
                      />
                      <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <ExternalLink className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  ) : (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full h-24 bg-rose-50 border border-rose-100 rounded-lg flex flex-col items-center justify-center p-2 mb-1.5 hover:bg-rose-100/60 transition"
                    >
                      <FileText className="w-8 h-8 text-rose-500 mb-1" />
                      <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">PDF Document</span>
                    </a>
                  )}

                  <div className="font-semibold text-slate-800 text-[11px] truncate" title={att.fileName}>
                    {att.fileName}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                    <span className="font-mono bg-slate-100 px-1 rounded text-slate-600">{att.category}</span>
                    <span>{formatFileSize(att.fileSize)}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 mt-2 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate max-w-[80px]">{att.uploadedBy}</span>
                  <div className="flex items-center gap-1">
                    <label
                      className="p-1 text-slate-400 hover:text-amber-600 cursor-pointer transition rounded"
                      title="Replace / Re-upload this document"
                    >
                      <Upload className="w-3 h-3" />
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => handleReplaceUpload(att.id, att.category, e)}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-amber-600 transition"
                      title="Open full document"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={() => handleDelete(att.id, att.fileName)}
                      className="p-1 text-slate-400 hover:text-rose-600 transition"
                      title="Delete attachment"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload Controls */}
      {allowUpload && (
        <div className="pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:border-amber-400 outline-none"
            >
              <option value="PHOTO">📸 Site Photograph</option>
              <option value="INVOICE">🧾 Bill / Invoice</option>
              <option value="CHALLAN">🚚 Delivery Challan</option>
              <option value="DRAWING">📐 Architectural / Drawing</option>
              <option value="SPECIFICATION">📋 Specification / Report</option>
              <option value="RECEIPT">💳 Payment Receipt</option>
              <option value="GENERAL">📎 General Document</option>
            </select>

            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg cursor-pointer transition shadow-xs">
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>{uploading ? "Uploading..." : "Upload File"}</span>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>

            {/* Mobile Camera Direct Button */}
            <label className="inline-flex sm:hidden items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg cursor-pointer transition">
              <Camera className="w-3.5 h-3.5" />
              <span>Camera</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-[90] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer overflow-y-auto"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-black/40 rounded-2xl overflow-hidden p-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 p-2 bg-slate-900/80 text-white rounded-full hover:bg-slate-900 z-10"
            >
              <X className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Attachment preview"
              className="max-h-[85vh] w-auto max-w-full rounded-xl object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
