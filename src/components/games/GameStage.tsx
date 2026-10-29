import { useMemo, useRef, useState } from 'react';
import { CURRICULUM } from '../../core/curriculum/content/curriculum';
import { missedReadingNotes } from '../../core/curriculum/review';
import type { GameRecord } from '../../core/curriculum/progress';
import type { CurriculumLesson, UiMode } from '../../core/curriculum/types';
import { orderedLessons } from '../../core/curriculum/unlock';
import { GAME_ICON, GAME_TITLE, gamesForLesson, type GameKind, type GameSpec } from '../../core/games/gameForLesson';
import { requireMidi } from '../../core/music/notes';
import { useCurriculum } from '../../store/curriculumStore';
import { InputSourceBar } from '../curriculum/common';
import { Button, Icon } from '../ui';
import { EarFinderView } from './EarFinderView';
import { EchoMelodyView } from './EchoMelodyView';
import { FingerQuizView } from './FingerQuizView';
import { IntervalDetectiveView } from './IntervalDetectiveView';
import { KeyHuntView } from './KeyHuntView';
import { NoteCatchView } from './NoteCatchView';
import { NoteSprintView } from './NoteSprintView';
import { RhythmTrainView } from './RhythmTrainView';
import { StaffShootView } from './StaffShootView';
import { SteadyBeatView } from './SteadyBeatView';
import { Stars, type GameResult } from './shared';

const HOW_TO: Record<GameKind, { adult: string; kids: string }> = {
  'note-catch': {
    adult: 'Nốt nhạc rơi xuống theo làn phía trên phím của nó. Đánh đúng nốt trước khi chạm đáy để hứng. Để rơi 1 nốt là mất 1 mạng; càng về sau nốt rơi càng nhanh.',
    kids: 'Nốt nhạc đang rơi! Bấm đúng phím để hứng trước khi nốt chạm đất nhé. Hứng liên tiếp được thưởng thêm điểm!',
  },
  'key-hunt': {
    adult: 'Mỗi lượt có một yêu cầu tìm phím và thanh thời gian. Bấm đúng càng nhanh càng nhiều điểm; bấm sai thì mất chuỗi nhưng vẫn được thử tiếp.',
    kids: 'Các bạn thú đang trốn trên bàn phím! Đọc yêu cầu rồi bấm thật nhanh để bắt được bạn ấy.',
  },
  'rhythm-train': {
    adult: 'Toa tàu là các nốt của bài tiết tấu. Gõ một phím bất kỳ đúng lúc toa chạm vạch trắng: lệch ít là Perfect, lệch vừa là Good. Toa "nghỉ" là dấu lặng — gõ vào là tàu phanh gấp. Vòng 2 chạy nhanh hơn.',
    kids: 'Tàu tiết tấu sắp chạy! Đếm theo nhịp rồi gõ đúng lúc toa chạm vạch. Toa "nghỉ" thì để tay yên nhé!',
  },
  'staff-shoot': {
    adult: 'Bóng bay mang một nốt vẽ trên khuông (không có tên nốt). Đọc nốt và đánh đúng phím trước khi bóng bay khỏi mép trái. Bóng vàng ⭐ là nốt bạn hay đọc nhầm — được gấp đôi điểm.',
    kids: 'Bóng bay chở nốt nhạc đang bay qua! Nhìn nốt trên khuông rồi bấm đúng phím để bắn bóng nhé.',
  },
  'finger-quiz': {
    adult: 'Đặt tay vào thế tay của buổi. Mỗi lượt hiện một số ngón — đánh phím mà ngón đó đang nằm trên. App chỉ kiểm tra phím, không biết bạn dùng ngón nào: hãy tự dùng đúng ngón.',
    kids: 'Đặt tay lên đàn như trong bài nhé. Hình bàn tay sáng ngón nào thì bấm phím dưới ngón đó!',
  },
  'echo-melody': {
    adult: 'Nghe app phát một đoạn nhạc ngắn rồi đánh lại đúng thứ tự. Đúng thì đoạn sau dài thêm một nốt. Sai một nốt mất một mạng và được nghe lại. "Nghe lại" và "Gợi ý" bị trừ điểm.',
    kids: 'Đàn đang đố bạn một giai điệu bí mật! Nghe thật kỹ rồi đánh lại giống hệt nhé.',
  },
  'note-sprint': {
    adult: 'Mỗi lúc hiện một nốt trên khuông (không có tên nốt). Đánh đúng phím để sang nốt mới — đọc được càng nhiều nốt trong 60 giây càng tốt. Đánh sai bị trừ 3 giây.',
    kids: 'Đua với đồng hồ! Nhìn nốt trên khuông rồi bấm đúng phím thật nhanh. Bấm sai thì đồng hồ bị trừ một giây đó.',
  },
  'ear-finder': {
    adult: 'App phát một nốt — tìm phím của nốt đó. Sai thì app cho biết nốt cần tìm cao hơn hay thấp hơn. Đúng ngay lần đầu được nhiều điểm nhất. Bấm "Nghe nốt mốc" để so sánh.',
    kids: 'Đàn hát một nốt bí mật! Nghe kỹ rồi tìm phím đó nhé. Nếu chưa đúng, mũi tên sẽ chỉ cho bạn đi lên hay đi xuống.',
  },
  'interval-detective': {
    adult: 'Mỗi lượt có một nốt gốc (sáng trên bàn phím) và một quãng, ví dụ "quãng 3 trưởng đi lên". Đánh nốt cách nốt gốc đúng quãng đó trước khi hết giờ. Đếm số nửa cung nếu cần.',
    kids: 'Thám tử ơi! Từ phím đang sáng, đếm đúng số bước rồi bấm phím cần tìm nhé.',
  },
  'steady-beat': {
    adult: 'Metronome kêu 8 phách: 4 phách đầu để nghe, 4 phách sau gõ theo (phím nào cũng được). Sau đó metronome tắt — bạn tự gõ tiếp thật đều. Mỗi phách được chấm Đều / Khá / Lệch theo độ lệch so với nhịp gốc.',
    kids: 'Tim đập thình thịch đều đều! Gõ theo tiếng tích-tắc, rồi khi tiếng tắt đi thì bạn tự gõ tiếp thật đều nhé.',
  },
};

