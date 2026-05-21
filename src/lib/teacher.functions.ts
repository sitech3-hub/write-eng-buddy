import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isTeacherEmail } from "./teacher-config";

export type StudentRow = {
  user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  thread_count: number;
  message_count: number;
  last_active_at: string | null;
};

export const getTeacherOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ students: StudentRow[] }> => {
    const callerEmail = (context.claims?.email as string | undefined) ?? null;
    if (!isTeacherEmail(callerEmail)) {
      throw new Error("Forbidden: not authorized");
    }

    // List all users (paginate up to 1000 here; expand if needed)
    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;

    const users = usersData.users ?? [];

    // Aggregate thread and message counts
    const [{ data: threads }, { data: messages }] = await Promise.all([
      supabaseAdmin.from("threads").select("user_id, updated_at"),
      supabaseAdmin.from("messages").select("user_id, created_at"),
    ]);

    const tCount = new Map<string, number>();
    const tLast = new Map<string, string>();
    for (const t of threads ?? []) {
      tCount.set(t.user_id, (tCount.get(t.user_id) ?? 0) + 1);
      const prev = tLast.get(t.user_id);
      if (!prev || (t.updated_at && t.updated_at > prev)) tLast.set(t.user_id, t.updated_at);
    }
    const mCount = new Map<string, number>();
    for (const m of messages ?? []) {
      mCount.set(m.user_id, (mCount.get(m.user_id) ?? 0) + 1);
    }

    const students: StudentRow[] = users.map((u) => ({
      user_id: u.id,
      email: u.email ?? null,
      display_name:
        (u.user_metadata?.full_name as string | undefined) ??
        (u.user_metadata?.name as string | undefined) ??
        null,
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      thread_count: tCount.get(u.id) ?? 0,
      message_count: mCount.get(u.id) ?? 0,
      last_active_at: tLast.get(u.id) ?? null,
    }));

    // Sort by last activity desc, then created desc
    students.sort((a, b) => {
      const av = a.last_active_at ?? a.created_at ?? "";
      const bv = b.last_active_at ?? b.created_at ?? "";
      return bv.localeCompare(av);
    });

    return { students };
  });
