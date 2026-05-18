import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { Send, Download } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  component: ThreadChatPage,
});

type ThreadMeta = { level: string; exercise_type: string };

function ThreadChatPage() {
  const { threadId } = useParams({ from: "/_authenticated/chat/$threadId" });
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialMessages(null);
    (async () => {
      const [{ data: msgs }, { data: thread }] = await Promise.all([
        supabase.from("messages").select("id, role, parts").eq("thread_id", threadId).order("created_at"),
        supabase.from("threads").select("level, exercise_type").eq("id", threadId).maybeSingle(),
      ]);
      if (cancelled) return;
      const ui: UIMessage[] = (msgs ?? []).map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        parts: m.parts as UIMessage["parts"],
      }));
      setInitialMessages(ui);
      setMeta(thread ? { level: thread.level, exercise_type: thread.exercise_type } : null);
    })();
    return () => { cancelled = true; };
  }, [threadId]);

  if (initialMessages === null) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">불러오는 중...</div>;
  }
  return <ThreadChat key={threadId} threadId={threadId} initial={initialMessages} meta={meta} />;
}

function ThreadChat({ threadId, initial, meta }: { threadId: string; initial: UIMessage[]; meta: ThreadMeta | null }) {
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest: async ({ messages }) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      return {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
        body: { messages, threadId, level: meta?.level, exerciseType: meta?.exercise_type },
      };
    },
  }), [threadId, meta]);

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initial,
    transport,
    onError: (e) => console.error(e),
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { textareaRef.current?.focus(); }, [threadId, status]);

  // Auto-start: if empty thread, send a kickoff prompt automatically
  useEffect(() => {
    if (initial.length === 0 && messages.length === 0 && status === "ready") {
      sendMessage({ text: "안녕하세요! 영어 쓰기 연습을 시작할게요." });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
  };

  const scaffoldStage = useMemo(() => computeScaffoldStage(messages), [messages]);

  return (
    <div className="flex h-full flex-col">
      <ChatToolbar messages={messages} threadId={threadId} exerciseType={meta?.exercise_type} />
      <ScaffoldIndicator stage={scaffoldStage} />
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="mt-6 text-sm text-muted-foreground animate-pulse">생각 중...</div>
          )}
        </div>
      </div>

      <div className="border-t bg-background">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
          <div className="relative rounded-2xl border bg-card shadow-sm focus-within:border-primary/50">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="여기에 영어로 작성해 보세요... (Shift+Enter 줄바꿈)"
              className="min-h-[80px] resize-none border-0 bg-transparent pr-14 focus-visible:ring-0 focus-visible:ring-offset-0"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              size="icon"
              className="absolute bottom-2 right-2 h-9 w-9"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            영어로 작성하면 AI가 교정하고 모범 답안을 알려줘요.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: UIMessage }) {
  const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
  const isUser = message.role === "user";
  return (
    <div className={cn("mb-6 flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn(
        "max-w-[85%]",
        isUser ? "rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground whitespace-pre-wrap" : "md-content"
      )}>
        {isUser ? text : <ReactMarkdown>{text}</ReactMarkdown>}
      </div>
    </div>
  );
}

const STAGE_MARKERS: Array<{ stage: 1 | 2 | 3 | 4; icon: string; label: string }> = [
  { stage: 1, icon: "🧱", label: "핵심 표현" },
  { stage: 2, icon: "🪜", label: "문장 뼈대" },
  { stage: 3, icon: "🌱", label: "함께 한 문장" },
  { stage: 4, icon: "🤝", label: "모범 단락 + 빈칸" },
];

function getMessageText(m: UIMessage) {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

// Help keywords — if present, the message is a help request, NOT an English attempt
const HELP_KEYWORDS = [
  "도와", "도와줘", "도와주세요", "힌트", "hint",
  "모르겠", "모르겠어", "모르겠어요",
  "어려", "어려워", "어려워요", "어렵",
  "못 쓰", "못쓰", "못하겠", "막혀", "막혔",
  "다음", "next", "계속",
];

/**
 * Heuristic: does this user message look like a real English writing attempt?
 * We want to reset scaffolding ONLY when the student has genuinely tried to
 * write English — not when they sprinkle a word like "hint" or "ok" into a
 * Korean help request.
 *
 * Rules (all must hold):
 *  - message does not match any help keyword
 *  - contains ≥ 3 English word tokens (2+ letters each)
 *  - English characters dominate over Korean (Korean ratio < 0.3)
 */
function looksLikeEnglishAttempt(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;

  const lower = text.toLowerCase();
  if (HELP_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()))) return false;

  const englishWords = text.match(/[A-Za-z]{2,}/g) ?? [];
  if (englishWords.length < 3) return false;

  const koreanChars = text.match(/[\uAC00-\uD7AF]/g)?.length ?? 0;
  const englishChars = text.match(/[A-Za-z]/g)?.length ?? 0;
  const totalLetters = koreanChars + englishChars;
  if (totalLetters === 0) return false;
  const koreanRatio = koreanChars / totalLetters;
  if (koreanRatio >= 0.3) return false;

  return true;
}

