import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, Sparkles, BookOpen, Calendar, ChevronRight, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/chat/dashboard")({
  component: MyDashboardPage,
});

const LEVEL_LABEL: Record<string, string> = {
  middle1: "중1", middle2: "중2", middle3: "중3",
  high1: "고1", high2: "고2", high3: "고3",
};
const TYPE_LABEL: Record<string, string> = {
  free: "자유 작문", diary: "영어 일기", email: "영어 이메일",
  opinion: "의견 쓰기", prompt: "AI 주제 제시",
};

type ThreadRow = {
  id: string;
  title: string;
  level: string;
  exercise_type: string;
  created_at: string;
  updated_at: string;
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day + 6) % 7; // Monday as week start
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - diff);
  return x;
}

function MyDashboardPage() {
  const { data: threads = [], isLoading } = useQuery<ThreadRow[]>({
    queryKey: ["my-threads-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads")
        .select("id, title, level, exercise_type, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const now = new Date();
  const weekStart = startOfWeek(now);
  const total = threads.length;
  const thisWeek = threads.filter((t) => new Date(t.updated_at) >= weekStart).length;
  const typeCounts = threads.reduce<Record<string, number>>((acc, t) => {
    acc[t.exercise_type] = (acc[t.exercise_type] ?? 0) + 1;
    return acc;
  }, {});
  const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">나의 대시보드</h1>
        <p className="mt-1 text-sm text-muted-foreground">지금까지의 영어 쓰기 연습 기록을 한눈에 볼 수 있어요.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<BookOpen className="h-4 w-4" />} label="총 연습" value={`${total}회`} />
        <StatCard icon={<Calendar className="h-4 w-4" />} label="이번 주" value={`${thisWeek}회`} />
        <StatCard
          icon={<Sparkles className="h-4 w-4" />}
          label="가장 많이 한 유형"
          value={topType ? TYPE_LABEL[topType[0]] ?? topType[0] : "—"}
        />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-sm font-semibold tracking-tight">최근 연습</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : threads.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">아직 연습 기록이 없어요.</p>
            <Link
              to="/chat"
              className="mt-3 inline-flex rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background"
            >
              첫 연습 시작하기
            </Link>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {threads.slice(0, 20).map((t) => (
              <li key={t.id}>
                <Link
                  to="/chat/$threadId"
                  params={{ threadId: t.id }}
                  className="group flex items-center gap-3 rounded-md px-4 py-3 transition hover:bg-muted/40"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.title || "새 연습"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {LEVEL_LABEL[t.level] ?? t.level} · {TYPE_LABEL[t.exercise_type] ?? t.exercise_type} ·{" "}
                      {new Date(t.updated_at).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
