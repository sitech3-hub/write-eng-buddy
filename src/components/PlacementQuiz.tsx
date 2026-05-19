import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Q = { q: string; options: { text: string; correct?: boolean }[]; cefr: "A1" | "A2" | "B1" | "B2" };

// 8문항: CEFR A1~B2 난이도 분포 (A1×2, A2×2, B1×2, B2×2)
const QUESTIONS: Q[] = [
  {
    cefr: "A1",
    q: "She ___ a student.",
    options: [{ text: "am" }, { text: "is", correct: true }, { text: "are" }, { text: "be" }],
  },
  {
    cefr: "A1",
    q: "다음 중 'apple'의 뜻은?",
    options: [{ text: "바나나" }, { text: "오렌지" }, { text: "사과", correct: true }, { text: "포도" }],
  },
  {
    cefr: "A2",
    q: "Yesterday, I ___ to the park.",
    options: [{ text: "go" }, { text: "goes" }, { text: "went", correct: true }, { text: "going" }],
  },
  {
    cefr: "A2",
    q: "He is ___ than his brother.",
    options: [{ text: "tall" }, { text: "taller", correct: true }, { text: "tallest" }, { text: "more tall" }],
  },
  {
    cefr: "B1",
    q: "If it ___ tomorrow, we will stay home.",
    options: [{ text: "rains", correct: true }, { text: "will rain" }, { text: "rained" }, { text: "raining" }],
  },
  {
    cefr: "B1",
    q: "I have ___ in Seoul for five years.",
    options: [{ text: "live" }, { text: "lived", correct: true }, { text: "living" }, { text: "lives" }],
  },
  {
    cefr: "B2",
    q: "The report, ___ was published last week, contains key findings.",
    options: [{ text: "who" }, { text: "which", correct: true }, { text: "what" }, { text: "whose" }],
  },
  {
    cefr: "B2",
    q: "Had I known earlier, I ___ differently.",
    options: [
      { text: "would act" },
      { text: "will have acted" },
      { text: "would have acted", correct: true },
      { text: "had acted" },
    ],
  },
];

const LEVEL_BY_SCORE: { value: string; label: string; cefr: string }[] = [
  { value: "middle1", label: "중학교 1학년", cefr: "A1" },
  { value: "middle2", label: "중학교 2학년", cefr: "A1–A2" },
  { value: "middle3", label: "중학교 3학년", cefr: "A2" },
  { value: "high1", label: "고등학교 1학년", cefr: "A2–B1" },
  { value: "high2", label: "고등학교 2학년", cefr: "B1" },
  { value: "high3", label: "고등학교 3학년", cefr: "B1–B2" },
];

function recommend(answers: (number | null)[]) {
  let score = 0;
  const weight: Record<Q["cefr"], number> = { A1: 1, A2: 2, B1: 3, B2: 4 };
  QUESTIONS.forEach((q, i) => {
    const a = answers[i];
    if (a !== null && q.options[a]?.correct) score += weight[q.cefr];
  });
  // 최대 점수 = 2*(1+2+3+4) = 20
  if (score <= 3) return LEVEL_BY_SCORE[0];
  if (score <= 6) return LEVEL_BY_SCORE[1];
  if (score <= 10) return LEVEL_BY_SCORE[2];
  if (score <= 13) return LEVEL_BY_SCORE[3];
  if (score <= 16) return LEVEL_BY_SCORE[4];
  return LEVEL_BY_SCORE[5];
}

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onApply: (level: string) => void;
};

export function PlacementQuiz({ open, onOpenChange, onApply }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => QUESTIONS.map(() => null));
  const [done, setDone] = useState(false);

  const reset = () => {
    setStep(0);
    setAnswers(QUESTIONS.map(() => null));
    setDone(false);
  };

  const handleSelect = (idx: number) => {
    const next = [...answers];
    next[step] = idx;
    setAnswers(next);
  };

  const handleNext = () => {
    if (step < QUESTIONS.length - 1) setStep(step + 1);
    else setDone(true);
  };

  const result = done ? recommend(answers) : null;
  const current = QUESTIONS[step];
  const selected = answers[step];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {!done ? (
          <>
            <DialogHeader>
              <DialogTitle>배치 퀴즈</DialogTitle>
              <DialogDescription>
                {step + 1} / {QUESTIONS.length} · 가장 알맞은 답을 골라주세요.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${((step + (selected !== null ? 1 : 0)) / QUESTIONS.length) * 100}%` }}
                />
              </div>

              <p className="text-base font-medium leading-relaxed">{current.q}</p>

              <div className="space-y-2">
                {current.options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSelect(idx)}
                    className={cn(
                      "w-full rounded-xl border px-4 py-3 text-left text-sm transition",
                      selected === idx
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep(Math.max(0, step - 1))}
                disabled={step === 0}
              >
                이전
              </Button>
              <Button onClick={handleNext} disabled={selected === null}>
                {step === QUESTIONS.length - 1 ? "결과 보기" : "다음"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>추천 레벨</DialogTitle>
              <DialogDescription>퀴즈 결과를 바탕으로 추천드려요.</DialogDescription>
            </DialogHeader>

            <div className="rounded-xl border bg-muted/30 p-5 text-center">
              <div className="text-xs text-muted-foreground">추천 학년</div>
              <div className="mt-1 text-2xl font-semibold">{result?.label}</div>
              <div className="mt-2 inline-block rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                CEFR {result?.cefr}
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                정답 {answers.filter((a, i) => a !== null && QUESTIONS[i].options[a]?.correct).length} /{" "}
                {QUESTIONS.length}
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={reset}>
                다시 풀기
              </Button>
              <Button
                onClick={() => {
                  if (result) onApply(result.value);
                  onOpenChange(false);
                  reset();
                }}
              >
                이 레벨로 설정
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
