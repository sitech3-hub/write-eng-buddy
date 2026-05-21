import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/chat" });
    });
  }, [navigate]);

  const handleGoogle = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("구글 로그인 실패");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/chat" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background text-xs font-semibold">W</span>
            <span className="text-2xl font-semibold tracking-tight">WriteEng</span>
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">영어 쓰기 연습 AI 튜터</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">시작하기</h1>
          <p className="mt-1 text-sm text-muted-foreground">구글 계정으로 로그인하여 학습을 시작하세요.</p>

          <Button
            className="mt-5 w-full gap-2"
            size="lg"
            onClick={handleGoogle}
            disabled={loading}
          >
            <GoogleIcon className="h-4 w-4" />
            Google 계정으로 계속하기
          </Button>

          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            계속 진행하면 학습 활동 기록에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.5 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.6 15 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 5.1 29.3 3 24 3 16.3 3 9.7 7.3 6.3 14.1z"/>
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.5-5.2l-6.2-5.2C29.3 36 26.8 37 24 37c-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 40.6 16.2 45 24 45z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.2 5.2C41.7 35.4 45 30.1 45 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
