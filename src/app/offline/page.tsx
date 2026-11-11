"use client";

import React from "react";
import { CloudOff, RefreshCw } from "lucide-react";

/** Shown by the service worker when a page has not been opened before and there is no signal. */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 pt-safe pb-safe">
      <div className="max-w-sm rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
        <CloudOff className="mx-auto h-10 w-10 text-amber-500" />
        <h1 className="mt-3 font-display text-lg font-extrabold text-slate-900">You are offline</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page has not been opened on this device before, so it is not saved offline yet. Pages you have already opened &mdash; like Projects and Daily Work Reports &mdash;
          still work, and anything you save will sync automatically when you are back online.
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
