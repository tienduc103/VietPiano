import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbCoachStorage, MemoryCoachStorage, ResilientCoachStorage, newId, resultKey, sanitizeSession, type CoachStorage } from './CoachStorage';
import { PerformanceRecorder } from '../recorder/PerformanceRecorder';
import { buildPerformance } from '../recorder/buildPerformance';
import type { AIFeedback, PerformanceSession, PracticePlan, RecordedSession, ScoringResult } from '../types';

function recorded(id: string, profileKey: string, lessonId: string, startedAt = 1000): RecordedSession {
  let now = 0;
  const rec = new PerformanceRecorder(
    {
      id,
      profileKey,
      lessonId,
      lessonTitle: lessonId,
      hand: 'both',
      mode: 'technical',
      targetBpm: 72,
      metronome: true,
      input: { source: 'midi', deviceName: 'Test Piano', capabilities: { noteOff: true, velocity: true, relativeLevel: false, pedal: false, polyphonic: true } },
      latencyMs: 0,
    },
    { now: () => now, wallClock: () => startedAt },
  );
  rec.start(0);
  for (const [i, midi] of [60, 62, 64].entries()) {
    now = 100 + i * 500;
    rec.noteOn({ midi, time: now, source: 'midi', velocity: 64 + i, channel: 0, port: 'p' });
    now += 300;
    rec.noteOff({ midi, time: now, source: 'midi', channel: 0, port: 'p' });
  }
  now = 2000;
  rec.control({ controller: 64, value: 127, time: now, channel: 0 });
  rec.stop(2500);
  return rec.snapshot();
}

const result = (sessionId: string, profileKey: string, lessonId: string, engineVersion = '1.0.0', createdAt = 1): ScoringResult =>
  ({
    id: resultKey(sessionId, engineVersion, 'technical'),
    sessionId,
    profileKey,
    lessonId,
    mode: 'technical',
    engineVersion,
    alignmentVersion: 'x',
    weightsVersion: 'y',
    createdAt,
    total: 80,
  }) as unknown as ScoringResult;

