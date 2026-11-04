import { useState, type ReactNode } from 'react';
import { midiToLabel, type NoteLabelStyle } from '../../core/music/notes';
import { midiInput, type MidiPortInfo } from '../../core/input/MIDIInputProvider';
import { BRAND_LABEL, TRANSPORT_LABEL } from '../../core/midi/deviceProfiles';
import {
  DEFAULT_LOWEST,
  effectiveKeyCount,
  KEY_COUNT_PRESETS,
  OCTAVE_LIMIT,
  physicalRange,
  rangeAdvice,
  shouldPlaySound,
  TRANSPOSE_LIMIT,
  type KeyCount,
  type MidiDeviceConfig,
  type VelocityCurve,
} from '../../core/midi/deviceConfig';
import { LIVE_TIMBRE_LABEL, soundOutput, type LiveTimbre } from '../../core/audio/SoundOutput';
import { platformHint } from '../../core/midi/platform';
import { useMidi } from '../../store/midiStore';
import { useSettings } from '../../store/settingsStore';
import { Button, Segmented, Toggle } from '../ui';
import { MidiSignalTest } from './MidiSignalTest';

const selectClass = 'min-h-12 rounded-xl bg-white px-3 ring-1 ring-violet-200 dark:bg-slate-800 dark:ring-violet-800';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-1">
      <span>
        {label}
        {hint && <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Stepper({ value, min, max, onChange, format, testId }: { value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string; testId?: string }) {
  return (
    <span className="inline-flex items-center gap-1" data-testid={testId}>
      <Button className="w-12 px-0" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Giảm">
        −
      </Button>
      <span className="min-w-16 text-center font-semibold tabular-nums">{format ? format(value) : value > 0 ? `+${value}` : value}</span>
      <Button className="w-12 px-0" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Tăng">
        +
      </Button>
    </span>
  );
}

function DeviceConfigEditor({ port, labelStyle }: { port: MidiPortInfo; labelStyle: NoteLabelStyle }) {
  const cfg = port.config;
  const set = (patch: Partial<MidiDeviceConfig>) => midiInput.updateConfig(port.id, patch);
  const keys = effectiveKeyCount(cfg, port.profile);
  const { low, high } = physicalRange(cfg, port.profile);
  const advice = rangeAdvice(cfg, port.profile);
  const label = (m: number) => midiToLabel(m, labelStyle);
  const hasSound = port.profile.hasBuiltInSound;
  return (
    <div className="mt-2 divide-y divide-violet-100 dark:divide-violet-900" data-testid="midi-device-config">
      <Toggle label="Nhận tín hiệu từ thiết bị này" checked={cfg.enabled} onChange={(v) => set({ enabled: v })} />
      <Row label="Số phím" hint={cfg.keyCount === null ? (port.profile.keyCount ? 'Tự nhận theo tên model' : 'Không nhận ra model — mặc định 88') : undefined}>
        <select
          className={selectClass}
          value={cfg.keyCount ?? 'auto'}
          onChange={(e) => set({ keyCount: e.target.value === 'auto' ? null : (Number(e.target.value) as KeyCount), lowestNote: null })}
          data-testid="midi-key-count"
        >
          <option value="auto">Tự động ({keys} phím)</option>
          {KEY_COUNT_PRESETS.map((k) => (
            <option key={k} value={k}>
              {k} phím
            </option>
          ))}
        </select>
      </Row>
      <Row label="Dải phím của đàn" hint={`${label(low)}–${label(high)} khi nút Octave trên đàn ở giữa`}>
        <Stepper
          value={Math.round((low - DEFAULT_LOWEST[keys]) / 12)}
          min={-3}
          max={3}
          format={(v) => `${label(DEFAULT_LOWEST[keys] + v * 12)}`}
          onChange={(v) => set({ lowestNote: v === 0 ? null : DEFAULT_LOWEST[keys] + v * 12 })}
        />
      </Row>
      <Row label="Quãng tám" hint="Dịch mọi nốt lên / xuống — controller ít phím chơi được bài ở quãng khác">
        <Stepper value={cfg.octave} min={-OCTAVE_LIMIT} max={OCTAVE_LIMIT} onChange={(v) => set({ octave: v })} testId="midi-octave" />
      </Row>
      <Row label="Dịch giọng (transpose)" hint="Nửa cung; phải khớp với cài đặt transpose trên đàn nếu có">
        <Stepper value={cfg.transpose} min={-TRANSPOSE_LIMIT} max={TRANSPOSE_LIMIT} onChange={(v) => set({ transpose: v })} testId="midi-transpose" />
      </Row>
      <Row label="Kênh MIDI" hint="Đàn có nhiều tiếng (split / layer) gửi mỗi phần một kênh">
        <select className={selectClass} value={cfg.channel} onChange={(e) => set({ channel: e.target.value === 'all' ? 'all' : Number(e.target.value) })} data-testid="midi-channel">
          <option value="all">Mọi kênh</option>
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i} value={i + 1}>
              Kênh {i + 1}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Lực gõ" hint="Phím mini cứng → Nhạy; ảnh hưởng chấm sắc thái mạnh – nhẹ">
        <Segmented<VelocityCurve>
          value={cfg.velocityCurve}
          onChange={(v) => set({ velocityCurve: v })}
          options={[
            { value: 'soft', label: 'Nhạy' },
            { value: 'normal', label: 'Chuẩn' },
            { value: 'hard', label: 'Nặng' },
            { value: 'fixed', label: 'Cố định' },
          ]}
        />
      </Row>
      <Toggle
        label={
          <span>
            Chỉ nhận phím trong dải
            <span className="block text-xs text-slate-500 dark:text-slate-400">Bỏ nốt ngoài {label(low)}–{label(high)} (pad / nút gửi nốt)</span>
          </span>
        }
        checked={cfg.limitToRange}
        onChange={(v) => set({ limitToRange: v })}
      />
      <Row
        label="App phát tiếng piano khi gõ"
        hint={hasSound === false ? 'Thiết bị này không có loa' : hasSound ? 'Đàn này có loa sẵn' : 'Không rõ đàn có loa không'}
      >
        <Segmented<MidiDeviceConfig['sound']>
          value={cfg.sound}
          onChange={(v) => set({ sound: v })}
          options={[
            { value: 'auto', label: `Tự động (${shouldPlaySound({ ...cfg, sound: 'auto' }, port.profile) ? 'bật' : 'tắt'})` },
            { value: 'on', label: 'Bật' },
            { value: 'off', label: 'Tắt' },
          ]}
        />
      </Row>
      {advice && <p className="py-2 text-sm text-amber-700 dark:text-amber-300">{advice}</p>}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="ghost" onClick={() => midiInput.resetConfig(port.id)}>
          Đặt lại mặc định
        </Button>
        {!port.connected && (
          <Button variant="ghost" onClick={() => midiInput.forget(port.id)}>
            Xoá khỏi danh sách
          </Button>
        )}
      </div>
    </div>
  );
}

