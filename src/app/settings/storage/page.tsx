"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { api, post } from "@/lib/client-api";
import { ArrowLeft, CheckCircle2, CloudUpload, HardDrive, Loader2 } from "lucide-react";

interface Status {
  provider: string;
  providerName: string;
  cloud: boolean;
  onVercel: boolean;
  databaseCopies: number;
  files: number;
}

export default function StorageSettingsPage() {
  const [s, setS] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [moved, setMoved] = useState(0);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);

  const load = () => api<Status>("/api/organization/storage").then(setS);
  useEffect(() => {
    load().catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);

  // Moves a batch at a time so each request stays short, until nothing is left or a batch moves nothing.
  const move = async () => {
    setBusy(true);
    setMsg(null);
    setMoved(0);
    let total = 0;
    try {
      for (;;) {
        const r = await api<{ moved: number; failed: string[]; remaining: number }>("/api/organization/storage", post({}));
        total += r.moved;
        setMoved(total);
        if (r.failed.length) throw new Error(`Could not upload ${r.failed[0]}. Check the storage settings and try again; files already moved are safe.`);
        if (r.remaining === 0 || r.moved === 0) break;
      }
      setMsg({ tone: "success", text: `${total} file${total === 1 ? "" : "s"} moved to ${s?.providerName}.` });
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
      load().catch(() => null);
    }
  };

  return (
    <Shell>
      <div className="space-y-5">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
        <PageHeader icon={HardDrive} title="File storage" subtitle="Where site photos, drawings, bills and other uploads are kept." />

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        {!s ? (
          <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Now</h2>
              <div className="flex items-center gap-2 text-sm">
                {s.cloud ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <HardDrive className="h-4 w-4 text-slate-400" />}
                <span className="font-semibold text-slate-800">{s.providerName}</span>
              </div>
              <p className="text-sm text-slate-600">
                {s.files} uploaded file{s.files === 1 ? "" : "s"}.{" "}
                {s.databaseCopies > 0 ? `${s.databaseCopies} cop${s.databaseCopies === 1 ? "y is" : "ies are"} kept in the database.` : "None are kept in the database."}
              </p>
              {s.cloud && s.databaseCopies > 0 && (
                <>
                  <p className="text-sm text-slate-600">
                    Files uploaded before cloud storage was set up are still in the database. They open as before; moving them makes the database smaller and backups faster.
                  </p>
                  <button
                    onClick={move}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />} {busy ? `Moving… ${moved} done` : `Move files to ${s.providerName}`}
                  </button>
                </>
              )}
              {!s.cloud && s.onVercel && (
                <Alert tone="info">This server&apos;s disk is wiped on each deploy, so every file is also kept in the database. Set up cloud storage to keep the database small.</Alert>
              )}
            </section>

            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Setting up cloud storage</h2>
              <p className="font-semibold text-slate-800">On Vercel (simplest)</p>
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>In the Vercel project, open Storage → Create → Blob, and choose a <b>private</b> store.</li>
                <li>Connect it to this project. Vercel adds BLOB_READ_WRITE_TOKEN to the environment variables.</li>
                <li>Redeploy. New uploads go to the store; come back here to move the older ones.</li>
              </ol>
              <p className="font-semibold text-slate-800">Amazon S3 or Cloudflare R2</p>
              <p>
                Set S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (and S3_ENDPOINT for R2) on the server. These take priority over Vercel Blob.
              </p>
              <p className="text-xs text-slate-500">Files are always opened through the app, which checks who is asking. The store itself is private.</p>
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
