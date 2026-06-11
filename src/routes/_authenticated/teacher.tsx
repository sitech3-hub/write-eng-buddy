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
import { ArrowLeft, CalendarRange, ChevronRight, FileText, Filter, MessageSquare, Printer, Search, Users, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getTeacherOverview, type StudentRow } from "@/lib/teacher.functions";
import { isTeacherEmail } from "@/lib/teacher-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  // Load persisted filters from localStorage
  const initialFilters = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem("teacher-dashboard-filters") || "null");
    } catch {
      return null;
    }
  }, []);

  const [levelFilter, setLevelFilter] = useState<string>(initialFilters?.levelFilter ?? "all");
  const [typeFilter, setTypeFilter] = useState<string>(initialFilters?.typeFilter ?? "all");
  // Date range (YYYY-MM-DD, inclusive). Empty string = unbounded.
  const [dateFrom, setDateFrom] = useState<string>(initialFilters?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState<string>(initialFilters?.dateTo ?? "");
  // Selected student ids (empty = "all matching")
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(
    new Set(initialFilters?.selectedStudentIds ?? []),
  );

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

  // Persist filters to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      "teacher-dashboard-filters",
      JSON.stringify({
        dateFrom,
        dateTo,
        levelFilter,
        typeFilter,
        selectedStudentIds: Array.from(selectedStudentIds),
      }),
    );
  }, [dateFrom, dateTo, levelFilter, typeFilter, selectedStudentIds]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-overview"],
    queryFn: () => fetchOverview(),
    enabled: hasSession,
    retry: false,
  });

  const students: StudentRow[] = data?.students ?? [];

  // Date range: convert to timestamps. `to` is end-of-day inclusive.
  const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
  const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
  const hasDateRange = fromTs !== null || toTs !== null;

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const idSel = selectedStudentIds;
    return students.filter((s) => {
      const matchQuery =
        !q ||
        (s.display_name ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q);
      const matchLevel = levelFilter === "all" || s.top_level === levelFilter;
      const matchType = typeFilter === "all" || s.top_type === typeFilter;
      const matchStudent = idSel.size === 0 || idSel.has(s.user_id);
      let matchDate = true;
      if (hasDateRange) {
        if (!s.last_active_at) matchDate = false;
        else {
          const t = new Date(s.last_active_at).getTime();
          if (fromTs !== null && t < fromTs) matchDate = false;
          if (toTs !== null && t > toTs) matchDate = false;
        }
      }
      return matchQuery && matchLevel && matchType && matchStudent && matchDate;
    });
  }, [students, searchQuery, levelFilter, typeFilter, selectedStudentIds, hasDateRange, fromTs, toTs]);

  const totalStudents = students.length;
  const activeStudents = filteredStudents.filter((s) => s.message_count > 0).length;
  const totalThreads = filteredStudents.reduce((acc, s) => acc + s.thread_count, 0);
  const totalMessages = filteredStudents.reduce((acc, s) => acc + s.message_count, 0);

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
        <ReportExportButtons
          students={filteredStudents}
          totalStudents={totalStudents}
          activeStudents={activeStudents}
          totalThreads={totalThreads}
          totalMessages={totalMessages}
          dateFrom={dateFrom}
          dateTo={dateTo}
          levelFilter={levelFilter}
          typeFilter={typeFilter}
          selectedCount={selectedStudentIds.size}
        />
      </div>

      <ScopeFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        levelFilter={levelFilter}
        onLevelChange={setLevelFilter}
        students={students}
        selectedStudentIds={selectedStudentIds}
        onSelectedStudentsChange={setSelectedStudentIds}
        filteredCount={filteredStudents.length}
        totalCount={totalStudents}
        onResetFilters={() => {
          if (typeof window !== "undefined") {
            localStorage.removeItem("teacher-dashboard-filters");
          }
        }}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="등록 학생" value={totalStudents} />
        <StatCard label="활동 학생" value={activeStudents} hint={`범위 내 ${filteredStudents.length}명 중`} />
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
                onClick={() => setOpenThreadId(t.id)}
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

      <ConversationDialog
        threadId={openThreadId}
        open={!!openThreadId}
        onOpenChange={(o) => !o && setOpenThreadId(null)}
      />
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

