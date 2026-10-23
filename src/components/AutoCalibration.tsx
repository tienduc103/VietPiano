import { useEffect, useState } from 'react';
import {
  AutoCalibrator,
  type CalibrationIssue,
  type CalibrationPatch,
  type CalibrationResult,
  type CalibrationState,
  type CalibrationWarning,
} from '../core/calibration/AutoCalibrator';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiToLabel, type NoteLabelStyle } from '../core/music/notes';
import { noiseGateToSensitivity, type DeviceSettings } from '../core/settings/DeviceSettings';
import { useMic } from '../store/micStore';
import { useSettings } from '../store/settingsStore';
import { PianoKeyboard } from './PianoKeyboard';
import { Button } from './ui';

const KEYBOARD_FROM = 43; // G2
const KEYBOARD_TO = 79; // G5

const WARNING_TEXT: Record<CalibrationWarning, string> = {
  'quiet-signal': 'Tiếng đàn thu được khá nhỏ nên đã hạ ngưỡng nhiễu. Nên đặt iPad gần đàn hơn hoặc tăng âm lượng đàn.',
  'noisy-room': 'Tiếng ồn nền gần bằng tiếng đàn — nhận diện có thể kém. Hãy giảm tiếng ồn hoặc tăng âm lượng đàn.',
  'onset-conflict':
    'Âm ngân dao động gần bằng lúc gõ lại phím — hai nốt giống nhau liền nhau có thể bị lỡ. Hãy nhấc phím rõ hơn giữa hai lần đánh.',
  'no-notes': 'Chưa đo được nốt nào nên chỉ chỉnh ngưỡng nhiễu.',
  'tuning-inconsistent': 'Cao độ các nốt lệch không đều nên giữ A4 = 440 Hz.',
};

/**
 * Trình hướng dẫn tự căn chỉnh: máy hiện nốt → người chơi đánh → máy nghe và đề xuất cài đặt.
 * Mỗi lượt là một lần mount (micro phải bật trước); "Làm lại" nhờ cha mount lượt mới qua `onRestart`.
 */
export function AutoCalibration({
  labelStyle,
  onRestart,
  onClose,
  onCheck,
}: {
  labelStyle: NoteLabelStyle;
  onRestart: () => void;
  onClose: () => void;
  onCheck: () => void;
}) {
  const [calibrator] = useState(() => new AutoCalibrator());
  const [state, setState] = useState<CalibrationState>(() => calibrator.getState());
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    const offState = calibrator.subscribe(setState);
    const offFrames = microphoneInput.pitchFrames.on((f) => calibrator.process(f));
    return () => {
      offState();
      offFrames();
    };
  }, [calibrator]);

  const close = onClose;

  const total = calibrator.steps.length;
  return (
    <div className="w-full rounded-xl bg-white p-4 ring-1 ring-violet-200 dark:bg-slate-800 dark:ring-violet-800" data-testid="auto-calibration">
      {state.phase === 'done' ? (
        <ResultView
          result={state.result}
          applied={applied}
          onApply={() => setApplied(true)}
          onRestart={onRestart}
          onClose={close}
          onCheck={() => {
            close();
            onCheck();
          }}
        />
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
            <span>
              Bước {state.stepIndex + 1}/{total}
            </span>
            <span className="flex gap-2">
              {state.phase !== 'silence' && (
                <Button variant="ghost" onClick={() => calibrator.skip()}>
                  Bỏ qua bước này
                </Button>
              )}
              <Button variant="ghost" onClick={close}>
                Huỷ
              </Button>
            </span>
          </div>
          {state.phase === 'silence' ? (
            <div className="py-4">
              <p className="text-2xl font-bold">Giữ yên lặng…</p>
              <p className="text-slate-600 dark:text-slate-300">Đừng đánh đàn, máy đang đo tiếng ồn nền.</p>
              <Progress value={state.progress} />
            </div>
          ) : (
            <NoteStep state={state} labelStyle={labelStyle} />
          )}
        </>
      )}
    </div>
  );
}

function NoteStep({
  state,
  labelStyle,
}: {
  state: Extract<CalibrationState, { phase: 'waiting' | 'listening' }>;
  labelStyle: NoteLabelStyle;
}) {
  const live = useMic((s) => s.live);
  const { midi, kind } = state.step;
  const other: NoteLabelStyle = labelStyle === 'letter' ? 'solfege' : 'letter';
  const listening = state.phase === 'listening';
  return (
    <div className="pt-2">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <p className="text-xl">{kind === 'repeat' ? 'Đánh hai lần nốt' : 'Đánh nốt'}</p>
        <p className="text-5xl font-bold text-violet-700 dark:text-violet-300" data-testid="calibration-target">
          {midiToLabel(midi, labelStyle)}
        </p>
        <p className="text-lg text-slate-500 dark:text-slate-400">({midiToLabel(midi, other)})</p>
      </div>
      <p className="mt-1 text-slate-600 dark:text-slate-300">
        {kind === 'repeat'
          ? 'Đánh cùng một phím hai lần, cách nhau khoảng 1 giây — như khi gặp hai nốt giống nhau liền nhau trong bài.'
          : 'Đánh một lần với lực bình thường rồi giữ phím 1–2 giây.'}
      </p>
      <div className="mt-2 min-h-7" role="status">
        {listening ? (
          <span className="font-semibold text-emerald-700 dark:text-emerald-300">
            {kind === 'repeat' ? 'Đang nghe… đánh lại lần nữa' : 'Đang nghe… giữ phím'}
          </span>
        ) : state.issue ? (
          <span className="font-semibold text-amber-700 dark:text-amber-300">{issueText(state.issue, midi, labelStyle)}</span>
        ) : (
          <span className="text-slate-500 dark:text-slate-400">Đang chờ bạn đánh…</span>
        )}
      </div>
      <Progress value={listening ? state.progress : 0} />
      <div className="mt-3 h-28">
        <PianoKeyboard
          from={KEYBOARD_FROM}
          to={KEYBOARD_TO}
          expected={midi}
          detected={live?.midi ?? null}
          flash={null}
          labelStyle={labelStyle}
          onPress={() => undefined}
        />
      </div>
    </div>
  );
}

