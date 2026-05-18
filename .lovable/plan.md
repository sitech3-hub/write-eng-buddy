# 영어 쓰기 연습 AI 에이전트 계획

## 컨셉
대한민국 중3~고1 학생을 위한 **영어 쓰기 연습 도구**. AI 튜터가 주제(prompt)를 제시하고, 학생이 영어로 글을 쓰면 문법·어휘·표현을 교정하고 한국어로 친절히 피드백한다. 대화는 스레드로 저장되어 다시 열어볼 수 있다.

## 주요 기능

1. **로그인 / 회원가입** (Lovable Cloud — 이메일+구글)
2. **스레드 목록 사이드바**
   - 새 연습 시작 버튼
   - 과거 스레드 클릭 시 해당 URL(`/chat/$threadId`)로 이동
3. **연습 시작 화면 (새 스레드)**
   - 레벨 선택: 중3 / 고1
   - 연습 유형 선택: 자유 작문 / 일기 / 이메일 / 의견 쓰기 / 주제 제시받기
   - 시작하면 AI가 한국어로 안내 + 영어 작문 prompt 제시
4. **쓰기 대화창**
   - 학생이 영어로 작성 → 전송
   - AI 응답 구성 (Markdown 렌더링):
     - ✅ **잘한 점**
     - ✏️ **교정** (원문 → 수정문, 차이점 강조)
     - 📚 **문법/표현 설명** (한국어)
     - 💡 **모범 답안 예시**
     - 🔁 **이어서 써볼 후속 질문**
   - AI Elements 기반 채팅 UI, 응답 스트리밍, 타이핑 인디케이터
5. **스레드 자동 제목 생성** (첫 메시지 기반)

## 기술 구조 (기술 섹션)

- **스택**: TanStack Start + Lovable Cloud(Supabase) + AI SDK + Lovable AI Gateway
- **모델**: `google/gemini-3-flash-preview` (기본), 시스템 프롬프트에 학습 레벨·교정 형식 명시
- **라우트**
  - `/` — 로그인 안 됐으면 `/login`, 됐으면 가장 최근 스레드 또는 신규 생성 후 `/chat/$threadId`로 이동
  - `/login` — 이메일/구글 로그인
  - `/_authenticated/chat/$threadId` — 스레드별 채팅 페이지
- **서버**
  - `src/routes/api/chat.ts` — `streamText` + `toUIMessageStreamResponse`, `onFinish`에서 메시지 저장
  - `src/lib/threads.functions.ts` — `requireSupabaseAuth` 미들웨어로 스레드 CRUD
- **DB 테이블**
  - `threads` (id uuid, user_id, title, level, exercise_type, created_at, updated_at)
  - `messages` (id uuid 자동, thread_id, role, parts jsonb, created_at) — UUID는 DB 생성, AI SDK `msg_...` ID는 저장 안 함
  - RLS: `auth.uid() = user_id`로 본인 데이터만 접근
- **클라이언트**
  - `useChat({ id: threadId, messages: initialMessages, transport })` — threadId로 remount
  - AI Elements: `Conversation`, `Message`, `MessageResponse`, `PromptInput`, `PromptInputTextarea`, `PromptInputFooter`, `PromptInputSubmit`, `Shimmer`
  - 어시스턴트 메시지는 배경 없이, 사용자 메시지는 `primary`/`primary-foreground` 버블
- **AI Gateway**: `createLovableAiGatewayProvider` 헬퍼, `LOVABLE_API_KEY` 서버 전용
- **start.ts**: `attachSupabaseAuth` functionMiddleware 등록 확인

## 디자인
- 미니멀, 화이트 베이스 + 포인트 컬러 1개(예: indigo)
- 모바일 우선, 사이드바는 모바일에서 Sheet
- 충분한 여백, 명확한 위계, shadcn/ui 기반
- 학생 친화적이지만 너무 유치하지 않은 톤

## 구축 순서
1. Lovable Cloud 활성화 + 로그인/회원가입(이메일+구글)
2. `threads`, `messages` 테이블 + RLS 마이그레이션
3. AI Gateway 헬퍼 + `/api/chat` 서버 라우트(시스템 프롬프트 포함)
4. 스레드 CRUD server functions
5. AI Elements 설치 후 채팅 UI 구성 (사이드바 + 스레드 페이지)
6. 새 스레드 시작 화면(레벨/유형 선택)
7. 두 스레드 생성 → 새로고침 검증

## 향후 확장(이번 범위 외)
- 말하기 연습(음성 입력)
- 학습 통계, 자주 틀리는 문법 추적
- 단어장 자동 저장
