import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">페이지를 찾을 수 없어요.</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">홈으로</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">문제가 발생했어요</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={() => { router.invalidate(); reset(); }} className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">다시 시도</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WriteEng — 영어 쓰기 연습 AI 튜터" },
      { name: "description", content: "한국 중·고등학생을 위한 영어 쓰기 연습 AI 튜터. 작문을 보내면 교정, 문법 설명, 모범 답안을 받아볼 수 있어요." },
      { property: "og:title", content: "WriteEng — 영어 쓰기 연습 AI 튜터" },
      { name: "twitter:title", content: "WriteEng — 영어 쓰기 연습 AI 튜터" },
      { property: "og:description", content: "한국 중·고등학생을 위한 영어 쓰기 연습 AI 튜터. 작문을 보내면 교정, 문법 설명, 모범 답안을 받아볼 수 있어요." },
      { name: "twitter:description", content: "한국 중·고등학생을 위한 영어 쓰기 연습 AI 튜터. 작문을 보내면 교정, 문법 설명, 모범 답안을 받아볼 수 있어요." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e51fabe1-91ae-4418-86b0-019707f58b42/id-preview-1ca57477--28eee712-489f-4332-b9a7-864f0ff62312.lovable.app-1779323915729.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/e51fabe1-91ae-4418-86b0-019707f58b42/id-preview-1ca57477--28eee712-489f-4332-b9a7-864f0ff62312.lovable.app-1779323915729.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthSync />
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}

function AuthSync() {
  const router = useRouter();
  const queryClient = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);
  return null;
}
