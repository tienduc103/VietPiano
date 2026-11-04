import { midiToLabel, type NoteLabelStyle } from '../core/music/notes';
import { midiInput } from '../core/input/MIDIInputProvider';
import { useMidi } from '../store/midiStore';
import { useSettings } from '../store/settingsStore';
import { Button, Icon, Toggle } from './ui';
import { MidiDeviceManager, MidiUnsupportedNote } from './midi/MidiDeviceManager';

/**
 * Phần cài đặt đàn MIDI: bật/tắt, trạng thái kết nối, nốt vừa nhận để thử, Quản lý thiết bị MIDI
 * (danh sách đàn, cấu hình dải phím / transpose / kênh, kiểm tra tín hiệu, tiếng piano), đàn mô phỏng.
 */
export function MidiSettings({ labelStyle }: { labelStyle: NoteLabelStyle }) {
  const enabled = useSettings((s) => s.settings.midiEnabled);
  const simulator = useSettings((s) => s.settings.midiSimulator);
  const update = useSettings((s) => s.update);
  const { status, devices, error, lastNote, lastVelocity } = useMidi();

  const simulatorToggle = (
    <Toggle
      label={
        <span>
          Đàn MIDI mô phỏng
          <span className="block text-sm text-slate-500 dark:text-slate-400">
            Thêm hai đàn ảo (controller 25 phím, đàn điện 88 phím) để thử cấu hình khi chưa có đàn thật. Bấm phím trên hình ở mục Kiểm tra tín hiệu.
          </span>
        </span>
      }
      checked={simulator}
      onChange={(v) => update(v ? { midiSimulator: true, midiEnabled: true } : { midiSimulator: false })}
    />
  );

  if (status === 'unsupported') {
    return (
      <>
        <MidiUnsupportedNote />
        <div className="mt-2">{simulatorToggle}</div>
      </>
    );
  }

  return (
    <div className="mt-2">
      <Toggle
        label={
          <span>
            Dùng đàn MIDI
            <span className="block text-sm text-slate-500 dark:text-slate-400">
              Nhận nốt chính xác qua dây USB hoặc Bluetooth MIDI, không cần micro. Khi đàn đã nối, nốt nghe qua micro bị bỏ qua khi luyện tập.
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
              <b>Chưa thấy đàn.</b> Cắm dây USB từ đàn vào máy và bật đàn — danh sách tự cập nhật. Đàn Bluetooth MIDI: ghép trong cài đặt
              Bluetooth / phần mềm MIDI của hệ điều hành trước. Nếu vẫn không thấy, đóng các phần mềm nhạc khác đang dùng đàn (trên Windows mỗi lúc
              chỉ một chương trình mở được cổng MIDI) rồi bấm Kết nối lại.
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
                {lastNote !== null && lastVelocity !== null && <span className="text-sm text-slate-500 dark:text-slate-400">lực {lastVelocity}</span>}
              </p>
            </>
          )}
          {(status === 'ready' || status === 'error') && <MidiDeviceManager labelStyle={labelStyle} />}
        </div>
      )}
      <div className="mt-2">{simulatorToggle}</div>
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
      className={`inline-flex items-center font-semibold ${small ? 'min-h-7 gap-1 rounded-md px-2 text-[11px]' : 'min-h-12 gap-2 rounded-xl px-3 text-sm'} ${
        connected
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
      }`}
      data-testid="midi-badge"
      title={connected ? 'Đang nhận nốt từ đàn MIDI; nốt nghe qua micro bị bỏ qua' : 'Bật MIDI nhưng chưa thấy đàn'}
    >
      <Icon name="keyboard" className={small ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
      <span className="max-w-48 truncate">{connected ? `MIDI: ${devices[0].name}` : status === 'ready' ? 'Chưa thấy đàn MIDI' : 'MIDI…'}</span>
    </div>
  );
}