function computeScaffoldStage(messages: UIMessage[]): 0 | 1 | 2 | 3 | 4 {
  let stage: 0 | 1 | 2 | 3 | 4 = 0;
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = getMessageText(m);
      // pick the highest stage marker present in this assistant message
      for (let i = STAGE_MARKERS.length - 1; i >= 0; i--) {
        if (text.includes(STAGE_MARKERS[i].icon)) {
          stage = STAGE_MARKERS[i].stage;
          break;
        }
      }
    } else if (m.role === "user") {
      // only reset when the student has actually attempted English writing
      if (looksLikeEnglishAttempt(getMessageText(m))) stage = 0;
    }
  }
  return stage;
}

function ScaffoldIndicator({ stage }: { stage: 0 | 1 | 2 | 3 | 4 }) {
  return (
    <div className="border-b bg-muted/30">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2 sm:px-6">
        <span className="text-xs font-medium text-muted-foreground">비계 단계</span>
        <div className="flex flex-1 items-center gap-1.5">
          {STAGE_MARKERS.map((s) => {
            const active = stage === s.stage;
            const done = stage > s.stage;
            return (
              <div
                key={s.stage}
                className={cn(
                  "flex flex-1 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-primary/15 text-primary",
                  !active && !done && "bg-transparent text-muted-foreground",
                )}
                title={`${s.stage}단계 — ${s.label}`}
              >
                <span>{s.icon}</span>
                <span className="hidden sm:inline">{s.stage}. {s.label}</span>
                <span className="sm:hidden">{s.stage}</span>
              </div>
            );
          })}
        </div>
        {stage === 0 && (
          <span className="text-xs text-muted-foreground">시작 전</span>
        )}
      </div>
    </div>
  );
}

const EXERCISE_LABEL: Record<string, string> = {
  free: "자유 작문",
  diary: "영어 일기",
  email: "영어 이메일",
  opinion: "의견 쓰기",
  prompt: "AI 주제 작문",
};

/**
 * Pull the student's own writing out of the chat — only messages that look
 * like real English attempts (not "도와줘" / "모르겠어" style help requests).
 */
function extractStudentWriting(messages: UIMessage[]): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = getMessageText(m).trim();
    if (!text) continue;
    if (!looksLikeEnglishAttempt(text)) continue;
    out.push(text);
  }
  return out;
}

function ChatToolbar({
  messages,
  threadId,
  exerciseType,
}: {
  messages: UIMessage[];
  threadId: string;
  exerciseType?: string;
}) {
  const entries = useMemo(() => extractStudentWriting(messages), [messages]);
  const count = entries.length;
  const wordCount = useMemo(
    () => entries.reduce((sum, t) => sum + (t.match(/[A-Za-z]+/g)?.length ?? 0), 0),
    [entries],
  );

  const handleDownload = () => {
    if (count === 0) return;
    const label = EXERCISE_LABEL[exerciseType ?? "free"] ?? "영어 쓰기";
    const date = new Date();
    const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const header = `# ${label} — 내가 쓴 글\n날짜: ${stamp}\n총 ${count}개 항목 · 약 ${wordCount} 단어\n\n---\n\n`;
    const body = entries.map((t, i) => `## ${i + 1}.\n${t}`).join("\n\n");
    const blob = new Blob([header + body + "\n"], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-writing-${stamp}-${threadId.slice(0, 8)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="border-b bg-background">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <span className="text-xs text-muted-foreground">
          내가 쓴 영어 {count}문장{wordCount > 0 ? ` · 약 ${wordCount} 단어` : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          disabled={count === 0}
          className="h-8 gap-1.5 text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          내 글 다운로드
        </Button>
      </div>
    </div>
  );
}
