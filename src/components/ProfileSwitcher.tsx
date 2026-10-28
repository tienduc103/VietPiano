import { useState } from 'react';
import { useProfiles, activeProfile } from '../store/profileStore';
import { ProfileDialog } from './ProfileDialog';
import { Button, Card, Icon } from './ui';

interface Props {
  /** Mô tả trong thẻ "Tạo hồ sơ" khi chưa có hồ sơ nào. */
  hint?: string;
  className?: string;
}

/**
 * Chọn / tạo / sửa hồ sơ người học — dùng chung ở trang chủ, giáo trình và thư viện.
 * Đổi hồ sơ thì tiến độ giáo trình nạp lại theo hồ sơ đó (App.tsx theo dõi `activeId`).
 */
export function ProfileSwitcher({
  hint = 'Cho biết tuổi, trình độ và mục tiêu — VietPiano sẽ gợi ý bài vừa sức và đánh giá tiến bộ riêng cho từng người.',
  className = 'mt-6',
}: Props) {
  const profiles = useProfiles((s) => s.profiles);
  const profile = useProfiles(activeProfile);
  const select = useProfiles((s) => s.select);
  const [dialog, setDialog] = useState<'new' | 'edit' | null>(null);

  return (
    <>
      {profiles.length === 0 ? (
        <Card className={`${className} flex flex-wrap items-center gap-4`}>
          <div className="text-4xl" aria-hidden>
            🎹
          </div>
          <div className="min-w-60 flex-1">
            <h2 className="text-lg font-semibold">Tạo hồ sơ người học</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{hint}</p>
          </div>
          <Button variant="primary" onClick={() => setDialog('new')} data-testid="create-profile">
            Tạo hồ sơ
          </Button>
        </Card>
      ) : (
        <div className={`${className} flex flex-wrap items-center gap-2`} role="group" aria-label="Người học">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              aria-pressed={p.id === profile?.id}
              data-testid={`profile-${p.name}`}
              className={`flex min-h-12 items-center gap-2 rounded-full py-1 pr-4 pl-1.5 font-semibold ring-1 transition-colors ${
                p.id === profile?.id
                  ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white ring-transparent shadow-md shadow-fuchsia-500/30'
                  : 'bg-white text-slate-700 ring-violet-200 hover:bg-violet-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-violet-800'
              }`}
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-xl dark:bg-slate-900/60" aria-hidden>
                {p.avatar}
              </span>
              {p.name}
              <span className="text-xs font-normal opacity-80">{p.age} tuổi</span>
            </button>
          ))}
          <Button variant="ghost" onClick={() => setDialog('new')} aria-label="Thêm người học">
            <span className="text-xl leading-none">+</span>
            Thêm
          </Button>
          {profile && (
            <Button variant="ghost" onClick={() => setDialog('edit')} data-testid="edit-profile">
              <Icon name="settings" className="h-5 w-5" />
              Sửa hồ sơ
            </Button>
          )}
        </div>
      )}

      {dialog && <ProfileDialog profile={dialog === 'edit' ? (profile ?? undefined) : undefined} onClose={() => setDialog(null)} />}
    </>
  );
}
