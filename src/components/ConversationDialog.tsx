import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";

import { getStudentThread, type JsonValue } from "@/lib/teacher.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

const TYPE_LABEL: Record<string, string> = {
  free: "자유작문",
  diary: "일기",
  email: "이메일",
  opinion: "의견",
  prompt: "주제제시",
};
const LEVEL_LABEL: Record<string, string> = {
  middle1: "중1",
  middle2: "중2",
  middle3: "중3",
  high1: "고1",
  high2: "고2",
  high3: "고3",
};

function formatDate(s: string): string {
  const d = new Date(s);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Extract human-readable text from AI SDK UIMessage `parts` JSON. */
function extractText(parts: JsonValue): string {
  if (parts == null) return "";
  if (typeof parts === "string") return parts;
  if (Array.isArray(parts)) {
    return parts.map(extractText).filter(Boolean).join("\n");
  }
  if (typeof parts === "object") {
    const obj = parts as { [k: string]: JsonValue };
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    if (Array.isArray(obj.content)) return extractText(obj.content);
    return "";
  }
  return "";
}

function sanitizeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|\n\r]+/g, " ").trim().slice(0, 60) || "conversation";
}

function csvEscape(s: string): string {
  // Wrap in quotes; escape internal quotes by doubling them.
  return `"${s.replace(/"/g, '""')}"`;
}

export type ConversationDialogProps = {
  threadId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ConversationDialog({ threadId, open, onOpenChange }: ConversationDialogProps) {
  const fetchThread = useServerFn(getStudentThread);
  const contentRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<"pdf" | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["teacher-thread", threadId],
    queryFn: () => fetchThread({ data: { threadId: threadId as string } }),
    enabled: !!threadId && open,
  });

  // Reset export state on close
  useEffect(() => {
    if (!open) setExporting(null);
  }, [open]);

  const baseName = data
    ? sanitizeFilename(
        `${data.student.display_name ?? data.student.email ?? "student"}_${data.thread.title}`,
      )
    : "conversation";

  function handleExportCsv() {
    if (!data) return;
    const header = ["발신자", "시간", "내용"];
    const rows = data.messages.map((m) => [
      m.role === "user" ? "학생" : "튜터",
      formatDate(m.created_at),
      extractText(m.parts),
    ]);
    const csv =
      // UTF-8 BOM ensures Excel opens Korean correctly.
      "\uFEFF" +
      [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleExportPdf() {
    if (!data || !contentRef.current) return;
    setExporting("pdf");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const imgWidth = pageWidth - margin * 2;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const imgData = canvas.toDataURL("image/png");

      let heightLeft = imgHeight;
      let position = margin;
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;

      while (heightLeft > 0) {
        position = margin - (imgHeight - heightLeft);
        pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
        heightLeft -= pageHeight - margin * 2;
      }

      pdf.save(`${baseName}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="pr-8 text-base font-semibold">
            {data ? data.thread.title : "대화 불러오는 중..."}
          </DialogTitle>
          {data && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{data.student.display_name ?? data.student.email ?? "—"}</span>
              <span>· {TYPE_LABEL[data.thread.exercise_type] ?? data.thread.exercise_type}</span>
              <span>· {LEVEL_LABEL[data.thread.level] ?? data.thread.level}</span>
              <span>· 메시지 {data.messages.length}</span>
            </div>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div ref={contentRef} className="bg-white px-6 py-5">
            {isLoading && (
              <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중...</p>
            )}
            {error && (
              <p className="py-10 text-center text-sm text-destructive">불러오지 못했어요.</p>
            )}
            {data && data.messages.length === 0 && (
              <p className="py-10 text-center text-xs text-muted-foreground">메시지가 없어요.</p>
            )}
            {data && data.messages.length > 0 && (
              <div className="space-y-3">
                {data.messages.map((m) => {
                  const isUser = m.role === "user";
                  const text = extractText(m.parts);
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl border px-4 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "border-primary/30 bg-primary/10"
                            : "border-border bg-card"
                        }`}
                        style={{ color: "#111" }}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                          <span className="font-medium">{isUser ? "학생" : "튜터"}</span>
                          <span>{formatDate(m.created_at)}</span>
                        </div>
                        <div className="whitespace-pre-wrap break-words">
                          {text || <span className="text-muted-foreground">(빈 메시지)</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={!data || data.messages.length === 0}
          >
            <FileText className="mr-1 h-3.5 w-3.5" /> CSV 내보내기
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleExportPdf}
            disabled={!data || data.messages.length === 0 || exporting === "pdf"}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            {exporting === "pdf" ? "PDF 생성 중..." : "PDF 내보내기"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
