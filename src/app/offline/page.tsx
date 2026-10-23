"use client";

import React from "react";
import { CloudOff, RefreshCw } from "lucide-react";

/** Shown by the service worker when a page has not been opened before and there is no signal. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <CloudOff className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 font-display text-lg font-extrabold text-slate-900">No signal</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page has not been opened on this phone before, so it is not saved for offline use. Pages you have opened, like your projects and the daily report, still
          work, and anything you save there is sent when the signal comes back.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={() => history.back()} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            Go back
          </button>
          <button onClick={() => location.reload()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    </div>
  );
}
