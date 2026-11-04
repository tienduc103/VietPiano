/**
 * Nhận dạng thiết bị MIDI từ tên cổng + hãng sản xuất mà hệ điều hành báo.
 *
 * Chỉ là GỢI Ý mặc định (số phím, có loa sẵn hay không, cách kết nối) để người dùng đỡ phải chỉnh tay;
 * mọi thiết bị tuân thủ chuẩn MIDI đều dùng được kể cả khi không nhận ra. Không có logic xử lý riêng theo hãng:
 * engine chỉ đọc thông điệp MIDI chuẩn. Tên cổng thay đổi theo hệ điều hành / driver (Windows thường thêm
 * số thứ tự "2- microKEY2-37"), nên chỉ so khớp lỏng theo từ khoá.
 *
 * Bảng này KHÔNG có nghĩa là đã kiểm thử trên phần cứng — xem docs/midi.md (bảng tương thích).
 */

export type MidiBrand =
  | 'yamaha'
  | 'korg'
  | 'roland'
  | 'casio'
  | 'akai'
  | 'arturia'
  | 'kawai'
  | 'novation'
  | 'm-audio'
  | 'nektar'
  | 'native-instruments'
  | 'alesis'
  | 'kurzweil'
  | 'nord'
  | 'unknown';

export const BRAND_LABEL: Record<MidiBrand, string> = {
  yamaha: 'Yamaha',
  korg: 'Korg',
  roland: 'Roland',
  casio: 'Casio',
  akai: 'Akai',
  arturia: 'Arturia',
  kawai: 'Kawai',
  novation: 'Novation',
  'm-audio': 'M-Audio',
  nektar: 'Nektar',
  'native-instruments': 'Native Instruments',
  alesis: 'Alesis',
  kurzweil: 'Kurzweil',
  nord: 'Nord',
  unknown: 'Không rõ hãng',
};

/** digital-piano / keyboard: có loa sẵn; controller: không phát tiếng, cần app phát. */
export type MidiDeviceKind = 'digital-piano' | 'keyboard' | 'controller' | 'unknown';

/** Cách thiết bị nối với máy. `os` = qua cổng MIDI của hệ điều hành mà không rõ dây gì. */
export type MidiTransport = 'usb' | 'bluetooth' | 'network' | 'virtual' | 'simulated' | 'os';

export const TRANSPORT_LABEL: Record<MidiTransport, string> = {
  usb: 'USB',
  bluetooth: 'Bluetooth LE MIDI',
  network: 'MIDI qua mạng',
  virtual: 'Cổng ảo',
  simulated: 'Mô phỏng',
  os: 'USB / driver hệ điều hành',
};

export interface DeviceProfile {
  brand: MidiBrand;
  kind: MidiDeviceKind;
  /** Số phím đoán được từ tên model; null = không rõ. */
  keyCount: number | null;
  /** true: đàn tự phát tiếng; false: controller câm; null: không rõ. */
  hasBuiltInSound: boolean | null;
  /** Tên model dễ đọc nếu nhận ra (vd "microKEY2-37"). */
  model: string | null;
}

interface Rule {
  brand: MidiBrand;
  kind: MidiDeviceKind;
  /** So với "tên + hãng" đã chuẩn hoá (chữ thường). */
  re: RegExp;
  /** Số phím cố định, hoặc lấy từ nhóm bắt đầu tiên của `re`. */
  keys?: number | 'capture';
  /** Nhóm bắt "mini" → 25 phím (Launchkey Mini, MPK mini). */
  model?: (m: RegExpMatchArray) => string;
}

const VALID_KEYS = new Set([25, 32, 37, 49, 61, 73, 76, 88]);