function issueText(issue: CalibrationIssue, target: number, style: NoteLabelStyle): string {
  switch (issue.kind) {
    case 'unclear':
      return 'Chưa nghe rõ — hãy đánh lại, mạnh hơn một chút.';
    case 'wrong-note':
      return `Máy nghe thấy ${midiToLabel(issue.heardMidi, style)} — hãy đánh ${midiToLabel(target, style)}.`;
    case 'no-restrike':
      return 'Chưa nghe thấy lần đánh thứ hai — hãy đánh lại hai lần.';
  }
}

function Progress({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
      <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width] duration-100" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

type Row = { key: keyof CalibrationPatch; label: string; format: (v: DeviceSettings[keyof CalibrationPatch]) => string };

const ROWS: Row[] = [
  { key: 'noiseGate', label: 'Độ nhạy micro', format: (v) => `${noiseGateToSensitivity(v as number)}` },
  { key: 'a4', label: 'Cao độ chuẩn A4', format: (v) => `${(v as number).toFixed(1)} Hz` },
  { key: 'minConfidence', label: 'Độ tin cậy tối thiểu', format: (v) => (v as number).toFixed(2) },
  { key: 'stableMs', label: 'Thời gian giữ ổn định', format: (v) => `${v as number} ms` },
  { key: 'onsetRatio', label: 'Ngưỡng nhận đánh lại cùng nốt', format: (v) => `×${(v as number).toFixed(2)}` },
  { key: 'octaveTolerant', label: 'Chấp nhận sai quãng tám', format: (v) => (v ? 'Bật' : 'Tắt') },
];

function ResultView({
  result,
  applied,
  onApply,
  onRestart,
  onClose,
  onCheck,
}: {
  result: CalibrationResult;
  applied: boolean;
  onApply: () => void;
  onRestart: () => void;
  onClose: () => void;
  onCheck: () => void;
}) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [before] = useState(settings);
  const rows = ROWS.filter((r) => result.patch[r.key] !== undefined);

  return (
    <div data-testid="calibration-result">
      <h4 className="text-lg font-semibold">{applied ? 'Đã áp dụng cài đặt mới' : 'Kết quả căn chỉnh'}</h4>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Nhiễu nền {result.measurements.ambientRms.toFixed(4)} · đo được {result.measurements.notes.length} nốt
      </p>
      <table className="mt-2 w-full text-left">
        <thead className="text-sm text-slate-500 dark:text-slate-400">
          <tr>
            <th className="py-1 font-medium">Cài đặt</th>
            <th className="py-1 font-medium">Hiện tại</th>
            <th className="py-1 font-medium">Đề xuất</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const next = result.patch[r.key]!;
            const changed = before[r.key] !== next;
            return (
              <tr key={r.key} className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-1.5">{r.label}</td>
                <td className="py-1.5 tabular-nums">{r.format(before[r.key])}</td>
                <td className={`py-1.5 tabular-nums ${changed ? 'font-semibold text-violet-700 dark:text-violet-300' : ''}`}>
                  {r.format(next)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {result.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-amber-800 dark:text-amber-200">
          {result.warnings.map((w) => (
            <li key={w} className="rounded-lg bg-amber-50 px-3 py-2 dark:bg-amber-950">
              {WARNING_TEXT[w]}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {applied && (
          <Button variant="primary" onClick={onCheck} data-testid="calibration-result-check">
            Kiểm tra theo nhịp
          </Button>
        )}
        {applied ? (
          <Button
            onClick={() => {
              const undo: Partial<DeviceSettings> = {};
              for (const r of rows) Object.assign(undo, { [r.key]: before[r.key] });
              update(undo);
              onClose();
            }}
          >
            Hoàn tác
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              update(result.patch);
              onApply();
            }}
          >
            Áp dụng
          </Button>
        )}
        <Button onClick={onRestart}>Làm lại</Button>
        <Button variant="ghost" onClick={onClose}>
          {applied ? 'Xong' : 'Bỏ qua'}
        </Button>
      </div>
      {applied && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Bấm “Kiểm tra theo nhịp” để đánh một đoạn ngắn và xem máy có nghe đúng từng nốt không.
        </p>
      )}
    </div>
  );
}
