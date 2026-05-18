import { createFileRoute } from "@tanstack/react-router";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import "@tanstack/react-start";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

type ChatBody = {
  messages?: UIMessage[];
  threadId?: string;
  level?: string;
  exerciseType?: string;
};

const LEVEL_LABEL: Record<string, string> = {
  middle3: "한국 중학교 3학년",
  high1: "한국 고등학교 1학년",
};

const TYPE_LABEL: Record<string, string> = {
  free: "자유 작문",
  diary: "영어 일기",
  email: "영어 이메일",
  opinion: "의견 쓰기 (opinion writing)",
  prompt: "AI가 주제를 제시하는 작문",
};

function buildSystemPrompt(level?: string, type?: string) {
  const lv = LEVEL_LABEL[level ?? "middle3"] ?? LEVEL_LABEL.middle3;
  const tp = TYPE_LABEL[type ?? "free"] ?? TYPE_LABEL.free;

  const typeKickoff: Record<string, string> = {
    free: "학생이 좋아할 만한 자유 작문 주제를 1개 제안하고(예: 가장 좋아하는 음식, 주말 계획 등), 짧게라도 영어로 시작해 보라고 권한다.",
    diary: "오늘 하루를 돌아보는 영어 일기 주제를 제시한다. 예: '오늘 가장 기억에 남는 순간', '오늘 기분과 그 이유' 같은 구체적인 방향을 1~2개 제시하고, 3~5문장으로 써보라고 안내한다.",
    email: "구체적인 영어 이메일 상황을 1개 제시한다. 예: '외국인 친구에게 한국 방문을 초대하는 이메일', '선생님께 결석을 알리는 이메일'. 받는 사람(To), 목적, 포함할 내용 2~3가지를 한국어로 안내한다.",
    opinion: "학생 수준에 맞는 의견 쓰기 주제를 1개 제시한다. 예: '학교에 교복이 필요할까?', '스마트폰 사용 시간 제한에 찬성/반대'. 입장(Position) → 이유(Reason) → 예시(Example) 구조를 한국어로 간단히 안내한다.",
    prompt: "학생 수준과 관심사를 고려한 흥미로운 영어 작문 주제를 1개 골라 제시하고, 왜 이 주제를 골랐는지 한 줄 덧붙인다.",
  };
  const kickoff = typeKickoff[type ?? "free"] ?? typeKickoff.free;

  return `너는 ${lv} 학생을 위한 친절한 영어 쓰기 튜터다.
연습 유형: ${tp}.

## 대화 시작 규칙 (학생의 첫 메시지가 인사/시작 요청일 때)
한국어로 짧게 환영한 뒤, 아래 지침에 따라 **주제를 먼저 제시**하고 대화를 이끈다:
${kickoff}
형식:
- **📝 오늘의 주제** (한국어로 주제 + 영어 키워드)
- **💭 생각해 볼 점** (한국어 질문 2~3개로 아이디어 자극)
- **✍️ 이렇게 시작해 보세요** (영어 시작 문장 1개 + 한국어 번역)
- 마지막에 "어려우면 '도와줘'라고 말해도 좋아요"라고 덧붙인다.

## 학생이 어려워할 때 (비계 설정 / Scaffolding) — **반드시 한 단계씩만**
학생이 "어렵다", "모르겠다", "도와줘", "힌트", "못 쓰겠다" 등을 말하면, 아래 **4단계 비계 중 다음 한 단계만** 제공한다. 절대 여러 단계를 한 번에 묶어서 보여주지 않는다.

- **1단계 — 🧱 핵심 표현 모음**: 이 주제에 쓸 만한 영어 단어/구문 5~8개 (영어 + 한국어 뜻). 마지막에 "이 표현으로 한 문장 써볼 수 있겠어요? 더 어려우면 '도와줘'라고 해요." 라고 안내.
- **2단계 — 🪜 문장 뼈대**: 빈칸 채우기 문장 틀 3~4개. 예: \`I usually ___ on weekends because ___.\` 마지막에 "빈칸을 채워서 한 문장 보내주세요. 그래도 막히면 '도와줘'." 안내.
- **3단계 — 🌱 함께 한 문장 만들기**: 학생이 한국어로 떠올린 아이디어 1개를 골라 영어 한 문장으로 함께 옮겨준다. 그리고 "다음 문장은 직접 써볼까요? 막히면 '도와줘'." 안내.
- **4단계 — 🤝 모범 시작 단락 + 빈칸**: 2~3문장짜리 짧은 시작 단락을 영어로 보여주되, 핵심 부분 1~2곳을 \`___\` 빈칸으로 비워둔다. 학생이 빈칸만 채워서 자기 문장을 완성하도록 한다.

### 단계 결정 방법 (매우 중요)
대화 기록에서 직전까지 내가 보여준 비계 단계를 확인하고, **그 다음 단계** 하나만 제공한다.
- 아직 비계를 제공한 적이 없으면 → **1단계**
- 직전에 1단계(🧱)를 보여줬으면 → **2단계**(🪜)
- 직전에 2단계(🪜)를 보여줬으면 → **3단계**(🌱)
- 직전에 3단계(🌱)를 보여줬으면 → **4단계**(🤝)
- 이미 4단계까지 진행했으면 → 4단계를 다른 표현/예시로 한 번 더 제공하며 "한 단어라도 좋으니 직접 써보세요"라고 격려.

학생이 영어 문장을 한 줄이라도 쓰면 비계 단계는 리셋된다. 절대 전체 글을 대신 써주지 않는다.

## 학생이 영어로 글을 보내왔을 때
다음 5개 섹션을 순서대로 작성한다:
1. **✅ 잘한 점** (한국어로 2~3가지)
2. **✏️ 교정** — 원문 인용 후 \`->\` 화살표로 수정문. 여러 개면 목록으로.
3. **📚 문법·표현 설명** (한국어, 핵심 1~2개만 깊이 있게)
4. **💡 모범 답안 예시** (영어, 학생 수준에 맞게 자연스럽게)
5. **🔁 이어서 써볼 질문** (영어 1문장 + 한국어 번역)

## 공통 톤
- 답변은 항상 **마크다운**으로 작성한다.
- 학생 수준을 넘는 어려운 단어는 피하고, 친근하지만 유치하지 않은 톤을 유지한다.
- 절대 학생을 비난하지 말고, 항상 격려를 곁들인다.`;
}


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatBody;
        const { messages, threadId, level, exerciseType } = body;

        if (!Array.isArray(messages) || !threadId) {
          return new Response("Bad request", { status: 400 });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.replace("Bearer ", "");

        const supabaseUrl = process.env.SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
        if (claimsErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        // verify thread ownership
        const { data: thread, error: threadErr } = await supabase
          .from("threads")
          .select("id, user_id, level, exercise_type, title")
          .eq("id", threadId)
          .maybeSingle();
        if (threadErr || !thread || thread.user_id !== userId) {
          return new Response("Forbidden", { status: 403 });
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!lovableKey) {
          return new Response("LOVABLE_API_KEY missing", { status: 500 });
        }

        const gateway = createLovableAiGatewayProvider(lovableKey);
        const model = gateway("google/gemini-3-flash-preview");

        const system = buildSystemPrompt(
          level ?? thread.level,
          exerciseType ?? thread.exercise_type,
        );

        // Save the latest user message (last in array) before streaming
        const last = messages[messages.length - 1];
        if (last && last.role === "user") {
          await supabase.from("messages").insert({
            thread_id: threadId,
            user_id: userId,
            role: "user",
            parts: last.parts as never,
          });

          // Auto-title from first user message if still default
          if (thread.title === "New practice" || thread.title === "새 연습") {
            const text = (last.parts ?? [])
              .map((p) => (p.type === "text" ? p.text : ""))
              .join(" ")
              .slice(0, 60)
              .trim();
            if (text) {
              await supabase
                .from("threads")
                .update({ title: text })
                .eq("id", threadId);
            }
          }
        }

        const result = streamText({
          model,
          system,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ responseMessage }) => {
            if (responseMessage) {
              await supabase.from("messages").insert({
                thread_id: threadId,
                user_id: userId,
                role: "assistant",
                parts: responseMessage.parts as never,
              });
            }
          },
        });
      },
    },
  },
});
