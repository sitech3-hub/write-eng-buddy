const TEACHER_EMAILS = [
  "sitech3@simin.hs.kr",
  "hongjinwoo@simin.hs.kr",
].map((e) => e.toLowerCase());

export function isTeacherEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEACHER_EMAILS.includes(email.toLowerCase());
}
