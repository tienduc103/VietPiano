import { useEffect, type RefObject } from 'react';
import { MIDI_NAV_CHORD_MS, MidiNav, type MidiNavAction } from '../core/input/midiNav';
import { midiInput } from '../core/input/MIDIInputProvider';
import type { NoteInputEvent } from '../core/input/NoteInputProvider';
import { useApp } from '../store/appStore';

/** Một bộ điều hướng cho toàn app (xem `core/input/midiNav.ts`). */
export const midiNav = new MidiNav();

let installed = false;

/**
 * Phím đàn đã dùng để bấm nút (hoặc phím đen đang chờ "lùi lại" / về Trang chủ). Nút bấm có thể đổi màn ngay trong
 * lúc phát sự kiện (vd "Bắt đầu" → ván chuyển sang đang chơi), nên màn nghe nốt phải bỏ chính phím đó (`useNoteInput`).
 */
const consumed = new WeakSet<NoteInputEvent>();

/** Phím này đã được điều hướng bằng đàn MIDI dùng → không phải nốt của bài / trò chơi. */
export function consumedByMidiNav(e: NoteInputEvent): boolean {
  return consumed.has(e);
}

/**
 * Nghe đàn MIDI + chạm màn hình — gắn một lần, khi nút điều hướng đầu tiên xuất hiện hoặc màn nghe nốt đầu tiên
 * mở (`useMidiNavListening`, chạy trước khi màn đăng ký nghe nốt). Nhờ vậy điều hướng luôn nhận phím TRƯỚC mọi màn
 * và kịp đánh dấu phím đã dùng (`consumedByMidiNav`).
 *
 * Mọi mốc thời gian của điều hướng (nút xuất hiện, chạm màn hình, phím đen chờ phím thứ hai) đo bằng `performance.now()`
 * → phím cũng tính theo lúc NHẬN, không dùng `e.time`: Web MIDI lấy mốc của driver (Windows: lúc mở cổng + số ms driver
 * báo; Bluetooth MIDI tự ước lượng) nên trên đàn thật có thể lệch xa đồng hồ của trang. Mốc trễ → mọi phím bị coi là
 * bấm trước khi nút hiện (kẹt trang); mốc sớm → phím đen chờ mãi, không "Quay lại".
 */
function install(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Hai phím đen cùng lúc → Trang chủ.
  midiNav.setHome(() => useApp.getState().navigate({ name: 'dashboard' }));
  midiInput.onNote((e) => {
    if (document.hidden) return;
    const result = midiNav.press({ kind: 'note', midi: e.midi, time: performance.now() });
    if (result !== null) consumed.add(e);
    // Phím đen: chờ xem có phím đen thứ hai (về Trang chủ) rồi mới "lùi lại".
    if (result === 'pending') window.setTimeout(() => midiNav.flush(performance.now()), MIDI_NAV_CHORD_MS + 20);
  });
  midiInput.onPedal((e) => {
    if (!e.down || document.hidden) return;
    midiNav.press({ kind: 'pedal', time: performance.now() });
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

/** Màn đang nghe nốt (`active`) → phím đàn không điều hướng. Gọi TRƯỚC khi màn đăng ký nghe nốt (xem `install`). */
export function useMidiNavListening(active: boolean): void {
  useEffect(() => {
    install();
    return active ? midiNav.listen() : undefined;
  }, [active]);
}
