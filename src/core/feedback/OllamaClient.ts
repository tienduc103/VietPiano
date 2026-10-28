/**
 * OllamaClient — gọi Ollama chạy trên chính máy người dùng (mặc định http://localhost:11434).
 * Chỉ gửi số liệu tóm tắt dạng chữ, KHÔNG gửi âm thanh. Không có Ollama thì app vẫn chạy bình thường.
 *
 * Chrome cho phép trang https gọi http://localhost; Ollama mặc định chấp nhận origin localhost:*.
 * Mở app từ tên miền khác (GitHub Pages) thì cần đặt OLLAMA_ORIGINS cho origin đó.
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type FetchLike = typeof fetch;

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export const DEFAULT_OLLAMA_MODEL = 'gemma4:12b';

/** Chuẩn hoá địa chỉ: bỏ khoảng trắng, dấu "/" cuối; thiếu giao thức thì thêm http://. null = không hợp lệ. */
export function normalizeOllamaUrl(raw: string): string | null {
  let s = raw.trim().replace(/\/+$/, '');
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = `http://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

export class OllamaError extends Error {
  constructor(
    message: string,
    /** network = không kết nối được (Ollama chưa chạy hoặc bị CORS chặn); http = Ollama trả lỗi. */
    readonly kind: 'network' | 'http' | 'aborted',
  ) {
    super(message);
  }
}

async function request(fetchImpl: FetchLike, url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(url, init);
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw new OllamaError('Đã huỷ', 'aborted');
    throw new OllamaError('Không kết nối được Ollama', 'network');
  }
  if (!res.ok) {
    let detail = '';
    try {
      detail = ((await res.json()) as { error?: string }).error ?? '';
    } catch {
      // thân lỗi không phải JSON
    }
    throw new OllamaError(detail || `Ollama trả lỗi HTTP ${res.status}`, 'http');
  }
  return res;
}

/** Danh sách model đã tải về (GET /api/tags). */
export async function listModels(baseUrl: string, opts: { signal?: AbortSignal; fetchImpl?: FetchLike } = {}): Promise<string[]> {
  const res = await request(opts.fetchImpl ?? fetch, `${baseUrl}/api/tags`, { signal: opts.signal });
  const body = (await res.json()) as { models?: { name?: string }[] };
  return (body.models ?? []).map((m) => m.name).filter((n): n is string => typeof n === 'string');
}

/**
 * Chat có stream (POST /api/chat): Ollama trả NDJSON, mỗi dòng một mẩu `message.content`.
 * `onToken` nhận từng mẩu; trả về toàn bộ câu trả lời.
 */
export async function streamChat(opts: {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
  /** Độ "sáng tạo"; nhận xét cần bám số liệu nên để thấp. */
  temperature?: number;
}): Promise<string> {
  const res = await request(opts.fetchImpl ?? fetch, `${opts.baseUrl}/api/chat`, {
    method: 'POST',
    // text/plain → "simple request", trình duyệt không cần preflight CORS; Ollama vẫn đọc JSON.
    headers: { 'Content-Type': 'text/plain' },
    // think: false — model có chế độ suy nghĩ (qwen3, gemma4…) trả lời ngay, nhanh hơn nhiều; model khác bỏ qua.
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true, think: false, options: { temperature: opts.temperature ?? 0.4 } }),
    signal: opts.signal,
  });
  let full = '';
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (msg.error) throw new OllamaError(msg.error, 'http');
    const chunk = msg.message?.content ?? '';
    if (chunk) {
      full += chunk;
      opts.onToken?.(chunk);
    }
  };
  if (!res.body) {
    for (const line of (await res.text()).split('\n')) handleLine(line);
    return full;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        handleLine(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
  } catch (e) {
    if ((e as { name?: string }).name === 'AbortError') throw new OllamaError('Đã huỷ', 'aborted');
    throw e;
  }
  handleLine(buffer + decoder.decode());
  return full;
}
