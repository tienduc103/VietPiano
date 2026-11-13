/**
 * Cài đặt → "Nhật ký Biểu diễn (tạm thời)" — docs/perform-log.md. Tên máy, nơi gửi log, số bản trên máy,
 * gửi ngay / tải file log (máy không gửi được, vd iPad mở từ GitHub Pages) / xoá.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { currentLogEndpoint, performLog, performLogSettings } from '../core/performLog';
import { AUTO_LOG_URL } from '../core/performLog/settings';
import { Button, Card, Toggle } from './ui';

const inputClass = 'min-h-12 w-72 max-w-full rounded-xl bg-white px-3 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800';

/** Tên file an toàn: bỏ dấu, chỉ giữ chữ / số / gạch. */
function fileSlug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function PerformLogSettings() {
  const settings = useSyncExternalStore(
    (cb) => performLogSettings.subscribe(cb),
    () => performLogSettings.get(),
  );
  const status = useSyncExternalStore(
    (cb) => performLog.subscribe(cb),
    () => performLog.getStatus(),
  );
  const [url, setUrl] = useState(settings.url);
  const [name, setName] = useState(settings.deviceName);
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    void performLog.refresh();
  }, [settings.url, settings.enabled]);

  const endpoint = currentLogEndpoint(settings.url);
  const saveUrl = () => {
    setUrl(performLogSettings.update({ url }).url);
    setCheck(null);
  };
  const saveName = () => setName(performLogSettings.update({ deviceName: name }).deviceName);
  const test = async () => {
    const next = performLogSettings.update({ url }).url;
    setUrl(next);
    setChecking(true);
    setCheck(await performLog.test(currentLogEndpoint(next)));
    setChecking(false);
  };
  const download = async () => {
    const text = await performLog.exportText();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
    const day = new Date().toISOString().slice(0, 10);
    a.download = `vietpiano-perform-log-${fileSlug(settings.deviceName) || settings.deviceId}-${day}.jsonl`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };

  const where = endpoint
    ? `Gửi tới: ${endpoint}`
    : settings.url === AUTO_LOG_URL
      ? 'Chưa gửi đi đâu: "auto" chỉ có máy ghi khi mở app từ máy chủ của app (npm run dev / serve:lan). Mở từ GitHub Pages → nhập địa chỉ máy đang chạy "npm run perflog", hoặc tải file log.'
      : 'Chưa gửi đi đâu.';

  return (
    <Card>
      <div data-testid="perform-log-card">
        <h2 className="text-xl font-semibold">Nhật ký Biểu diễn (tạm thời)</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Để tìm vì sao chế độ Biểu diễn chấm sai / lỡ nhiều: mỗi lượt Biểu diễn ghi nốt cần đánh, nốt app nhận được (nguồn, thời điểm, lực gõ),
          kết quả chấm; mỗi lần mở app ghi tên máy, trình duyệt, người chơi. Không ghi âm thanh. Chỉ gửi tới máy ghi của chính bạn (máy chạy
          server app, hoặc địa chỉ nhập bên dưới); log ở đó nằm trong thư mục logs/perform-log.
        </p>
        <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
          <div data-testid="perform-log-enabled">
            <Toggle label="Ghi nhật ký Biểu diễn trên máy này" checked={settings.enabled} onChange={(v) => performLogSettings.update({ enabled: v })} />
          </div>
          <label className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2">
            <span>Tên máy (để nhận ra trong log)</span>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              placeholder="vd: iPad của bé An"
              aria-label="Tên máy"
              data-testid="perform-log-name"
            />
          </label>
          <label className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-2">
            <span>Gửi tới (máy ghi)</span>
            <input
              className={inputClass}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={saveUrl}
              onKeyDown={(e) => e.key === 'Enter' && saveUrl()}
              placeholder="auto"
              spellCheck={false}
              aria-label="Địa chỉ máy ghi nhật ký"
              data-testid="perform-log-url"
            />
          </label>
          <div className="py-2 text-sm" role="status" data-testid="perform-log-status">
            <p>
              Trên máy này: {status.perform} lượt Biểu diễn, {status.total - status.perform} lần mở app — {status.pending} bản chưa gửi.
              {status.sending ? ' Đang gửi…' : ''}
            </p>
            <p className="text-slate-500 dark:text-slate-400">{where}</p>
            {status.lastError && <p className="text-amber-700 dark:text-amber-300">Lần gửi gần nhất lỗi: {status.lastError}</p>}
            {check && <p className={check.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'}>{check.text}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2 py-3">
            <Button onClick={() => void test()} disabled={checking} data-testid="perform-log-test">
              {checking ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}
            </Button>
            <Button onClick={() => void performLog.flush(true)} disabled={!endpoint || status.pending === 0 || status.sending} data-testid="perform-log-send">
              Gửi ngay
            </Button>
            <Button onClick={() => void download()} disabled={status.total === 0} data-testid="perform-log-download">
              Tải file log
            </Button>
            {confirmClear ? (
              <>
                <Button
                  variant="danger"
                  onClick={() => {
                    void performLog.clear();
                    setConfirmClear(false);
                  }}
                  data-testid="perform-log-clear-confirm"
                >
                  Xác nhận xoá log trên máy này
                </Button>
                <Button onClick={() => setConfirmClear(false)}>Huỷ</Button>
              </>
            ) : (
              <Button onClick={() => setConfirmClear(true)} disabled={status.total === 0} data-testid="perform-log-clear">
                Xoá log trên máy…
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
