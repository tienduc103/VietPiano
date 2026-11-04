/**
 * Adapter nền tảng MIDI. MidiEngine chỉ làm việc với interface này nên Web MIDI (Chrome/Edge trên Windows,
 * macOS, Android), cầu nối native (Core MIDI trên iPad qua app vỏ WKWebView, Windows MIDI qua WebView2)
 * và thiết bị mô phỏng (test / phát triển không cần đàn thật) dùng chung một logic.
 *
 * Adapter chỉ chuyển byte thô + danh sách cổng; KHÔNG đọc nghĩa thông điệp, KHÔNG biết hãng / model.
 */
import type { MidiTransport } from '../deviceProfiles';

export interface MidiPortDescriptor {
  /** Duy nhất trong phiên kết nối (Web MIDI trên Windows có thể đổi giữa các lần cắm). */
  id: string;
  name: string;
  manufacturer: string;
  /** Adapter biết chắc (native, mô phỏng) thì báo; Web MIDI không biết → undefined, engine đoán theo tên. */
  transport?: MidiTransport;
  state: 'connected' | 'disconnected';
}

export interface MidiBackendHandlers {
  /** Danh sách cổng vào thay đổi (cắm / rút / bật / tắt đàn, ghép Bluetooth). Luôn gửi đủ danh sách. */
  onPorts(ports: MidiPortDescriptor[]): void;
  /** Byte thô từ một cổng. `time` cùng gốc performance.now(); có thể chứa nhiều thông điệp / running status. */
  onData(portId: string, data: ArrayLike<number>, time: number): void;
  /** Kết nối hỏng giữa chừng (app native mất cầu nối…) → engine chuyển trạng thái lỗi và thử kết nối lại. */
  onError?(error: Error): void;
}

export interface MidiBackendSession {
  close(): void;
  /** Quét lại cổng (khi app trở lại từ nền). */
  refresh?(): void;
}

export type MidiBackendKind = 'web-midi' | 'native-bridge' | 'simulated' | 'composite';

export interface MidiBackend {
  readonly kind: MidiBackendKind;
  /** Tên hiển thị: "Web MIDI (Chrome/Edge)", "Core MIDI (app VietPiano cho iPad)"… */
  readonly label: string;
  /** Lỗi xin quyền: ném Error có `name` = 'SecurityError' | 'NotAllowedError'. */
  open(handlers: MidiBackendHandlers): Promise<MidiBackendSession>;
  /** Mở hộp thoại ghép Bluetooth LE MIDI của hệ điều hành nếu nền tảng có (iPad: CABTMIDICentralViewController). */
  pairBluetooth?(): void;
}
