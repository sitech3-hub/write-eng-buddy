import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getTeacherOverview, type StudentRow } from "@/lib/teacher.functions";
import { isTeacherEmail } from "@/lib/teacher-config";
import { Button } from "@/components/ui/button";

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

function formatDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function TeacherDashboard() {
  const navigate = useNavigate();
  const fetchOverview = useServerFn(getTeacherOverview);
  const [ready, setReady] = useState(false);

  // Ensure session restored before calling the protected server fn
  useEffect(() => {
    supabase.auth.getSession().then(() => setReady(true));
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-overview"],
    queryFn: () => fetchOverview(),
    enabled: ready,
  });

  const students: StudentRow[] = data?.students ?? [];
  const totalStudents = students.length;
  const totalThreads = students.reduce((acc, s) => acc + s.thread_count, 0);
  const totalMessages = students.reduce((acc, s) => acc + s.message_count, 0);

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
          <p className="mt-1 text-sm text-muted-foreground">학생들의 학습 현황을 한눈에 확인하세요.</p>
        </div>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="등록 학생" value={totalStudents} />
        <StatCard label="총 연습 수" value={totalThreads} />
        <StatCard label="총 메시지 수" value={totalMessages} />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" /> 학생 목록
          </div>
          <span className="text-xs text-muted-foreground">{totalStudents}명</span>
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

        {!isLoading && students.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 font-medium">이름</th>
                  <th className="px-5 py-2 font-medium">이메일</th>
                  <th className="px-5 py-2 font-medium text-right">연습</th>
                  <th className="px-5 py-2 font-medium text-right">메시지</th>
                  <th className="px-5 py-2 font-medium">가입일</th>
                  <th className="px-5 py-2 font-medium">최근 활동</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.user_id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="px-5 py-3">{s.display_name ?? "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{s.email ?? "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.thread_count}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{s.message_count}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(s.created_at)}</td>
                    <td className="px-5 py-3 text-muted-foreground">{formatDate(s.last_active_at ?? s.last_sign_in_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
