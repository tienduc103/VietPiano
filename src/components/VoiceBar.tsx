import type { UiMode } from '../core/curriculum/types';
import { voiceTeacher } from '../core/voice/teacher';
import { useVoiceActive, useVoiceState } from '../hooks/useVoiceTeacher';
import { useSettings } from '../store/settingsStore';
import { Button, Icon } from './ui';

const SPEEDS = [
  { rate: 0.7, label: 'Chậm' },
  { rate: 0.85, label: 'Vừa' },
  { rate: 1, label: 'Nhanh' },
];

/**
 * Bong bóng lời cô giáo + nút Nghe lại, Tắt/bật tiếng, Tốc độ. Hiện khi cô giáo giọng nói đang chạy
 * (mặc định Kids Mode). Chữ luôn hiện (phụ huynh đọc được, máy không có giọng tiếng Việt vẫn dùng được).
 */
export function VoiceBar({ mode }: { mode?: UiMode }) {
  const active = useVoiceActive(mode);
  const state = useVoiceState();
  const muted = useSettings((s) => s.settings.voiceMuted);
  const rate = useSettings((s) => s.settings.voiceRate);
  const update = useSettings((s) => s.update);
  if (!active) return null;

  const speed = SPEEDS.reduce((best, s) => (Math.abs(s.rate - rate) < Math.abs(best.rate - rate) ? s : best));
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  const replay = () => {
    voiceTeacher.unlock();
    voiceTeacher.replay();
  };

  // Gọn một dòng: chữ vừa phải, nút chỉ có icon (vẫn ≥ 48px cho cảm ứng).
  return (
    <div
      className="flex w-fit max-w-full items-center gap-1 rounded-xl bg-amber-50 py-0.5 pr-1 pl-2 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:ring-amber-800"
      data-testid="voice-bar"
      data-speaking={state.speaking || undefined}
    >
      <span className={`text-xl ${state.speaking ? 'animate-bounce' : ''}`} aria-hidden>
        👩‍🏫
      </span>
      <p className="min-w-0 flex-1 px-1 text-base leading-snug font-medium text-amber-900 dark:text-amber-100" aria-live="polite" data-testid="voice-caption">
        {state.caption ?? 'Cô giáo sẽ hướng dẫn bé nhé!'}
        {state.silent && !muted && (
          <span className="block text-xs font-normal text-amber-700 dark:text-amber-300" data-testid="voice-no-tts">
            Máy này chưa có giọng đọc tiếng Việt — cô chỉ hiện chữ.
          </span>
        )}
      </p>
      {!state.unlocked && !muted ? (
        <Button variant="primary" onClick={replay} aria-label="Bật tiếng cô giáo" title="Bật tiếng cô giáo" className="px-3" data-testid="voice-unlock">
          <Icon name="volume" className="h-5 w-5" />
        </Button>
      ) : (
        <Button variant="ghost" onClick={replay} disabled={!state.lastCue || muted} aria-label="Nghe lại" title="Nghe lại" className="px-3" data-testid="voice-replay">
          <Icon name="restart" className="h-5 w-5" />
        </Button>
      )}
      <Button
        variant="ghost"
        onClick={() => update({ voiceMuted: !muted })}
        aria-pressed={!muted}
        aria-label={muted ? 'Bật giọng cô giáo' : 'Tắt giọng cô giáo'}
        title={muted ? 'Bật giọng cô giáo' : 'Tắt giọng cô giáo'}
        className="px-3"
        data-testid="voice-mute"
      >
        <Icon name={muted ? 'volumeOff' : 'volume'} className="h-5 w-5" />
      </Button>
      <Button
        variant="ghost"
        onClick={() => update({ voiceRate: nextSpeed.rate })}
        aria-label={`Tốc độ đọc: ${speed.label}`}
        title={`Tốc độ đọc: ${speed.label}`}
        className="px-2 text-sm"
        data-testid="voice-speed"
      >
        {speed.label}
      </Button>
    </div>
  );
}
