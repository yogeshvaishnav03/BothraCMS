"use client";
/* eslint-disable @next/next/no-img-element */

import { Alert } from "@/components/ui/Alert";
import React, { useState, useEffect, useRef, useCallback } from "react";
import Shell from "@/components/layout/Shell";
import { ContactActions, WhatsAppIcon } from "@/components/ui/ContactActions";
import { whatsappLink } from "@/lib/contact-links";
import { formatDateTime } from "@/lib/formatters";
import { useLanguage } from "@/lib/i18n";
import {
  MessageSquare,
  Users,
  User,
  Plus,
  Send,
  Search,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Clock,
  X,
  Sparkles,
  RefreshCw,
  Hash,
  AlertCircle,
  HardHat,
  Building,
  Check,
  Image as ImageIcon,
  ChevronDown,
  Download,
  Eye,
  ArrowLeft,
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  jobTitle?: string | null;
  lastLoginAt?: string | null;
  isCurrentUser: boolean;
  existingConversationId?: string | null;
}

interface ConversationItem {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string;
  description?: string | null;
  createdById: string;
  creator?: { id: string; name: string; role: string } | null;
  createdAt: string;
  updatedAt: string;
  otherUser?: { id: string; name: string; email: string; role: string; phone?: string | null } | null;
  participantsCount: number;
  participants: Array<{ id: string; name: string; email: string; role: string }>;
  latestMessage?: {
    id: string;
    content: string;
    imageUrl?: string | null;
    createdAt: string;
    senderId: string;
    senderName: string;
  } | null;
  unreadCount: number;
}

interface MessageItem {
  id: string;
  conversationId: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string;
  senderId: string;
  isMine: boolean;
  sender: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

// Safely fetch and parse JSON, never throwing SyntaxError on HTML (e.g. 500 error pages)
async function safeFetchJson(url: string, init?: RequestInit): Promise<any> {
  try {
    const res = await fetch(url, init);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return await res.json();
    }
    return {
      success: false,
      error: { message: `Server error (${res.status} ${res.statusText || "Error"})` },
    };
  } catch (err: any) {
    return { success: false, error: { message: err?.message || "Network request failed" } };
  }
}