function ReportExportButtons({
  students,
  totalStudents,
  activeStudents,
  totalThreads,
  totalMessages,
  dateFrom,
  dateTo,
  levelFilter,
  typeFilter,
  selectedCount,
}: {
  students: StudentRow[];
  totalStudents: number;
  activeStudents: number;
  totalThreads: number;
  totalMessages: number;
  dateFrom: string;
  dateTo: string;
  levelFilter: string;
  typeFilter: string;
  selectedCount: number;
}) {
  const stamp = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (dateFrom || dateTo) {
      parts.push(`기간 ${dateFrom || "처음"} ~ ${dateTo || "오늘"}`);
    } else {
      parts.push("기간 전체");
    }
    parts.push(`반 ${levelFilter === "all" ? "전체" : LEVEL_LABEL[levelFilter] ?? levelFilter}`);
    parts.push(`유형 ${typeFilter === "all" ? "전체" : TYPE_LABEL[typeFilter] ?? typeFilter}`);
    parts.push(`학생 ${selectedCount === 0 ? "전체 매칭" : `${selectedCount}명 선택`}`);
    return parts.join(" · ");
  }, [dateFrom, dateTo, levelFilter, typeFilter, selectedCount]);

  const csvEscape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCsv = () => {
    if (students.length === 0) return;
    const headers = [
      "이름",
      "이메일",
      "주 레벨",
      "주 유형",
      "연습 수",
      "메시지 수",
      "마지막 활동",
    ];
    const rows = students.map((s) => [
      s.display_name ?? "",
      s.email ?? "",
      LEVEL_LABEL[s.top_level ?? ""] ?? s.top_level ?? "",
      TYPE_LABEL[s.top_type ?? ""] ?? s.top_type ?? "",
      s.thread_count,
      s.message_count,
      s.last_active_at ?? "",
    ]);
    const meta = [[`# 범위: ${scopeLabel}`], [`# 생성일: ${stamp}`], []];
    const csv =
      [...meta, headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
    // BOM for Excel Korean compatibility
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `students-report-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (students.length === 0) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rowsHtml = students
      .map(
        (s) => `<tr>
          <td>${esc(s.display_name ?? "—")}</td>
          <td>${esc(s.email ?? "—")}</td>
          <td>${esc(LEVEL_LABEL[s.top_level ?? ""] ?? s.top_level ?? "—")}</td>
          <td>${esc(TYPE_LABEL[s.top_type ?? ""] ?? s.top_type ?? "—")}</td>
          <td class="num">${s.thread_count}</td>
          <td class="num">${s.message_count}</td>
          <td>${s.last_active_at ? esc(formatDate(s.last_active_at)) : "—"}</td>
        </tr>`,
      )
      .join("");
    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"/>
<title>학생 학습 리포트 — ${stamp}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", Roboto, sans-serif; color: #111; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
  .summary { display: flex; gap: 18px; font-size: 12px; margin: 12px 0 20px; }
  .summary div { background: #f4f4f5; padding: 8px 12px; border-radius: 6px; }
  .summary b { font-size: 16px; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border-bottom: 1px solid #e4e4e7; padding: 8px 10px; text-align: left; }
  th { background: #f9fafb; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tr:nth-child(even) td { background: #fafafa; }
  .noprint { position: fixed; top: 12px; right: 12px; }
  @media print { .noprint { display: none; } }
  .noprint button { padding: 8px 14px; font-size: 13px; cursor: pointer; }
</style></head><body>
  <div class="noprint"><button onclick="window.print()">PDF로 저장 / 인쇄</button></div>
  <h1>학생 학습 리포트</h1>
  <div class="meta">생성일: ${stamp} · 범위: ${esc(scopeLabel)}</div>
  <div class="summary">
    <div><span>등록 학생</span><b>${totalStudents}</b></div>
    <div><span>활동 학생</span><b>${activeStudents}</b></div>
    <div><span>총 연습</span><b>${totalThreads}</b></div>
    <div><span>총 메시지</span><b>${totalMessages}</b></div>
  </div>
  <table>
    <thead><tr>
      <th>이름</th><th>이메일</th><th>주 레벨</th><th>주 유형</th>
      <th class="num">연습</th><th class="num">메시지</th><th>마지막 활동</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return (
    <div className="flex shrink-0 gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={downloadCsv}
        disabled={students.length === 0}
        className="h-8 gap-1.5 text-xs"
      >
        <FileText className="h-3.5 w-3.5" /> CSV
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={downloadPdf}
        disabled={students.length === 0}
        className="h-8 gap-1.5 text-xs"
      >
        <Printer className="h-3.5 w-3.5" /> PDF 리포트
      </Button>
    </div>
  );
}

function todayYmd(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ScopeFilterBar({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  levelFilter,
  onLevelChange,
  students,
  selectedStudentIds,
  onSelectedStudentsChange,
  filteredCount,
  totalCount,
  onResetFilters,
}: {
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  levelFilter: string;
  onLevelChange: (v: string) => void;
  students: StudentRow[];
  selectedStudentIds: Set<string>;
  onSelectedStudentsChange: (s: Set<string>) => void;
  filteredCount: number;
  totalCount: number;
  onResetFilters?: () => void;
}) {
  const [studentSearch, setStudentSearch] = useState("");

  const setPreset = (days: number | null) => {
    if (days === null) {
      onDateFromChange("");
      onDateToChange("");
    } else {
      onDateFromChange(todayYmd(days - 1));
      onDateToChange(todayYmd(0));
    }
  };

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedStudentsChange(next);
  };

  const matchingStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.display_name ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q),
    );
  }, [students, studentSearch]);

  const hasAnyFilter =
    !!dateFrom || !!dateTo || levelFilter !== "all" || selectedStudentIds.size > 0;

  return (
    <div className="mb-6 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Filter className="h-3.5 w-3.5" /> 내보내기 범위
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-8 w-[140px] text-xs"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-8 w-[140px] text-xs"
          />
          <div className="flex gap-1">
            {[
              { label: "7일", days: 7 },
              { label: "30일", days: 30 },
              { label: "90일", days: 90 },
            ].map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setPreset(p.days)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setPreset(null)}
            >
              전체
            </Button>
          </div>
        </div>

        <div className="h-5 w-px bg-border" />

        <Select value={levelFilter} onValueChange={onLevelChange}>
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue placeholder="반(레벨)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 반</SelectItem>
            {Object.entries(LEVEL_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              학생 {selectedStudentIds.size === 0 ? "전체" : `${selectedStudentIds.size}명 선택`}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <Input
              placeholder="이름/이메일 검색"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="mb-2 h-8 text-xs"
            />
            <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{selectedStudentIds.size}명 선택</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() =>
                    onSelectedStudentsChange(new Set(matchingStudents.map((s) => s.user_id)))
                  }
                >
                  표시 전체 선택
                </button>
                <button
                  type="button"
                  className="hover:text-foreground"
                  onClick={() => onSelectedStudentsChange(new Set())}
                >
                  비우기
                </button>
              </div>
            </div>
            <ScrollArea className="h-56 pr-1">
              <ul className="space-y-0.5">
                {matchingStudents.length === 0 && (
                  <li className="px-1 py-4 text-center text-xs text-muted-foreground">
                    학생이 없어요.
                  </li>
                )}
                {matchingStudents.map((s) => (
                  <li key={s.user_id}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-muted/50">
                      <Checkbox
                        checked={selectedStudentIds.has(s.user_id)}
                        onCheckedChange={() => toggleStudent(s.user_id)}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {s.display_name ?? s.email ?? s.user_id}
                      </span>
                      {s.top_level && (
                        <span className="rounded bg-secondary px-1 py-0.5 text-[10px] text-secondary-foreground">
                          {LEVEL_LABEL[s.top_level] ?? s.top_level}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          범위: <span className="tabular-nums text-foreground">{filteredCount}</span> / {totalCount}명
          {hasAnyFilter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                onDateFromChange("");
                onDateToChange("");
                onLevelChange("all");
                onSelectedStudentsChange(new Set());
                onResetFilters?.();
              }}
            >
              초기화
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