function DeviceCard({ port, index, labelStyle, selected, onSelect }: { port: MidiPortInfo; index: number; labelStyle: NoteLabelStyle; selected: boolean; onSelect: () => void }) {
  const active = useMidi((s) => s.lastActivePort === port.id && s.log[0]?.portId === port.id);
  const logSeq = useMidi((s) => (s.log[0]?.portId === port.id ? s.log[0].seq : 0));
  const [open, setOpen] = useState(false);
  const keys = effectiveKeyCount(port.config, port.profile);
  const status = !port.connected ? 'Đã ngắt' : port.config.enabled ? 'Đang kết nối' : 'Đang tắt';
  const statusClass = !port.connected
    ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
    : port.config.enabled
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
      : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
  const brand = port.profile.brand !== 'unknown' ? BRAND_LABEL[port.profile.brand] : port.manufacturer || BRAND_LABEL.unknown;
  return (
    <li className={`rounded-xl p-3 ring-1 ${selected ? 'bg-violet-50 ring-violet-300 dark:bg-slate-900 dark:ring-violet-600' : 'ring-violet-100 dark:ring-violet-900'}`} data-testid={`midi-device-${index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          key={logSeq}
          className={`h-3 w-3 shrink-0 rounded-full ${active ? 'animate-ping bg-fuchsia-500' : port.connected ? 'bg-emerald-500' : 'bg-slate-400'}`}
          style={{ animationIterationCount: 1 }}
          aria-hidden
        />
        <button type="button" className="min-h-12 flex-1 text-left" onClick={onSelect}>
          <span className="block font-semibold" data-testid="midi-device-name">
            {port.name}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {brand}
            {port.profile.model && ` · ${port.profile.model}`} · {keys} phím · {TRANSPORT_LABEL[port.transport]}
            {port.transportGuessed && port.transport !== 'os' ? ' (đoán theo tên)' : ''}
          </span>
        </button>
        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${statusClass}`} data-testid="midi-device-status">
          {status}
        </span>
        <Button variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Đóng' : 'Cấu hình'}
        </Button>
      </div>
      {open && <DeviceConfigEditor port={port} labelStyle={labelStyle} />}
      {selected && port.connected && <MidiSignalTest port={port} labelStyle={labelStyle} />}
    </li>
  );
}