/** Thứ tự quan trọng: model cụ thể trước, hãng chung sau. */
const RULES: Rule[] = [
  // Korg
  { brand: 'korg', kind: 'controller', re: /microkey\s*air[\s-]*(25|37|49|61)/, keys: 'capture', model: (m) => `microKEY Air-${m[1]}` },
  { brand: 'korg', kind: 'controller', re: /microkey\s*2?[\s-]*(25|37|49|61)/, keys: 'capture', model: (m) => `microKEY-${m[1]}` },
  { brand: 'korg', kind: 'controller', re: /microkey/, model: () => 'microKEY' },
  { brand: 'korg', kind: 'controller', re: /nanokey/, keys: 25, model: () => 'nanoKEY' },
  { brand: 'korg', kind: 'controller', re: /keystage[\s-]*(49|61)/, keys: 'capture', model: (m) => `Keystage ${m[1]}` },
  { brand: 'korg', kind: 'digital-piano', re: /\b(b2|lp-?\d+|c1 air|g1 air|xe20)\b/, keys: 88 },
  { brand: 'korg', kind: 'unknown', re: /korg/ },
  // Akai
  { brand: 'akai', kind: 'controller', re: /mpk\s*mini/, keys: 25, model: () => 'MPK mini' },
  { brand: 'akai', kind: 'controller', re: /lpk\s*25/, keys: 25, model: () => 'LPK25' },
  { brand: 'akai', kind: 'controller', re: /mpk\s*(?:2|mk\s*\d)?\s*(25|49|61|88)\b/, keys: 'capture', model: (m) => `MPK ${m[1]}` },
  { brand: 'akai', kind: 'controller', re: /akai/ },
  // Arturia
  { brand: 'arturia', kind: 'controller', re: /keystep\s*37/, keys: 37, model: () => 'KeyStep 37' },
  { brand: 'arturia', kind: 'controller', re: /keystep/, keys: 32, model: () => 'KeyStep' },
  { brand: 'arturia', kind: 'controller', re: /minilab/, keys: 25, model: () => 'MiniLab' },
  { brand: 'arturia', kind: 'controller', re: /keylab(?:\s*essential)?(?:\s*mk\s*\d)?[\s-]*(49|61|88)/, keys: 'capture', model: (m) => `KeyLab ${m[1]}` },
  { brand: 'arturia', kind: 'controller', re: /arturia|keylab/ },
  // Novation
  { brand: 'novation', kind: 'controller', re: /launchkey\s*mini/, keys: 25, model: () => 'Launchkey Mini' },
  { brand: 'novation', kind: 'controller', re: /launchkey[\s-]*(25|37|49|61|88)/, keys: 'capture', model: (m) => `Launchkey ${m[1]}` },
  { brand: 'novation', kind: 'controller', re: /novation|launchkey|impulse|sl\s*mk/ },
  // M-Audio
  { brand: 'm-audio', kind: 'controller', re: /keystation\s*mini/, keys: 32, model: () => 'Keystation Mini' },
  { brand: 'm-audio', kind: 'controller', re: /keystation[\s-]*(49|61|88)/, keys: 'capture', model: (m) => `Keystation ${m[1]}` },
  { brand: 'm-audio', kind: 'controller', re: /oxygen(?:\s*pro)?[\s-]*(25|49|61)/, keys: 'capture', model: (m) => `Oxygen ${m[1]}` },
  { brand: 'm-audio', kind: 'controller', re: /m-?audio|keystation|oxygen|hammer\s*88/ },
  // Nektar, NI, Alesis
  { brand: 'nektar', kind: 'controller', re: /impact\s*(?:gx|lx)?[\s+]*(25|49|61|88)/, keys: 'capture', model: (m) => `Impact ${m[1]}` },
  { brand: 'nektar', kind: 'controller', re: /nektar/ },
  { brand: 'native-instruments', kind: 'controller', re: /komplete\s*kontrol\s*[am]?(25|32|49|61|88)/, keys: 'capture', model: (m) => `Komplete Kontrol ${m[1]}` },
  { brand: 'native-instruments', kind: 'controller', re: /komplete|kontrol|native instruments/ },
  { brand: 'alesis', kind: 'digital-piano', re: /recital|prestige|virtue/, keys: 88 },
  { brand: 'alesis', kind: 'controller', re: /alesis|v49|v61|q49|q25/ },
  // Yamaha
  { brand: 'yamaha', kind: 'digital-piano', re: /clavinova|\bclp|\bcvp|\bydp|arius|\bp-?\d{2,3}\b|\bp-?s?\d{3}\b|\bdgx|\bcsp/, keys: 88 },
  { brand: 'yamaha', kind: 'keyboard', re: /\bpsr|\bez-|\bnp-?\d+/, keys: 61 },
  { brand: 'yamaha', kind: 'unknown', re: /yamaha/ },
  // Roland
  { brand: 'roland', kind: 'controller', re: /\ba-?(49|88)\b/, keys: 'capture', model: (m) => `A-${m[1]}` },
  { brand: 'roland', kind: 'digital-piano', re: /\b(fp|rd|hp|lx|dp|rp)-?\d{2,4}/, keys: 88 },
  { brand: 'roland', kind: 'keyboard', re: /\b(go:?keys|go:?piano|e-x\d+)/, keys: 61 },
  { brand: 'roland', kind: 'unknown', re: /roland/ },
  // Casio
  { brand: 'casio', kind: 'digital-piano', re: /privia|\bpx-?s?\d+|\bcdp|\bap-?\d+|celviano/, keys: 88 },
  { brand: 'casio', kind: 'keyboard', re: /\bct-?[sx]?\d+|\bwk-?\d+|\blk-?\d+|casiotone/, keys: 61 },
  { brand: 'casio', kind: 'unknown', re: /casio/ },
  // Kawai, Kurzweil, Nord
  { brand: 'kawai', kind: 'digital-piano', re: /kawai|\bes-?\d{3}|\bcn-?\d{2}|\bca-?\d{2}/, keys: 88 },
  { brand: 'kurzweil', kind: 'digital-piano', re: /kurzweil/ },
  { brand: 'nord', kind: 'keyboard', re: /\bnord\b|clavia/ },
  // Không rõ hãng nhưng tên nói rõ là đàn có loa (nhiều đàn Yamaha / Casio báo đúng chữ "Digital Piano").
  { brand: 'unknown', kind: 'digital-piano', re: /digital piano|e-?piano|stage piano/, keys: 88 },
  { brand: 'unknown', kind: 'keyboard', re: /digital keyboard|portable keyboard/, keys: 61 },
];

