## Plan: 하드코딩 교사 이메일 복원

### Context
현재 `src/lib/teacher-config.ts`는 `TEACHER_EMAILS` / `VITE_TEACHER_EMAILS` 환경 변수를 읽어오도록 구성되어 있습니다. 사용자가 두 개의 구글 계정(sitech3@simin.hs.kr, hongjinwoo@simin.hs.kr)만 하드코딩으로 교사 대시보드에 접근 가능하도록 변경해 달라고 요청했습니다.

### Changes
- `src/lib/teacher-config.ts`: `getTeacherEmails()` 내부를 환경 변수 읽기 대신 정적 배열 `['sitech3@simin.hs.kr', 'hongjinwoo@simin.hs.kr']`로 교체.
- `isTeacherEmail()` 함수는 기존 로직 그대로 유지 (대소문자 무시, 포함 여부 확인).

### Impact
- `/teacher` 경로의 `beforeLoad` 및 서버 함수(`getTeacherOverview`, `getStudentDetail`, `getStudentThread`)의 권한 검증이 해당 2개 이메일로 고정됨.
- 환경 변수 설정 없이도 즉시 동작.