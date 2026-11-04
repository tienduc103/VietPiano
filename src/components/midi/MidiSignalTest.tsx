import { useMemo } from 'react';
import { midiToLabel, type NoteLabelStyle } from '../../core/music/notes';
import { mappedRange, totalShift } from '../../core/midi/deviceConfig';
import type { MidiPortInfo } from '../../core/input/MIDIInputProvider';
import { midiSimulator, simulatorIdOf } from '../../core/midi/appMidi';
import { useMidi } from '../../store/midiStore';

const BLACK = new Set([1, 3, 6, 8, 10]);
const isBlack = (m: number) => BLACK.has(m % 12);

/**
 * Kiểm tra tín hiệu trực tiếp của một thiết bị: bàn phím theo dải nốt app nhận (sau dịch giọng),
 * phím đang giữ, pedal, lực gõ, nhật ký thông điệp. Thiết bị mô phỏng: bấm phím trên hình để gửi nốt.
 */
export function MidiSignalTest({ port, labelStyle }: { port: MidiPortInfo; labelStyle: NoteLabelStyle }) {
  const held = useMidi((s) => s.heldByPort[port.id]) ?? [];
  const pedal = useMidi((s) => s.pedalByPort[port.id] ?? false);
  const log = useMidi((s) => s.log);
  const lastVelocity = useMidi((s) => s.lastVelocity);
  const simId = simulatorIdOf(port.id);
  const { low, high } = mappedRange(port.config, port.profile);
  const keys = useMemo(() => Array.from({ length: high - low + 1 }, (_, i) => low + i), [low, high]);
  const whites = keys.filter((m) => !isBlack(m));
  const heldSet = new Set(held);
  const shift = totalShift(port.config);
  const portLog = log.filter((e) => e.portId === port.id);

  const press = (midi: number, on: boolean) => {
    if (!simId) return;
    const raw = midi - shift;
    if (on) midiSimulator.noteOn(simId, raw, 90);
    else midiSimulator.noteOff(simId, raw);
  };

  return (
    <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-violet-100 dark:bg-slate-900 dark:ring-violet-900" data-testid="midi-signal-test">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">Kiểm tra tín hiệu</span>
        <span>
          Nốt: <b data-testid="midi-signal-note">{held.length ? held.map((m) => midiToLabel(m, labelStyle)).join(' ') : '—'}</b>
        </span>
        <span className="flex items-center gap-2">
          Lực gõ
          <span className="relative h-2 w-24 overflow-hidden rounded bg-slate-200 dark:bg-slate-700">
            <span className="absolute inset-y-0 left-0 bg-fuchsia-500" style={{ width: `${(lastVelocity ?? 0) / 1.27}%` }} />
          </span>
          <span className="w-8 tabular-nums" data-testid="midi-signal-velocity">
            {lastVelocity ?? '—'}
          </span>
        </span>
        <span className={pedal ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-slate-500'} data-testid="midi-signal-pedal">
          Pedal: {pedal ? 'đang đạp' : 'nhả'}
        </span>
      </div>
      <div className="relative mt-2 h-20 select-none" style={{ touchAction: 'none' }} aria-label="Bàn phím kiểm tra tín hiệu">
        <div className="flex h-full">
          {whites.map((m) => (
            <div
              key={m}
              data-midi={m}
              onPointerDown={() => press(m, true)}
              onPointerUp={() => press(m, false)}
              onPointerLeave={(e) => e.buttons && press(m, false)}
              className={`relative flex-1 rounded-b border border-slate-300 dark:border-slate-600 ${heldSet.has(m) ? 'bg-fuchsia-400' : 'bg-white dark:bg-slate-200'} ${simId ? 'cursor-pointer' : ''}`}
            >
              {m % 12 === 0 && <span className="absolute bottom-0.5 left-0 right-0 text-center text-[9px] text-slate-500">{midiToLabel(m, labelStyle)}</span>}
            </div>
          ))}
        </div>
        {keys.filter(isBlack).map((m) => {
          const idx = whites.findIndex((w) => w > m);
          if (idx <= 0) return null;
          return (
            <div
              key={m}
              data-midi={m}
              onPointerDown={() => press(m, true)}
              onPointerUp={() => press(m, false)}
              onPointerLeave={(e) => e.buttons && press(m, false)}
              className={`absolute top-0 h-[60%] rounded-b ${heldSet.has(m) ? 'bg-fuchsia-600' : 'bg-slate-800'} ${simId ? 'cursor-pointer' : ''}`}
              style={{ left: `calc(${(idx / whites.length) * 100}% - ${35 / whites.length}%)`, width: `${70 / whites.length}%` }}
            />
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {midiToLabel(low, labelStyle)}–{midiToLabel(high, labelStyle)} · {keys.length} phím
        {shift !== 0 && ` · đang dịch ${shift > 0 ? '+' : ''}${shift} nửa cung`}
        {simId && ' · đàn mô phỏng: bấm phím trên hình để gửi nốt'}
      </p>
      <ol className="mt-2 max-h-32 overflow-y-auto font-mono text-xs" data-testid="midi-signal-log">
        {portLog.length === 0 && <li className="text-slate-500">Chưa nhận tín hiệu nào — bấm thử một phím hoặc đạp pedal.</li>}
        {portLog.map((e) => (
          <li key={e.seq} className={e.accepted ? '' : 'text-slate-400 line-through'} title={e.accepted ? undefined : 'Bị bỏ qua (thiết bị đang tắt hoặc kênh bị lọc)'}>
            {e.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
