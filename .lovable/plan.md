
# 교사 대시보드 확장 — 학생 누적기록 + 시각화

현재 대시보드는 학생 목록 + 카운트 3종(StatCard)만 있습니다. 교사가 실제로 학습 지도에 활용할 수 있도록 **누적 학습 기록**과 **차트 시각화**를 추가합니다.

## 추가할 섹션 (우선순위 순)

### 1. 전체 활동 추이 차트 (대시보드 상단)
- **일자별 메시지 수 라인/에어리어 차트** (최근 30일)
  - x축: 날짜, y축: 메시지 수
  - 학생 활동이 활발한 시기 한눈에 파악
- **연습 유형별 분포 도넛 차트** (자유작문/일기/이메일/의견/주제제시)
  - 어떤 유형을 많이 연습하는지

### 2. 레벨 분포 막대 차트
- 중1~고3 6단계별 학생 수(또는 스레드 수)
- 학년별 활동 편차 확인

### 3. 학생 카드 그리드 (기존 테이블 대체 또는 보완)
- 학생별 카드에:
  - 이름/이메일
  - 누적 연습/메시지 수
  - **미니 스파크라인** (최근 14일 활동) — 시각적으로 활성/비활성 학생 즉시 구분
  - 마지막 활동 시각
  - 상세 보기 버튼 → `/teacher/student/$userId` 페이지로 이동

### 4. 학생 상세 페이지 (`/teacher/student/$userId`) ⭐ 핵심
교사가 한 학생을 깊이 들여다볼 수 있는 페이지:
- **누적 통계**: 총 연습 수, 총 메시지 수, 평균 메시지/스레드, 활동 일수, 가장 많이 한 연습 유형, 주로 사용한 레벨
- **활동 히트맵** (GitHub-style 잔디): 최근 12주 일자별 활동량
- **일자별 활동 차트**: 라인/바 차트 (최근 30일)
- **연습 유형 분포**: 도넛
- **스레드 목록**: 제목, 레벨, 유형, 메시지 수, 마지막 활동일 → 클릭 시 읽기 전용으로 대화 내용 보기
- **(선택) 자주 등장한 영어 키워드 클라우드** — 학생 메시지에서 추출

### 5. (선택, 추후) 최근 교정 사례
- 어시스턴트 메시지 중 `✏️ 교정` 섹션을 파싱해 "최근 교정 5건" 표시
- 학생이 자주 틀리는 패턴 인사이트

## 기술 구현 계획

### 라이브러리
- **Recharts** (이미 shadcn/ui chart 컴포넌트로 일부 포함되어 있을 가능성. 확인 후 없으면 `bun add recharts`)
- 히트맵: 별도 라이브러리 없이 grid + opacity로 직접 구현 (가벼움)
- 카운트업 애니메이션, fade-in 등 시각 효과는 Tailwind transition + 간단한 CSS 키프레임으로

### 서버 함수 추가/확장 (`src/lib/teacher.functions.ts`)
- `getTeacherOverview()` 확장 — 반환에 추가:
  - `dailyActivity: { date: string; count: number }[]` (최근 30일)
  - `exerciseTypeDist: { type: string; count: number }[]`
  - `levelDist: { level: string; count: number }[]`
  - 각 학생 row에 `daily_sparkline: number[]` (최근 14일)
- `getStudentDetail(userId)` 신규
  - 인증 + 교사 이메일 화이트리스트 재확인
  - 해당 학생의 스레드 목록, 일자별 활동, 유형/레벨 분포, 히트맵 데이터 반환
- `getStudentThread(userId, threadId)` 신규 — 교사가 대화 읽기 전용 조회

### 라우트
- `src/routes/_authenticated/teacher.tsx` — 차트/스파크라인 추가
- `src/routes/_authenticated/teacher.student.$userId.tsx` — 학생 상세 페이지 신규
- 둘 다 `beforeLoad`에서 `isTeacherEmail` 가드

### 시각 효과
- 카드/차트 등장 시 fade-in + slide-up (Tailwind `animate-in fade-in slide-in-from-bottom-2`)
- 숫자 카운트업 (간단한 `useEffect` + `requestAnimationFrame`)
- 히트맵 셀 hover 시 tooltip
- 차트는 부드러운 곡선 + 그라데이션 area
- 미니멀 디자인 원칙 유지: 모노톤 + 포인트 컬러 1개 (primary)

## 데이터/성능 고려
- `messages` 테이블의 `created_at`만으로 일자별 집계 가능 — admin 클라이언트로 group by
- 학생 수가 많아질 경우 30일 윈도우로 제한, 학생 카드는 페이지네이션 또는 검색 추가 (이번 범위 외)

## 작업 순서 (구현 시)
1. `teacher.functions.ts` 확장 + 신규 서버 함수 작성
2. recharts 설치 확인/추가
3. `teacher.tsx`에 차트 섹션 + 스파크라인 카드 그리드 추가
4. `teacher.student.$userId.tsx` 신규 페이지 작성
5. 시각 효과(애니메이션, hover) 다듬기
6. 빌드 확인 + 두 교사 계정으로 동작 확인

---

**확인 요청**:
- 위 5개 섹션 전부 한 번에 진행할까요, 아니면 **(1)전체 추이 차트 + (3)스파크라인 카드 + (4)학생 상세 페이지** 핵심 3개부터 먼저 구현할까요?
- 학생 상세에서 **대화 내용 읽기**도 포함할까요? (사생활/허락 측면에서 학교 정책에 따라 다를 수 있어 확인합니다.)