function SoundChooser() {
  const timbre = useSettings((s) => s.settings.midiSoundTimbre);
  const update = useSettings((s) => s.update);
  const preview = (t: LiveTimbre) => {
    soundOutput.liveNoteOn(60, 90, t);
    setTimeout(() => soundOutput.liveNoteOff(60), 600);
  };
  return (
    <Row label="Tiếng piano của app" hint="Dùng khi đàn không có loa (controller). Chạm màn hình một lần sau khi mở app để trình duyệt cho phát tiếng.">
      <span className="flex flex-wrap items-center gap-2">
        <Segmented<LiveTimbre>
          value={timbre}
          onChange={(v) => {
            update({ midiSoundTimbre: v });
            preview(v);
          }}
          options={(Object.keys(LIVE_TIMBRE_LABEL) as LiveTimbre[]).map((v) => ({ value: v, label: LIVE_TIMBRE_LABEL[v] }))}
        />
        <Button variant="ghost" onClick={() => preview(timbre)}>
          Nghe thử
        </Button>
      </span>
    </Row>
  );
}

/** Danh sách thiết bị + cấu hình + kiểm tra tín hiệu (hiện khi đã bật MIDI). */
export function MidiDeviceManager({ labelStyle }: { labelStyle: NoteLabelStyle }) {
  const { status, ports } = useMidi();
  const lastActive = useMidi((s) => s.lastActivePort);
  const [picked, setPicked] = useState<string | null>(null);
  const connected = ports.filter((p) => p.connected);
  const selectedId = (picked && connected.some((p) => p.id === picked) ? picked : null) ?? (lastActive && connected.some((p) => p.id === lastActive) ? lastActive : connected[0]?.id ?? null);

  return (
    <div className="mt-3" data-testid="midi-device-manager">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex-1 font-semibold">Thiết bị MIDI</h3>
        {midiInput.canPairBluetooth() && <Button onClick={() => midiInput.pairBluetooth()}>Ghép Bluetooth MIDI</Button>}
        <Button variant="ghost" onClick={() => void midiInput.reconnect()} disabled={status === 'connecting'} data-testid="midi-reconnect">
          Kết nối lại
        </Button>
      </div>
      {midiInput.backendLabel && <p className="text-xs text-slate-500 dark:text-slate-400">Qua: {midiInput.backendLabel}</p>}
      {ports.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chưa có thiết bị nào.</p>
      ) : (
        <ul className="mt-2 space-y-2" data-testid="midi-device-list">
          {ports.map((p, i) => (
            <DeviceCard key={p.id} port={p} index={i} labelStyle={labelStyle} selected={p.id === selectedId} onSelect={() => setPicked(p.id)} />
          ))}
        </ul>
      )}
      <div className="mt-3">
        <SoundChooser />
      </div>
    </div>
  );
}

/** Giải thích khi nền tảng không có MIDI (Safari, iPad) — kèm hướng đi Core MIDI. */
export function MidiUnsupportedNote() {
  const hint = platformHint();
  return (
    <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="midi-unsupported">
      {hint === 'ipad' ? (
        <>
          <p>
            Safari và mọi trình duyệt trên iPad/iPhone đều không có Web MIDI nên VietPiano trên trình duyệt chưa nhận được đàn MIDI. Tạm thời
            hãy dùng micro.
          </p>
          <p className="mt-1">
            Đang thiết kế <b>app VietPiano cho iPad</b> dùng Core MIDI (USB-C, Bluetooth MIDI) với cùng giao diện; khi chạy trong app đó, mục này sẽ
            tự hiện danh sách đàn.
          </p>
        </>
      ) : (
        <p>
          Trình duyệt này không hỗ trợ MIDI (Web MIDI). Safari và mọi trình duyệt trên iPad/iPhone đều không có. Hãy mở VietPiano bằng Chrome hoặc
          Edge trên máy tính, hoặc tiếp tục dùng micro.
        </p>
      )}
    </div>
  );
}
