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
  /** Daily message counts for the last 14 days (oldest -> newest). */
  daily_sparkline: number[];
  top_type: string | null;
  top_level: string | null;
};

export type DailyPoint = { date: string; count: number };
export type DistPoint = { key: string; count: number };

export type TeacherOverview = {
  students: StudentRow[];
  dailyActivity: DailyPoint[]; // last 30 days
  exerciseTypeDist: DistPoint[];
  levelDist: DistPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayKey(iso: string): string {
  // YYYY-MM-DD in UTC — consistent bucketing
  return new Date(iso).toISOString().slice(0, 10);
}

function buildDateWindow(days: number): string[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(today.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

function assertTeacher(context: { claims?: Record<string, unknown> | null }) {
  const callerEmail = (context.claims?.email as string | undefined) ?? null;
  if (!isTeacherEmail(callerEmail)) {
    throw new Error("Forbidden: not authorized");
  }
}

export const getTeacherOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TeacherOverview> => {
    assertTeacher(context);

    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const users = usersData.users ?? [];

    const [{ data: threads }, { data: messages }] = await Promise.all([
      supabaseAdmin.from("threads").select("user_id, updated_at, exercise_type, level"),
      supabaseAdmin.from("messages").select("user_id, created_at, role"),
    ]);

    // Per-user aggregates
    const tCount = new Map<string, number>();
    const tLast = new Map<string, string>();
    const userTypeCount = new Map<string, Map<string, number>>();
    const userLevelCount = new Map<string, Map<string, number>>();
    for (const t of threads ?? []) {
      tCount.set(t.user_id, (tCount.get(t.user_id) ?? 0) + 1);
      const prev = tLast.get(t.user_id);
      if (!prev || (t.updated_at && t.updated_at > prev)) tLast.set(t.user_id, t.updated_at);

      let tc = userTypeCount.get(t.user_id);
      if (!tc) {
        tc = new Map<string, number>();
        userTypeCount.set(t.user_id, tc);
      }
      tc.set(t.exercise_type, (tc.get(t.exercise_type) ?? 0) + 1);

      let lc = userLevelCount.get(t.user_id);
      if (!lc) {
        lc = new Map<string, number>();
        userLevelCount.set(t.user_id, lc);
      }
      lc.set(t.level, (lc.get(t.level) ?? 0) + 1);
    }

    const mCount = new Map<string, number>();
    // Per-user daily counts (last 14 days)
    const sparkWindow = buildDateWindow(14);
    const sparkIdx = new Map(sparkWindow.map((d, i) => [d, i] as const));
    const sparkPerUser = new Map<string, number[]>();
    // Overall daily counts (last 30 days)
    const dailyWindow = buildDateWindow(30);
    const dailyIdx = new Map(dailyWindow.map((d, i) => [d, i] as const));
    const dailyArr = new Array<number>(dailyWindow.length).fill(0);

    for (const m of messages ?? []) {
      mCount.set(m.user_id, (mCount.get(m.user_id) ?? 0) + 1);
      if (!m.created_at) continue;
      const day = toDayKey(m.created_at);
      const di = dailyIdx.get(day);
      if (di !== undefined) dailyArr[di] += 1;
      const si = sparkIdx.get(day);
      if (si !== undefined) {
        let arr = sparkPerUser.get(m.user_id);
        if (!arr) {
          arr = new Array<number>(sparkWindow.length).fill(0);
          sparkPerUser.set(m.user_id, arr);
        }
        arr[si] += 1;
      }
    }

    // Distributions
    const typeMap = new Map<string, number>();
    const levelMap = new Map<string, number>();
    for (const t of threads ?? []) {
      typeMap.set(t.exercise_type, (typeMap.get(t.exercise_type) ?? 0) + 1);
      levelMap.set(t.level, (levelMap.get(t.level) ?? 0) + 1);
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
      daily_sparkline:
        sparkPerUser.get(u.id) ?? new Array<number>(sparkWindow.length).fill(0),
    }));

    students.sort((a, b) => {
      const av = a.last_active_at ?? a.created_at ?? "";
      const bv = b.last_active_at ?? b.created_at ?? "";
      return bv.localeCompare(av);
    });

    return {
      students,
      dailyActivity: dailyWindow.map((d, i) => ({ date: d, count: dailyArr[i] })),
      exerciseTypeDist: [...typeMap.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      levelDist: [...levelMap.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
    };
  });

// ---------- Student detail ----------

export type StudentThreadSummary = {
  id: string;
  title: string;
  level: string;
  exercise_type: string;
  updated_at: string;
  created_at: string;
  message_count: number;
};

export type StudentDetail = {
  user: {
    user_id: string;
    email: string | null;
    display_name: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
  };
  stats: {
    thread_count: number;
    message_count: number;
    user_message_count: number;
    active_days: number;
    avg_messages_per_thread: number;
    top_type: string | null;
    top_level: string | null;
  };
  dailyActivity: DailyPoint[]; // last 30 days
  heatmap: DailyPoint[]; // last 84 days (12 weeks)
  exerciseTypeDist: DistPoint[];
  levelDist: DistPoint[];
  threads: StudentThreadSummary[];
};

export const getStudentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => {
    if (!data?.userId || typeof data.userId !== "string") {
      throw new Error("userId is required");
    }
    return data;
  })
  .handler(async ({ context, data }): Promise<StudentDetail> => {
    assertTeacher(context);

    const { data: userResp, error: userErr } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (userErr) throw userErr;
    const u = userResp.user;
    if (!u) throw new Error("Student not found");

    const [{ data: threads }, { data: messages }] = await Promise.all([
      supabaseAdmin
        .from("threads")
        .select("id, title, level, exercise_type, created_at, updated_at")
        .eq("user_id", data.userId)
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("messages")
        .select("thread_id, role, created_at")
        .eq("user_id", data.userId),
    ]);

    const threadMsgCount = new Map<string, number>();
    const typeMap = new Map<string, number>();
    const levelMap = new Map<string, number>();
    for (const t of threads ?? []) {
      typeMap.set(t.exercise_type, (typeMap.get(t.exercise_type) ?? 0) + 1);
      levelMap.set(t.level, (levelMap.get(t.level) ?? 0) + 1);
    }

    const dailyWindow = buildDateWindow(30);
    const dailyIdx = new Map(dailyWindow.map((d, i) => [d, i] as const));
    const dailyArr = new Array<number>(dailyWindow.length).fill(0);

    const heatWindow = buildDateWindow(84);
    const heatIdx = new Map(heatWindow.map((d, i) => [d, i] as const));
    const heatArr = new Array<number>(heatWindow.length).fill(0);

    const activeDaySet = new Set<string>();
    let userMsgCount = 0;
    for (const m of messages ?? []) {
      threadMsgCount.set(m.thread_id, (threadMsgCount.get(m.thread_id) ?? 0) + 1);
      if (m.role === "user") userMsgCount += 1;
      if (!m.created_at) continue;
      const day = toDayKey(m.created_at);
      activeDaySet.add(day);
      const di = dailyIdx.get(day);
      if (di !== undefined) dailyArr[di] += 1;
      const hi = heatIdx.get(day);
      if (hi !== undefined) heatArr[hi] += 1;
    }

    const messageCount = messages?.length ?? 0;
    const threadCount = threads?.length ?? 0;
    const topType = [...typeMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const topLevel = [...levelMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      user: {
        user_id: u.id,
        email: u.email ?? null,
        display_name:
          (u.user_metadata?.full_name as string | undefined) ??
          (u.user_metadata?.name as string | undefined) ??
          null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      },
      stats: {
        thread_count: threadCount,
        message_count: messageCount,
        user_message_count: userMsgCount,
        active_days: activeDaySet.size,
        avg_messages_per_thread:
          threadCount > 0 ? Math.round((messageCount / threadCount) * 10) / 10 : 0,
        top_type: topType,
        top_level: topLevel,
      },
      dailyActivity: dailyWindow.map((d, i) => ({ date: d, count: dailyArr[i] })),
      heatmap: heatWindow.map((d, i) => ({ date: d, count: heatArr[i] })),
      exerciseTypeDist: [...typeMap.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      levelDist: [...levelMap.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      threads: (threads ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        level: t.level,
        exercise_type: t.exercise_type,
        created_at: t.created_at,
        updated_at: t.updated_at,
        message_count: threadMsgCount.get(t.id) ?? 0,
      })),
    };
  });

// ---------- Read-only thread viewer ----------

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ThreadMessage = {
  id: string;
  role: string;
  parts: JsonValue;
  created_at: string;
};

export type StudentThreadDetail = {
  thread: {
    id: string;
    user_id: string;
    title: string;
    level: string;
    exercise_type: string;
    created_at: string;
    updated_at: string;
  };
  student: {
    user_id: string;
    email: string | null;
    display_name: string | null;
  };
  messages: ThreadMessage[];
};

export const getStudentThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { threadId: string }) => {
    if (!data?.threadId || typeof data.threadId !== "string") {
      throw new Error("threadId is required");
    }
    return data;
  })
  .handler(async ({ context, data }): Promise<StudentThreadDetail> => {
    assertTeacher(context);

    const { data: thread, error: threadErr } = await supabaseAdmin
      .from("threads")
      .select("id, user_id, title, level, exercise_type, created_at, updated_at")
      .eq("id", data.threadId)
      .single();
    if (threadErr) throw threadErr;
    if (!thread) throw new Error("Thread not found");

    const [{ data: messages, error: msgErr }, { data: userResp }] = await Promise.all([
      supabaseAdmin
        .from("messages")
        .select("id, role, parts, created_at")
        .eq("thread_id", data.threadId)
        .order("created_at", { ascending: true }),
      supabaseAdmin.auth.admin.getUserById(thread.user_id),
    ]);
    if (msgErr) throw msgErr;

    const u = userResp?.user;
    return {
      thread,
      student: {
        user_id: thread.user_id,
        email: u?.email ?? null,
        display_name:
          (u?.user_metadata?.full_name as string | undefined) ??
          (u?.user_metadata?.name as string | undefined) ??
          null,
      },
      messages: (messages ?? []).map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts as JsonValue,
        created_at: m.created_at,
      })),
    };
  });
