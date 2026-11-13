import { useEffect, useState } from 'react';
import { checkForUpdate } from '../appUpdate';
import { hardReload } from '../hardReload';
import { Button, Icon } from './ui';

/** Bản đã bấm "Để sau" — ẩn tới khi có bản khác (giữ trong phiên chạy, mở lại app thì báo lại). */
let dismissedVersion: string | null = null;

/** Phiên bản mới trên server (`version.json`), null nếu đang chạy bản mới nhất / offline / không kiểm tra được.
 *  Kiểm tra khi gắn component và mỗi khi app quay lại từ nền. */
function useUpdateAvailable(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const res = await checkForUpdate(__APP_VERSION__, `${import.meta.env.BASE_URL}version.json`);
      if (!alive) return;
      if (res.status === 'available') setVersion(res.version);
      else if (res.status === 'latest') setVersion(null);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return version;
}

/**
 * Dải thông báo trên trang chủ khi server có phiên bản mới: "Cập nhật ngay" = tải lại cứng (giữ tiến độ, cài đặt);
 * "Để sau" ẩn tới khi có bản khác. Không có bản mới thì không hiện gì.
 */
export function UpdateBanner() {
  const latest = useUpdateAvailable();
  const [dismissed, setDismissed] = useState(dismissedVersion);
  const [updating, setUpdating] = useState(false);
  if (!latest || latest === dismissed) return null;

  return (
    <div
      role="status"
      data-testid="update-banner"
      className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-violet-50 px-4 py-2 ring-1 ring-violet-200 dark:bg-violet-950/60 dark:ring-violet-800"
    >
      <Icon name="reload" className="h-6 w-6 shrink-0 text-violet-600 dark:text-violet-300" />
      <p className="min-w-48 flex-1 text-sm">
        <span className="font-semibold">Đã có phiên bản mới {latest}</span>
        <span className="text-slate-500 dark:text-slate-400"> — tiến độ và cài đặt vẫn giữ nguyên khi cập nhật.</span>
      </p>
      <Button
        variant="ghost"
        disabled={updating}
        onClick={() => {
          dismissedVersion = latest;
          setDismissed(latest);
        }}
      >
        Để sau
      </Button>
      <Button
        variant="primary"
        disabled={updating}
        data-testid="update-banner-apply"
        onClick={() => {
          setUpdating(true);
          void hardReload();
        }}
      >
        {updating ? 'Đang cập nhật…' : 'Cập nhật ngay'}
      </Button>
    </div>
  );
}
