/** Utilitários para mensagens de erro na UI (PT-BR) e log no console. */

export function newErrorId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function readObj(err: unknown): Record<string, unknown> | null {
  return err && typeof err === "object" ? (err as Record<string, unknown>) : null;
}

export function extractErrMeta(err: unknown): {
  rawMessage: string;
  httpStatus?: number;
  code?: string;
  errorName?: string;
} {
  const rawMessage =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const o = readObj(err);
  let httpStatus: number | undefined;
  let code: string | undefined;
  if (o) {
    if ("status" in o && typeof o.status === "number" && !Number.isNaN(o.status)) {
      httpStatus = o.status;
    }
    if ("statusCode" in o && typeof o.statusCode === "number" && !Number.isNaN(o.statusCode)) {
      httpStatus = o.statusCode;
    }
    if ("code" in o && o.code != null) code = String(o.code);
  }
  return {
    rawMessage,
    httpStatus,
    code,
    errorName: err instanceof Error ? err.name : undefined,
  };
}

export function logAppError(contextPtBr: string, err: unknown): void {
  const meta = extractErrMeta(err);
  console.error(`[LeadApp] ${contextPtBr}`, { ...meta, erro_bruto: err });
}

export function formatBannerSummary(contextPtBr: string, err: unknown): string {
  const { rawMessage, httpStatus, code } = extractErrMeta(err);
  const extras: string[] = [];
  if (httpStatus === 401) extras.push("não autorizado (HTTP 401)");
  else if (httpStatus === 403) extras.push("acesso negado (HTTP 403)");
  else if (httpStatus != null) extras.push(`HTTP ${httpStatus}`);
  if (code) extras.push(`código ${code}`);
  if (extras.length > 0) return `${contextPtBr}: ${extras.join(" · ")}`;
  if (rawMessage && rawMessage.trim().length > 0) return `${contextPtBr}: ${rawMessage}`;
  return contextPtBr;
}

export function formatBannerDetail(err: unknown): string | undefined {
  if (err instanceof Error) {
    const stack = err.stack?.split("\n").slice(0, 8).join("\n");
    return [err.name && `Nome: ${err.name}`, `Mensagem: ${err.message}`, stack && `Stack:\n${stack}`]
      .filter(Boolean)
      .join("\n");
  }
  const o = readObj(err);
  if (!o) return undefined;
  try {
    const s = JSON.stringify(o);
    return s.length > 1800 ? `${s.slice(0, 1800)}…` : s;
  } catch {
    return extractErrMeta(err).rawMessage;
  }
}
