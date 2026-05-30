import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getStudentThread, type JsonValue } from "@/lib/teacher.functions";
import { isTeacherEmail } from "@/lib/teacher-config";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/teacher/thread/$threadId")({
  ssr: false,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!isTeacherEmail(data.user?.email)) {
      throw redirect({ to: "/chat" });
    }
  },
  component: ThreadViewerPage,
});

const TYPE_LABEL: Record<string, string> = {
  free: "자유작문",
  diary: "일기",
  email: "이메일",
  opinion: "의견",
  prompt: "주제제시",
};
const LEVEL_LABEL: Record<string, string> = {
  middle1: "중1",
  middle2: "중2",
  middle3: "중3",
  high1: "고1",
  high2: "고2",
  high3: "고3",
};

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Extract human-readable text from AI SDK UIMessage `parts` JSON. */
function extractText(parts: JsonValue): string {
  if (parts == null) return "";
  if (typeof parts === "string") return parts;
  if (Array.isArray(parts)) {
    return parts.map(extractText).filter(Boolean).join("\n");
  }
  if (typeof parts === "object") {
    const obj = parts as { [k: string]: JsonValue };
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    if (Array.isArray(obj.content)) return extractText(obj.content);
    return "";
  }
  return "";
}

function ThreadViewerPage() {
  const { threadId } = Route.useParams();
  const navigate = useNavigate();
  const fetchThread = useServerFn(getStudentThread);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(() => setReady(true));
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-thread", threadId],
    queryFn: () => fetchThread({ data: { threadId } }),
    enabled: ready,
  });

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-10">
      <button
        onClick={() =>
          data
            ? navigate({
                to: "/teacher/student/$userId",
                params: { userId: data.thread.user_id },
              })
            : navigate({ to: "/teacher" })
        }
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> 학생 상세로 돌아가기
      </button>

      {isLoading && (
        <p className="py-20 text-center text-sm text-muted-foreground">불러오는 중...</p>
      )}
      {error && (
        <div className="py-20 text-center text-sm">
          <p className="text-destructive">불러오지 못했어요.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => location.reload()}>
            다시 시도
          </Button>
        </div>
      )}

      {data && (
        <>
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">{data.thread.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.student.display_name ?? data.student.email ?? "—"} ·{" "}
              {TYPE_LABEL[data.thread.exercise_type] ?? data.thread.exercise_type} ·{" "}
              {LEVEL_LABEL[data.thread.level] ?? data.thread.level} · 메시지 {data.messages.length}
            </p>
          </div>

          <div className="space-y-3">
            {data.messages.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">
                메시지가 없어요.
              </p>
            )}
            {data.messages.map((m) => {
              const isUser = m.role === "user";
              const text = extractText(m.parts);
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? "border-primary/30 bg-primary/10"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                      <span className="font-medium">
                        {isUser ? "학생" : "튜터"}
                      </span>
                      <span>{formatDate(m.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words">
                      {text || (
                        <span className="text-muted-foreground">(빈 메시지)</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
