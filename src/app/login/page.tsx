"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@buildtrack.pro");
  const [password, setPassword] = useState("Password123!");
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
        setError(data.error?.message || "Invalid credentials");
      } else {
        router.push("/");
      }
    } catch {
      setError("Unable to connect to server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const setDemoUser = (userEmail: string) => {
    setEmail(userEmail);
    setPassword("Password123!");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 selection:bg-amber-500 selection:text-slate-950">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/20 mb-3">
            <HardHat className="w-8 h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Build Track <span className="text-amber-400">PRO</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Construction Operations & Site Management Platform
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/60">
          <h2 className="text-lg font-bold text-white mb-5 flex items-center justify-between">
            <span>Sign In to Workspace</span>
            <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
              <ShieldCheck className="w-3.5 h-3.5" /> SECURE
            </span>
          </h2>

          {error && (
            <div className="mb-5 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Work Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="supervisor@buildtrack.pro"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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

          {/* Quick Demo Accounts */}
          <div className="mt-6 pt-5 border-t border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center justify-between">
              <span>Quick Demo Accounts</span>
              <span className="text-[10px] text-amber-400/80 lowercase">password: Password123!</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setDemoUser("admin@buildtrack.pro")}
                className={`p-2 rounded-lg text-left border transition-all ${
                  email === "admin@buildtrack.pro"
                    ? "bg-amber-500/10 border-amber-500/50 text-amber-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-slate-200">Admin</div>
                <div className="text-[10px] truncate text-slate-500">admin@buildtrack.pro</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser("supervisor@buildtrack.pro")}
                className={`p-2 rounded-lg text-left border transition-all ${
                  email === "supervisor@buildtrack.pro"
                    ? "bg-amber-500/10 border-amber-500/50 text-amber-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-slate-200">Supervisor</div>
                <div className="text-[10px] truncate text-slate-500">supervisor@buildtrack.pro</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser("finance@buildtrack.pro")}
                className={`p-2 rounded-lg text-left border transition-all ${
                  email === "finance@buildtrack.pro"
                    ? "bg-amber-500/10 border-amber-500/50 text-amber-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-slate-200">Finance</div>
                <div className="text-[10px] truncate text-slate-500">finance@buildtrack.pro</div>
              </button>

              <button
                type="button"
                onClick={() => setDemoUser("store@buildtrack.pro")}
                className={`p-2 rounded-lg text-left border transition-all ${
                  email === "store@buildtrack.pro"
                    ? "bg-amber-500/10 border-amber-500/50 text-amber-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold text-slate-200">Storekeeper</div>
                <div className="text-[10px] truncate text-slate-500">store@buildtrack.pro</div>
              </button>
            </div>
          </div>
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
