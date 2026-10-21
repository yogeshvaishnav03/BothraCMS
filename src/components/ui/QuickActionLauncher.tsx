"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  X,
  Search,
  CalendarDays,
  Clock,
  Boxes,
  BookOpen,
  DollarSign,
  Users,
  Building2,
  MessageSquare,
  FileText,
  FolderKanban,
  Settings,
  Sparkles,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface QuickActionItem {
  id: string;
  titleEn: string;
  titleHi: string;
  descEn: string;
  descHi: string;
  href: string;
  icon: any;
  colorClass: string;
  badgeEn?: string;
  badgeHi?: string;
  keywords: string[];
  roles?: string[]; // Allowed roles (if undefined, all except WORKER unless WORKER is listed)
}

const QUICK_ACTIONS: QuickActionItem[] = [
  {
    id: "day-book",
    titleEn: "Record Day Book Entry",
    titleHi: "दैनिक खर्च / रोकड़ दर्ज करें",
    descEn: "Cash In or Cash Out for diesel, tea, local purchases",
    descHi: "डीजल, चाय-पानी, मजदूरी और साइट के रोजमर्रा के खर्च",
    href: "/day-book",
    icon: CalendarDays,
    colorClass: "bg-emerald-500 text-white",
    badgeEn: "Cash",
    badgeHi: "रोकड़",
    keywords: ["daybook", "cash", "expense", "kharcha", "rokar", "diesel", "chai", "petty cash", "money", "paise"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "FINANCE_CONTROLLER"],
  },
  {
    id: "attendance",
    titleEn: "Mark Site Attendance",
    titleHi: "हाजिरी लगाएं (Attendance)",
    descEn: "Check-in workers, skilled masons, and supervisors",
    descHi: "कारीगरों और मजदूरों की दैनिक उपस्थिति दर्ज करें",
    href: "/attendance",
    icon: Clock,
    colorClass: "bg-blue-500 text-white",
    badgeEn: "Daily",
    badgeHi: "दैनिक",
    keywords: ["attendance", "hajiri", "checkin", "present", "absent", "muster", "labor", "worker", "shift"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "WORKER"],
  },
  {
    id: "materials",
    titleEn: "Receive Materials (GRN)",
    titleHi: "सामान / माल प्राप्ति दर्ज करें",
    descEn: "Log incoming cement bags, steel tons, and sand dumpers",
    descHi: "सीमेंट, सरिया, बजरी और ईंटों का ट्रक साइट पर दर्ज करें",
    href: "/materials",
    icon: Boxes,
    colorClass: "bg-amber-500 text-slate-950",
    badgeEn: "Stock",
    badgeHi: "स्टॉक",
    keywords: ["materials", "cement", "steel", "sand", "grn", "stock", "truck", "saman", "dumper", "store"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"],
  },
  {
    id: "measurement-book",
    titleEn: "Add Measurement (MB)",
    titleHi: "माप पुस्तिका नाप दर्ज करें",
    descEn: "Record work dimensions (Length × Breadth × Depth)",
    descHi: "किए गए काम का नाप (L × B × D) और बिलिंग परिमाण",
    href: "/measurement-book",
    icon: BookOpen,
    colorClass: "bg-indigo-500 text-white",
    badgeEn: "L×B×D",
    badgeHi: "नाप",
    keywords: ["measurement", "mb", "naap", "dimensions", "length", "breadth", "slab", "brickwork", "plaster"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"],
  },
  {
    id: "finance",
    titleEn: "Add Bill or Payment",
    titleHi: "बिल या भुगतान (Payment) जोड़ें",
    descEn: "Record vendor invoices, contractor RA bills & bank UTRs",
    descHi: "सप्लायर का बिल, ठेकेदार का भुगतान और बैंक ट्रांजेक्शन",
    href: "/finance",
    icon: DollarSign,
    colorClass: "bg-teal-500 text-white",
    badgeEn: "Billing",
    badgeHi: "बिलिंग",
    keywords: ["finance", "bill", "payment", "utr", "gst", "vendor bill", "contractor payment", "bank", "paise"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "FINANCE_CONTROLLER"],
  },
  {
    id: "workforce",
    titleEn: "Add Worker to Directory",
    titleHi: "नया कारीगर या मजदूर जोड़ें",
    descEn: "Register mason, carpenter, or helper with daily wage",
    descHi: "मिस्त्री, बढ़ई या हेल्पर का मोबाइल नंबर और दिहाड़ी दर",
    href: "/workforce",
    icon: Users,
    colorClass: "bg-purple-500 text-white",
    badgeEn: "Staff",
    badgeHi: "मजदूर",
    keywords: ["worker", "labor", "workforce", "aadhaar", "mason", "mistri", "helper", "wage", "dihaadi"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"],
  },
  {
    id: "parties",
    titleEn: "Add Vendor or Contractor",
    titleHi: "नया वेंडर या ठेकेदार जोड़ें",
    descEn: "Save supplier GSTIN, bank details & phone number",
    descHi: "फर्म का नाम, जीएसटी नंबर और बैंक खाता दर्ज करें",
    href: "/parties",
    icon: Building2,
    colorClass: "bg-cyan-500 text-white",
    badgeEn: "Parties",
    badgeHi: "पार्टी",
    keywords: ["vendor", "contractor", "party", "supplier", "thekedar", "gstin", "phone", "firm"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "FINANCE_CONTROLLER"],
  },
  {
    id: "chat",
    titleEn: "Send Site Message / Photo",
    titleHi: "साइट पर मैसेज या फोटो भेजें",
    descEn: "Instantly chat with project manager, supervisor or team",
    descHi: "साइट की ताज़ा स्थिति या समस्या टीम के साथ साझा करें",
    href: "/chat",
    icon: MessageSquare,
    colorClass: "bg-rose-500 text-white",
    badgeEn: "Chat",
    badgeHi: "संदेश",
    keywords: ["chat", "message", "photo", "sandesh", "batcheet", "supervisor", "site team", "alert"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "WORKER", "FINANCE_CONTROLLER"],
  },
  {
    id: "projects",
    titleEn: "View Projects & Sites",
    titleHi: "प्रोजेक्ट्स और निर्माण साइट्स",
    descEn: "Check project progress, remaining budget, and health",
    descHi: "काम की प्रगति और साइट का बजट देखें",
    href: "/projects",
    icon: FolderKanban,
    colorClass: "bg-orange-500 text-white",
    badgeEn: "Projects",
    badgeHi: "प्रोजेक्ट्स",
    keywords: ["project", "site", "budget", "progress", "building", "kam"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "FINANCE_CONTROLLER"],
  },
  {
    id: "reports",
    titleEn: "Download Excel Reports",
    titleHi: "एक्सेल रिपोर्ट डाउनलोड करें",
    descEn: "Export CA-ready financial statements & muster rolls",
    descHi: "सीए और मालिक को भेजने लायक हिसाब की शीट निकालें",
    href: "/reports",
    icon: FileText,
    colorClass: "bg-violet-500 text-white",
    badgeEn: "Excel",
    badgeHi: "रिपोर्ट",
    keywords: ["report", "excel", "csv", "audit", "statement", "muster roll", "download"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "FINANCE_CONTROLLER"],
  },
  {
    id: "settings",
    titleEn: "Change Password / Settings",
    titleHi: "पासवर्ड व सेटिंग्स बदलें",
    descEn: "Update account password, language, and security",
    descHi: "अपना लॉगिन पासवर्ड और भाषा बदलें",
    href: "/settings",
    icon: Settings,
    colorClass: "bg-slate-700 text-white",
    badgeEn: "Account",
    badgeHi: "खाता",
    keywords: ["settings", "password", "language", "bhasha", "security", "profile"],
    roles: ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "WORKER", "FINANCE_CONTROLLER"],
  },
];

interface QuickActionLauncherProps {
  currentUser?: any;
}

export default function QuickActionLauncher({ currentUser }: QuickActionLauncherProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isHi = language === "hi";

  const userRole = currentUser?.role || "SITE_SUPERVISOR";

  // Filter actions allowed for current role
  const availableActions = QUICK_ACTIONS.filter((act) => {
    if (!act.roles) return true;
    return act.roles.includes(userRole);
  });

  // Filter by user search query
  const filteredActions = availableActions.filter((act) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      act.titleEn.toLowerCase().includes(q) ||
      act.titleHi.toLowerCase().includes(q) ||
      act.descEn.toLowerCase().includes(q) ||
      act.descHi.toLowerCase().includes(q) ||
      act.keywords.some((k) => k.toLowerCase().includes(q))
    );
  });

  // Keyboard shortcut listener: Alt+Q or Ctrl+K opens quick actions, and custom event listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.key.toLowerCase() === "q") || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    const handleCustomOpen = () => {
      setIsOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("openQuickActionLauncher", handleCustomOpen);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("openQuickActionLauncher", handleCustomOpen);
    };
  }, [isOpen]);

  // Autofocus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleSelectAction = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  return (
    <>
      {/* Floating Action Button (FAB) at bottom-right */}
      <div className="fixed bottom-20 lg:bottom-6 right-5 z-40 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-full shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer border border-amber-300/40"
          title={isHi ? "त्वरित कार्य (Alt + Q)" : "Quick Actions (Alt + Q)"}
        >
          {/* Subtle pulse ring */}
          <span className="absolute -inset-1 rounded-full bg-amber-400/30 animate-pulse pointer-events-none" />
          <Zap className="w-5 h-5 fill-slate-950 stroke-slate-950 animate-bounce" />
          <span className="text-xs sm:text-sm tracking-wide">
            {isHi ? "त्वरित कार्य" : "Quick Action"}
          </span>
          <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] font-mono bg-slate-950/20 rounded text-slate-900 border border-slate-950/30">
            Alt+Q
          </kbd>
        </button>
      </div>

      {/* Quick Action Modal Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header & Search */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 border-b border-slate-800">
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-sm">
                    <Zap className="w-5 h-5 fill-slate-950 stroke-slate-950" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{isHi ? "त्वरित कार्य मेन्यू" : "Quick Action Launcher"}</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                        1-Click
                      </span>
                    </h2>
                    <p className="text-xs text-slate-400">
                      {isHi
                        ? "किसी भी काम पर क्लिक करें, तुरंत वह पेज खुल जाएगा"
                        : "Click any task below to jump straight to it"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Instant Search Bar */}
              <div className="relative mt-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    isHi
                      ? "खोजें... जैसे हाजिरी, सीमेंट, खर्च, बिल, मजदूर, नाप"
                      : "Type what you want to do... e.g. Attendance, Cement, Cash, Payment"
                  }
                  className="w-full bg-slate-800/90 text-white placeholder-slate-400 text-xs sm:text-sm pl-10 pr-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Action Cards Grid */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2 bg-slate-50/50">
              {filteredActions.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  <p className="font-semibold">
                    {isHi ? "कोई परिणाम नहीं मिला" : "No matching action found"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {isHi
                      ? "कृपया दूसरा शब्द लिखकर खोजें (जैसे 'हाजिरी', 'सीमेंट', 'खर्च')"
                      : "Try searching with different keywords like 'Attendance', 'Cash', 'Material'"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredActions.map((act) => {
                    const Icon = act.icon;
                    return (
                      <button
                        key={act.id}
                        type="button"
                        onClick={() => handleSelectAction(act.href)}
                        className="group flex items-start gap-3 p-3 sm:p-3.5 bg-white hover:bg-amber-50/50 rounded-xl border border-slate-200 hover:border-amber-400 transition-all shadow-xs hover:shadow-md text-left cursor-pointer"
                      >
                        <div
                          className={`w-10 h-10 rounded-xl ${act.colorClass} flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-amber-700 truncate">
                              {isHi ? act.titleHi : act.titleEn}
                            </h3>
                            {act.badgeEn && (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                                {isHi ? act.badgeHi : act.badgeEn}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 group-hover:text-slate-700 line-clamp-2 mt-0.5 leading-snug">
                            {isHi ? act.descHi : act.descEn}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 shrink-0 self-center transition-transform group-hover:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer with Helpful Tips */}
            <div className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  {isHi
                    ? "टिप: कीबोर्ड पर Alt+Q दबाकर यह मेन्यू कभी भी खोलें"
                    : "Tip: Press Alt+Q anywhere to launch this menu instantly"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition"
              >
                {isHi ? "बंद करें (Esc)" : "Close (Esc)"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
