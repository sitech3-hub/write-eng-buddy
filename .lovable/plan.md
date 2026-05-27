
# AI 모델 자동 폴백 로직 추가

`/api/chat` 서버 라우트에서 Lovable AI Gateway 호출 시 크레딧 소진(402) 또는 레이트 리밋(429)이 감지되면 자동으로 더 저렴/가벼운 모델로 재시도하는 로직을 추가합니다.

## 동작 방식

1. **기본 모델**: `google/gemini-3-flash-preview` (현재와 동일)
2. **1차 폴백**: `google/gemini-2.5-flash` (균형형, 저렴)
3. **2차 폴백**: `google/gemini-2.5-flash-lite` (최저가, 빠름)

스트리밍 시작 전에 모델을 한 번 ping(짧은 헬스 체크) 하기보다는, 실제 `streamText` 호출 시 발생하는 에러를 catch 해서 다음 모델로 넘어가는 방식이 가장 자연스럽습니다. AI SDK는 `streamText`가 비동기로 stream을 반환하므로, 첫 청크 직전 에러를 잡기 위해 `onError` 콜백 + try/catch 조합을 씁니다.

## 변경 파일

### 1. `src/lib/ai-gateway.ts`
- 모델 폴백 체인 상수 추가: `MODEL_FALLBACK_CHAIN = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash", "google/gemini-2.5-flash-lite"]`
- 헬퍼 함수 `isCreditOrRateLimitError(err)` 추가: 에러 메시지/상태코드에서 402, 429, "payment required", "rate limit", "quota" 패턴을 감지

### 2. `src/routes/api/chat.ts`
- 기존 단일 `streamText({ model, ... })` 호출을 폴백 루프로 감싼다:
  ```
  for (const modelId of MODEL_FALLBACK_CHAIN) {
    try {
      const result = streamText({
        model: gateway(modelId),
        system,
        messages,
        onError: ({ error }) => { /* log + 다음 시도 신호 */ },
      });
      // 첫 응답이 안전하게 시작되면 그대로 반환
      return result.toUIMessageStreamResponse({ ... });
    } catch (err) {
      if (isCreditOrRateLimitError(err) && hasNextModel) continue;
      throw err;
    }
  }
  ```
- 폴백이 발생한 경우, 어시스턴트 메시지 저장 시 사용된 모델 ID를 콘솔에 로그 (디버깅용). 메시지 parts에는 영향을 주지 않음.
- 모든 모델 소진 시 사용자에게 명확한 한국어 에러 응답:
  - 402 → "AI 사용 크레딧이 모두 소진되었습니다. 워크스페이스 설정에서 크레딧을 추가해 주세요."
  - 429 → "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."

### 3. 클라이언트 토스트 (선택)
`src/routes/_authenticated/chat.$threadId.tsx`의 `useChat` `onError`에서 위 에러 메시지가 오면 토스트로 표시 (이미 onError가 있다면 해당 분기 보강, 없으면 추가).

## 주의사항

- 스트리밍 중간에 모델을 바꿀 수는 없음 — 폴백은 **스트림이 시작되기 전** 또는 **즉시 실패**한 경우에만 동작.
- 폴백 발생 시 시스템 프롬프트/메시지는 동일하게 재사용 (CEFR/난이도 유지).
- 모델 자체 능력 차이로 응답 품질이 다소 떨어질 수 있다는 점은 사용자에게 별도 안내하지 않음 (UX 매끄럽게).

## 검증

- 빌드 통과 확인
- `/api/chat` 정상 동작 확인 (기본 모델 호출되는지)
- 모델 ID를 일부러 잘못 넣어 폴백이 동작하는지 로그 확인 (개발 중 임시)
