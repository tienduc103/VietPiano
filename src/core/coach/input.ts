/**
 * Nguồn nốt của một phiên ghi Coach + dữ liệu nguồn đó THỰC SỰ cung cấp (quyết định tiêu chí nào chấm được):
 *  - đàn MIDI (đã nối, được chọn / tự động): Note On + velocity + Note Off; pedal chỉ khi đã thấy tín hiệu CC 64;
 *  - micro (chọn "Micro", hoặc tự động khi micro đang bật và không có đàn MIDI): chỉ nốt đơn, không Note Off, độ to tương đối;
 *  - còn lại: bàn phím ảo / bàn phím máy tính — có Note Off, không lực gõ, không pedal.
 * Bàn phím ảo luôn được ghi kèm (người dùng bấm trực tiếp trên màn hình), như các màn khác.
 */
import type { InputSource } from '../input/NoteInputProvider';
import type { CoachInputSetting } from './settings';
import type { InputCapabilities } from './types';

export interface ResolvedInput {
  primary: InputSource;
  sources: ReadonlySet<InputSource>;
  capabilities: InputCapabilities;
  label: string;
}

/** Nguồn nốt của phiên ghi + dữ liệu nguồn đó cung cấp được (không tuyên bố có pedal / velocity khi nguồn không gửi). */
export function resolveInput(setting: CoachInputSetting, midiReady: boolean, micRunning: boolean, pedalSeen: boolean): ResolvedInput {
  const midi = (setting === 'auto' || setting === 'midi') && midiReady;
  const mic = !midi && (setting === 'microphone' || (setting === 'auto' && micRunning));
  if (midi)
    return { primary: 'midi', sources: new Set(['midi', 'virtual']), capabilities: { noteOff: true, velocity: true, relativeLevel: false, pedal: pedalSeen, polyphonic: true }, label: 'Đàn MIDI' };
  if (mic)
    return { primary: 'microphone', sources: new Set(['microphone', 'virtual']), capabilities: { noteOff: false, velocity: false, relativeLevel: true, pedal: false, polyphonic: false }, label: 'Micro (thử nghiệm — chỉ nốt đơn)' };
  return { primary: 'virtual', sources: new Set(['virtual']), capabilities: { noteOff: true, velocity: false, relativeLevel: false, pedal: false, polyphonic: true }, label: 'Bàn phím ảo / bàn phím máy tính' };
}

