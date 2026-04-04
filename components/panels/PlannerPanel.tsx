"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { Send, Loader2, Plus, Trash2, MessageSquare } from "lucide-react";

interface Message { role: "user" | "assistant"; content: string; timestamp: string }
interface Chat { id: string; title: string; created_at: string; updated_at: string; messages?: Message[] }

export default function PlannerPanel({ agentId }: { agentId: string }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { loadChats(); }, []);
  useEffect(() => { if (currentChatId) loadChat(currentChatId); else setMessages([]); }, [currentChatId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadChats = async () => {
    setLoadingChats(true);
    try {
      const r = await fetch("/api/llm/chats"); if (r.ok) { const d = await r.json(); setChats(d.chats || []); if (d.chats?.length > 0 && !currentChatId) setCurrentChatId(d.chats[0].id); }
    } catch {} finally { setLoadingChats(false); }
  };

  const loadChat = async (id: string) => {
    setLoadingMsgs(true); setMessages([]);
    try { const r = await fetch(`/api/llm/chats/${id}`); if (r.ok) { const d = await r.json(); setMessages(d.chat?.messages || []); } }
    catch {} finally { setLoadingMsgs(false); }
  };

  const createChat = async () => {
    try {
      const r = await fetch("/api/llm/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "New Chat" }) });
      if (r.ok) { const d = await r.json(); setChats(prev => [d.chat, ...prev]); setCurrentChatId(d.chat.id); setMessages([]); setInput(""); }
    } catch {}
  };

  const deleteChat = async (id: string) => {
    try {
      const r = await fetch(`/api/llm/chats/${id}`, { method: "DELETE" });
      if (r.ok) { setChats(prev => prev.filter(c => c.id !== id)); if (currentChatId === id) { setCurrentChatId(null); setMessages([]); } }
    } catch {}
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    let chatId = currentChatId;
    if (!chatId) {
      const r = await fetch("/api/llm/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: input.slice(0, 50) }) });
      if (r.ok) { const d = await r.json(); chatId = d.chat.id; setCurrentChatId(chatId); setChats(prev => [d.chat, ...prev]); }
    }
    const userMsg: Message = { role: "user", content: input, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]); setInput(""); setLoading(true);
    try {
      const r = await fetch("/api/llm/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input, history: messages.slice(-10), agentId, chatId }) });
      if (!r.ok) throw new Error();
      const d = await r.json();
      const assistantMsg: Message = { role: "assistant", content: d.message || d.content || d.response || "Sorry, I couldn't respond.", timestamp: new Date().toISOString() };
      const updated = [...messages, userMsg, assistantMsg]; setMessages(updated);
      if (chatId) {
        await fetch(`/api/llm/chats/${chatId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: updated }) });
        const chat = chats.find(c => c.id === chatId);
        if (chat && (chat.title === "New Chat" || !chat.title)) {
          const title = input.substring(0, 50);
          await fetch(`/api/llm/chats/${chatId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
          setChats(prev => prev.map(c => c.id === chatId ? { ...c, title } : c));
        }
      }
    } catch { setMessages(prev => [...prev, { role: "assistant", content: "Sorry, something went wrong.", timestamp: new Date().toISOString() }]); }
    finally { setLoading(false); }
  };

  const formatContent = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h3 key={i} className="text-base font-semibold mt-3 mb-1">{line.replace("## ", "")}</h3>;
      if (line.startsWith("### ")) return <h4 key={i} className="text-sm font-semibold mt-2 mb-1">{line.replace("### ", "")}</h4>;
      if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 list-disc text-sm">{line.replace(/^[-*] /, "")}</li>;
      if (line.match(/^\d+\. /)) return <li key={i} className="ml-4 list-decimal text-sm">{line.replace(/^\d+\. /, "")}</li>;
      if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="font-semibold text-sm">{line.replace(/\*\*/g, "")}</p>;
      if (!line.trim()) return <br key={i} />;
      return <p key={i} className="text-sm">{line}</p>;
    });
  };

  return (
    <div className="flex h-full">
      {/* Chat list */}
      <div className="w-56 border-r border-gray-100 bg-gray-50/50 flex-col shrink-0 hidden md:flex">
        <div className="p-3 border-b border-gray-100">
          <button onClick={createChat} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800">
            <Plus className="w-4 h-4" />New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {loadingChats ? (
            <div className="text-center py-8 text-gray-400 text-xs">Loading...</div>
          ) : chats.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">No chats yet</div>
          ) : chats.map(c => (
            <div key={c.id} onClick={() => setCurrentChatId(c.id)}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition ${currentChatId === c.id ? "bg-white shadow-sm" : "hover:bg-white/50"}`}>
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-sm text-gray-700 truncate">{c.title || "Untitled"}</span>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteChat(c.id); }} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition"><Trash2 className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        {!currentChatId && !loadingChats ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm mb-4">Start a conversation with the meeting planner</p>
              <button onClick={createChat} className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-medium hover:bg-gray-800">New Chat</button>
            </div>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingMsgs ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="text-center py-16 text-gray-400 text-sm">Send a message to start planning</div>
              ) : (
                <div className="max-w-3xl mx-auto space-y-4">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === "user" ? "bg-black text-white" : "bg-gray-100 text-gray-800"}`}>
                        {msg.role === "user" ? <p className="text-sm whitespace-pre-wrap">{msg.content}</p> : <div className="prose-sm">{formatContent(msg.content)}</div>}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-2xl px-4 py-3 flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                        <span className="text-sm text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={endRef} />
                </div>
              )}
            </div>
            {/* Input */}
            <form onSubmit={sendMessage} className="border-t border-gray-100 px-6 py-4">
              <div className="max-w-3xl mx-auto flex gap-3">
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} rows={1}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
                  placeholder="Ask about meetings, schedules, or plans..."
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-black/5" />
                <button type="submit" disabled={!input.trim() || loading}
                  className="shrink-0 w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center hover:bg-gray-800 disabled:opacity-40 self-end">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
