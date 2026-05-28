function getTeacherEmails(): string[] {
  const raw =
    (typeof process !== "undefined" && process.env?.TEACHER_EMAILS) ||
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_TEACHER_EMAILS) ||
    "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isTeacherEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getTeacherEmails().includes(email.toLowerCase());
}