/** Chuẩn hoá tên: chữ thường, bỏ tiền tố số thứ tự Windows ("2- "), gộp khoảng trắng. */
export function normalizeDeviceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^\d+-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function identifyDevice(name: string, manufacturer = ''): DeviceProfile {
  const hay = `${normalizeDeviceName(name)} ${manufacturer.toLowerCase()}`;
  for (const rule of RULES) {
    const m = hay.match(rule.re);
    if (!m) continue;
    if (rule.kind === 'unknown') {
      // Chỉ nhận ra hãng ("Roland Digital Piano") → lấy kiểu đàn từ quy tắc chung theo tên.
      const generic = RULES.find((r) => r.brand === 'unknown' && r.re.test(hay));
      if (generic) return { ...profileFrom(generic, m), brand: rule.brand };
    }
    return profileFrom(rule, m);
  }
  return { brand: 'unknown', kind: 'unknown', keyCount: null, hasBuiltInSound: null, model: null };
}

function profileFrom(rule: Rule, m: RegExpMatchArray): DeviceProfile {
  let keyCount: number | null = null;
  if (rule.keys === 'capture') {
    const n = Number(m[1]);
    keyCount = VALID_KEYS.has(n) ? n : null;
  } else if (typeof rule.keys === 'number') keyCount = rule.keys;
  // Hãng nhận ra theo tên chung mà kiểu thiết bị không rõ: có thể là đàn hoặc controller.
  const hasBuiltInSound = rule.kind === 'controller' ? false : rule.kind === 'unknown' ? null : true;
  return { brand: rule.brand, kind: rule.kind, keyCount, hasBuiltInSound, model: rule.model ? rule.model(m) : null };
}

/**
 * Đoán cách kết nối khi nền tảng không báo (Web MIDI không cho biết). Cầu nối native báo chính xác.
 * `guessed` = true nghĩa là chỉ đoán theo tên.
 */
export function guessTransport(name: string, manufacturer = ''): { transport: MidiTransport; guessed: boolean } {
  const hay = `${name} ${manufacturer}`.toLowerCase();
  if (/bluetooth|\bble\b|\bbt\b|ble-midi|ble midi/.test(hay)) return { transport: 'bluetooth', guessed: true };
  if (/rtpmidi|network|session \d|\bnet\b/.test(hay)) return { transport: 'network', guessed: true };
  if (/loopmidi|loopbe|iac driver|midi through|virtual|vmpk|teVirtualMIDI/i.test(hay)) return { transport: 'virtual', guessed: true };
  return { transport: 'os', guessed: true };
}
