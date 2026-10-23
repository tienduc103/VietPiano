import { useEffect, useState } from 'react';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { midiToLabel, type NoteLabelStyle } from '../core/music/notes';
import {
  DEFAULT_SETTINGS,
  noiseGateFromAmbient,
  noiseGateToSensitivity,
  sensitivityToNoiseGate,
} from '../core/settings/DeviceSettings';
import { useSettings } from '../store/settingsStore';
import { useMic } from '../store/micStore';
import { useApp } from '../store/appStore';
import { Button, Card, Icon, Segmented, Toggle } from '../components/ui';
import { DetectedNote, LevelMeter, MicButton, MicError } from '../components/MicPanel';
import { AutoCalibration } from '../components/AutoCalibration';
import { CalibrationCheckView } from '../components/CalibrationCheckView';
import { AppVersion } from '../components/AppVersion';

const CALIBRATION_MS = 2500;

export function SettingsScreen() {
  const navigate = useApp((s) => s.navigate);
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-12">
        <header className="mb-6 flex items-center gap-3 max-[1040px]:pl-10">
          <Button variant="ghost" onClick={() => navigate({ name: 'library' })} aria-label="Quay lại" className="px-2">
            <Icon name="back" />
          </Button>
          <h1 className="text-3xl font-bold">Cài đặt</h1>
        </header>

        <div className="grid gap-5">
          <Card>
            <h2 className="text-xl font-semibold">Microphone</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Đặt iPad trên giá nhạc, cách loa đàn khoảng 30–80 cm. Âm lượng đàn ở mức vừa phải. Âm thanh chỉ được xử lý trên máy.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <MicButton />
              <DetectedNote labelStyle={settings.labelStyle} />
              <div className="min-w-48 flex-1">
                <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Mức âm (vạch vàng = ngưỡng nhiễu)</div>
                <LevelMeter />
              </div>
            </div>
            <div className="mt-3">
              <MicError />
            </div>
            <Calibration />
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Nhận diện nốt</h2>
            <Slider
              label="Độ nhạy micro"
              hint="Cao hơn = nghe được tiếng nhỏ hơn nhưng dễ bắt nhiễu."
              min={0}
              max={100}
              step={1}
              value={noiseGateToSensitivity(settings.noiseGate)}
              format={(v) => `${v}`}
              onChange={(v) => update({ noiseGate: sensitivityToNoiseGate(v) })}
            />
            <Slider
              label="Thời gian giữ ổn định"
              hint="Cao độ phải giữ nguyên bao lâu mới được chấp nhận. Tăng nếu hay nhận nhầm."
              min={30}
              max={300}
              step={10}
              value={settings.stableMs}
              format={(v) => `${v} ms`}
              onChange={(v) => update({ stableMs: v })}
            />
            <Slider
              label="Độ tin cậy tối thiểu"
              hint="Ngưỡng chất lượng cao độ (YIN). Giảm nếu nốt trầm khó nhận."
              min={0.6}
              max={0.97}
              step={0.01}
              value={settings.minConfidence}
              format={(v) => v.toFixed(2)}
              onChange={(v) => update({ minConfidence: v })}
            />
            <Slider
              label="Ngưỡng nhận đánh lại cùng nốt"
              hint="Mức tăng âm lượng để coi là phím được gõ lại. Giảm nếu đánh lặp nốt không được nhận; tăng nếu âm ngân làm nhảy nốt."
              min={1.15}
              max={2.5}
              step={0.05}
              value={settings.onsetRatio}
              format={(v) => `×${v.toFixed(2)}`}
              onChange={(v) => update({ onsetRatio: v })}
            />
            <Slider
              label="Cao độ chuẩn A4"
              hint="Clavinova mặc định 440 Hz. Chỉ đổi nếu bạn đã chỉnh Tuning trên đàn."
              min={430}
              max={450}
              step={0.5}
              value={settings.a4}
              format={(v) => `${v.toFixed(1)} Hz`}
              onChange={(v) => update({ a4: v })}
            />
            <div className="mt-2">
              <Toggle
                label={
                  <span>
                    Chấp nhận sai quãng tám
                    <span className="block text-sm text-slate-500 dark:text-slate-400">Bật nếu micro hay nhận nốt trầm thành quãng 8 cao hơn.</span>
                  </span>
                }
                checked={settings.octaveTolerant}
                onChange={(v) => update({ octaveTolerant: v })}
              />
            </div>
            <div className="mt-4">
              <Button
                variant="ghost"
                onClick={() =>
                  update({
                    noiseGate: DEFAULT_SETTINGS.noiseGate,
                    stableMs: DEFAULT_SETTINGS.stableMs,
                    minConfidence: DEFAULT_SETTINGS.minConfidence,
                    onsetRatio: DEFAULT_SETTINGS.onsetRatio,
                    a4: DEFAULT_SETTINGS.a4,
                    octaveTolerant: DEFAULT_SETTINGS.octaveTolerant,
                  })
                }
              >
                Khôi phục mặc định nhận diện
              </Button>
            </div>
          </Card>

          <Card>
            <h2 className="text-xl font-semibold">Hiển thị</h2>
            <div className="mt-2 divide-y divide-slate-200 dark:divide-slate-700">
              <Toggle label="Hiện tên nốt dưới khuông" checked={settings.showNoteNames} onChange={(v) => update({ showNoteNames: v })} />
              <Toggle label="Hiện bàn phím piano ảo" checked={settings.showKeyboard} onChange={(v) => update({ showKeyboard: v })} />
              <Toggle
                label="Hiện nút micro nổi (bật/tắt micro, xem nốt đang nghe)"
                checked={settings.showFloatingNote}
                onChange={(v) => update({ showFloatingNote: v })}
              />
              <Row label="Kiểu tên nốt">
                <Segmented
                  value={settings.labelStyle}
                  onChange={(v) => update({ labelStyle: v })}
                  options={[
                    { value: 'letter', label: 'C D E (C4)' },
                    { value: 'solfege', label: 'Đô Rê Mi' },
                  ]}
                />
              </Row>
              <Row label="Giao diện">
                <Segmented
                  value={settings.theme}
                  onChange={(v) => update({ theme: v })}
                  options={[
                    { value: 'system', label: 'Theo máy' },
                    { value: 'light', label: 'Sáng' },
                    { value: 'dark', label: 'Tối' },
                  ]}
                />
              </Row>
            </div>
          </Card>

          <DataCard />
        </div>

        <AppVersion className="mt-8" />
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Slider(props: {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-4 block">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">{props.label}</span>
        <span className="text-sm font-semibold text-fuchsia-600 tabular-nums dark:text-fuchsia-300">{props.format(props.value)}</span>
      </div>
      <input
        type="range"
        className="w-full"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="text-sm text-slate-500 dark:text-slate-400">{props.hint}</span>
    </label>
  );
}

/**
 * Hiệu chuẩn: tự căn chỉnh (máy hiện nốt, nghe và đề xuất cài đặt), hoặc chỉ đo nhiễu nền
 * để đặt noise gate; sau đó đánh thử để kiểm tra.
 */
function Calibration() {
  const status = useMic((s) => s.status);
  const update = useSettings((s) => s.update);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const [phase, setPhase] = useState<'idle' | 'measuring' | 'done'>('idle');
  const [result, setResult] = useState<{ ambient: number; gate: number } | null>(null);
  const [checking, setChecking] = useState(false);
  // Số lượt tự căn chỉnh (dùng làm key để "Làm lại" mount lượt mới); null = đang đóng.
  const [autoRun, setAutoRun] = useState<number | null>(null);

  const startAuto = async () => {
    if (!microphoneInput.isActive()) {
      await microphoneInput.start().catch(() => undefined);
      if (!microphoneInput.isActive()) return;
    }
    setAutoRun((n) => (n ?? 0) + 1);
  };

  const measure = async () => {
    if (status !== 'running') {
      await microphoneInput.start().catch(() => undefined);
      if (!microphoneInput.isActive()) return;
    }
    setPhase('measuring');
    const samples: number[] = [];
    const off = microphoneInput.analysis.on((a) => samples.push(a.rms));
    await new Promise((r) => setTimeout(r, CALIBRATION_MS));
    off();
    if (samples.length === 0) {
      setPhase('idle');
      return;
    }
    // Dùng phân vị 90% để bỏ qua vài tiếng động đột ngột.
    samples.sort((a, b) => a - b);
    const ambient = samples[Math.floor(samples.length * 0.9)];
    const gate = noiseGateFromAmbient(ambient);
    update({ noiseGate: gate });
    setResult({ ambient, gate });
    setPhase('done');
  };

  return (
    <div className="mt-5 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-100 dark:bg-slate-900/60 dark:ring-violet-900">
      <h3 className="font-semibold">Hiệu chuẩn micro</h3>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        <b>Tự căn chỉnh:</b> giữ yên lặng vài giây, sau đó ứng dụng hiện lần lượt từng nốt (từ quãng trầm tới quãng cao) —
        bạn đánh nốt đó, máy nghe và đề xuất độ nhạy, độ tin cậy, thời gian ổn định, ngưỡng đánh lại và cao độ chuẩn.
        Xong thì bấm <b>“Kiểm tra theo nhịp”</b>: khuông nhạc chạy theo nhịp và chờ bạn đánh từng nốt, cho biết máy nghe
        đúng, nghe sai hay nghe thừa ở nốt nào.
      </p>
      {/* Một hàng nút theo thứ tự dùng; khung kết quả của từng nút hiện bên dưới hàng. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => void startAuto()} disabled={autoRun !== null} data-testid="auto-calibrate">
          Tự căn chỉnh (khoảng 1 phút)
        </Button>
        <Button onClick={() => setChecking(true)} disabled={checking} data-testid="calibration-check-open">
          Kiểm tra theo nhịp
        </Button>
        <Button onClick={() => void measure()} disabled={phase === 'measuring'}>
          {phase === 'measuring' ? 'Đang đo… hãy giữ yên lặng' : 'Chỉ đo tiếng ồn nền'}
        </Button>
        {/* Đặt cuối hàng: danh sách nốt nghe được (w-full) tự xuống dòng ngay dưới các nút. */}
        <ListenTest labelStyle={labelStyle} />
      </div>
      {result && (
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Nhiễu nền: {result.ambient.toFixed(4)} → ngưỡng {result.gate.toFixed(4)} (độ nhạy {noiseGateToSensitivity(result.gate)})
        </p>
      )}
      {autoRun !== null && (
        <div className="mt-3">
          <AutoCalibration
            key={autoRun}
            labelStyle={labelStyle}
            onRestart={() => void startAuto()}
            onClose={() => setAutoRun(null)}
            onCheck={() => {
              setAutoRun(null);
              setChecking(true);
            }}
          />
        </div>
      )}
      {checking && (
        <div className="mt-3">
          <CalibrationCheckView labelStyle={labelStyle} onClose={() => setChecking(false)} />
        </div>
      )}
    </div>
  );
}

const LISTEN_TEST_MS = 15_000;
const LISTEN_TEST_MAX_NOTES = 16;

/** Đánh thử: hiện các nốt NoteRecognizer nhận được trong 15 giây (mỗi phím phải hiện đúng một lần). */
function ListenTest({ labelStyle }: { labelStyle: NoteLabelStyle }) {
  const status = useMic((s) => s.status);
  const [until, setUntil] = useState<number | null>(null);
  const [heard, setHeard] = useState<number[] | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const listening = until !== null && status === 'running';

  // Một bộ nghe duy nhất cho mỗi lượt; gỡ khi hết giờ, bấm dừng, tắt micro hoặc rời màn hình.
  useEffect(() => {
    if (!listening) return;
    const off = microphoneInput.onNote((e) => setHeard((h) => [...(h ?? []).slice(-(LISTEN_TEST_MAX_NOTES - 1)), e.midi]));
    const tick = () => {
      const left = Math.ceil((until - performance.now()) / 1000);
      if (left <= 0) setUntil(null);
      else setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => {
      off();
      clearInterval(id);
    };
  }, [listening, until]);

  const start = async () => {
    if (!microphoneInput.isActive()) {
      await microphoneInput.start().catch(() => undefined);
      if (!microphoneInput.isActive()) return;
    }
    microphoneInput.resetRecognizer();
    setHeard([]);
    setUntil(performance.now() + LISTEN_TEST_MS);
  };

  return (
    <>
      <Button onClick={() => (listening ? setUntil(null) : void start())} data-testid="listen-test">
        {listening ? `Dừng (còn ${secondsLeft} giây)` : 'Đánh thử (15 giây)'}
      </Button>
      {heard !== null && (
        <div className="flex w-full flex-wrap items-center gap-2" data-testid="heard-notes">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {listening ? 'Đang nghe — đánh vài nốt, mỗi phím phải hiện đúng một lần:' : `Đã nghe ${heard.length} nốt:`}
          </span>
          {heard.length === 0 && !listening && <span className="text-sm text-slate-400">không nghe thấy nốt nào</span>}
          {heard.map((m, i) => (
            <span key={i} className="rounded-lg bg-violet-100 px-3 py-1 text-lg font-bold text-violet-800 dark:bg-violet-900 dark:text-violet-200">
              {midiToLabel(m, labelStyle)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function DataCard() {
  const clearProgress = useApp((s) => s.clearProgress);
  const [confirming, setConfirming] = useState(false);
  return (
    <Card>
      <h2 className="text-xl font-semibold">Dữ liệu</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Tiến độ và lịch sử luyện tập lưu trong IndexedDB của trình duyệt trên máy này. Xoá dữ liệu Safari sẽ xoá cả tiến độ.
      </p>
      <div className="mt-3 flex gap-2">
        {confirming ? (
          <>
            <Button
              variant="danger"
              onClick={() => {
                void clearProgress();
                setConfirming(false);
              }}
            >
              Xác nhận xoá toàn bộ tiến độ
            </Button>
            <Button onClick={() => setConfirming(false)}>Huỷ</Button>
          </>
        ) : (
          <Button onClick={() => setConfirming(true)}>Xoá tiến độ luyện tập…</Button>
        )}
      </div>
    </Card>
  );
}
