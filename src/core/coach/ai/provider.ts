/**
 * Provider AI cục bộ cho Coach. Chỉ AI chạy trên máy người dùng / máy chủ trong mạng LAN (Ollama) — không có API đám mây.
 * `OllamaProvider`: tìm địa chỉ như Cài đặt hiện có ("auto" = proxy `/ollama` của server app → localhost), gọi `/api/chat`
 * KHÔNG stream với `format` = JSON schema (structured output; Ollama cũ không hiểu schema → thử lại với "json"),
 * timeout riêng mỗi lần gọi. Content-Type text/plain → "simple request", không cần preflight CORS (như OllamaClient).
 * Interface mở để thêm provider cục bộ khác (llama.cpp server, LM Studio…) sau này.
 */
import { OllamaError, resolveOllama, type ChatMessage } from '../../feedback/OllamaClient';

type FetchLike = typeof fetch;

export interface AiStatus {
  ok: boolean;
  baseUrl?: string;
  models?: string[];
  /** Model trong cài đặt đã được tải về máy chủ. */
  modelAvailable?: boolean;
  error?: string;
  kind?: 'network' | 'http' | 'aborted' | 'timeout';
}

export interface AiChatRequest {
  messages: ChatMessage[];
  schema?: object;
  signal?: AbortSignal;
  timeoutMs: number;
  temperature?: number;
}

export interface AiProvider {
  readonly id: string;
  readonly label: string;
  readonly model: string;
  status(signal?: AbortSignal): Promise<AiStatus>;
  /** Trả về nội dung chữ của câu trả lời (JSON dạng chuỗi). */
  chatJson(req: AiChatRequest): Promise<string>;
}

export class AiTimeoutError extends Error {
  readonly kind = 'timeout' as const;
  constructor(ms: number) {
    super(`AI không trả lời trong ${Math.round(ms / 1000)} giây`);
  }
}

/** Gộp tín hiệu huỷ của người dùng + hẹn giờ. */
function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; done: () => void; timedOut: () => boolean } {
  const ctrl = new AbortController();
  let timeout = false;
  const timer = setTimeout(() => {
    timeout = true;
    ctrl.abort();
  }, ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  if (signal?.aborted) ctrl.abort();
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
    timedOut: () => timeout,
  };
}

export class OllamaProvider implements AiProvider {
  readonly id = 'ollama';
  readonly label = 'Ollama (máy cục bộ / LAN)';
  private baseUrl: string | null = null;

  constructor(
    private readonly opts: {
      /** Địa chỉ cần thử theo thứ tự (`ollamaCandidatesForPage`). */
      candidates: () => string[];
      model: string;
      fetchImpl?: FetchLike;
    },
  ) {}

  get model(): string {
    return this.opts.model;
  }

  async status(signal?: AbortSignal): Promise<AiStatus> {
    try {
      const { baseUrl, models } = await resolveOllama(this.opts.candidates(), { signal, fetchImpl: this.opts.fetchImpl });
      this.baseUrl = baseUrl;
      const m = this.opts.model;
      return { ok: true, baseUrl, models, modelAvailable: models.some((x) => x === m || x === `${m}:latest` || (!m.includes(':') && x.startsWith(`${m}:`))) };
    } catch (e) {
      const err = e instanceof OllamaError ? e : new OllamaError(String(e), 'network');
      return { ok: false, error: err.message, kind: err.kind };
    }
  }

  async chatJson(req: AiChatRequest): Promise<string> {
    const t = withTimeout(req.signal, req.timeoutMs);
    try {
      const base = this.baseUrl ?? (await resolveOllama(this.opts.candidates(), { signal: t.signal, fetchImpl: this.opts.fetchImpl })).baseUrl;
      this.baseUrl = base;
      const post = (format: object | 'json') =>
        (this.opts.fetchImpl ?? fetch)(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({ model: this.opts.model, messages: req.messages, stream: false, think: false, format, options: { temperature: req.temperature ?? 0.2 } }),
          signal: t.signal,
        });
      let res = await post(req.schema ?? 'json');
      // Ollama cũ chưa hỗ trợ schema trong `format` → thử lại với "json".
      if (!res.ok && res.status === 400 && req.schema) res = await post('json');
      if (!res.ok) {
        let detail = '';
        try {
          detail = ((await res.json()) as { error?: string }).error ?? '';
        } catch {
          // không phải JSON
        }
        throw new OllamaError(detail || `Ollama trả lỗi HTTP ${res.status}`, 'http');
      }
      const body = (await res.json()) as { message?: { content?: string }; error?: string };
      if (body.error) throw new OllamaError(body.error, 'http');
      return body.message?.content ?? '';
    } catch (e) {
      if (t.timedOut()) throw new AiTimeoutError(req.timeoutMs);
      if ((e as { name?: string }).name === 'AbortError') throw new OllamaError('Đã huỷ', 'aborted');
      if (e instanceof OllamaError) {
        if (e.kind === 'network') this.baseUrl = null;
        throw e;
      }
      this.baseUrl = null;
      throw new OllamaError('Không kết nối được Ollama', 'network');
    } finally {
      t.done();
    }
  }
}
