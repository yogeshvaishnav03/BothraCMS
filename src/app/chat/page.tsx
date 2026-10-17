"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Shell from "@/components/layout/Shell";
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
} from "lucide-react";

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
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
  otherUser?: { id: string; name: string; email: string; role: string } | null;
  participantsCount: number;
  participants: Array<{ id: string; name: string; email: string; role: string }>;
  latestMessage?: {
    id: string;
    content: string;
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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";

  // Scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load User, Conversations, and Employees
  const loadChatData = useCallback(async () => {
    try {
      const [userRes, convRes, empRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => r.json()),
        fetch("/api/chat/conversations").then((r) => r.json()),
        fetch("/api/chat/employees").then((r) => r.json()),
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

  // Load Messages for Active Conversation
  const loadMessages = useCallback(async (convId: string, background = false) => {
    if (!background) setMessagesLoading(true);
    try {
      const res = await fetch(`/api/chat/conversations/${convId}/messages`);
      const json = await res.json();
      if (json.success && json.data) {
        setMessages(json.data.messages || []);
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

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

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
      const res = await fetch("/api/chat/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      const json = await res.json();
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

  // Send a message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeConversationId || !messageInput.trim() || sending) return;

    const content = messageInput.trim();
    setMessageInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/chat/conversations/${activeConversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      if (json.success && json.data?.message) {
        setMessages((prev) => [...prev, json.data.message]);
        scrollToBottom();
        // Refresh conversations list to update latestMessage
        fetch("/api/chat/conversations")
          .then((r) => r.json())
          .then((r) => {
            if (r.success) setConversations(r.data.conversations || []);
          });
      } else {
        alert(json.error?.message || "Failed to send message");
        setMessageInput(content); // restore on failure
      }
    } catch (err) {
      console.error("Error sending message:", err);
      setMessageInput(content);
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
      const res = await fetch("/api/chat/conversations/group", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupName.trim(),
          description: groupDescription.trim() || undefined,
          memberIds: selectedMemberIds,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[620px] max-h-[750px]">
          {/* Left Column: Conversations & Employees Directory (5 cols) */}
          <div className="md:col-span-4 border-r border-slate-200 flex flex-col h-full bg-slate-50/50">
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

                      <button
                        onClick={() => handleStartDirectChat(emp.id)}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-lg text-xs transition shrink-0 flex items-center gap-1"
                        title={`Chat with ${emp.name || "Employee"}`}
                      >
                        <MessageSquare className="w-3 h-3" />
                        <span>Chat</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Chat Messages Window (7 cols) */}
          <div className="md:col-span-8 flex flex-col h-full bg-white">
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
                    <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-sm">
                          {activeConversation.type === "GROUP" ? (
                            <Users className="w-5 h-5 text-amber-400" />
                          ) : (
                            activeInitials
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="font-black text-sm text-slate-900">
                              {activeChatName}
                            </h2>
                            {activeConversation.type === "DIRECT" ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold flex items-center gap-1">
                                <User className="w-2.5 h-2.5" />
                                <span>1-on-1 Direct Chat</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-bold flex items-center gap-1">
                                <Users className="w-2.5 h-2.5" />
                                <span>Super Admin Group ({activeConversation.participantsCount || activeConversation.participants?.length || 0} members)</span>
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                            {activeConversation.type === "DIRECT" && activeConversation.otherUser ? (
                              <>
                                <span className="font-semibold text-slate-700">
                                  {activeConversation.otherUser.role || "USER"}
                                </span>
                                <span>&bull;</span>
                                <span>{activeConversation.otherUser.email || ""}</span>
                              </>
                            ) : (
                              <span>
                                {activeConversation.description || "Custom channel created by Super Admin"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => loadMessages(activeConversationId)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                          title="Refresh messages"
                        >
                          <RefreshCw className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Messages Body */}
                    <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50/50">
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
                            Say hello to start the conversation! Messages are saved authoritatively in the platform database.
                          </div>
                        </div>
                      ) : (
                        messages.map((m) => {
                          const senderName = m.sender?.name || "User";
                          const senderRole = m.sender?.role || "";
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
                                className={`max-w-md p-3 rounded-2xl text-xs leading-relaxed shadow-2xs whitespace-pre-wrap ${
                                  m.isMine
                                    ? "bg-slate-900 text-white rounded-tr-none"
                                    : "bg-white text-slate-900 border border-slate-200 rounded-tl-none"
                                }`}
                              >
                                {m.content}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Message Input Box */}
                    <form
                      onSubmit={handleSendMessage}
                      className="p-3 border-t border-slate-200 bg-white flex items-center gap-2"
                    >
                      <input
                        type="text"
                        placeholder={t("chat.typeMessage", "Type your message... (Press Enter to send)")}
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                        disabled={sending}
                      />
                      <button
                        type="submit"
                        disabled={sending || !messageInput.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs transition disabled:opacity-50 shadow-sm shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{sending ? "..." : t("chat.send", "Send")}</span>
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          onClick={() => setShowCreateGroupModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
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

            <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
              {groupError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{groupError}</span>
                </div>
              )}

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
    </Shell>
  );
}