/** Ý nghĩa ô "chuỗi" trên màn kết quả theo từng trò. */
const COMBO_LABEL: Partial<Record<GameKind, string>> = { 'echo-melody': 'Đoạn dài nhất (nốt)', 'steady-beat': 'Chuỗi phách đều' };
const HITS_LABEL: Record<GameKind, string> = {
  'note-catch': 'Hứng được',
  'key-hunt': 'Bắt được',
  'rhythm-train': 'Gõ trúng',
  'staff-shoot': 'Bắn trúng',
  'echo-melody': 'Vòng qua',
  'finger-quiz': 'Đúng',
  'note-sprint': 'Đọc đúng',
  'ear-finder': 'Tìm được',
  'interval-detective': 'Tìm được',
  'steady-beat': 'Phách đều',
};

/**
 * Trò chơi sau buổi học (sau phần Luyện tập): chọn trò → giới thiệu → chơi → kết quả (sao, điểm, kỷ lục).
 * Mỗi buổi có 2 trò suy từ nội dung buổi (`gamesForLesson`); điểm không ảnh hưởng tiến độ buổi.
 */
export function GameStage({
  lesson,
  initialKind,
  backLabel = 'Về giáo trình',
  ...rest
}: {
  lesson: CurriculumLesson;
  mode: UiMode;
  initialKind?: GameKind;
  backLabel?: string;
  onResult: (r: GameResult & { kind: GameKind }) => void;
  onNext?: () => void;
  onBack: () => void;
}) {
  const specs = useMemo(() => {
    const level = CURRICULUM.levels.find((l) => l.levelId === lesson.levelId);
    const lessons = level ? orderedLessons(level) : [];
    return gamesForLesson(lesson, lessons.slice(0, Math.max(0, lessons.findIndex((l) => l.lessonId === lesson.lessonId))));
  }, [lesson]);
  const record = useCurriculum((s) => s.records[lesson.lessonId]);
  return (
    <GamePlayer
      {...rest}
      key={lesson.lessonId}
      specs={specs}
      initialKind={initialKind}
      backLabel={backLabel}
      recordOf={(k) => record?.games?.[k]}
      // Nốt hay đọc nhầm của buổi → bóng vàng.
      goldenFor={(spec) => {
        const notes = spec.kind === 'staff-shoot' ? spec.notes : [];
        return [...missedReadingNotes(record?.mistakes).keys()].map(requireMidi).filter((m) => notes.includes(m));
      }}
    />
  );
}

