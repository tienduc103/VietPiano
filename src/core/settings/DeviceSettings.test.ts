import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  noiseGateFromAmbient,
  noiseGateToSensitivity,
  saveSettings,
  sensitivityToNoiseGate,
} from './DeviceSettings';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe('DeviceSettings', () => {
  it('trả về mặc định khi chưa lưu', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('lưu và đọc lại', () => {
    const st = memoryStorage();
    saveSettings({ ...DEFAULT_SETTINGS, a4: 442, labelStyle: 'solfege' }, st);
    expect(loadSettings(st)).toMatchObject({ a4: 442, labelStyle: 'solfege' });
  });

  it('chuẩn hoá dữ liệu hỏng hoặc ngoài phạm vi', () => {
    const st = memoryStorage();
    st.setItem('vietpiano.settings.v1', JSON.stringify({ a4: 9999, noiseGate: 'x', theme: 'neon' }));
    const s = loadSettings(st);
    expect(s.a4).toBe(480);
    expect(s.noiseGate).toBe(DEFAULT_SETTINGS.noiseGate);
    expect(s.theme).toBe('system');
    st.setItem('vietpiano.settings.v1', JSON.stringify({ tempoPercent: 500, practiceMode: 'fast' }));
    expect(loadSettings(st)).toMatchObject({ tempoPercent: 160, practiceMode: 'wait' });
    // Cài đặt cũ (v1.04) chỉ có tempoMode.
    st.setItem('vietpiano.settings.v1', JSON.stringify({ tempoMode: true }));
    expect(loadSettings(st).practiceMode).toBe('tempo');
    st.setItem('vietpiano.settings.v1', JSON.stringify({ practiceMode: 'count' }));
    expect(loadSettings(st).practiceMode).toBe('count');
    // Cài đặt cũ chưa có showFloatingNote → mặc định bật; giá trị lạ → boolean.
    st.setItem('vietpiano.settings.v1', JSON.stringify({ a4: 442 }));
    expect(loadSettings(st).showFloatingNote).toBe(true);
    st.setItem('vietpiano.settings.v1', JSON.stringify({ showFloatingNote: 0 }));
    expect(loadSettings(st).showFloatingNote).toBe(false);
    // Vị trí nút tải lại: thiếu → null (góc mặc định), hỏng → null, ngoài phạm vi → kẹp.
    expect(loadSettings(st).reloadButtonPos).toBeNull();
    st.setItem('vietpiano.settings.v1', JSON.stringify({ reloadButtonPos: { x: 'a' } }));
    expect(loadSettings(st).reloadButtonPos).toBeNull();
    st.setItem('vietpiano.settings.v1', JSON.stringify({ reloadButtonPos: { x: 0.3, y: -1 } }));
    expect(loadSettings(st).reloadButtonPos).toEqual({ x: 0.3, y: 0 });
    // MIDI: mặc định tắt; chỉ bật khi đúng true.
    expect(loadSettings(st).midiEnabled).toBe(false);
    st.setItem('vietpiano.settings.v1', JSON.stringify({ midiEnabled: 'yes' }));
    expect(loadSettings(st).midiEnabled).toBe(false);
    st.setItem('vietpiano.settings.v1', JSON.stringify({ midiEnabled: true }));
    expect(loadSettings(st).midiEnabled).toBe(true);
    st.setItem('vietpiano.settings.v1', '{not json');
    expect(loadSettings(st)).toEqual(DEFAULT_SETTINGS);
  });

  it('giao diện giáo trình và nguồn nốt: giá trị lạ → auto', () => {
    const st = memoryStorage();
    expect(loadSettings(st)).toMatchObject({ uiMode: 'auto', inputSource: 'auto', metronomeWithMic: false });
    st.setItem('vietpiano.settings.v1', JSON.stringify({ uiMode: 'kids', inputSource: 'midi', metronomeWithMic: true }));
    expect(loadSettings(st)).toMatchObject({ uiMode: 'kids', inputSource: 'midi', metronomeWithMic: true });
    st.setItem('vietpiano.settings.v1', JSON.stringify({ uiMode: 'baby', inputSource: 'usb', metronomeWithMic: 'yes' }));
    expect(loadSettings(st)).toMatchObject({ uiMode: 'auto', inputSource: 'auto', metronomeWithMic: false });
  });

  it('AI cục bộ: mặc định tắt; địa chỉ hỏng → mặc định, địa chỉ được chuẩn hoá', () => {
    const st = memoryStorage();
    st.setItem('vietpiano.settings.v1', JSON.stringify({ aiCoachEnabled: 'yes', ollamaUrl: 'ftp://x', ollamaModel: '  ' }));
    expect(loadSettings(st)).toMatchObject({ aiCoachEnabled: false, ollamaUrl: 'auto', ollamaModel: 'gemma4:12b' });
    st.setItem('vietpiano.settings.v1', JSON.stringify({ ollamaUrl: 'http://localhost:11434' }));
    expect(loadSettings(st).ollamaUrl).toBe('auto');
    st.setItem('vietpiano.settings.v1', JSON.stringify({ aiCoachEnabled: true, ollamaUrl: '127.0.0.1:11434/', ollamaModel: ' gemma2:9b ' }));
    expect(loadSettings(st)).toMatchObject({ aiCoachEnabled: true, ollamaUrl: 'http://127.0.0.1:11434', ollamaModel: 'gemma2:9b' });
  });

  it('ánh xạ độ nhạy ↔ noise gate hai chiều', () => {
    expect(sensitivityToNoiseGate(0)).toBeCloseTo(0.05);
    expect(sensitivityToNoiseGate(100)).toBeCloseTo(0.0005);
    for (const s of [0, 25, 50, 75, 100]) expect(noiseGateToSensitivity(sensitivityToNoiseGate(s))).toBe(s);
  });

  it('hiệu chuẩn: noise gate gấp 3 nhiễu nền, có giới hạn dưới', () => {
    expect(noiseGateFromAmbient(0.004)).toBeCloseTo(0.012);
    expect(noiseGateFromAmbient(0)).toBe(0.002);
  });
});