// Client-side image compression to base64 Data URL (used as resilient fallback if storage provider fails)
function compressImageToDataUrl(file: File, maxDimension = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) return resolve("");

      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        try {
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", quality));
            return;
          }
        } catch {
          // Fallback to original read result if canvas processing errors
        }
        resolve(result);
      };
      img.onerror = () => resolve(result);
      img.src = result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const { t } = useLanguage();

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<any | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messageInput, setMessageInput] = useState("");

  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"conversations" | "employees">("conversations");

  // Create Group Modal (Super Admin only)
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Image Sharing & Fullscreen Modal State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const isScrolledUpRef = useRef<boolean>(false);
  const prevMessagesCountRef = useRef<number>(0);
  const prevActiveConvIdRef = useRef<string | null>(null);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // Dedicated container scroll-to-bottom (does NOT scroll whole page window)
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
      setShowScrollBottomBtn(false);
      isScrolledUpRef.current = false;
    }
  }, []);

  // Monitor scroll in messages window to detect if user is reading older messages
  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const scrolledUp = distanceFromBottom > 90;
    isScrolledUpRef.current = scrolledUp;
    setShowScrollBottomBtn(scrolledUp);
  }, []);

  // Handle image selection from file picker
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file (JPEG, PNG, WebP).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size exceeds 5MB limit. Please select a smaller photo.");
      return;
    }

    setSelectedImage(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreviewUrl(previewUrl);
  };

  // Clear selected image
  const handleClearImage = () => {
    if (imagePreviewUrl) {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImage(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Load User, Conversations, and Employees
  const loadChatData = useCallback(async () => {
    try {
      const [userRes, convRes, empRes] = await Promise.all([
        safeFetchJson("/api/auth/me"),
        safeFetchJson("/api/chat/conversations"),
        safeFetchJson("/api/chat/employees"),
      ]);

      if (userRes.success && userRes.data) {
        setCurrentUser(userRes.data.user);
      }
      if (convRes.success && convRes.data) {
        setConversations(convRes.data.conversations || []);
      }
      if (empRes.success && empRes.data) {
        setEmployees(empRes.data.employees || []);
      }
    } catch (err) {
      console.error("Failed to load chat references:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChatData();
  }, [loadChatData]);

  // Deep link from anywhere in the CMS: /chat?with=<userId> opens that person's chat.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || loading || typeof window === "undefined") return;
    const target = new URLSearchParams(window.location.search).get("with");
    if (!target) return;
    deepLinkHandledRef.current = true;
    window.history.replaceState(null, "", "/chat");
    handleStartDirectChat(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // Load Messages for Active Conversation
  const loadMessages = useCallback(async (convId: string, background = false) => {
    if (!background) setMessagesLoading(true);
    try {
      const json = await safeFetchJson(`/api/chat/conversations/${convId}/messages`);
      if (json.success && json.data) {
        setMessages((prev) => {
          const incoming: MessageItem[] = json.data.messages || [];
          if (
            prev.length === incoming.length &&
            prev[prev.length - 1]?.id === incoming[incoming.length - 1]?.id
          ) {
            return prev;
          }
          return incoming;
        });
        setActiveConversation(json.data.conversation || null);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("refreshNotifications"));
        }
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      if (!background) setMessagesLoading(false);
    }
  }, []);

  // Set active conversation and fetch its messages
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  // Smart auto-scroll: only scrolls to bottom if conversation changed or user is at bottom
  useEffect(() => {
    if (messages.length === 0) return;

    const isDifferentConv = prevActiveConvIdRef.current !== activeConversationId;
    const hasNewMessages = messages.length > prevMessagesCountRef.current;

    prevMessagesCountRef.current = messages.length;
    prevActiveConvIdRef.current = activeConversationId;

    if (isDifferentConv) {
      setTimeout(() => scrollToBottom(false), 50);
    } else if (hasNewMessages && !isScrolledUpRef.current) {
      setTimeout(() => scrollToBottom(true), 50);
    }
  }, [messages, activeConversationId, scrollToBottom]);

  // Auto-poll messages every 4 seconds for active conversation
  useEffect(() => {
    if (!activeConversationId) return;
    const interval = setInterval(() => {
      loadMessages(activeConversationId, true);
    }, 4000);
    return () => clearInterval(interval);
  }, [activeConversationId, loadMessages]);

  // Start or open a direct 1-to-1 conversation with an employee
  const handleStartDirectChat = async (targetUserId: string) => {
    try {
      const json = await safeFetchJson("/api/chat/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (json.success && json.data?.conversation) {
        const convId = json.data.conversation.id;
        setActiveConversationId(convId);
        setActiveTab("conversations");
        await loadChatData();
      } else {
        alert(json.error?.message || "Failed to start direct conversation");
      }
    } catch (err) {
      console.error("Error starting direct chat:", err);
      alert("Network error starting direct chat");
    }
  };

  // Send a message (with optional image attachment)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeConversationId || sending) return;

    const content = messageInput.trim();
    if (!content && !selectedImage) return;

    setSending(true);

    try {
      let uploadedImageUrl: string | null = null;

      // 1. Upload photo if selected
      if (selectedImage) {
        // Pre-compress image to clean data URL as primary reliable payload
        let localDataUrl: string | null = null;
        try {
          localDataUrl = await compressImageToDataUrl(selectedImage, 1200, 0.8);
        } catch (compressErr) {
          console.warn("Failed to compress image:", compressErr);
        }

        try {
          const formData = new FormData();
          formData.append("file", selectedImage);
          formData.append("category", "PHOTO");
          formData.append("entityType", "CHAT");
          formData.append("entityId", activeConversationId);

          const uploadRes = await fetch("/api/uploads", {
            method: "POST",
            body: formData,
          });

          const ct = uploadRes.headers.get("content-type") || "";
          if (uploadRes.ok && ct.includes("application/json")) {
            const uploadJson = await uploadRes.json();
            // If storage provider returned an external cloud URL (S3/R2 CDN), use it;
            // otherwise use localDataUrl because local storage on serverless does not persist across instances
            if (
              uploadJson.success &&
              uploadJson.data?.url &&
              (uploadJson.data.url.startsWith("http://") || uploadJson.data.url.startsWith("https://"))
            ) {
              uploadedImageUrl = uploadJson.data.url;
            }
          }
        } catch (uploadErr) {
          console.warn("Storage upload failed, falling back to data URL:", uploadErr);
        }

        // Resilient fallback: Use compressed base64 if no external cloud CDN URL
        if (!uploadedImageUrl) {
          uploadedImageUrl = localDataUrl;
        }

        if (!uploadedImageUrl && !content) {
          throw new Error("Unable to attach image. Please try again with another photo.");
        }
      }

      // 2. Post message with content and optional imageUrl
      const json = await safeFetchJson(`/api/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: content || (uploadedImageUrl ? "[Photo]" : ""),
          imageUrl: uploadedImageUrl,
        }),
      });

      if (json.success && json.data?.message) {
        setMessages((prev) => [...prev, json.data.message]);
        setMessageInput("");
        handleClearImage();
        setTimeout(() => scrollToBottom(true), 50);

        // Refresh conversations list to update latestMessage
        safeFetchJson("/api/chat/conversations").then((r) => {
          if (r.success) setConversations(r.data.conversations || []);
        });
      } else {
        alert(json.error?.message || "Failed to send message");
      }
    } catch (err: any) {
      console.error("Error sending message:", err);
      alert(err.message || "Failed to send message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Create a new group (Super Admin only)
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      alert("Only Super Admin can create chat groups.");
      return;
    }
    if (!groupName.trim()) {
      setGroupError("Please enter a group name.");
      return;
    }
    if (selectedMemberIds.length === 0) {
      setGroupError("Please select at least one employee to add to the group.");
      return;
    }

    setCreatingGroup(true);
    setGroupError(null);

    try {
      const json = await safeFetchJson("/api/chat/conversations/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          memberIds: selectedMemberIds,
        }),
      });

      if (json.success) {
        setShowCreateGroupModal(false);
        setGroupName("");
        setGroupDescription("");
        setSelectedMemberIds([]);
        await loadChatData();
        if (json.data?.group?.id) {
          setActiveConversationId(json.data.group.id);
        }
      } else {
        setGroupError(json.error?.message || "Failed to create group.");
      }
    } catch (err: any) {
      setGroupError(err.message || "Network error creating group.");
    } finally {
      setCreatingGroup(false);
    }
  };

  // Toggle member selection for group creation
  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const selectAllEmployees = () => {
    const allIds = employees.filter((e) => !e.isCurrentUser).map((e) => e.id);
    setSelectedMemberIds(allIds);
  };

  const clearAllEmployees = () => {
    setSelectedMemberIds([]);
  };

  const filteredConversations = conversations.filter((c) => {
    const q = search.toLowerCase();
    const cName = c.name || c.otherUser?.name || "";
    if (c.type === "GROUP") {
      return cName.toLowerCase().includes(q);
    }
    return (
      cName.toLowerCase().includes(q) ||
      Boolean(c.otherUser && c.otherUser.role?.toLowerCase().includes(q))
    );
  });

  const directConversations = filteredConversations.filter((c) => c.type === "DIRECT");
  const groupConversations = filteredConversations.filter((c) => c.type === "GROUP");

  const filteredEmployees = employees.filter((e) => {
    const q = search.toLowerCase();
    return (
      !e.isCurrentUser &&
      (e.name.toLowerCase().includes(q) ||
        e.email.toLowerCase().includes(q) ||
        e.role.toLowerCase().includes(q))
    );
  });

  return (
    <Shell>
      <div className="space-y-4">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center font-bold shadow-xs">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">
                  {t("chat.title", "Team Messages & Employee Chat")}
                </h1>
                {isSuperAdmin && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black uppercase flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" />
                    <span>Super Admin</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  "chat.subtitle",
                  "Direct 1-on-1 employee communication. Groups are created exclusively by Super Admin upon request."
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {/* Super Admin Group Creation Button */}
            {isSuperAdmin ? (
              <button
                onClick={() => {
                  setGroupError(null);
                  setSelectedMemberIds([]);
                  setShowCreateGroupModal(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-sm transition transform active:scale-98"
                title="Super Admin Privilege: Create a custom team chat group"
              >
                <Plus className="w-4 h-4" />
                <span>{t("chat.newGroup", "Create Group (Super Admin)")}</span>
              </button>
            ) : (
              <div className="text-[11px] text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                <span>1-on-1 Direct Chats Only</span>
              </div>
            )}

            <button
              onClick={() => loadChatData()}
              className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl transition"
              title="Refresh messages"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Chat Interface */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col md:grid md:grid-cols-12 h-[calc(100vh-12.5rem)] min-h-[580px] max-h-[820px]">
          {/* Left Column: Conversations & Employees Directory (4 cols on desktop) */}
          <div
            className={`border-r border-slate-200 flex flex-col h-full min-h-0 bg-slate-50/50 overflow-hidden ${
              activeConversationId ? "hidden md:flex md:col-span-4" : "flex md:col-span-4"
            }`}
          >
            {/* Search & Switch Tabs */}
            <div className="p-3 border-b border-slate-200 bg-white space-y-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder={
                    activeTab === "conversations"
                      ? "Search chats..."
                      : "Search employees by name or role..."
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none bg-slate-50"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              </div>

              {/* Navigation Tabs */}
              <div className="grid grid-cols-2 gap-1 p-0.5 bg-slate-100 rounded-lg text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => setActiveTab("conversations")}
                  className={`py-1.5 rounded-md transition ${
                    activeTab === "conversations"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  {t("chat.directChats", "Active Chats")} ({conversations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("employees")}
                  className={`py-1.5 rounded-md transition flex items-center justify-center gap-1 ${
                    activeTab === "employees"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  <Users className="w-3 h-3 text-amber-500" />
                  <span>{t("chat.allEmployees", "Directory")} ({Math.max(0, employees.filter((e) => !e.isCurrentUser).length)})</span>
                </button>
              </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loading ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading conversations...</span>
                </div>
              ) : activeTab === "conversations" ? (
                /* ACTIVE CONVERSATIONS TAB */
                <div className="space-y-3 p-2">
                  {/* Direct Chats Sub-section */}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center justify-between">
                      <span>1-on-1 Employee Chats</span>
                      <span className="font-mono">{directConversations.length}</span>
                    </div>

                    {directConversations.length === 0 ? (
                      <div className="p-4 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-100 mt-1">
                        No direct chats active. Switch to &ldquo;Directory&rdquo; to start messaging any employee.
                      </div>
                    ) : (
                      <div className="space-y-1 mt-1">
                        {directConversations.map((c) => {
                          const isActive = activeConversationId === c.id;
                          const displayName = c.name || c.otherUser?.name || "Direct Chat";
                          return (
                            <button
                              key={c.id}
                              onClick={() => setActiveConversationId(c.id)}
                              className={`w-full text-left p-2.5 rounded-xl transition flex items-start gap-2.5 ${
                                isActive
                                  ? "bg-amber-500/15 border border-amber-400/50 text-slate-950 shadow-2xs"
                                  : "hover:bg-white border border-transparent text-slate-800"
                              }`}
                            >
                              <div className="w-9 h-9 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                {(displayName || "DC").slice(0, 2).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-xs truncate text-slate-900">
                                    {displayName}
                                  </span>
                                  {c.latestMessage && (
                                    <span className="text-[10px] text-slate-400 whitespace-nowrap ml-1 font-mono">
                                      {new Date(c.latestMessage.createdAt).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  {c.otherUser?.role && (
                                    <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-200 text-slate-700 font-semibold">
                                      {c.otherUser.role}
                                    </span>
                                  )}
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {c.latestMessage?.content || "Click to start chatting..."}
                                  </p>
                                </div>
                              </div>
                              {c.unreadCount > 0 && (
                                <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0">
                                  {c.unreadCount}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Groups Sub-section (Only visible if groups exist or super admin) */}
                  {(groupConversations.length > 0 || isSuperAdmin) && (
                    <div className="pt-2 border-t border-slate-200">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>Super Admin Custom Groups</span>
                        </span>
                        <span className="font-mono">{groupConversations.length}</span>
                      </div>

                      {groupConversations.length === 0 ? (
                        <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] text-slate-500 text-center mt-1">
                          No groups created yet. Super Admin can click &ldquo;+ Create Group&rdquo; above when needed.
                        </div>
                      ) : (
                        <div className="space-y-1 mt-1">
                          {groupConversations.map((g) => {
                            const isActive = activeConversationId === g.id;
                            return (
                              <button
                                key={g.id}
                                onClick={() => setActiveConversationId(g.id)}
                                className={`w-full text-left p-2.5 rounded-xl transition flex items-start gap-2.5 ${
                                  isActive
                                    ? "bg-slate-900 text-white shadow-2xs"
                                    : "hover:bg-white border border-transparent text-slate-800"
                                }`}
                              >
                                <div
                                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                                    isActive ? "bg-amber-400 text-slate-950" : "bg-slate-200 text-slate-800"
                                  }`}
                                >
                                  <Users className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span
                                      className={`font-bold text-xs truncate ${
                                        isActive ? "text-white" : "text-slate-900"
                                      }`}
                                    >
                                      {g.name || "Group Chat"}
                                    </span>
                                    <span
                                      className={`text-[10px] font-mono px-1 py-0.2 rounded ${
                                        isActive ? "bg-slate-800 text-amber-300" : "bg-slate-200 text-slate-600"
                                      }`}
                                    >
                                      {g.participantsCount} members
                                    </span>
                                  </div>
                                  <p
                                    className={`text-[11px] truncate mt-0.5 ${
                                      isActive ? "text-slate-300" : "text-slate-500"
                                    }`}
                                  >
                                    {g.latestMessage?.content || g.description || "Group channel"}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* ALL EMPLOYEES DIRECTORY TAB */
                <div className="p-2 space-y-1.5">
                  <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900">
                    💡 Click on any employee to instantly start or resume a private 1-on-1 direct chat.
                  </div>

                  {filteredEmployees.map((emp) => (
                    <div
                      key={emp.id}
                      className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0">
                          {(emp.name || "User").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 truncate">{emp.name || "Unnamed Employee"}</div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                            <span className="font-mono bg-slate-100 text-slate-700 px-1 py-0.2 rounded font-semibold">
                              {emp.role}
                            </span>
                            <span className="truncate">{emp.email}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {whatsappLink(emp.phone) && (
                          <a
                            href={whatsappLink(emp.phone, `Namaste ${emp.name},`) || undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-500 hover:text-white transition"
                            title={`WhatsApp ${emp.name}`}
                            aria-label={`WhatsApp ${emp.name}`}
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleStartDirectChat(emp.id)}
                          className="px-2.5 py-1.5 bg-gradient-brand text-slate-950 font-bold rounded-lg text-xs transition shrink-0 flex items-center gap-1 hover:brightness-110"
                          title={`Chat with ${emp.name || "Employee"}`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Chat</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Chat Messages Window (8 cols on desktop) */}
          <div
            className={`flex flex-col h-full min-h-0 bg-white overflow-hidden relative ${
              !activeConversationId ? "hidden md:flex md:col-span-8" : "flex md:col-span-8"
            }`}
          >
            {activeConversationId && activeConversation ? (
              (() => {
                const activeChatName =
                  activeConversation.type === "GROUP"
                    ? activeConversation.name || "Group Chat"
                    : activeConversation.otherUser?.name || activeConversation.name || "Direct Chat";
                const activeInitials = (activeChatName || "DC").slice(0, 2).toUpperCase();

                return (
                  <>
                    {/* Chat Top Banner */}
                    <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Mobile Back Button to Return to Conversations */}
                        <button
                          type="button"
                          onClick={() => setActiveConversationId(null)}
                          className="md:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition shrink-0"
                          title="Back to chats"
                        >
                          <ArrowLeft className="w-4 h-4" />
                        </button>
                        <div className="w-10 h-10 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
                          {activeConversation.type === "GROUP" ? (
                            <Users className="w-5 h-5 text-amber-400" />
                          ) : (
                            activeInitials
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h2 className="font-black text-sm text-slate-900 truncate">
                              {activeChatName}
                            </h2>
                            {activeConversation.type === "DIRECT" ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1 shrink-0">
                                <User className="w-2.5 h-2.5" />
                                <span>1-on-1 Direct Chat</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-bold flex items-center gap-1 shrink-0">
                                <Users className="w-2.5 h-2.5" />
                                <span>Super Admin Group ({activeConversation.participantsCount || activeConversation.participants?.length || 0} members)</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 truncate">
                            {activeConversation.type === "DIRECT" && activeConversation.otherUser ? (
                              <>
                                <span className="font-semibold text-slate-700">
                                  {activeConversation.otherUser.role || "USER"}
                                </span>
                                <span>&bull;</span>
                                <span className="truncate">{activeConversation.otherUser.email || ""}</span>
                              </>
                            ) : (
                              <span className="truncate">
                                {activeConversation.description || "Custom channel created by Super Admin"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {activeConversation.type === "DIRECT" && activeConversation.otherUser?.phone && (
                          <ContactActions
                            phone={activeConversation.otherUser.phone}
                            message={`Namaste ${activeConversation.otherUser.name},`}
                            className="hidden sm:flex"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => loadMessages(activeConversationId)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                          title="Refresh messages"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Messages Body (Isolated scroll container - does not expand page downwards) */}
                    <div
                      ref={messagesContainerRef}
                      onScroll={handleScroll}
                      className="flex-1 min-h-0 p-4 overflow-y-auto space-y-3 bg-slate-50/50 overscroll-contain"
                    >
                      {messagesLoading && messages.length === 0 ? (
                        <div className="py-20 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                          <span>Loading messages...</span>
                        </div>
                      ) : messages.length === 0 ? (
                        <div className="py-20 text-center max-w-sm mx-auto space-y-2">
                          <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                            <MessageSquare className="w-6 h-6" />
                          </div>
                          <div className="text-sm font-bold text-slate-800">No Messages Yet</div>
                          <div className="text-xs text-slate-500">
                            Say hello or share an inspection photo to start chatting! Messages are saved securely in the database.
                          </div>
                        </div>
                      ) : (
                        messages.map((m) => {
                          const senderName = m.sender?.name || "User";
                          const senderRole = m.sender?.role || "";
                          const hasPhoto = Boolean(m.imageUrl);
                          const hasCaption = m.content && m.content !== "[Photo]";

                          return (
                            <div
                              key={m.id}
                              className={`flex flex-col ${m.isMine ? "items-end" : "items-start"}`}
                            >
                              <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-500">
                                {!m.isMine && (
                                  <span className="font-bold text-slate-700">
                                    {senderName} {senderRole ? `(${senderRole})` : ""}
                                  </span>
                                )}
                                <span>
                                  {m.createdAt
                                    ? new Date(m.createdAt).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })
                                    : ""}
                                </span>
                              </div>

                              <div
                                className={`max-w-md p-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                                  m.isMine
                                    ? "bg-slate-900 text-white rounded-tr-none"
                                    : "bg-white text-slate-900 border border-slate-200 rounded-tl-none"
                                }`}
                              >
                                {/* Shared Photo Preview */}
                                {m.imageUrl && (
                                  <div className="relative group overflow-hidden rounded-xl bg-slate-950/10 cursor-pointer">
                                    <img
                                      src={m.imageUrl}
                                      alt="Shared in chat"
                                      onClick={() => setFullscreenImage(m.imageUrl || null)}
                                      className="max-h-72 w-auto max-w-full rounded-xl object-contain transition duration-200 group-hover:scale-101"
                                      loading="lazy"
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        const target = e.currentTarget;
                                        target.onerror = null;
                                        target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='120' viewBox='0 0 260 120'%3E%3Crect width='260' height='120' fill='%23f1f5f9' rx='10'/%3E%3Ctext x='130' y='65' text-anchor='middle' font-family='sans-serif' font-size='12' fill='%2364748b'%3E📷 Photo unavailable%3C/text%3E%3C/svg%3E";
                                      }}
                                    />
                                    <div
                                      onClick={() => setFullscreenImage(m.imageUrl || null)}
                                      className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 text-white font-bold text-xs rounded-xl"
                                    >
                                      <Eye className="w-4 h-4" />
                                      <span>Click to preview</span>
                                    </div>
                                  </div>
                                )}

                                {/* Caption or text content */}
                                {hasCaption && (
                                  <div
                                    className={`whitespace-pre-wrap break-words ${
                                      hasPhoto ? "mt-2 pt-1 border-t border-white/10 px-0.5" : "px-1"
                                    }`}
                                  >
                                    {m.content}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Floating Jump to Latest Button */}
                    {showScrollBottomBtn && (
                      <button
                        type="button"
                        onClick={() => scrollToBottom(true)}
                        className="absolute bottom-20 right-6 z-20 px-3.5 py-1.5 bg-slate-900/90 hover:bg-slate-900 text-amber-400 font-bold text-xs rounded-full shadow-lg flex items-center gap-1.5 backdrop-blur-xs transition transform hover:scale-105 active:scale-95 border border-slate-700 animate-in fade-in slide-in-from-bottom-2"
                        title="Scroll to latest messages"
                      >
                        <ChevronDown className="w-4 h-4 animate-bounce" />
                        <span>Latest messages</span>
                      </button>
                    )}

                    {/* Selected Image Preview Attachment Banner */}
                    {selectedImage && (
                      <div className="p-2.5 px-3 bg-amber-50/90 border-t border-amber-200/80 flex items-center justify-between gap-3 shrink-0 animate-in fade-in slide-in-from-bottom-1">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {imagePreviewUrl ? (
                            <img
                              src={imagePreviewUrl}
                              alt="Upload preview"
                              className="w-12 h-12 object-cover rounded-lg border border-amber-300 shadow-2xs shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-amber-200 flex items-center justify-center shrink-0">
                              <ImageIcon className="w-6 h-6 text-amber-700" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 truncate">
                              {selectedImage.name}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {(selectedImage.size / 1024).toFixed(1)} KB &bull; Photo ready to send
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearImage}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          title="Remove image"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Message Input Box */}
                    <form
                      onSubmit={handleSendMessage}
                      className="p-3 border-t border-slate-200 bg-white flex items-center gap-2 shrink-0"
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleImageSelect}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={sending}
                        className={`p-2 rounded-xl transition border shrink-0 flex items-center justify-center ${
                          selectedImage
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "text-slate-500 hover:text-amber-600 hover:bg-amber-50 border-slate-200 hover:border-amber-300"
                        } disabled:opacity-50`}
                        title="Attach image / site photo (Max 5MB)"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>

                      <input
                        type="text"
                        placeholder={
                          selectedImage
                            ? "Add an optional caption for this photo... (Press Enter to send)"
                            : t("chat.typeMessage", "Type your message... (Press Enter to send)")
                        }
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        disabled={sending}
                      />

                      <button
                        type="submit"
                        disabled={sending || (!messageInput.trim() && !selectedImage)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition disabled:opacity-50 shadow-sm shrink-0"
                      >
                        {sending ? (
                          <>
                            <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                            <span>Sending...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>{t("chat.send", "Send")}</span>
                          </>
                        )}
                      </button>
                    </form>
                  </>
                );
              })()
            ) : (
              /* No Active Conversation Selected */
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-md mb-4">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  {t("chat.selectConversation", "Select an employee to start chatting")}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                  Super Admin can chat directly 1-on-1 with every employee across the company. Group chats are not created automatically, but can be created by Super Admin upon request.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab("employees")}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition"
                  >
                    Open Employee Directory
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUPER ADMIN GROUP CREATION MODAL */}
      {showCreateGroupModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          onClick={() => setShowCreateGroupModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{t("chat.createGroupTitle", "Create Team Chat Group")}</span>
                    <span className="text-[10px] font-mono bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded uppercase">
                      Super Admin Only
                    </span>
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Groups are only created when Super Admin explicitly initiates them
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateGroupModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-5 space-y-4 flex-1 overflow-y-auto">
              {groupError && <Alert tone="error">{groupError}</Alert>}

              {/* Group Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {t("chat.groupName", "Group Name")} *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Skyline Site Engineers, Core Management"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  {t("chat.groupDescription", "Description (Optional)")}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Fast-track coordination for Tower 2 casting"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              {/* Member Selection Checklist */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    {t("chat.selectMembers", "Select Employees to Include")} * ({selectedMemberIds.length} selected)
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={selectAllEmployees}
                      className="text-amber-600 hover:underline font-bold"
                    >
                      Select All
                    </button>
                    <span>&bull;</span>
                    <button
                      type="button"
                      onClick={clearAllEmployees}
                      className="text-slate-500 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-slate-100 p-1 bg-slate-50/50">
                  {employees
                    .filter((e) => !e.isCurrentUser)
                    .map((emp) => {
                      const isChecked = selectedMemberIds.includes(emp.id);
                      return (
                        <label
                          key={emp.id}
                          className="p-2 hover:bg-white rounded-lg flex items-center justify-between cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleMemberSelection(emp.id)}
                              className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 truncate">
                                {emp.name}
                              </div>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                                <span className="font-mono bg-slate-200 px-1 rounded text-slate-700 font-semibold">
                                  {emp.role}
                                </span>
                                <span className="truncate">{emp.email}</span>
                              </div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  As Super Admin, creating this group allows all selected members to view and participate in this shared channel.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateGroupModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs shadow-md transition disabled:opacity-50"
                >
                  <Users className="w-4 h-4" />
                  <span>{creatingGroup ? "Creating Group..." : t("chat.createGroupBtn", "Create Group")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Photo Viewer Modal */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setFullscreenImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between pb-3 text-white">
              <span className="text-xs font-semibold flex items-center gap-1.5 text-slate-300">
                <ImageIcon className="w-4 h-4 text-amber-400" />
                <span>Shared Photo Preview</span>
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={fullscreenImage}
                  download="chat-photo.jpg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  title="Download / Open original full size"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setFullscreenImage(null)}
                  className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition"
                  title="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <img
              src={fullscreenImage}
              alt="Shared full photo"
              className="max-h-[80vh] w-auto max-w-full rounded-2xl object-contain shadow-2xl border border-slate-700"
            />
          </div>
        </div>
      )}
    </Shell>
  );
}
