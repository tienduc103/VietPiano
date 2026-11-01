import { useEffect, type RefObject } from 'react';
import { MIDI_NAV_CHORD_MS, MidiNav, type MidiNavAction } from '../core/input/midiNav';
import { midiInput } from '../core/input/MIDIInputProvider';
import { useApp } from '../store/appStore';

/** Một bộ điều hướng cho toàn app (xem `core/input/midiNav.ts`). */
export const midiNav = new MidiNav();

let installed = false;

/** Nghe đàn MIDI + chạm màn hình — gắn một lần, khi nút điều hướng đầu tiên xuất hiện. */
function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Hai phím đen cùng lúc → Trang chủ.
  midiNav.setHome(() => useApp.getState().navigate({ name: 'dashboard' }));
  midiInput.onNote((e) => {
    if (document.hidden) return;
    // Phím đen: chờ xem có phím đen thứ hai (về Trang chủ) rồi mới "lùi lại".
    if (midiNav.press({ kind: 'note', midi: e.midi, time: e.time }) === 'pending') {
      window.setTimeout(() => midiNav.flush(performance.now()), MIDI_NAV_CHORD_MS + 20);
    }
  });
  midiInput.onPedal((e) => {
    if (!e.down || document.hidden) return;
    midiNav.press({ kind: 'pedal', time: e.time });
  });
  // Chạm / bấm chuột thường đổi màn → chờ lại trước khi nhận phím đàn.
  window.addEventListener('pointerdown', () => midiNav.touched(performance.now()), true);
}

/** Nút đang hiện, không bị tắt, không nằm dưới hộp thoại đang mở. */
function isAvailable(el: HTMLButtonElement | null): boolean {
  if (!el || !el.isConnected || el.disabled || el.getClientRects().length === 0) return false;
  if (el.closest('[inert],[aria-hidden="true"]')) return false;
  const modals = document.querySelectorAll('[aria-modal="true"]');
  const top = modals[modals.length - 1];
  return !top || top.contains(el);
}

/** Gắn nút vào điều hướng bằng đàn MIDI: phím trắng / pedal → 'forward', phím đen → 'back'. */
export function useMidiNavTarget(ref: RefObject<HTMLButtonElement | null>, action: MidiNavAction | undefined): void {
  useEffect(() => {
    if (!action) return;
    install();
    return midiNav.register({ action, available: () => isAvailable(ref.current), activate: () => ref.current?.click() }, performance.now());
  }, [action, ref]);
}

/** Màn đang nghe nốt (`active`) → phím đàn không điều hướng. */
export function useMidiNavListening(active: boolean): void {
  useEffect(() => (active ? midiNav.listen() : undefined), [active]);
}
