import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ConversationDialog } from "@/components/ConversationDialog";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, ChevronRight, MessageSquare, Search, Users, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getTeacherOverview, type StudentRow } from "@/lib/teacher.functions";
import { isTeacherEmail } from "@/lib/teacher-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/teacher")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getUser();
    if (!isTeacherEmail(data.user?.email)) {
      throw redirect({ to: "/chat" });
    }
  },
  component: TeacherDashboard,
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

function useCountUp(value: number, duration = 700): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return n;
}

function TeacherDashboard() {
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getTeacherOverview);
  const [hasSession, setHasSession] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      if (data.user) setHasSession(true);
      else navigate({ to: "/login" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-overview"],
    queryFn: () => fetchOverview(),
    enabled: hasSession,
    retry: false,
  });

  const students: StudentRow[] = data?.students ?? [];

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      const matchQuery =
        !q ||
        (s.display_name ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q);
      const matchLevel = levelFilter === "all" || s.top_level === levelFilter;
      const matchType = typeFilter === "all" || s.top_type === typeFilter;
      return matchQuery && matchLevel && matchType;
    });
  }, [students, searchQuery, levelFilter, typeFilter]);

  const totalStudents = students.length;
  const activeStudents = students.filter((s) => s.message_count > 0).length;
  const totalThreads = students.reduce((acc, s) => acc + s.thread_count, 0);
  const totalMessages = students.reduce((acc, s) => acc + s.message_count, 0);

  const dailyData = useMemo(
    () =>
      (data?.dailyActivity ?? []).map((d) => ({
        date: d.date,
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

  const levelData = useMemo(
    () =>
      (data?.levelDist ?? []).map((d) => ({
        name: LEVEL_LABEL[d.key] ?? d.key,
        value: d.count,
      })),
    [data?.levelDist],
  );

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 overflow-y-auto px-6 py-10">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate({ to: "/chat" })}
            className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> 채팅으로 돌아가기
          </button>
          <h1 className="text-2xl font-semibold tracking-tight">교사 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            학생들의 학습 누적 기록과 활동 추이를 한눈에 확인하세요.
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="등록 학생" value={totalStudents} />
        <StatCard label="활동 학생" value={activeStudents} hint={`전체 ${totalStudents}명 중`} />
        <StatCard label="총 연습 수" value={totalThreads} />
        <StatCard label="총 메시지 수" value={totalMessages} />
      </div>

      {/* Charts */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="최근 30일 메시지 추이" className="lg:col-span-2">
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-activity" x1="0" y1="0" x2="0" y2="1">
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
                  labelStyle={{ color: "var(--foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  fill="url(#g-activity)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="연습 유형 분포">
          <div className="h-56 w-full">
            {typeData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={typeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={42}
                    outerRadius={70}
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
          <Legend items={typeData} />
        </ChartCard>
      </div>

      <div className="mb-6">
        <ChartCard title="레벨별 연습 수">
          <div className="h-44 w-full">
            {levelData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer>
                <BarChart data={levelData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={28} />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklab, var(--muted) 40%, transparent)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Recent conversations */}
      <div className="mb-6 rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare className="h-4 w-4" /> 최근 대화
          </div>
          <span className="text-xs text-muted-foreground">
            최신 {data?.recentThreads?.length ?? 0}건
          </span>
        </div>
        {isLoading && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
        )}
        {!isLoading && (data?.recentThreads?.length ?? 0) === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            아직 대화 기록이 없어요.
          </p>
        )}
        {!isLoading && data?.recentThreads && data.recentThreads.length > 0 && (
          <ul className="divide-y">
            {data.recentThreads.map((t) => (
              <li
                key={t.id}
                className="group flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                onClick={() =>
                  navigate({ to: "/teacher/thread/$threadId", params: { threadId: t.id } })
                }
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {(t.student_name ?? t.student_email ?? "?").trim().charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                    <span className="truncate">{t.student_name ?? t.student_email ?? "—"}</span>
                    <span>· {TYPE_LABEL[t.exercise_type] ?? t.exercise_type}</span>
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
                    navigate({
                      to: "/teacher/thread/$threadId",
                      params: { threadId: t.id },
                    });
                  }}
                >
                  대화 보기
                  <ChevronRight className="ml-0.5 h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Students */}
      <div className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> 학생별 누적 기록
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="이름 또는 이메일 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-40 pl-8 text-xs sm:w-48"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="레벨" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 레벨</SelectItem>
                {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filteredStudents.length} / {totalStudents}명
            </span>
          </div>
        </div>

        {isLoading && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
        )}
        {error && (
          <div className="px-5 py-10 text-center text-sm">
            <p className="text-destructive">불러오지 못했어요.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => location.reload()}>
              다시 시도
            </Button>
          </div>
        )}
        {!isLoading && !error && students.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">아직 학생 데이터가 없어요.</p>
        )}
        {!isLoading && !error && students.length > 0 && filteredStudents.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">조건에 맞는 학생이 없어요.</p>
        )}

        {!isLoading && filteredStudents.length > 0 && (
          <ul className="divide-y">
            {filteredStudents.map((s, idx) => (
              <li
                key={s.user_id}
                className="group cursor-pointer px-5 py-3 transition-colors hover:bg-muted/40 animate-in fade-in slide-in-from-bottom-1"
                style={{ animationDelay: `${Math.min(idx * 25, 400)}ms` }}
                onClick={() =>
                  navigate({ to: "/teacher/student/$userId", params: { userId: s.user_id } })
                }
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {(s.display_name ?? s.email ?? "?").trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-medium">
                        {s.display_name ?? "—"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{s.email ?? "—"}</span>
                      {s.top_level && (
                        <span className="inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                          {LEVEL_LABEL[s.top_level] ?? s.top_level}
                        </span>
                      )}
                      {s.top_type && (
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {TYPE_LABEL[s.top_type] ?? s.top_type}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>
                        연습 <span className="tabular-nums text-foreground">{s.thread_count}</span>
                      </span>
                      <span>
                        메시지 <span className="tabular-nums text-foreground">{s.message_count}</span>
                      </span>
                      <span>최근 {formatDate(s.last_active_at ?? s.last_sign_in_at)}</span>
                    </div>
                  </div>
                  <Sparkline values={s.daily_sparkline} />
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  const n = useCountUp(value);
  return (
    <div className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/30">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{n}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ChartCard({
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

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      아직 데이터가 없어요.
    </div>
  );
}

function Legend({ items }: { items: { name: string; value: number }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={it.name} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: `color-mix(in oklab, var(--primary) ${Math.round((1 - i * 0.15)*100)}%, transparent)` }}
          />
          {it.name} <span className="tabular-nums text-foreground">{it.value}</span>
        </span>
      ))}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="hidden h-8 items-end gap-[2px] sm:flex">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-primary/70"
          style={{
            height: `${Math.max(2, (v / max) * 32)}px`,
            opacity: v === 0 ? 0.18 : 0.55 + (v / max) * 0.45,
          }}
        />
      ))}
    </div>
  );
}