/**
 * Khung chơi chung: chọn trò (khi có nhiều trò) → giới thiệu → chơi → kết quả. Dùng cho trò sau buổi và mục Trò chơi.
 * `recordOf`: kỷ lục hiện có của trò (để hiện + báo "Kỷ lục mới").
 */
export function GamePlayer({
  specs,
  mode,
  initialKind,
  recordOf,
  goldenFor,
  onResult,
  onNext,
  onBack,
  backLabel,
}: {
  specs: readonly GameSpec[];
  mode: UiMode;
  initialKind?: GameKind;
  recordOf: (kind: GameKind) => GameRecord | undefined;
  goldenFor?: (spec: GameSpec) => number[];
  onResult: (r: GameResult & { kind: GameKind }) => void;
  onNext?: () => void;
  onBack: () => void;
  backLabel: string;
}) {
  const kids = mode === 'kids';
  const [kind, setKind] = useState<GameKind>(initialKind && specs.some((s) => s.kind === initialKind) ? initialKind : specs[0].kind);
  const spec = specs.find((s) => s.kind === kind) ?? specs[0];
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  /** Kỷ lục của trò này trước ván vừa chơi (để báo "Kỷ lục mới"). */
  const previousBest = useRef(0);
  /** Nốt "vàng" (×2 điểm) của ván, lấy lúc bắt đầu ván. */
  const golden = useRef<number[]>([]);

  const start = () => {
    previousBest.current = recordOf(spec.kind)?.bestScore ?? 0;
    golden.current = goldenFor?.(spec) ?? [];
    setRun((r) => r + 1);
    setPhase('play');
  };
  const pick = (k: GameKind) => {
    setKind(k);
    setPhase('intro');
    setResult(null);
  };
  const end = (r: GameResult) => {
    setResult(r);
    setPhase('result');
    onResult({ ...r, kind: spec.kind });
  };
  /** Trò kế tiếp trong danh sách (vòng lại) — nút "Chơi …" ở màn kết quả. */
  const other = specs.length > 1 ? specs[(specs.findIndex((s) => s.kind === spec.kind) + 1) % specs.length] : undefined;

  if (phase === 'play') {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-2xl font-bold">
            {GAME_ICON[spec.kind]} {GAME_TITLE[spec.kind]}
          </h2>
          <Button variant="ghost" onClick={() => setPhase('intro')} data-testid="game-stop">
            Dừng
          </Button>
        </div>
        <InputSourceBar />
        <GameView key={run} spec={spec} mode={mode} golden={golden.current} onEnd={end} />
      </div>
    );
  }

  const best = recordOf(spec.kind);
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      {phase === 'intro' && specs.length > 1 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${specs.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Chọn trò chơi">
          {specs.map((s) => {
            const rec = recordOf(s.kind);
            return (
              <button
                key={s.kind}
                type="button"
                role="radio"
                aria-checked={s.kind === spec.kind}
                onClick={() => pick(s.kind)}
                data-testid={`game-pick-${s.kind}`}
                className={`flex min-h-20 items-center gap-3 rounded-2xl p-3 text-left ring-2 transition-colors ${
                  s.kind === spec.kind ? 'bg-fuchsia-500 text-white ring-fuchsia-300' : 'bg-white/90 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900'
                }`}
              >
                <span className="text-4xl" aria-hidden>
                  {GAME_ICON[s.kind]}
                </span>
                <span className="grid">
                  <span className="text-lg font-bold">{GAME_TITLE[s.kind]}</span>
                  <span className="text-sm opacity-80">{rec ? `${'★'.repeat(rec.bestStars)}${'☆'.repeat(3 - rec.bestStars)} · kỷ lục ${rec.bestScore}` : 'Chưa chơi'}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
      <section
        className="grid gap-5 rounded-3xl bg-white/90 p-6 text-center shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900"
        data-testid={phase === 'result' ? 'game-result' : 'game-intro'}
        data-game={spec.kind}
      >
        {phase === 'result' && result ? (
          <>
            <Stars stars={result.stars} />
            <h2 className="text-2xl font-extrabold">{result.stars === 3 ? (kids ? 'Siêu đỉnh! 🏆' : 'Xuất sắc!') : result.stars >= 1 ? (kids ? 'Giỏi lắm! 🎉' : 'Hoàn thành') : 'Thử lại nhé!'}</h2>
            <div className="text-5xl font-extrabold tabular-nums" data-testid="game-final-score">
              {result.score}
            </div>
            {result.score > previousBest.current && previousBest.current > 0 && <p className="font-bold text-fuchsia-600 dark:text-fuchsia-300">🏅 Kỷ lục mới!</p>}
            <dl className="grid grid-cols-3 gap-3">
              <Stat label={HITS_LABEL[spec.kind]} value={`${result.hits}/${result.total}`} />
              <Stat label={COMBO_LABEL[spec.kind] ?? 'Chuỗi dài nhất'} value={`${result.bestCombo}`} />
              <Stat label="Kỷ lục" value={`${Math.max(result.score, previousBest.current)}`} />
            </dl>
          </>
        ) : (
          <>
            <div className="text-6xl">{GAME_ICON[spec.kind]}</div>
            <h2 className="text-2xl font-extrabold">{GAME_TITLE[spec.kind]}</h2>
            <p className={kids ? 'text-xl' : 'text-lg'}>{kids ? HOW_TO[spec.kind].kids : HOW_TO[spec.kind].adult}</p>
            {best && best.plays > 0 && (
              <div className="grid justify-items-center gap-1">
                <Stars stars={best.bestStars} className="text-3xl" />
                <span className="text-sm text-slate-500 dark:text-slate-400">Kỷ lục: {best.bestScore} điểm</span>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          <Button variant={phase === 'result' && onNext ? 'secondary' : 'primary'} className="text-lg" onClick={start} data-testid={phase === 'result' ? 'game-again' : 'game-start'}>
            {phase === 'result' ? (
              <>
                <Icon name="restart" /> Chơi lại
              </>
            ) : (
              '▶ Bắt đầu chơi'
            )}
          </Button>
          {phase === 'result' && other && (
            <Button onClick={() => pick(other.kind)} data-testid="game-other">
              {GAME_ICON[other.kind]} Chơi {GAME_TITLE[other.kind]}
            </Button>
          )}
          {onNext && (
            <Button variant={phase === 'result' ? 'primary' : 'secondary'} className="text-lg" onClick={onNext} data-testid="game-next">
              Bài tiếp theo →
            </Button>
          )}
          <Button variant="ghost" onClick={onBack} data-testid="game-back">
            {backLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}

function GameView({ spec, mode, golden, onEnd }: { spec: GameSpec; mode: UiMode; golden: number[]; onEnd: (r: GameResult) => void }) {
  switch (spec.kind) {
    case 'note-catch':
      return <NoteCatchView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'key-hunt':
      return <KeyHuntView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'rhythm-train':
      return <RhythmTrainView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'staff-shoot':
      return <StaffShootView spec={spec} mode={mode} golden={golden} onEnd={onEnd} />;
    case 'echo-melody':
      return <EchoMelodyView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'finger-quiz':
      return <FingerQuizView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'note-sprint':
      return <NoteSprintView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'ear-finder':
      return <EarFinderView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'interval-detective':
      return <IntervalDetectiveView spec={spec} mode={mode} onEnd={onEnd} />;
    case 'steady-beat':
      return <SteadyBeatView spec={spec} mode={mode} onEnd={onEnd} />;
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-violet-50 px-3 py-2 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
