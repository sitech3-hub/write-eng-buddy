import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const createLovableAiGatewayProvider = (lovableApiKey: string) =>
  createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });

// Cheapest-last fallback chain. When the primary model hits credit/rate
// limits, subsequent requests automatically use a lighter model.
export const MODEL_FALLBACK_CHAIN = [
  "google/gemini-3-flash-preview",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
] as const;

export type GatewayErrorKind = "credit" | "rate" | null;

// In-memory state shared across requests in the same server instance.
let activeIndex = 0;
let activeChangedAt = Date.now();
let lastErrorKind: GatewayErrorKind = null;
let lastErrorAt: number | null = null;
const RESET_AFTER_MS = 10 * 60 * 1000; // retry primary after 10 minutes

export function getActiveModelId(): string {
  if (activeIndex > 0 && Date.now() - activeChangedAt > RESET_AFTER_MS) {
    activeIndex = 0;
    activeChangedAt = Date.now();
    lastErrorKind = null;
    console.info("[ai-gateway] cooldown elapsed, retrying primary model");
  }
  return MODEL_FALLBACK_CHAIN[activeIndex];
}

export function getModelStatusSnapshot() {
  // Trigger cooldown check first
  getActiveModelId();
  return {
    activeIndex,
    activeModelId: MODEL_FALLBACK_CHAIN[activeIndex],
    primaryModelId: MODEL_FALLBACK_CHAIN[0],
    chain: [...MODEL_FALLBACK_CHAIN] as string[],
    lastErrorKind,
    lastErrorAt,
    changedAt: activeChangedAt,
    resetAfterMs: RESET_AFTER_MS,
  };
}

export function classifyGatewayError(err: unknown): GatewayErrorKind {
  const anyErr = err as { message?: string; statusCode?: number; status?: number; cause?: unknown };
  const status = anyErr?.statusCode ?? anyErr?.status;
  const msg = String(anyErr?.message ?? "").toLowerCase();
  const causeMsg = String((anyErr?.cause as { message?: string } | undefined)?.message ?? "").toLowerCase();
  const all = `${msg} ${causeMsg}`;
  if (status === 402 || all.includes("payment required") || all.includes("insufficient") || all.includes("credit") || all.includes("quota")) {
    return "credit";
  }
  if (status === 429 || all.includes("rate limit") || all.includes("too many requests")) {
    return "rate";
  }
  return null;
}

export function bumpModelOnError(err: unknown): GatewayErrorKind {
  const kind = classifyGatewayError(err);
  if (!kind) return null;
  lastErrorKind = kind;
  lastErrorAt = Date.now();
  if (activeIndex < MODEL_FALLBACK_CHAIN.length - 1) {
    activeIndex++;
    activeChangedAt = Date.now();
    console.warn(
      `[ai-gateway] ${kind} error detected, switching to cheaper model: ${MODEL_FALLBACK_CHAIN[activeIndex]}`,
    );
  } else {
    console.warn(`[ai-gateway] ${kind} error on cheapest model; no further fallback available`);
  }
  return kind;
}
