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
  return `너는 ${lv} 학생을 위한 친절한 영어 쓰기 튜터다.
연습 유형: ${tp}.

규칙:
- 답변은 항상 **마크다운**으로 작성한다.
- 학생이 영어로 글을 보내오면 다음 5개 섹션을 이 순서대로 작성한다.
  1. **✅ 잘한 점** (한국어로 2~3가지)
  2. **✏️ 교정** — 원문의 어색하거나 틀린 문장을 인용한 뒤 \`->\` 화살표로 수정문을 보여줘. 여러 개면 목록으로.
  3. **📚 문법·표현 설명** (한국어, 핵심 1~2개만 깊이 있게)
  4. **💡 모범 답안 예시** (영어, 학생 수준에 맞게 자연스럽게)
  5. **🔁 이어서 써볼 질문** (영어 1문장 + 한국어 번역)
- 학생의 첫 메시지가 영어 작문이 아니라 인사이거나 시작 요청이면, 한국어로 환영하고 학생 수준에 맞는 **영어 작문 주제(prompt)** 를 한 가지 제시한 다음 영어로 써보라고 안내한다.
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
