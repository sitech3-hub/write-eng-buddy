import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { Send, Download, FileText, Printer } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
    onError: (e) => {
      console.error(e);
      const msg = e?.message ?? "";
      if (msg.includes("크레딧")) {
        toast.error("AI 크레딧 소진", { description: msg });
      } else if (msg.includes("너무 많")) {
        toast.warning("요청이 너무 많습니다", { description: msg });
      } else if (msg) {
        toast.error("오류", { description: msg });
      }
    },
  });

  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => { textareaRef.current?.focus(); }, [threadId, status]);

  // Auto-start: if empty thread, send a kickoff prompt tailored to the exercise type + level
  const kickoffSentRef = useRef(false);
  useEffect(() => {
    if (kickoffSentRef.current) return;
    if (initial.length === 0 && messages.length === 0 && status === "ready" && meta) {
      kickoffSentRef.current = true;
      sendMessage({ text: kickoffMessageFor(meta.exercise_type, meta.level) });
    }
  }, [initial.length, messages.length, status, meta, sendMessage]);

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
      <LevelInfoBar level={meta?.level} />
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
          <div className="relative rounded-xl border bg-card transition focus-within:border-foreground/40 focus-within:shadow-sm">
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
              className="absolute bottom-2 right-2 h-8 w-8 rounded-lg"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
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
        isUser
          ? "rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-background whitespace-pre-wrap"
          : "md-content"
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

const KICKOFF_BY_TYPE: Record<string, string> = {
  free: "안녕하세요! 자유 작문 연습을 시작할게요. 오늘 쓰기 좋은 주제를 하나 추천해 주세요.",
  diary: "안녕하세요! 오늘 하루를 돌아보는 영어 일기를 써보고 싶어요. 주제 방향을 제안해 주세요.",
  email: "안녕하세요! 영어 이메일 쓰기를 연습할게요. 어떤 상황의 이메일을 써볼지 알려주세요.",
  opinion: "안녕하세요! 의견 쓰기(opinion writing)를 연습하고 싶어요. 토론할 만한 주제를 하나 제시해 주세요.",
  prompt: "안녕하세요! 흥미로운 영어 작문 주제를 하나 골라서 제시해 주세요.",
};

const LEVEL_LABEL_FOR_KICKOFF: Record<string, string> = {
  middle1: "중학교 1학년 (CEFR A1)",
  middle2: "중학교 2학년 (CEFR A1–A2)",
  middle3: "중학교 3학년 (CEFR A2)",
  high1: "고등학교 1학년 (CEFR A2–B1)",
  high2: "고등학교 2학년 (CEFR B1)",
  high3: "고등학교 3학년 (CEFR B1–B2)",
};

function kickoffMessageFor(type?: string, level?: string) {
  const base = KICKOFF_BY_TYPE[type ?? "free"] ?? KICKOFF_BY_TYPE.free;
  const lv = LEVEL_LABEL_FOR_KICKOFF[level ?? ""] ?? null;
  if (!lv) return base;
  return `${base}\n\n제 수준은 **${lv}**이에요. 주제 난이도, 어휘, 예문, 글의 길이까지 모두 이 수준에 맞춰 주세요.`;
}

/* ── CEFR level info bar ── */
const LEVEL_TARGET: Record<string, { sentences: string; paragraphs: string; vocab: string }> = {
  middle1: { sentences: "2~3", paragraphs: "1", vocab: "600~800" },
  middle2: { sentences: "3~4", paragraphs: "1", vocab: "1,000" },
  middle3: { sentences: "4~5", paragraphs: "1~2", vocab: "1,500" },
  high1: { sentences: "5~6", paragraphs: "2", vocab: "2,000" },
  high2: { sentences: "6~7", paragraphs: "2~3", vocab: "2,500~3,000" },
  high3: { sentences: "7~8", paragraphs: "3", vocab: "3,500" },
};

const LEVEL_DISPLAY: Record<string, { name: string; cefr: string }> = {
  middle1: { name: "중학교 1학년", cefr: "A1" },
  middle2: { name: "중학교 2학년", cefr: "A1–A2" },
  middle3: { name: "중학교 3학년", cefr: "A2" },
  high1: { name: "고등학교 1학년", cefr: "A2–B1" },
  high2: { name: "고등학교 2학년", cefr: "B1" },
  high3: { name: "고등학교 3학년", cefr: "B1–B2" },
};

