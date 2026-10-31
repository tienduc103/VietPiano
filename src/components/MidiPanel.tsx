import { midiToLabel, type NoteLabelStyle } from '../core/music/notes';
import { midiInput } from '../core/input/MIDIInputProvider';
import { useMidi } from '../store/midiStore';
import { useSettings } from '../store/settingsStore';
import { Button, Icon, Toggle } from './ui';

/** Phần cài đặt đàn MIDI: bật/tắt, trạng thái kết nối, tên đàn, nốt vừa nhận để thử. */
export function MidiSettings({ labelStyle }: { labelStyle: NoteLabelStyle }) {
  const enabled = useSettings((s) => s.settings.midiEnabled);
  const update = useSettings((s) => s.update);
  const { status, devices, error, lastNote } = useMidi();

  if (status === 'unsupported') {
    return (
      <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="midi-unsupported">
        Trình duyệt này không hỗ trợ MIDI (Web MIDI). Safari và mọi trình duyệt trên iPad/iPhone đều không có. Hãy mở
        VietPiano bằng Chrome hoặc Edge trên máy tính, hoặc tiếp tục dùng micro.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <Toggle
        label={
          <span>
            Dùng đàn MIDI
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              Nhận nốt chính xác qua dây, không cần micro. Khi đàn đã nối, nốt nghe qua micro bị bỏ qua khi luyện tập.
            </span>
          </span>
        }
        checked={enabled}
        onChange={(v) => update({ midiEnabled: v })}
      />
      {enabled && (
        <div className="mt-3 rounded-xl bg-violet-50 p-4 ring-1 ring-violet-100 dark:bg-slate-900/60 dark:ring-violet-900" data-testid="midi-status">
          {status === 'connecting' && <p>Đang mở MIDI… (trình duyệt có thể hỏi quyền, hãy chọn Cho phép)</p>}
          {(status === 'denied' || status === 'error') && (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="flex-1 text-sm text-rose-700 dark:text-rose-300">
                {error}
              </p>
              <Button onClick={() => void midiInput.start()}>Thử lại</Button>
            </div>
          )}
          {status === 'ready' && devices.length === 0 && (
            <p>
              <b>Chưa thấy đàn.</b> Cắm dây USB từ đàn vào máy và bật đàn — danh sách tự cập nhật. Nếu vẫn không thấy, đóng
              các phần mềm nhạc khác đang dùng đàn (trên Windows mỗi lúc chỉ một chương trình mở được cổng MIDI).
            </p>
          )}
          {status === 'ready' && devices.length > 0 && (
            <>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                Đã kết nối: {devices.map((d) => d.name).join(', ')}
              </p>
              <p className="mt-2 flex items-center gap-3">
                <span className="text-sm text-slate-500 dark:text-slate-400">Bấm thử một phím trên đàn:</span>
                <span className="min-w-16 text-3xl font-bold tabular-nums" data-testid="midi-last-note">
                  {lastNote === null ? '—' : midiToLabel(lastNote, labelStyle)}
                </span>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Nhãn nhỏ ở màn luyện tập: đang nhận nốt từ đàn nào. Ẩn khi không bật MIDI. */
export function MidiBadge({ small = false }: { small?: boolean }) {
  const enabled = useSettings((s) => s.settings.midiEnabled);
  const { status, devices } = useMidi();
  if (!enabled || status === 'unsupported' || status === 'idle') return null;
  const connected = status === 'ready' && devices.length > 0;
  return (
    <div
      className={`inline-flex items-center font-semibold ${small ? 'min-h-9 gap-1.5 rounded-lg px-2.5 text-xs' : 'min-h-12 gap-2 rounded-xl px-3 text-sm'} ${
        connected
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
      }`}
      data-testid="midi-badge"
      title={connected ? 'Đang nhận nốt từ đàn MIDI; nốt nghe qua micro bị bỏ qua' : 'Bật MIDI nhưng chưa thấy đàn'}
    >
      <Icon name="keyboard" className={small ? 'h-4 w-4' : 'h-5 w-5'} />
      <span className="max-w-48 truncate">{connected ? `MIDI: ${devices[0].name}` : status === 'ready' ? 'Chưa thấy đàn MIDI' : 'MIDI…'}</span>
    </div>
  );
}
