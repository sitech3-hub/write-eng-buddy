import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PlacementQuiz } from "@/components/PlacementQuiz";

export const Route = createFileRoute("/_authenticated/chat/")({
  component: NewPracticePage,
});

const LEVELS = [
  { value: "middle1", label: "중학교 1학년", cefr: "A1", desc: "기초 영어 (Beginner)" },
  { value: "middle2", label: "중학교 2학년", cefr: "A1–A2", desc: "기초~초급" },
  { value: "middle3", label: "중학교 3학년", cefr: "A2", desc: "초급 (Elementary)" },
  { value: "high1", label: "고등학교 1학년", cefr: "A2–B1", desc: "초급~중급" },
  { value: "high2", label: "고등학교 2학년", cefr: "B1", desc: "중급 (Intermediate)" },
  { value: "high3", label: "고등학교 3학년", cefr: "B1–B2", desc: "중급~중상급" },
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
  const [quizOpen, setQuizOpen] = useState(false);
  const [recommended, setRecommended] = useState<string | null>(null);

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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center overflow-y-auto px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">새 영어 쓰기 연습</h1>
        <p className="mt-2 text-sm text-muted-foreground">레벨과 연습 유형을 선택해주세요.</p>
      </div>

      <section className="w-full space-y-6">
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="mb-1 text-sm font-medium">학습 레벨</h2>
              <p className="text-xs text-muted-foreground">학년에 따른 CEFR 수준에 맞춰 난이도가 조정돼요.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuizOpen(true)}
              className="gap-1.5 whitespace-nowrap"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              배치 퀴즈
            </Button>
          </div>
          {recommended && (
            <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
              퀴즈 추천 레벨로 <span className="font-semibold">{LEVELS.find((l) => l.value === recommended)?.label}</span> ({LEVELS.find((l) => l.value === recommended)?.cefr})을 선택했어요.
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                onClick={() => setLevel(l.value)}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left text-sm transition",
                  level === l.value ? "border-primary bg-primary/5 text-foreground" : "border-border hover:border-primary/50"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{l.label}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{l.cefr}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{l.desc}</div>
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

      <PlacementQuiz
        open={quizOpen}
        onOpenChange={setQuizOpen}
        onApply={(lv) => {
          setLevel(lv);
          setRecommended(lv);
          toast.success("추천 레벨이 적용됐어요");
        }}
      />
    </div>
  );
}
