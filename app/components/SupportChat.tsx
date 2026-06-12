"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm the Campus Macros support assistant. What can I help you with today?",
};

// Floating AI support chat for logged-in app pages. The assistant gathers
// details about the user's issue and files it with the human team — it never
// takes account actions itself.
export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [concluded, setConcluded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open && !concluded) inputRef.current?.focus();
  }, [open, concluded]);

  async function send() {
    const text = input.trim();
    if (!text || sending || concluded) return;
    setError(null);
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The greeting is client-side boilerplate; the API expects the
        // conversation to start with a user message.
        body: JSON.stringify({ messages: next.slice(1) }),
      });
      if (!res.ok) throw new Error(`support chat ${res.status}`);
      const data: { message: string; concluded: boolean } = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
      if (data.concluded) setConcluded(true);
    } catch {
      setError("Couldn't reach support right now — please try again in a moment.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setMessages([GREETING]);
    setConcluded(false);
    setError(null);
    setInput("");
  }

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 right-4 sm:right-6 z-40 w-[22rem] max-w-[calc(100vw-2rem)] h-[28rem] max-h-[calc(100vh-8rem)] bg-white border border-brand-900/15 rounded-2xl shadow-2xl shadow-brand-900/20 flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Support chat"
        >
          {/* Header */}
          <div className="px-4 py-3 bg-gradient-to-r from-brand-800 to-emerald-700 text-white flex items-center justify-between">
            <div>
              <p className="text-sm font-bold leading-tight">Campus Macros Support</p>
              <p className="text-[11px] text-brand-200">
                AI assistant
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close support chat"
              className="w-7 h-7 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-brand-50/30">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-gradient-to-br from-brand-600 to-emerald-700 text-white rounded-br-md"
                      : "bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-3.5 py-2.5 shadow-sm flex items-center gap-1.5">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce"
                      style={{ animationDelay: `${d}ms` }}
                    />
                  ))}
                </div>
              </div>
            )}
            {concluded && (
              <div className="text-center pt-1">
                <p className="text-[11px] text-gray-500 mb-1.5">
                  This conversation was sent to our team. ✉️
                </p>
                <button
                  onClick={reset}
                  className="text-xs font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2"
                >
                  Start a new conversation
                </button>
              </div>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="p-2.5 border-t border-gray-200 bg-white flex items-center gap-2"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={sending || concluded}
              maxLength={2000}
              placeholder={concluded ? "Conversation closed" : "Describe your issue…"}
              aria-label="Message support"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={sending || concluded || !input.trim()}
              aria-label="Send message"
              className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-600 to-emerald-700 text-white flex items-center justify-center shadow-md shadow-brand-700/25 hover:from-brand-700 hover:to-emerald-800 disabled:opacity-40 transition-all flex-shrink-0"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95 28.897 28.897 0 0 0 15.293-7.155.75.75 0 0 0 0-1.114A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* Floating bubble */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support chat" : "Open support chat"}
        className="fixed bottom-6 right-4 sm:right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-brand-600 to-emerald-700 text-white shadow-xl shadow-brand-700/30 hover:shadow-brand-700/50 hover:-translate-y-0.5 transition-all flex items-center justify-center"
      >
        {open ? (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-6 h-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10.5h8m-8 3.5h5m-9.4 4.7.8-2.7A7.97 7.97 0 0 1 4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.3 0-2.6-.3-3.7-.9l-3.7 1.1Z"
            />
          </svg>
        )}
      </button>
    </>
  );
}
