"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { api, patch } from "@/lib/client-api";
import { cn } from "@/lib/cn";
import { ArrowLeft, Camera, Crosshair, Loader2, MapPin, MapPinOff, Save } from "lucide-react";

interface Rules {
  requireGps: boolean;
  requireSelfie: boolean;
  blockOffSite: boolean;
}
interface Site {
  id: string;
  name: string;
  code: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofenceM: number | null;
  radius: number;
}
interface CheckIn {
  id: string;
  name: string;
  at: string;
  flag: string | null;
  site: string | null;
  distanceM: number | null;
  selfie: string | null;
  lat: number | null;
  lng: number | null;
}
interface Data {
  rules: Rules;
  sites: Site[];
  today: CheckIn[];
}

const RADII = [100, 200, 300, 500, 1000, 2000];
const dist = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";

function Toggle({ on, onChange, title, text }: { on: boolean; onChange: (v: boolean) => void; title: string; text: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50" aria-pressed={on}>
      <span className={cn("mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition", on ? "bg-amber-600" : "bg-slate-300")}>
        <span className={cn("h-4 w-4 rounded-full bg-white shadow transition", on && "translate-x-4")} />
      </span>
      <span>
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500">{text}</span>
      </span>
    </button>
  );
}

function SiteRow({ site, onSave }: { site: Site; onSave: (s: { id: string; latitude: number | null; longitude: number | null; geofenceM: number | null }) => Promise<void> }) {
  const [text, setText] = useState(site.latitude != null ? `${site.latitude}, ${site.longitude}` : "");
  const [radius, setRadius] = useState(site.radius);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const save = async (lat: number | null, lng: number | null) => {
    setErr(null);
    setBusy("save");
    try {
      await onSave({ id: site.id, latitude: lat, longitude: lng, geofenceM: radius });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(null);
    }
  };
  const fromText = () => {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
    if (!text.trim()) return save(null, null);
    if (!m) return setErr("Type it as two numbers with a comma, like 26.9124, 75.7873 (copy it from Google Maps).");
    return save(Number(m[1]), Number(m[2]));
  };
  const here = () => {
    if (!navigator.geolocation) return setErr("This browser cannot read the location.");
    setBusy("here");
    setErr(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 1e6) / 1e6;
        const lng = Math.round(p.coords.longitude * 1e6) / 1e6;
        setText(`${lat}, ${lng}`);
        save(lat, lng);
      },
      () => {
        setBusy(null);
        setErr("Location was not allowed or could not be read.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  return (
    <div className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-900">{site.name}</div>
          <div className="text-xs text-slate-500">{site.address}</div>
        </div>
        {site.latitude != null ? (
          <a href={`https://www.google.com/maps?q=${site.latitude},${site.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline">
            <MapPin className="h-3.5 w-3.5" /> Location set
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
            <MapPinOff className="h-3.5 w-3.5" /> No location
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(input, "max-w-[220px] font-mono")} placeholder="26.9124, 75.7873" value={text} onChange={(e) => setText(e.target.value)} />
        <select className={cn(input, "w-auto")} value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Radius">
          {RADII.map((r) => (
            <option key={r} value={r}>
              within {dist(r)}
            </option>
          ))}
        </select>
        <button onClick={fromText} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
          {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
        </button>
        <button onClick={here} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          {busy === "here" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Crosshair className="h-3.5 w-3.5" />} Use my location here
        </button>
      </div>
      {err && <p className="text-xs text-rose-600">{err}</p>}
    </div>
  );
}

export default function AttendanceSettingsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [rules, setRules] = useState<Rules | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<Data>("/api/organization/attendance")
      .then((x) => {
        setD(x);
        setRules(x.rules);
      })
      .catch((e) => setMsg({ tone: "error", text: e.message }));
  }, []);

  const saveRules = async () => {
    if (!rules) return;
    setBusy(true);
    setMsg(null);
    try {
      const x = await api<Data>("/api/organization/attendance", patch({ rules }));
      setD(x);
      setRules(x.rules);
      setMsg({ tone: "success", text: "Saved." });
    } catch (e: any) {
      setMsg({ tone: "error", text: e.message });
    } finally {
      setBusy(false);
    }
  };
  const saveSite = async (site: { id: string; latitude: number | null; longitude: number | null; geofenceM: number | null }) => {
    const x = await api<Data>("/api/organization/attendance", patch({ site }));
    setD(x);
    setMsg({ tone: "success", text: "Site location saved." });
  };
  const located = d?.sites.filter((s) => s.latitude != null).length ?? 0;

  return (
    <Shell>
      <div className="space-y-5">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Settings
        </Link>
        <PageHeader icon={MapPin} title="Check-In Rules" subtitle="Set site location for GPS check-ins and choose if staff need to take a selfie.">
          <button
            onClick={saveRules}
            disabled={!rules || busy}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </button>
        </PageHeader>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        {!d || !rules ? (
          <div className="h-96 animate-pulse rounded-2xl bg-slate-100" />
        ) : (
          <>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900">Rules</h2>
                <p className="text-xs text-slate-500">
                  The location is always recorded when the phone allows it, and a check-in away from every site is marked for you to see. These make it stricter.
                </p>
                <Toggle on={rules.requireGps} onChange={(v) => setRules({ ...rules, requireGps: v })} title="Location must be on" text="No check-in without the phone's location." />
                <Toggle
                  on={rules.blockOffSite}
                  onChange={(v) => setRules({ ...rules, blockOffSite: v })}
                  title="Only check in at a site"
                  text="Refuse a check-in further than the site's radius from every site. Needs site locations below."
                />
                <Toggle on={rules.requireSelfie} onChange={(v) => setRules({ ...rules, requireSelfie: v })} title="Selfie at check-in" text="The phone's front camera opens when someone checks in; the photo is kept with the day." />
                <p className="text-xs text-slate-500">
                  A check-in saved on a phone with no signal is never refused when it arrives later; it is only marked.
                </p>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">
                  Site locations <span className="font-normal text-slate-500">({located} of {d.sites.length} set)</span>
                </h2>
                <p className="px-5 pt-3 text-xs text-slate-500">Stand on the site and press &quot;Use my location here&quot;, or copy the point from Google Maps.</p>
                <div className="divide-y divide-slate-100">
                  {d.sites.map((s) => (
                    <SiteRow key={s.id} site={s} onSave={saveSite} />
                  ))}
                  {d.sites.length === 0 && <p className="px-5 py-6 text-center text-sm text-slate-500">No sites yet.</p>}
                </div>
              </section>
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">Today&apos;s check-ins</h2>
              {d.today.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-slate-500">Nobody has checked in yet today.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {d.today.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                      {c.selfie ? (
                        <a href={c.selfie} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.selfie} alt={`${c.name} at check-in`} className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200" />
                        </a>
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400" title="No selfie">
                          <Camera className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800">{c.name}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(c.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                          {c.site && c.distanceM != null ? ` · ${dist(c.distanceM)} from ${c.site}` : ""}
                        </div>
                      </div>
                      {c.flag === "OFF_SITE" && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">Away from site</span>}
                      {c.flag === "NO_GPS" && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">No location</span>}
                      {!c.flag && c.site && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">On site</span>}
                      {c.lat != null && (
                        <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-amber-700 hover:underline">
                          Map
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </Shell>
  );
}
