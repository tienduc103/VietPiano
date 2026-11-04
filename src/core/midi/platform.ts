/**
 * Chọn adapter MIDI theo nền tảng:
 *   1. Trang chạy trong app VietPiano native (iPad Core MIDI / Windows WebView2) → cầu nối native.
 *   2. Trình duyệt có Web MIDI (Chrome / Edge máy tính, Android) → Web MIDI.
 *   3. Không có gì (Safari, mọi trình duyệt trên iPad) → null = "không hỗ trợ", app dùng micro.
 * Thiết bị mô phỏng (phát triển / e2e) gộp thêm vào adapter thật nếu bật.
 */
import { CompositeBackend } from './backends/CompositeBackend';
import { detectBridgeChannel, NativeBridgeBackend } from './backends/NativeBridgeBackend';
import { SimulatedMidiBackend } from './backends/SimulatedMidiBackend';
import type { MidiBackend } from './backends/types';
import { browserRequestMidiAccess, WebMidiBackend } from './backends/WebMidiBackend';

export function createPlatformBackend(): MidiBackend | null {
  const channel = detectBridgeChannel();
  if (channel) return new NativeBridgeBackend(channel);
  const request = browserRequestMidiAccess();
  return request ? new WebMidiBackend(request) : null;
}

let cached: { backend: MidiBackend | null } | null = null;

/** Adapter nền tảng dùng chung cả app (phát hiện một lần: cầu nối native chỉ được gắn bộ nhận một lần). */
export function platformBackend(): MidiBackend | null {
  cached ??= { backend: createPlatformBackend() };
  return cached.backend;
}

export function withSimulator(base: MidiBackend | null, sim: SimulatedMidiBackend | null): MidiBackend | null {
  if (!sim) return base;
  return base ? new CompositeBackend([base, sim]) : sim;
}

/** Nền tảng hiện tại để Quản lý thiết bị giải thích đúng cách nối. */
export type MidiPlatformHint = 'ipad' | 'safari' | 'desktop' | 'other';

export function platformHint(nav: { userAgent: string; maxTouchPoints?: number; platform?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator): MidiPlatformHint {
  if (!nav) return 'other';
  const ua = nav.userAgent;
  // iPadOS 13+ báo là Macintosh; phân biệt bằng màn cảm ứng.
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1)) return 'ipad';
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return 'safari';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'other';
}
