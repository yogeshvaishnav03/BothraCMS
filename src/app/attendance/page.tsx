"use client";

import React, { useEffect, useState } from "react";
import Shell from "@/components/layout/Shell";
import { formatDateTime, formatDate } from "@/lib/formatters";
import {
  HardHat,
  UserCheck,
  UserX,
  Clock,
  MapPin,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  X,
  Plus,
  Users,
  UserPlus,
  Trash2,
} from "lucide-react";

export default function AttendancePage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [workers, setWorkers] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(true);

  // Register Worker modal
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [workerType, setWorkerType] = useState("MASON");
  const [phone, setPhone] = useState("");
  const [defaultSiteId, setDefaultSiteId] = useState("");
  const [dailyWageRate, setDailyWageRate] = useState("");

  // Correction modal
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [sessionToCorrect, setSessionToCorrect] = useState<any>(null);
  const [correctionStatus, setCorrectionStatus] = useState("PRESENT");
  const [correctionReason, setCorrectionReason] = useState("");

  // Feedback states
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()).catch(() => ({})),
      fetch("/api/workforce").then((r) => r.json()),
      fetch(`/api/attendance?workDate=${workDate}`).then((r) => r.json()),
      fetch("/api/sites").then((r) => r.json()),
    ])
      .then(([authRes, workerRes, attRes, sitesRes]) => {
        if (authRes?.success && authRes.data?.user) {
          setCurrentUser(authRes.data.user);
        }
        if (workerRes.success) {
          setWorkers(workerRes.data || []);
        }
        if (attRes.success) {
          setSessions(attRes.data || []);
        }
        if (sitesRes.success && sitesRes.data) {
          const rawSites = sitesRes.data || [];
          setSites(rawSites);
          if (rawSites.length > 0) {
            setDefaultSiteId((prev) => (rawSites.some((s: any) => s.id === prev) ? prev : rawSites[0].id));
          }
        }
      })
      .catch((err) => {
        console.error("Authoritative attendance load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (sites.length > 0) {
      setDefaultSiteId((prev) => (sites.some((s) => s.id === prev) ? prev : sites[0].id));
    }
  }, [sites]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workDate]);

  const handleDeleteWorker = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete worker "${name}"?`)) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/workforce?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to delete worker");
        return;
      }
      setStatusMessage(`Worker "${name}" deleted.`);
      loadData();
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to delete worker"}`);
    }
  };

  const handleRegisterWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) {
      setErrorMessage("Worker name is required");
      return;
    }
    if (!employeeCode.trim()) {
      setErrorMessage("Employee code is required");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/workforce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workerName.trim(),
          employeeCode: employeeCode.trim(),
          workerType,
          phone: phone.trim() || undefined,
          defaultSiteId: defaultSiteId || undefined,
          dailyWageRate: dailyWageRate ? parseFloat(dailyWageRate) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to register worker");
      } else {
        setStatusMessage(
          `Worker ${data.data.name} (${data.data.employeeCode}) registered successfully!`
        );
        setShowRegisterModal(false);
        setWorkerName("");
        setEmployeeCode("");
        setPhone("");
        setDailyWageRate("");
        loadData();
      }
    } catch {
      setErrorMessage("Network error during worker registration");
    } finally {
      setSubmitting(false);
    }
  };

  const getGpsCoords = async (): Promise<{ lat?: number; lng?: number; acc?: number }> => {
    if (typeof window === "undefined" || !navigator.geolocation) return {};
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          timeout: 4000,
          enableHighAccuracy: true,
        });
      });
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        acc: pos.coords.accuracy,
      };
    } catch {
      return {};
    }
  };

  const handleSelfCheckIn = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const gps = await getGpsCoords();
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workDate,
          siteId: sites.length > 0 ? sites[0].id : undefined,
          latitude: gps.lat,
          longitude: gps.lng,
          accuracyM: gps.acc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to check in");
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked in successfully at ${timeStr}${gpsStr}!`);
        loadData();
      }
    } catch {
      setErrorMessage("Network error during check-in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkerCheckIn = async (workerId: string) => {
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const gps = await getGpsCoords();
      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workforceMemberId: workerId,
          siteId: sites.length > 0 ? sites[0].id : undefined,
          workDate,
          latitude: gps.lat,
          longitude: gps.lng,
          accuracyM: gps.acc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to check in worker");
      } else {
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Worker checked in successfully${gpsStr}!`);
        loadData();
      }
    } catch {
      setErrorMessage("Network error during worker check-in");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckOut = async (sessionId?: string) => {
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const gps = await getGpsCoords();
      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          latitude: gps.lat,
          longitude: gps.lng,
          accuracyM: gps.acc,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to check out");
      } else {
        const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const gpsStr = gps.lat ? ` (GPS: ${gps.lat.toFixed(4)}, ${gps.lng?.toFixed(4)})` : "";
        setStatusMessage(`Checked out successfully at ${timeStr}${gpsStr}!`);
        loadData();
      }
    } catch {
      setErrorMessage("Network error during check-out");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorrectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToCorrect) return;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/attendance/${sessionToCorrect.id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: correctionStatus,
          reason: correctionReason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to submit correction");
      } else {
        setStatusMessage("Attendance record corrected and audit trail logged.");
        setShowCorrectionModal(false);
        setSessionToCorrect(null);
        setCorrectionReason("");
        loadData();
      }
    } catch {
      setErrorMessage("Network error during correction");
    } finally {
      setSubmitting(false);
    }
  };

  // Map attendance status to worker
  const activeSessionMap = new Map();
  sessions.forEach((s) => activeSessionMap.set(s.workforceMemberId, s));

  // Find current user's session for today
  const currentUserSession = sessions.find((s) => {
    const userEmpCode = currentUser?.id ? `USR-${currentUser.id.slice(-6).toUpperCase()}` : "";
    if (userEmpCode && s.workforceMember?.employeeCode === userEmpCode) return true;
    if (currentUser?.name && s.workforceMember?.name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase()) return true;
    return false;
  });
  const isUserCheckedIn = !!currentUserSession;
  const isUserCheckedOut = !!currentUserSession?.checkOutAt;

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
              <HardHat className="w-6 h-6 text-amber-500" />
              <span>Workforce Attendance & Shifts</span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Shift check-in/out with event-based geolocation, shift validation, and supervisor correction logs.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="date"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
            />
            <button
              onClick={() => {
                if (sites.length > 0) setDefaultSiteId(sites[0].id);
                setEmployeeCode(`EMP-${Date.now().toString().slice(-4)}`);
                setShowRegisterModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all"
            >
              <UserPlus className="w-4 h-4 text-amber-400" />
              <span>+ Register Worker</span>
            </button>
            {!isUserCheckedIn ? (
              <button
                onClick={handleSelfCheckIn}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                <UserCheck className="w-4 h-4" />
                <span>{submitting ? "Checking In..." : "Check In"}</span>
              </button>
            ) : !isUserCheckedOut ? (
              <button
                onClick={() => handleCheckOut(currentUserSession.id)}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-sm transition-all disabled:opacity-50"
              >
                <Clock className="w-4 h-4" />
                <span>{submitting ? "Checking Out..." : "Check Out"}</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Shift Completed</span>
              </div>
            )}
          </div>
        </div>

        {/* Feedback alerts */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Attendance Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Roster Crew
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {workers.length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Registered trade workers</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Checked In Today
            </span>
            <div className="text-2xl font-black text-emerald-600 mt-1 tabular-nums">
              {sessions.length}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-1">Present on site</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Shift In Progress
            </span>
            <div className="text-2xl font-black text-blue-600 mt-1 tabular-nums">
              {sessions.filter((s) => !s.checkOutAt).length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Awaiting checkout</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Completed Shifts
            </span>
            <div className="text-2xl font-black text-slate-900 mt-1 tabular-nums">
              {sessions.filter((s) => s.checkOutAt).length}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">Shift verified</div>
          </div>
        </div>

        {/* Workforce Attendance Roster Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-500" />
              <span>Site Crew Roster & Shift Status ({formatDate(workDate)})</span>
            </h2>
            <span className="text-xs font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
              Skyline Heights Sector 62
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs">Loading attendance...</div>
          ) : workers.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">No workers registered.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Worker / Code</th>
                    <th className="py-3 px-4">Trade</th>
                    <th className="py-3 px-4">Check-In Time</th>
                    <th className="py-3 px-4">Check-Out Time</th>
                    <th className="py-3 px-4">GPS Location</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workers.map((w) => {
                    const session = activeSessionMap.get(w.id);
                    const isCheckedIn = !!session;
                    const isCheckedOut = !!session?.checkOutAt;

                    return (
                      <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900">{w.name}</div>
                          <div className="text-xs text-slate-400 font-mono">{w.employeeCode}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {w.workerType}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                          {session ? formatDateTime(session.checkInAt) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-xs font-mono text-slate-600">
                          {isCheckedOut ? formatDateTime(session.checkOutAt) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-500">
                          {session?.checkInLat ? (
                            <div className="flex items-center gap-1 font-mono text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded w-max">
                              <MapPin className="w-3 h-3 text-emerald-600" />
                              <span>
                                {session.checkInLat.toFixed(4)}, {session.checkInLng?.toFixed(4)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No GPS</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {!isCheckedIn ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                              ABSENT / NOT IN
                            </span>
                          ) : isCheckedOut ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">
                              SHIFT CLOSED
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 animate-pulse">
                              ● WORKING ON SITE
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isCheckedIn && (
                              <button
                                onClick={() => handleWorkerCheckIn(w.id)}
                                disabled={submitting}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                              >
                                Check In
                              </button>
                            )}

                            {isCheckedIn && !isCheckedOut && (
                              <button
                                onClick={() => handleCheckOut(session.id)}
                                disabled={submitting}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                              >
                                Check Out
                              </button>
                            )}

                            {isCheckedIn && (
                              <button
                                onClick={() => {
                                  setSessionToCorrect(session);
                                  setCorrectionStatus(session.status);
                                  setShowCorrectionModal(true);
                                }}
                                title="Supervisor Correction"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                            )}

                            <button
                              onClick={() => handleDeleteWorker(w.id, w.name)}
                              title="Delete Worker"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Attendance Correction */}
        {showCorrectionModal && sessionToCorrect && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-amber-600" />
                  <span>Supervisor Attendance Correction</span>
                </div>
                <button
                  onClick={() => setShowCorrectionModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs mb-4">
                Worker: <span className="font-bold">{sessionToCorrect.workforceMember?.name}</span> (
                {sessionToCorrect.workforceMember?.employeeCode})
              </div>

              <form onSubmit={handleCorrectionSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Shift Status
                  </label>
                  <select
                    value={correctionStatus}
                    onChange={(e) => setCorrectionStatus(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    <option value="PRESENT">Full Day Present</option>
                    <option value="HALF_DAY">Half Day</option>
                    <option value="OVERTIME">Overtime</option>
                    <option value="CORRECTED">Correction Override</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Mandatory Audit Justification Reason
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="e.g. Worker was present on 5th floor casting but device was unavailable for gate scan"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCorrectionModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Save Correction"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Register Worker */}
        {showRegisterModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 my-8">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-500" />
                  <span>Register Workforce Personnel</span>
                </div>
                <button
                  onClick={() => setShowRegisterModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleRegisterWorkerSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sunil Sharma"
                      value={workerName}
                      onChange={(e) => setWorkerName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Employee Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. EMP-1044"
                      value={employeeCode}
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Trade / Designation *
                    </label>
                    <select
                      value={workerType}
                      onChange={(e) => setWorkerType(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="MASON">Mason (Mistri)</option>
                      <option value="CARPENTER">Carpenter</option>
                      <option value="ELECTRICIAN">Electrician</option>
                      <option value="PLUMBER">Plumber</option>
                      <option value="HELPER">General Helper (Beldar)</option>
                      <option value="FOREMAN">Site Foreman (Mukadam)</option>
                      <option value="SITE_ENGINEER">Site Engineer</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Primary Assigned Site
                    </label>
                    <select
                      value={defaultSiteId}
                      onChange={(e) => setDefaultSiteId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">No fixed site (Floating)</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Daily Wage Rate (₹)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 750"
                      value={dailyWageRate}
                      onChange={(e) => setDailyWageRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50"
                  >
                    {submitting ? "Registering..." : "Register Worker"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
