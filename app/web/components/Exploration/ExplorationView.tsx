import { useEffect, useRef, useState } from "react";
import { apiClient, getActiveProfileId } from "../../lib/api";
import type { DirectionTab } from "../../lib/stores";
import { useSSE } from "../../lib/use-sse";
import { Button } from "../ui/button";

interface ExplorationViewProps {
  tab: DirectionTab;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function ExplorationView({ tab }: ExplorationViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load history on tab switch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    void apiClient
      .getExplorationTab(tab.tab_id)
      .then((res) => {
        if (cancelled) return;
        setMessages(res.history?.messages ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab.tab_id]);

  const sse = useSSE({
    url: "/api/exploration/chat",
    method: "POST",
    headers: { "X-Profile-Id": getActiveProfileId() ?? "" },
    body: undefined,
  });

  const send = () => {
    const content = draft.trim();
    if (!content) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setDraft("");
    // Reconfigure SSE body via fresh useSSE call would need re-render; do a manual fetch instead.
    void chatStream(tab.tab_id, next, (token) => {
      setMessages((curr) => {
        const last = curr[curr.length - 1];
        if (last && last.role === "assistant") {
          return [...curr.slice(0, -1), { role: "assistant", content: last.content + token }];
        }
        return [...curr, { role: "assistant", content: token }];
      });
    });
  };

  // Auto-scroll only when already at the bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Suppress the unused sse import (kept for future use of useSSE primitive)
  void sse;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-elevated)] px-5 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            New Direction
          </p>
          <p className="text-sm font-medium text-[var(--text-primary)]">{tab.name}</p>
        </div>
        <span className="font-mono text-[10px] text-[var(--text-muted)]">{tab.tab_id}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {loading && <p className="text-xs text-[var(--text-muted)]">loading…</p>}
        {!loading && messages.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center text-xs text-[var(--text-muted)]">
            Start brainstorming. The exploration model will diverge with you.
          </p>
        )}
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[80%] rounded-xl bg-[var(--accent-tint)] px-3 py-2 text-sm text-[var(--text-primary)]"
                  : "max-w-[80%] rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm leading-relaxed text-[var(--text-secondary)]"
              }
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3">
        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Diverge here. Shift+Enter for newline."
            rows={2}
            className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          />
          <Button variant="primary" onClick={send}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

async function chatStream(
  tab_id: string,
  messages: Message[],
  onToken: (token: string) => void,
): Promise<void> {
  const res = await fetch("/api/exploration/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Profile-Id": getActiveProfileId() ?? "",
    },
    body: JSON.stringify({ tab_id, messages }),
  });
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pending: { event: string; data: string } | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, "");
      if (line === "") {
        if (pending) {
          if (pending.event === "token") {
            try {
              const parsed = JSON.parse(pending.data) as { content?: string };
              if (parsed.content) onToken(parsed.content);
            } catch {
              /* ignore */
            }
          }
          pending = null;
        }
        continue;
      }
      if (line.startsWith("event:")) {
        if (!pending) pending = { event: "message", data: "" };
        pending.event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        if (!pending) pending = { event: "message", data: "" };
        pending.data += (pending.data ? "\n" : "") + line.slice(5).trim();
      }
    }
  }
}
