import type { InputSource } from './NoteInputProvider';
import type { InputSourceSetting } from '../settings/DeviceSettings';

/**
 * Có nhận sự kiện từ nguồn này không, theo cài đặt nguồn nốt của giáo trình.
 * Bàn phím ảo luôn nhận (người dùng bấm trực tiếp trên màn hình).
 */
export function acceptSource(source: InputSource, setting: InputSourceSetting, midiConnected: boolean): boolean {
  if (source === 'virtual') return true;
  if (setting === 'microphone') return source === 'microphone';
  if (setting === 'midi') return source === 'midi';
  // auto: đàn MIDI đã nối thì micro cũng nghe chính tiếng đàn đó → bỏ micro để một phím không thành hai sự kiện.
  return source === 'midi' || !midiConnected;
}

/**
 * Nốt chỉ đến từ micro (không có đàn MIDI nhận được): micro chỉ nhận một nốt mỗi lúc → bài có phần đệm chỉ chấm
 * tay phải. Micro tắt thì người học bấm bàn phím ảo / bàn phím máy tính → chấm được cả hai tay.
 */
export function micOnlyInput(setting: InputSourceSetting, micRunning: boolean, midiConnected: boolean): boolean {
  if (!micRunning) return false;
  return setting === 'microphone' || (setting === 'auto' && !midiConnected);
}
