import { useSyncExternalStore } from 'react';
import { midiInput } from '../core/input/MIDIInputProvider';

/**
 * Đã nhận tín hiệu pedal vang (Control Change 64) từ đàn MIDI ít nhất một lần trong lần mở app này chưa.
 * Đàn MIDI không cho biết có cắm pedal hay không: chưa thấy tín hiệu pedal nào → coi như thiết bị không cung cấp
 * dữ liệu pedal → điểm pedal "không đo" (không phạt), thay vì chấm 0%.
 */
let seen = false;
const listeners = new Set<() => void>();
let unsubscribe: (() => void) | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  unsubscribe ??= midiInput.onPedal(() => {
    if (seen) return;
    seen = true;
    listeners.forEach((l) => l());
  });
  return () => listeners.delete(listener);
}

export function usePedalSeen(): boolean {
  return useSyncExternalStore(subscribe, () => seen);
}