const DIFFICULTY_TAG: Record<string, { label: string; color: string }> = {
  middle1: { label: "쉬움", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  middle2: { label: "쉬움", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  middle3: { label: "기본", color: "bg-amber-50 text-amber-700 border-amber-200" },
  high1: { label: "기본", color: "bg-amber-50 text-amber-700 border-amber-200" },
  high2: { label: "도전", color: "bg-rose-50 text-rose-700 border-rose-200" },
  high3: { label: "도전", color: "bg-rose-50 text-rose-700 border-rose-200" },
};

const LEVEL_GUIDE: Record<string, { grammar: string[]; vocab: string }> = {
  middle1: {
    grammar: ["be동사", "현재시제", "1~3인칭 대명사", "수/불가산 명사", "기본 전치사(in, on, at)"],
    vocab: "숫자, 색깔, 가족, 음식, 동물 등 일상 기초 어휘",
  },
  middle2: {
    grammar: ["과거시제", "미래 be going to", "there is/are", "기초 형용사/부사", "현재진행형"],
    vocab: "취미, 학교, 날씨, 교통 등 일상 확장 어휘",
  },
  middle3: {
    grammar: ["현재진행형", "can/could", "비교급/최상급", "have to / must", "조금 긴 문장 만들기"],
    vocab: "쇼핑, 여행, 건강, 직업, 감정 표현 어휘",
  },
  high1: {
    grammar: ["현재완료", "조건부 1형(if)", "접속사(because, although)", "수동태 기초", "will/shall 구분"],
    vocab: "사회, 환경, 미디어, 학교생활, 의견 표현 어휘",
  },
  high2: {
    grammar: ["관계대명사", "수동태", "조건부 1~2형", "간접의문문", "접속사 확장(while, unless)"],
    vocab: "감정, 의견, 세계 문제, 기술, 추상 개념 어휘",
  },
  high3: {
    grammar: ["조건부 2/3형", "가정법 과거", "관계대명사 고급", "간접화법", "강조/도치"],
    vocab: "정치, 경제, 철학, 문화, 논증 및 비평 어휘",
  },
};

function LevelInfoBar({ level }: { level?: string }) {
  const target = LEVEL_TARGET[level ?? ""] ?? LEVEL_TARGET.middle3;
  const label = LEVEL_DISPLAY[level ?? ""] ?? LEVEL_DISPLAY.middle3;
  const tag = DIFFICULTY_TAG[level ?? ""] ?? DIFFICULTY_TAG.middle3;
  const guide = LEVEL_GUIDE[level ?? ""] ?? LEVEL_GUIDE.middle3;
  return (
    <div className="border-b bg-muted/20">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 py-1.5 sm:px-6">
        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {label.name} · {label.cefr}
        </span>
        <HoverCard openDelay={100} closeDelay={200}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className={cn(
                "inline-flex cursor-help items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors hover:opacity-80",
                tag.color
              )}
            >
              {tag.label}
            </button>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" align="start" className="w-72 space-y-2 text-xs">
            <div>
              <p className="mb-1 font-semibold text-foreground">권장 문법 범위</p>
              <ul className="space-y-0.5 text-muted-foreground">
                {guide.grammar.map((g) => (
                  <li key={g} className="flex items-start gap-1.5">
                    <span className="mt-0.5 block h-1 w-1 rounded-full bg-primary" />
                    {g}
                  </li>
                ))}
              </ul>
            </div>
            <div className="border-t pt-2">
              <p className="mb-0.5 font-semibold text-foreground">권장 어휘 범위</p>
              <p className="text-muted-foreground">{guide.vocab}</p>
            </div>
            <div className="border-t pt-2 text-[10px] text-muted-foreground">
              목표: {target.sentences}문장 / {target.paragraphs}단락 · 어휘 {target.vocab}단어
            </div>
          </HoverCardContent>
        </HoverCard>
        <span className="text-[11px] text-muted-foreground">
          목표: {target.sentences}문장 / {target.paragraphs}단락 · 어휘 {target.vocab}단어
        </span>
      </div>
    </div>
  );
}


/**
 * Pull the student's own writing out of the chat.
 * When `excludeHelp` is true, filter out "도와줘" / "모르겠어" style help requests.
 */
function extractStudentWriting(messages: UIMessage[], excludeHelp: boolean): string[] {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role !== "user") continue;
    const text = getMessageText(m).trim();
    if (!text) continue;
    if (excludeHelp && !looksLikeEnglishAttempt(text)) continue;
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
  const [excludeHelp, setExcludeHelp] = useState(true);
  const entries = useMemo(
    () => extractStudentWriting(messages, excludeHelp),
    [messages, excludeHelp],
  );
  const count = entries.length;
  const totalWordCount = useMemo(
    () => entries.reduce((sum, t) => sum + (t.match(/[A-Za-z]+/g)?.length ?? 0), 0),
    [entries],
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Reset selection to "all" whenever the dialog opens or entries change
  useEffect(() => {
    if (open) setSelected(new Set(entries.map((_, i) => i)));
  }, [open, entries]);

  const label = EXERCISE_LABEL[exerciseType ?? "free"] ?? "영어 쓰기";
  const stamp = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const chosen = useMemo(
    () => entries.filter((_, i) => selected.has(i)),
    [entries, selected],
  );
  const chosenWordCount = useMemo(
    () => chosen.reduce((sum, t) => sum + (t.match(/[A-Za-z]+/g)?.length ?? 0), 0),
    [chosen],
  );

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const selectAll = () => setSelected(new Set(entries.map((_, i) => i)));
  const clearAll = () => setSelected(new Set());

  const downloadMd = () => {
    if (chosen.length === 0) return;
    const header = `# ${label} — 내가 쓴 글\n날짜: ${stamp}\n총 ${chosen.length}개 항목 · 약 ${chosenWordCount} 단어\n\n---\n\n`;
    const body = chosen.map((t, i) => `## ${i + 1}.\n${t}`).join("\n\n");
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

  /**
   * PDF: open a print-friendly window and trigger the browser's "Save as PDF".
   * This avoids font/embedding issues that plague JS PDF libraries with Korean.
   */
  const downloadPdf = () => {
    if (chosen.length === 0) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const itemsHtml = chosen
      .map(
        (t, i) =>
          `<section class="item"><h2>${i + 1}.</h2><p>${esc(t).replace(/\n/g, "<br/>")}</p></section>`,
      )
      .join("");
    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>${esc(label)} — 내가 쓴 글</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.6; }
  header { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 24px; }
  header h1 { font-size: 22px; margin: 0 0 6px; }
  header .meta { font-size: 12px; color: #555; }
  .item { margin: 0 0 18px; page-break-inside: avoid; }
  .item h2 { font-size: 14px; color: #666; margin: 0 0 4px; font-weight: 600; }
  .item p { font-size: 14px; margin: 0; white-space: pre-wrap; }
  @media print { .noprint { display: none; } }
  .noprint { position: fixed; top: 12px; right: 12px; }
  .noprint button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>
  <header>
    <h1>${esc(label)} — 내가 쓴 글</h1>
    <div class="meta">날짜: ${stamp} · 총 ${chosen.length}개 항목 · 약 ${chosenWordCount} 단어</div>
  </header>
  ${itemsHtml}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <>
      <div className="border-b bg-background">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
          <span className="text-xs text-muted-foreground">
            내가 쓴 영어 {count}문장{totalWordCount > 0 ? ` · 약 ${totalWordCount} 단어` : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={count === 0}
            className="h-8 gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" />
            내 글 다운로드
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>내 글 미리보기</DialogTitle>
            <DialogDescription>
              저장할 문장을 선택하세요. 도움 요청 메시지 자동 제외를 켜고 끌 수 있어요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="exclude-help" className="text-sm cursor-pointer">
                도움 요청 문장 자동 제외
              </Label>
              <span className="text-xs text-muted-foreground">
                {excludeHelp
                  ? "‘도와줘’, ‘모르겠어’ 같은 메시지를 숨깁니다."
                  : "모든 학생 메시지를 포함합니다."}
              </span>
            </div>
            <Switch
              id="exclude-help"
              checked={excludeHelp}
              onCheckedChange={(v) => setExcludeHelp(Boolean(v))}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {selected.size} / {count} 선택 · 약 {chosenWordCount} 단어
            </span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                전체 선택
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll}>
                전체 해제
              </Button>
            </div>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border bg-muted/20 p-2">
            {entries.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                아직 영어로 작성한 문장이 없어요.
              </p>
            ) : (
              <ul className="space-y-1">
                {entries.map((t, i) => {
                  const checked = selected.has(i);
                  return (
                    <li
                      key={i}
                      className={cn(
                        "flex gap-3 rounded-md p-2 text-sm transition-colors hover:bg-background",
                        checked && "bg-background",
                      )}
                    >
                      <Checkbox
                        id={`pick-${i}`}
                        checked={checked}
                        onCheckedChange={() => toggle(i)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={`pick-${i}`}
                        className="flex-1 cursor-pointer whitespace-pre-wrap leading-relaxed"
                      >
                        <span className="mr-2 text-xs text-muted-foreground">{i + 1}.</span>
                        {t}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={downloadMd}
              disabled={selected.size === 0}
              className="gap-1.5"
            >
              <FileText className="h-4 w-4" />
              Markdown
            </Button>
            <Button
              onClick={downloadPdf}
              disabled={selected.size === 0}
              className="gap-1.5"
            >
              <Printer className="h-4 w-4" />
              PDF로 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
