import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import { Send } from "lucide-react";

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
