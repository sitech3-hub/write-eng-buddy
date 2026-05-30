import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ChevronRight, MessageSquare } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getStudentDetail } from "@/lib/teacher.functions";
import { isTeacherEmail } from "@/lib/teacher-config";
import { Button } from "@/components/ui/button";
import { ConversationDialog } from "@/components/ConversationDialog";

export const Route = createFileRoute("/_authenticated/teacher/student/$userId")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!isTeacherEmail(data.user?.email)) {
      throw redirect({ to: "/chat" });
    }
  },
  component: StudentDetailPage,
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

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortDate(s: string): string {
  const d = new Date(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function StudentDetailPage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const fetchDetail = useServerFn(getStudentDetail);
  const [ready, setReady] = useState(false);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(() => setReady(true));
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-student", userId],
    queryFn: () => fetchDetail({ data: { userId } }),
    enabled: ready,
  });

  const dailyData = useMemo(
    () =>
      (data?.dailyActivity ?? []).map((d) => ({
        label: shortDate(d.date),
        count: d.count,
      })),
    [data?.dailyActivity],
  );

  const typeData = useMemo(
    () =>
      (data?.exerciseTypeDist ?? []).map((d) => ({
        name: TYPE_LABEL[d.key] ?? d.key,
        value: d.count,
      })),
    [data?.exerciseTypeDist],
  );

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-10">
      <button
        onClick={() => navigate({ to: "/teacher" })}
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> 대시보드로 돌아가기
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
          <div className="mb-6 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-base font-semibold text-primary">
              {(data.user.display_name ?? data.user.email ?? "?").trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {data.user.display_name ?? "이름 없음"}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {data.user.email ?? "—"} · 가입 {formatDate(data.user.created_at)}
              </p>
            </div>
          </div>

          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="총 연습" value={data.stats.thread_count} />
            <Stat label="총 메시지" value={data.stats.message_count} />
            <Stat
              label="활동 일수"
              value={data.stats.active_days}
              hint={`평균 ${data.stats.avg_messages_per_thread} msg/연습`}
            />
            <Stat
              label="주력 유형"
              text={
                data.stats.top_type
                  ? `${TYPE_LABEL[data.stats.top_type] ?? data.stats.top_type}`
                  : "—"
              }
              hint={
                data.stats.top_level
                  ? `레벨 ${LEVEL_LABEL[data.stats.top_level] ?? data.stats.top_level}`
                  : undefined
              }
            />
          </div>

          {/* Heatmap */}
          <Card title="활동 히트맵 (최근 12주)">
            <Heatmap data={data.heatmap} />
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="최근 30일 활동" className="lg:col-span-2">
              <div className="h-52 w-full">
                <ResponsiveContainer>
                  <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g-student" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={28} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      fill="url(#g-student)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="연습 유형 분포">
              <div className="h-52 w-full">
                {typeData.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    아직 데이터가 없어요.
                  </div>
                ) : (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={typeData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={40}
                        outerRadius={68}
                        paddingAngle={2}
                        stroke="var(--background)"
                      >
                        {typeData.map((_, i) => (
                          <Cell key={i} fill={`color-mix(in oklab, var(--primary) ${Math.round((1 - i * 0.15)*100)}%, transparent)`} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>

          {/* Threads */}
          <Card title="연습 기록" className="mt-4">
            {data.threads.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                아직 연습 기록이 없어요.
              </p>
            ) : (
              <ul className="divide-y">
                {data.threads.map((t) => (
                  <li
                    key={t.id}
                    className="group flex cursor-pointer items-center gap-3 py-3 transition-colors hover:bg-muted/40"
                    onClick={() => setOpenThreadId(t.id)}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                        <span>{TYPE_LABEL[t.exercise_type] ?? t.exercise_type}</span>
                        <span>· {LEVEL_LABEL[t.level] ?? t.level}</span>
                        <span>· 메시지 {t.message_count}</span>
                        <span>· {formatDate(t.updated_at)}</span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenThreadId(t.id);
                      }}
                    >
                      대화 보기
                      <ChevronRight className="ml-0.5 h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <ConversationDialog
        threadId={openThreadId}
        open={!!openThreadId}
        onOpenChange={(o) => !o && setOpenThreadId(null)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  text,
  hint,
}: {
  label: string;
  value?: number;
  text?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 animate-in fade-in slide-in-from-bottom-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tabular-nums">
        {text ?? value ?? 0}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 ${className}`}
    >
      <div className="mb-3 text-sm font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Heatmap({ data }: { data: { date: string; count: number }[] }) {
  // Group into 12 columns x 7 rows (oldest left -> newest right)
  const max = Math.max(1, ...data.map((d) => d.count));
  const cols: { date: string; count: number }[][] = [];
  for (let i = 0; i < data.length; i += 7) {
    cols.push(data.slice(i, i + 7));
  }
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((d) => {
              const intensity = d.count === 0 ? 0 : 0.15 + (d.count / max) * 0.85;
              return (
                <div
                  key={d.date}
                  title={`${d.date} · ${d.count}건`}
                  className="h-3 w-3 rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    background:
                      d.count === 0
                        ? "var(--muted)"
                        : `color-mix(in oklab, var(--primary) ${Math.round((intensity)*100)}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>적음</span>
        {[0.2, 0.4, 0.6, 0.8, 1].map((o) => (
          <span
            key={o}
            className="h-2.5 w-2.5 rounded-[2px]"
            style={{ background: `color-mix(in oklab, var(--primary) ${Math.round((o)*100)}%, transparent)` }}
          />
        ))}
        <span>많음</span>
      </div>
    </div>
  );
}
