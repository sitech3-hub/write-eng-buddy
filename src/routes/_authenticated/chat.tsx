import { createFileRoute, Outlet, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Plus, MessageSquare, Trash2, Menu, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { isTeacherEmail } from "@/lib/teacher-config";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatLayout,
});

type Thread = { id: string; title: string; updated_at: string };

function ChatLayout() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const params = useParams({ strict: false }) as { threadId?: string };
  const [email, setEmail] = useState<string>("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false); }, [params.threadId]);

  const { data: threads = [] } = useQuery<Thread[]>({
    queryKey: ["threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("threads")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleNew = () => { setMobileOpen(false); navigate({ to: "/chat" }); };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("이 연습을 삭제할까요?")) return;
    const { error } = await supabase.from("threads").delete().eq("id", id);
    if (error) { toast.error("삭제 실패"); return; }
    await qc.invalidateQueries({ queryKey: ["threads"] });
    if (params.threadId === id) navigate({ to: "/chat" });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const isTeacher = isTeacherEmail(email);

  const sidebarBody = (
    <>
      <div className="px-6 pt-6 pb-4">
        <Link to="/chat" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
          <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background text-[11px] font-semibold tracking-tight">W</span>
          <span className="text-[15px] font-semibold tracking-tight">WriteEng</span>
        </Link>
        <p className="mt-1 pl-9 text-xs text-sidebar-foreground/50">영어 쓰기 연습</p>
      </div>
      <div className="space-y-2 px-4">
        <Button onClick={handleNew} variant="outline" className="w-full justify-start gap-2 rounded-lg border-dashed font-normal" size="sm">
          <Plus className="h-3.5 w-3.5" /> 새 연습 시작
        </Button>
        {isTeacher && (
          <Link
            to="/teacher"
            onClick={() => setMobileOpen(false)}
            className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-normal text-sidebar-foreground/80 transition hover:border-foreground/40 hover:text-sidebar-foreground"
          >
            <GraduationCap className="h-3.5 w-3.5" /> 교사 대시보드
          </Link>
        )}
      </div>
      <div className="mt-6 px-6 pb-2 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/40">
        최근 연습
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {threads.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-sidebar-foreground/40">
            아직 연습 기록이 없어요.
          </p>
        )}
        {threads.map((t) => (
          <Link
            key={t.id}
            to="/chat/$threadId"
            params={{ threadId: t.id }}
            onClick={() => setMobileOpen(false)}
            className={cn(
              "group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition",
              params.threadId === t.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="flex-1 truncate">{t.title || "새 연습"}</span>
            <button
              onClick={(e) => handleDelete(t.id, e)}
              className="opacity-0 transition group-hover:opacity-100"
              aria-label="삭제"
            >
              <Trash2 className="h-3.5 w-3.5 text-sidebar-foreground/40 hover:text-destructive" />
            </button>
          </Link>
        ))}
      </nav>
      <div className="border-t px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-sidebar-foreground/55">{email}</span>
          <button onClick={handleSignOut} className="text-sidebar-foreground/50 transition hover:text-sidebar-foreground" aria-label="로그아웃">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background">
      <aside className="hidden w-72 flex-col border-r bg-sidebar md:flex">
        {sidebarBody}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex h-12 items-center gap-2 border-b bg-background px-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="메뉴 열기">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">메뉴</SheetTitle>
              {sidebarBody}
            </SheetContent>
          </Sheet>
          <Link to="/chat" className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-background text-[10px] font-semibold tracking-tight">W</span>
            <span className="text-sm font-semibold tracking-tight">WriteEng</span>
          </Link>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
