"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        let msg = data.error?.message || "Invalid credentials";
        if (msg.includes("admin@buildtrack.pro") || msg.includes("Password123") || msg.includes("instant demo access") || msg.includes("Database connecting")) {
          msg = "Authentication service is temporarily unavailable. Please try again shortly.";
        }
        if (res.status === 401) {
          msg = "The email or password is incorrect. Check both and try again.";
        }
        setError(msg);
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("Unable to connect to server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-chrome flex flex-col justify-center items-center p-4 overflow-hidden selection:bg-amber-500 selection:text-slate-950">
      {/* Ambient blueprint grid and glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-amber-500/20 blur-3xl animate-float" />
      <div className="relative w-full max-w-md animate-fade-up">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-brand text-slate-950 shadow-glow mb-4">
            <HardHat className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Bothra <span className="text-gradient-brand">CMS</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Construction Operations & Site Management Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/[0.04] backdrop-blur-xl ring-1 ring-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/40">
          <h2 className="text-lg font-bold text-white mb-5 flex items-center justify-between">
            <span>Sign In to Workspace</span>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              <ShieldCheck className="w-3.5 h-3.5" /> SECURE
            </span>
          </h2>

          {error && (
            <div id="login-error" role="alert" className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="supervisor@buildtrack.pro"
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? "login-error" : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950/60 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-brand hover:brightness-110 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 shadow-glow active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Security badge footer */}
        <div className="text-center mt-6 text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>Role-Scoped Multi-Tenant Isolation Active</span>
        </div>
      </div>
    </div>
  );
}