function suite(name: string, make: () => CoachStorage) {
  describe(name, () => {
    it('lưu → tải → tái dựng đúng chuỗi sự kiện và nốt (round-trip)', async () => {
      const s = make();
      const rec = recorded('s1', 'p1', 'lesson-a');
      await s.saveSession(rec);
      const back = await s.getRecorded('s1');
      expect(back).toEqual(rec);
      expect(buildPerformance(back!).notes.map((n) => [n.midi, n.onMs, n.heldMs, n.velocity])).toEqual([
        [60, 100, 300, 64],
        [62, 600, 300, 65],
        [64, 1100, 300, 66],
      ]);
    });

    it('lưu nháp nhiều lần ghi đè cùng phiên; phiên dở dang được liệt kê để khôi phục', async () => {
      const s = make();
      const rec = recorded('s1', 'p1', 'lesson-a');
      const draft: RecordedSession = { session: { ...rec.session, status: 'recording' }, events: rec.events.slice(0, 3) };
      await s.saveSession(draft);
      expect((await s.listOpenSessions('p1')).map((x) => x.id)).toEqual(['s1']);
      await s.saveSession(rec);
      expect(await s.listOpenSessions('p1')).toEqual([]);
      expect((await s.getRecorded('s1'))!.events).toHaveLength(rec.events.length);
      await s.setSessionStatus('s1', 'interrupted');
      expect((await s.getSession('s1'))!.status).toBe('interrupted');
    });

    it('tách theo hồ sơ + bài; chấm lại bằng phiên bản mới giữ cả kết quả cũ', async () => {
      const s = make();
      await s.saveSession(recorded('s1', 'p1', 'lesson-a', 1000));
      await s.saveSession(recorded('s2', 'p1', 'lesson-b', 2000));
      await s.saveSession(recorded('s3', 'p2', 'lesson-a', 3000));
      expect((await s.listSessions('p1')).map((x) => x.id)).toEqual(['s1', 's2']);
      expect((await s.listSessions('p1', 'lesson-a')).map((x) => x.id)).toEqual(['s1']);
      expect((await s.listSessions('p2')).map((x) => x.id)).toEqual(['s3']);
      await s.saveResult(result('s1', 'p1', 'lesson-a', '1.0.0', 1));
      await s.saveResult(result('s1', 'p1', 'lesson-a', '1.1.0', 2));
      await s.saveResult(result('s3', 'p2', 'lesson-a', '1.0.0', 3));
      expect((await s.resultsForSession('s1')).map((r) => r.engineVersion)).toEqual(['1.0.0', '1.1.0']);
      expect((await s.listResults('p1', 'lesson-a')).length).toBe(2);
      expect((await s.listResults('p2')).length).toBe(1);
    });

    it('xoá một phiên kéo theo kết quả + nhận xét; xoá hồ sơ không đụng hồ sơ khác', async () => {
      const s = make();
      await s.saveSession(recorded('s1', 'p1', 'lesson-a'));
      await s.saveSession(recorded('s2', 'p1', 'lesson-a'));
      await s.saveSession(recorded('s3', 'p2', 'lesson-a'));
      await s.saveResult(result('s1', 'p1', 'lesson-a'));
      await s.saveResult(result('s2', 'p1', 'lesson-a'));
      await s.saveResult(result('s3', 'p2', 'lesson-a'));
      const fb = (id: string, sessionId: string, profileKey: string): AIFeedback =>
        ({ id, resultId: resultKey(sessionId, '1.0.0', 'technical'), sessionId, profileKey, createdAt: 1, source: 'rules', content: { summary: 'x', strengths: [], priorities: [] }, verification: { ok: true, removed: [], replaced: [] } }) as AIFeedback;
      await s.saveFeedback(fb('f1', 's1', 'p1'));
      await s.saveFeedback(fb('f3', 's3', 'p2'));
      const plan = { id: 'plan1', profileKey: 'p1', lessonId: 'lesson-a', createdAt: 1 } as PracticePlan;
      await s.savePlan(plan);
      await s.savePlan({ ...plan, id: 'plan2', profileKey: 'p2' });

      await s.deleteSession('s1');
      expect(await s.getSession('s1')).toBeNull();
      expect(await s.resultsForSession('s1')).toEqual([]);
      expect(await s.feedbackForResult(resultKey('s1', '1.0.0', 'technical'))).toEqual([]);
      expect((await s.listResults('p1')).map((r) => r.sessionId)).toEqual(['s2']);

      await s.deleteProfile('p1');
      expect(await s.listSessions('p1')).toEqual([]);
      expect(await s.listResults('p1')).toEqual([]);
      expect(await s.listPlans('p1')).toEqual([]);
      expect((await s.listSessions('p2')).map((x) => x.id)).toEqual(['s3']);
      expect((await s.listPlans('p2')).map((p) => p.id)).toEqual(['plan2']);
      expect((await s.feedbackForResult(resultKey('s3', '1.0.0', 'technical'))).map((f) => f.id)).toEqual(['f3']);
    });

    it('xuất dữ liệu một hồ sơ (báo cáo cho phụ huynh / giáo viên)', async () => {
      const s = make();
      await s.saveSession(recorded('s1', 'p1', 'lesson-a'));
      await s.saveSession(recorded('s3', 'p2', 'lesson-a'));
      await s.saveResult(result('s1', 'p1', 'lesson-a'));
      const out = await s.exportProfile('p1', 42);
      expect(out).toMatchObject({ format: 'vietpiano-coach-export', version: 2, exportedAt: 42, profileKey: 'p1' });
      expect(out.sessions.map((x) => x.id)).toEqual(['s1']);
      expect(out.results).toHaveLength(1);
      // Log gốc đi kèm (chấm lại được bằng engine mới), chỉ của hồ sơ được xuất.
      expect(Object.keys(out.events)).toEqual(['s1']);
      expect(out.events.s1).toEqual((await s.getRecorded('s1'))!.events);
      expect(out.events.s1.length).toBeGreaterThan(0);
    });
  });
}

suite('IndexedDbCoachStorage', () => new IndexedDbCoachStorage(new IDBFactory()));
suite('MemoryCoachStorage', () => new MemoryCoachStorage());

describe('ResilientCoachStorage', () => {
  it('IndexedDB lỗi → chuyển sang bộ nhớ tạm, vẫn lưu / đọc được', async () => {
    const broken = new MemoryCoachStorage();
    broken.saveSession = async () => {
      throw new Error('QuotaExceeded');
    };
    const s = new ResilientCoachStorage(broken);
    const rec = recorded('s1', 'p1', 'lesson-a');
    await s.saveSession(rec);
    expect(s.degraded).toBe(true);
    expect(await s.getRecorded('s1')).toEqual(rec);
  });
});

describe('tiện ích', () => {
  it('sanitizeSession bỏ bản ghi hỏng', () => {
    expect(sanitizeSession(null)).toBeNull();
    expect(sanitizeSession({ id: 'x' })).toBeNull();
    const ok = recorded('s1', 'p1', 'a').session;
    expect(sanitizeSession(ok)).toEqual(ok satisfies PerformanceSession);
  });

  it('newId có tiền tố, không trùng khi khác thời điểm / số ngẫu nhiên', () => {
    expect(newId('cs', 1000, () => 0.5)).toMatch(/^cs-rs-[0-9a-z]{6}$/);
    expect(newId('cs', 1000, () => 0.1)).not.toBe(newId('cs', 1000, () => 0.2));
  });
});
