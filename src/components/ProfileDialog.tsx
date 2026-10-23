import { useEffect, useState } from 'react';
import {
  AGE_GROUP_LABELS,
  AGE_MAX,
  AGE_MIN,
  AVATARS,
  DAILY_MINUTES_OPTIONS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  ageGroup,
  recommendedDailyMinutes,
  type Experience,
  type LearnerProfile,
  type LearningGoal,
} from '../core/profile/LearnerProfile';
import { useProfiles } from '../store/profileStore';
import { Button, Icon } from './ui';

interface Props {
  /** Có = sửa hồ sơ; không có = tạo mới. */
  profile?: LearnerProfile;
  onClose: () => void;
}

const chip = (on: boolean, size = 'px-4 text-sm') =>
  `min-h-12 rounded-xl ${size} font-semibold ring-1 transition-colors ${
    on
      ? 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-400 dark:bg-fuchsia-900/60 dark:text-fuchsia-100 dark:ring-fuchsia-500'
      : 'bg-white text-slate-700 ring-slate-200 hover:bg-violet-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700'
  }`;

/** Tạo / sửa hồ sơ người học: tên, tuổi, trình độ, mục tiêu, thời gian tập mỗi ngày. */
export function ProfileDialog({ profile, onClose }: Props) {
  const add = useProfiles((s) => s.add);
  const update = useProfiles((s) => s.update);
  const remove = useProfiles((s) => s.remove);
  const [name, setName] = useState(profile?.name ?? '');
  const [age, setAge] = useState(profile?.age ?? 8);
  // Chuỗi đang gõ trong ô tuổi; chỉ chốt (giới hạn AGE_MIN–AGE_MAX) khi rời ô hoặc bấm −/+.
  const [ageText, setAgeText] = useState(String(profile?.age ?? 8));
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS[0]);
  const [experience, setExperience] = useState<Experience>(profile?.experience ?? 'new');
  const [goals, setGoals] = useState<LearningGoal[]>(profile?.goals ?? []);
  const [dailyMinutes, setDailyMinutes] = useState(profile?.dailyMinutes ?? recommendedDailyMinutes(8));
  // Chưa tự chọn thời gian thì đổi tuổi sẽ đổi theo mức gợi ý.
  const [minutesTouched, setMinutesTouched] = useState(!!profile);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeAge = (v: number) => {
    const next = Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(v) || AGE_MIN));
    setAge(next);
    setAgeText(String(next));
    if (!minutesTouched) setDailyMinutes(recommendedDailyMinutes(next));
  };

  const save = () => {
    const finalAge = Math.min(AGE_MAX, Math.max(AGE_MIN, Math.round(Number(ageText)) || age));
    const data = { name: name.trim() || 'Người học', age: finalAge, avatar, experience, goals, dailyMinutes };
    if (profile) update(profile.id, data);
    else add(data);
    onClose();
  };

  const minuteOptions = [...new Set<number>([...DAILY_MINUTES_OPTIONS, dailyMinutes])].sort((a, b) => a - b);

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={profile ? 'Sửa hồ sơ người học' : 'Tạo hồ sơ người học'}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-bold">{profile ? 'Sửa hồ sơ người học' : 'Hồ sơ người học mới'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Tuổi và trình độ giúp VietPiano gợi ý bài vừa sức. Dữ liệu chỉ lưu trên máy này.</p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng" className="px-2">
            <Icon name="close" />
          </Button>
        </div>

        <div className="mt-4 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="text-sm font-semibold">Tên</span>
              <input
                autoFocus={!profile}
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Bé Na"
                data-testid="profile-name"
                className="mt-1 block min-h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-600"
              />
            </label>
            <div>
              <span className="text-sm font-semibold">
                Tuổi <span className="font-normal text-slate-500 dark:text-slate-400">· {AGE_GROUP_LABELS[ageGroup(age)]}</span>
              </span>
              <div className="mt-1 flex items-center gap-2">
                <Button onClick={() => changeAge(age - 1)} aria-label="Giảm tuổi" className="w-12 px-0 text-xl">
                  −
                </Button>
                <input
                  type="number"
                  inputMode="numeric"
                  min={AGE_MIN}
                  max={AGE_MAX}
                  value={ageText}
                  onChange={(e) => {
                    setAgeText(e.target.value);
                    const v = Number(e.target.value);
                    if (v >= AGE_MIN && v <= AGE_MAX) changeAge(v);
                  }}
                  onBlur={() => changeAge(Number(ageText) || age)}
                  aria-label="Tuổi"
                  data-testid="profile-age"
                  className="min-h-12 w-20 rounded-xl bg-white text-center text-lg font-bold tabular-nums ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-600"
                />
                <Button onClick={() => changeAge(age + 1)} aria-label="Tăng tuổi" className="w-12 px-0 text-xl">
                  +
                </Button>
              </div>
            </div>
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Hình đại diện</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <button key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={`Hình ${a}`} className={`${chip(avatar === a, 'w-12 text-2xl')}`}>
                  {a}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Trình độ hiện tại</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {(Object.keys(EXPERIENCE_LABELS) as Experience[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={experience === e}
                  onClick={() => setExperience(e)}
                  className={`${chip(experience === e)} py-2 text-left`}
                >
                  <div>{EXPERIENCE_LABELS[e].label}</div>
                  <div className="text-xs font-normal opacity-75">{EXPERIENCE_LABELS[e].hint}</div>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Mục tiêu (chọn nhiều)</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(GOAL_LABELS) as LearningGoal[]).map((g) => {
                const on = goals.includes(g);
                return (
                  <button key={g} type="button" aria-pressed={on} onClick={() => setGoals(on ? goals.filter((x) => x !== g) : [...goals, g])} className={chip(on)}>
                    {GOAL_LABELS[g]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">
              Thời gian tập mỗi ngày <span className="font-normal text-slate-500 dark:text-slate-400">· gợi ý cho tuổi {age}: {recommendedDailyMinutes(age)} phút</span>
            </legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {minuteOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={dailyMinutes === m}
                  onClick={() => {
                    setDailyMinutes(m);
                    setMinutesTouched(true);
                  }}
                  className={chip(dailyMinutes === m)}
                >
                  {m} phút
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {profile &&
            (confirmDelete ? (
              <>
                <span className="text-sm text-rose-600 dark:text-rose-400">Xoá hồ sơ? (Lịch sử tập vẫn giữ trong thống kê chung)</span>
                <Button
                  variant="danger"
                  onClick={() => {
                    remove(profile.id);
                    onClose();
                  }}
                >
                  Xoá
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Không
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Xoá hồ sơ
              </Button>
            ))}
          <div className="flex-1" />
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" onClick={save} data-testid="profile-save">
            <Icon name="check" />
            {profile ? 'Lưu' : 'Tạo hồ sơ'}
          </Button>
        </div>
      </div>
    </div>
  );
}
