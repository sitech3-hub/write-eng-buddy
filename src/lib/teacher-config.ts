export const TEACHER_EMAILS = [
  "sitech3@simin.hs.kr",
  "hongjinwoo@simin.hs.kr",
] as const;

export function isTeacherEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEACHER_EMAILS.includes(email.toLowerCase() as (typeof TEACHER_EMAILS)[number]);
}
