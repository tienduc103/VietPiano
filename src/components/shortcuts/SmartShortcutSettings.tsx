import { dismissedCount } from '../../core/shortcuts/smart/settings';
import type { SmartType } from '../../core/shortcuts/smart/types';
import { activeProfile, useProfiles } from '../../store/profileStore';
import { useSmartShortcuts } from '../../store/smartShortcutStore';
import { Button, Toggle } from '../ui';

const TYPE_TOGGLES: readonly (readonly [SmartType, string])[] = [
  ['continue', 'Gợi ý tiếp tục học'],
  ['weakness', 'Gợi ý luyện điểm yếu'],
  ['practice', 'Gợi ý bài luyện phù hợp'],
  ['game', 'Gợi ý trò chơi'],
  ['review', 'Gợi ý ôn tập'],
  ['frequent', 'Gợi ý nội dung thường chơi'],
];

/**
 * Cài đặt → Lối tắt → Lối tắt thông minh (mục con cuối thẻ "Lối tắt"). Riêng từng hồ sơ; tắt không ảnh hưởng lối tắt
 * thủ công; ẩn gợi ý không xoá bài học / tiến độ. AI cục bộ chưa có (P8) → hiện rõ là chưa có, không phải công tắc giả.
 */
export function SmartShortcutSettings() {
  const settings = useSmartShortcuts((s) => s.state.settings);
  const dismissed = useSmartShortcuts((s) => s.state.dismissed);
  const update = useSmartShortcuts((s) => s.updateSettings);
  const restore = useSmartShortcuts((s) => s.restoreDismissed);
  const profile = useProfiles(activeProfile);
  const hidden = dismissedCount(dismissed, Date.now());

  return (
    <section aria-labelledby="smart-shortcuts-title" data-testid="smart-shortcut-settings">
      <h3 id="smart-shortcuts-title" className="text-lg font-semibold">
        <span aria-hidden>✨</span> Lối tắt thông minh
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        App tự gợi ý buổi nên học tiếp, nốt cần luyện lại, bài nên ôn, trò chơi hợp với bài đang học — tính từ tiến độ đã lưu
        {profile ? ` của ${profile.name}` : ''} ngay trên máy này, không cần AI. Gợi ý không thay đổi lối tắt bạn tự tạo; ẩn một gợi ý không xoá bài học hay tiến độ.
      </p>
      <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
        <Toggle label="Bật lối tắt thông minh" checked={settings.enabled} onChange={(v) => update({ enabled: v })} />
        {settings.enabled && (
          <>
            <Toggle label="Hiện gợi ý trên thanh hồ sơ (khi còn chỗ)" checked={settings.showOnBar} onChange={(v) => update({ showOnBar: v })} />
            {TYPE_TOGGLES.map(([type, label]) => (
              <Toggle key={type} label={label} checked={settings.types[type]} onChange={(v) => update({ types: { [type]: v } })} />
            ))}
          </>
        )}
        <div className="flex min-h-12 items-center justify-between gap-4 text-slate-500 dark:text-slate-400">
          <span>Cho phép AI cục bộ cải thiện gợi ý</span>
          <span className="shrink-0 text-sm">Chưa có trong bản này</span>
        </div>
        {hidden > 0 && (
          <div className="flex min-h-12 items-center justify-between gap-4">
            <span>Đang ẩn {hidden} gợi ý (tự hiện lại sau 7 ngày)</span>
            <Button onClick={restore} data-testid="smart-restore-dismissed">
              Hiện lại
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
