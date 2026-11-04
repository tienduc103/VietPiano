/**
 * Lưu cấu hình từng đàn MIDI (localStorage). Khoá theo TÊN + hãng chứ không theo id cổng:
 * Web MIDI trên Windows đổi id theo thứ tự cắm, còn tên giữ nguyên → cắm lại vẫn nhớ cấu hình.
 * Hai đàn cùng model dùng chung cấu hình (chấp nhận được với app học một người).
 */
import { normalizeDeviceName } from './deviceProfiles';
import { sanitizeDeviceConfig, type MidiDeviceConfig } from './deviceConfig';

export interface DeviceConfigStore {
  load(key: string): MidiDeviceConfig | undefined;
  save(key: string, config: MidiDeviceConfig): void;
}

const STORAGE_KEY = 'vietpiano.midiDevices.v1';
/** Không giữ cấu hình vô hạn (mỗi lần cắm cổng ảo lạ lại thêm một mục). */
const MAX_ENTRIES = 40;

export function deviceKey(name: string, manufacturer: string): string {
  return `${normalizeDeviceName(name)}|${manufacturer.trim().toLowerCase()}`;
}

export class MemoryDeviceConfigStore implements DeviceConfigStore {
  protected map = new Map<string, MidiDeviceConfig>();
  load(key: string) {
    return this.map.get(key);
  }
  save(key: string, config: MidiDeviceConfig) {
    this.map.delete(key);
    this.map.set(key, config);
    while (this.map.size > MAX_ENTRIES) this.map.delete(this.map.keys().next().value as string);
  }
}

type KV = Pick<Storage, 'getItem' | 'setItem'>;

function safeStorage(): KV | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export class LocalDeviceConfigStore extends MemoryDeviceConfigStore {
  constructor(private readonly storage: KV | undefined = safeStorage()) {
    super();
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>).slice(-MAX_ENTRIES)) this.map.set(k, sanitizeDeviceConfig(v));
      }
    } catch {
      // dữ liệu hỏng → bắt đầu lại
    }
  }

  override save(key: string, config: MidiDeviceConfig): void {
    super.save(key, config);
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.map)));
    } catch {
      // Safari private mode / hết dung lượng: chỉ nhớ trong phiên
    }
  }
}
