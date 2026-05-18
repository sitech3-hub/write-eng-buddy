import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: NewPracticePage,
});

const LEVELS = [
  { value: "middle3", label: "중학교 3학년" },
  { value: "high1", label: "고등학교 1학년" },
];
const TYPES = [
  { value: "free", label: "자유 작문", desc: "원하는 주제로 자유롭게" },
  { value: "diary", label: "영어 일기", desc: "오늘 하루를 영어로" },
  { value: "email", label: "영어 이메일", desc: "이메일 양식으로 작성" },
  { value: "opinion", label: "의견 쓰기", desc: "주제에 대한 내 생각" },
  { value: "prompt", label: "AI가 주제 제시", desc: "AI가 주제를 골라줘요" },
];

function NewPracticePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [level, setLevel] = useState("middle3");
  const [type, setType] = useState("free");
  const [loading, setLoading] = useState(false);

  const start = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { navigate({ to: "/login" }); return; }
    const { data, error } = await supabase
      .from("threads")
      .insert({ user_id: u.user.id, level, exercise_type: type, title: "새 연습" })
      .select("id")
      .single();
    setLoading(false);
    if (error || !data) { toast.error("시작하지 못했어요"); return; }
    await qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId: data.id } });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">새 영어 쓰기 연습</h1>
        <p className="mt-2 text-sm text-muted-foreground">레벨과 연습 유형을 선택해주세요.</p>
      </div>

      <section className="w-full space-y-6">
        <div>
          <h2 className="mb-3 text-sm font-medium">학습 레벨</h2>
          <div className="grid grid-cols-2 gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => setLevel(l.value)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-sm transition",
                  level === l.value ? "border-primary bg-primary/5 text-foreground" : "border-border hover:border-primary/50"
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-medium">연습 유형</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left text-sm transition",
                  type === t.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                )}
              >
                <div className="font-medium">{t.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={start} disabled={loading} className="w-full" size="lg">
          {loading ? "시작 중..." : "연습 시작하기"}
        </Button>
      </section>
    </div>
  );
}
