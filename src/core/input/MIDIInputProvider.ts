/**
 * MIDIInputProvider: nguồn nốt từ đàn MIDI cho toàn app. Toàn bộ xử lý nằm ở `core/midi/MidiEngine`
 * (lớp MIDI chung, độc lập hãng / nền tảng); file này giữ tên và API cũ để mọi màn hình, bài học, trò chơi
 * dùng `midiInput` như trước.
 *
 * Adapter mặc định: cầu nối native nếu trang chạy trong app VietPiano (iPad Core MIDI / Windows WebView2),
 * không thì Web MIDI (Chrome / Edge máy tính). Safari và mọi trình duyệt trên iPad không có Web MIDI →
 * `isSupported()` = false, app dùng micro như cũ.
 * MIDI cho biết chính xác phím nào được gõ nên không qua NoteRecognizer.
 */
import { MidiEngine, type MidiEngineOptions } from '../midi/MidiEngine';
import type { MidiBackend } from '../midi/backends/types';
import { WebMidiBackend, type RequestMidiAccess } from '../midi/backends/WebMidiBackend';
import { platformBackend } from '../midi/platform';

export { parseNoteMessage, parseNoteOn, parseSustainPedal, type MidiNoteMessage, type MidiNoteOn } from '../midi/messages';
export type { MidiAccessLike, MidiInputLike, RequestMidiAccess } from '../midi/backends/WebMidiBackend';
export type { MidiDetailEvent, MidiDevice, MidiPortInfo, MidiState, MidiStatus, PedalInputEvent } from '../midi/MidiEngine';

export class MIDIInputProvider extends MidiEngine {
  /** Nhận hàm xin quyền Web MIDI (test cũ), một adapter bất kỳ, hoặc null = không hỗ trợ. */
  constructor(source: RequestMidiAccess | MidiBackend | null = platformBackend(), opts?: MidiEngineOptions) {
    super(typeof source === 'function' ? new WebMidiBackend(source) : source, opts);
  }
}

/** Một instance cho toàn app. */
export const midiInput = new MIDIInputProvider();
