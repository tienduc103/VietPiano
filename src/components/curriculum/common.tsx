import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { highlightedKeys } from '../../core/curriculum/keys';
import { accompanimentTimeline, lessonTimeline, pedalRanges, pieceToLesson } from '../../core/curriculum/piece';
import { sustainUnderPedal } from '../../core/music/pedal';
import { text, type Illustration, type Piece, type UiMode } from '../../core/curriculum/types';
import { scheduleNotes, soundOutput } from '../../core/audio/SoundOutput';
import { isBlackKey } from '../../core/music/notes';
import { voiceTeacher } from '../../core/voice/teacher';
import type { InputSourceSetting } from '../../core/settings/DeviceSettings';
import { useSettings } from '../../store/settingsStore';
import { useMidi } from '../../store/midiStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { ScoreView } from '../ScoreView';
import { MicButton, MicError } from '../MicPanel';
import { MidiBadge } from '../MidiPanel';
import { Button, Icon } from '../ui';

const NO_RESULTS: never[] = [];

/**
 * Khuông nhạc tĩnh (không con trỏ) cho hình minh hoạ / câu hỏi.
 * `noteLabels`: chữ dưới từng nốt thay tên nốt (theo thứ tự nốt, bỏ dấu lặng); chữ có dấu cách xuống hai dòng.
 */
export function StaticScore({
  piece,
  id,
  showNames,
  noteLabels,
  bare,
}: {
  piece: Piece;
  id: string;
  showNames?: boolean;
  noteLabels?: readonly string[];
  /** Trong thẻ có sẵn nền: bỏ nền + viền riêng, căn khuông nhạc vào giữa; khuông dài hơn thẻ → thu nhỏ cho vừa bề ngang. */
  bare?: boolean;
}) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const lesson = useMemo(() => pieceToLesson(piece, id), [piece, id]);
  const hostRef = useRef<HTMLDivElement>(null);
  useNoteLabels(hostRef, noteLabels);
  const contentWidth = useScoreContentWidth(hostRef, !!bare);
  // Khuông đôi (bài hai tay / có phần đệm) cần cao hơn: số ngón dưới hợp âm trầm không bị cắt.
  const height = piece.clef === 'grand' ? 'h-72' : 'h-48';
  const baseHeight = piece.clef === 'grand' ? 288 : 192;
  const hostWidth = useElementWidth(hostRef, !!bare);
  const score = <ScoreView lesson={lesson} index={0} results={NO_RESULTS} status="finished" wrongPulse={0} showNames={(showNames ?? true) || !!noteLabels} labelStyle={labelStyle} />;
  if (bare) {
    // Khuông dài hơn thẻ → thu nhỏ phần hiển thị (transform, không đổi khung ScoreView đo) cho vừa; luôn căn giữa.
    const fit = contentWidth > 0 && hostWidth > 0 ? Math.min(1, (hostWidth - 4) / contentWidth) : 1;
    return (
      // Khuông một dòng chừa chỗ dòng kẻ phụ phía trên → kéo sát tiêu đề thẻ cho cân.
      <div ref={hostRef} className="relative -mt-4 -mb-2 w-full min-w-0" style={{ height: baseHeight * fit }} data-fit={fit.toFixed(2)}>
        <div
          className="absolute top-0"
          style={
            contentWidth > 0
              ? { height: baseHeight, width: Math.ceil(contentWidth), left: '50%', transform: `translateX(-50%) scale(${fit})`, transformOrigin: 'top center' }
              : { height: baseHeight, width: '100%', left: 0 }
          }
        >
          {score}
        </div>
      </div>
    );
  }
  return (
    <div ref={hostRef} className={`${height} rounded-2xl bg-white ring-1 ring-violet-100 dark:bg-slate-900 dark:ring-violet-900`}>
      {score}
    </div>
  );
}

/** Bề rộng phần tử (px), theo dõi khi đổi cỡ. */
function useElementWidth(ref: React.RefObject<HTMLElement | null>, enabled: boolean): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, enabled]);
  return width;
}

/** Bề rộng khuông nhạc đã vẽ (px trên màn hình) — đo khung chứa SVG mà ScoreView đặt bề rộng theo tỉ lệ. */
function useScoreContentWidth(hostRef: React.RefObject<HTMLDivElement | null>, enabled: boolean): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;
    let observed: Element | null = null;
    const ro = new ResizeObserver(() => {
      // offsetWidth: bề rộng bố cục, không tính transform scale (khung bị thu nhỏ khi khuông dài).
      const w = observed instanceof HTMLElement ? observed.offsetWidth : 0;
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) > 1 ? w : prev));
    });
    const attach = () => {
      const box = host.querySelector('svg')?.parentElement?.parentElement ?? null;
      if (box && box !== observed) {
        if (observed) ro.unobserve(observed);
        observed = box;
        ro.observe(box);
      }
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(host, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, [hostRef, enabled]);
  return width;
}

/** Thẻ hình có tiêu đề: nền trắng, tiêu đề nhỏ bên trái, nút (nghe) bên phải. */
function FigureCard({ caption, action, children, testId }: { caption: string; action?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <figure className="grid min-w-0 gap-2 rounded-3xl bg-white px-5 py-4 shadow-sm ring-1 ring-violet-100 dark:bg-slate-900 dark:ring-violet-900" data-testid={testId}>
      <figcaption className="flex min-h-12 flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-bold tracking-wide text-violet-700 uppercase dark:text-violet-300">{caption}</span>
        {action}
      </figcaption>
      {children}
    </figure>
  );
}

/**
 * Thay chữ tên nốt (`.score-label`, ScoreView vẽ theo thứ tự nốt) bằng chữ tuỳ ý. ScoreView vẽ lại SVG khi đổi cỡ /
 * nạp font → theo dõi thay đổi và ghi lại (chỉ ghi khi khác, nên không lặp vô hạn).
 */
function useNoteLabels(hostRef: React.RefObject<HTMLDivElement | null>, labels: readonly string[] | undefined) {
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || !labels) return;
    const apply = () =>
      host.querySelectorAll<SVGTextElement>('text.score-label').forEach((el, i) => {
        const want = labels[i];
        if (want === undefined || el.dataset.custom === want) return;
        el.dataset.custom = want;
        el.classList.add('score-label-custom');
        // Chữ dài hơn tên nốt: nhỏ hơn một chút để không chạm nhau ở nốt móc đơn.
        el.style.fontSize = '13px';
        const words = want.split(' ');
        const x = el.getAttribute('x') ?? '0';
        el.textContent = '';
        words.forEach((w, j) => {
          const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          span.setAttribute('x', x);
          if (j > 0) span.setAttribute('dy', '1.1em');
          span.textContent = w;
          el.appendChild(span);
        });
      });
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hostRef, labels]);
}

/** Phát mẫu bản nhạc bằng tiếng đàn tổng hợp. Lúc đang phát, nốt từ micro bị bỏ qua (micro nghe thấy loa). */
export function ListenButton({ piece, bpm, label = 'Nghe mẫu' }: { piece: Piece; bpm?: number; label?: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => soundOutput.stop(), []);
  if (!soundOutput.isSupported()) return null;
  const start = () => {
    if (playing) {
      soundOutput.stop();
      setPlaying(false);
      return;
    }
    // Bé đang nghe mẫu → cô giáo im (câu chờ đọc sau khi mẫu dứt sẽ không đọc nữa).
    voiceTeacher.interrupt();
    const lesson = pieceToLesson(piece, 'listen');
    // Bài có phần đệm: nghe cả hai tay cùng lúc; có pedal: nốt ngân tới chỗ nhả pedal.
    const notes = sustainUnderPedal([...lessonTimeline(lesson), ...accompanimentTimeline(lesson)], pedalRanges(lesson));
    const ms = soundOutput.playSequence(scheduleNotes(notes, bpm ?? piece.bpm));
    setPlaying(true);
    window.setTimeout(() => setPlaying(false), ms);
  };
  return (
    <Button onClick={start} aria-pressed={playing} data-testid="listen">
      <Icon name={playing ? 'pause' : 'play'} />
      {playing ? 'Dừng' : label}
    </Button>
  );
}

const NO_LABEL = () => '';

/** Khoảng cách giữa các nốt khi nghe mẫu từng nốt (giây). */
const LISTEN_GAP_SEC = 0.9;

/** Nút 🔊 phát lần lượt vài nốt (hình bàn phím ở trang giới thiệu). Micro bỏ nốt trong lúc phát. */
export function ListenNotesButton({ notes, label = 'Nghe' }: { notes: readonly number[]; label?: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => soundOutput.stop(), []);
  useEffect(() => {
    if (!playing) return;
    const ms = soundOutput.playSequence(notes.map((midi, i) => ({ midi, start: i * LISTEN_GAP_SEC, duration: LISTEN_GAP_SEC * 0.9, velocity: 90 })));
    const id = window.setTimeout(() => setPlaying(false), ms);
    return () => window.clearTimeout(id);
  }, [playing, notes]);
  if (!soundOutput.isSupported()) return null;
  return (
    <Button
      onClick={() => {
        if (playing) soundOutput.stop();
        else voiceTeacher.interrupt();
        setPlaying(!playing);
      }}
      aria-pressed={playing}
      data-testid="listen-notes"
    >
      <span aria-hidden>{playing ? '⏸' : '🔊'}</span>
      {playing ? 'Dừng' : label}
    </Button>
  );
}

/** Bàn phím nhỏ vẽ SVG (không bấm được) — thẻ hình đáp án; không hiện tên phím. */
export function MiniKeyboard({ from, to, highlighted }: { from: number; to: number; highlighted: ReadonlySet<number> }) {
  const whites: number[] = [];
  const blacks: { midi: number; at: number }[] = [];
  for (let m = from; m <= to; m++) {
    if (isBlackKey(m)) blacks.push({ midi: m, at: whites.length });
    else whites.push(m);
  }
  const W = 20;
  const H = 70;
  return (
    <svg viewBox={`0 0 ${whites.length * W} ${H}`} className="h-28 w-full" role="img" aria-label="Bàn phím" data-testid="mini-keyboard">
      {whites.map((m, i) => (
        <rect
          key={m}
          x={i * W + 0.5}
          y={0.5}
          width={W - 1}
          height={H - 1}
          rx={2}
          data-midi={m}
          data-highlighted={highlighted.has(m) || undefined}
          className={highlighted.has(m) ? 'fill-amber-300 stroke-amber-600' : 'fill-white stroke-slate-400'}
          strokeWidth={highlighted.has(m) ? 2 : 1}
        />
      ))}
      {blacks.map((b) => (
        <rect
          key={b.midi}
          x={b.at * W - W * 0.3}
          y={0}
          width={W * 0.6}
          height={H * 0.6}
          rx={1.5}
          data-midi={b.midi}
          data-highlighted={highlighted.has(b.midi) || undefined}
          className={highlighted.has(b.midi) ? 'fill-amber-500' : 'fill-slate-800 dark:fill-slate-950'}
        />
      ))}
    </svg>
  );
}

/** Hình trong thẻ đáp án (câu đố chọn hình): gọn, không tương tác, không lộ tên nốt. */
export function OptionImage({ ill, id }: { ill: Illustration; id: string }) {
  switch (ill.type) {
    case 'keyboard':
      return <MiniKeyboard from={ill.from} to={ill.to} highlighted={new Set(highlightedKeys(ill.highlight, ill.from, ill.to))} />;
    case 'hand':
      return <HandFigure hand={ill.hand} highlight={ill.highlight} className="mx-auto h-40" />;
    case 'staff':
    case 'counting':
      return (
        <div className="pointer-events-none">
          <StaticScore piece={ill.piece} id={id} showNames={false} />
        </div>
      );
  }
}

/**
 * Ngón tay phải (ngón cái bên trái; tay trái lật gương): (x, y) = đỉnh đầu ngón, `rot` = góc nghiêng (độ),
 * `len` = dài từ đầu ngón tới gốc, `wt` / `wb` = nửa bề rộng ở đầu / gốc ngón (ngón thon dần).
 */
const HAND_FINGERS = [
  { n: 1, x: 34, y: 108, rot: -50, len: 74, wt: 12.5, wb: 17 },
  { n: 2, x: 68, y: 40, rot: -10, len: 98, wt: 11.5, wb: 15 },
  { n: 3, x: 102, y: 28, rot: 0, len: 106, wt: 12, wb: 15.5 },
  { n: 4, x: 135, y: 38, rot: 9, len: 98, wt: 11.5, wb: 15 },
  { n: 5, x: 164, y: 66, rot: 20, len: 76, wt: 10, wb: 13.5 },
];

const PALM_PATH = 'M 66 126 Q 104 116 154 128 Q 166 160 150 194 L 146 214 L 82 214 L 78 198 Q 60 182 58 158 Q 58 138 66 126 Z';

/** Ngón tay dựng đứng: đầu ngón ở gốc toạ độ, gốc ngón ở (0, len); đầu tròn, thân thon dần. */
function fingerPath({ len, wt, wb }: { len: number; wt: number; wb: number }): string {
  return `M ${-wb} ${len} C ${-wb} ${len * 0.55} ${-wt} ${len * 0.35} ${-wt} ${wt} A ${wt} ${wt} 0 0 1 ${wt} ${wt} C ${wt} ${len * 0.35} ${wb} ${len * 0.55} ${wb} ${len} Z`;
}

/** Bàn tay với số ngón 1–5 (ngón cái = 1 ở cả hai tay). */
export function HandFigure({
  hand,
  highlight,
  className = 'mx-auto h-56',
}: {
  hand: 'right' | 'left';
  /** Ngón được tô nổi (trò Đố số ngón tay). */
  highlight?: number;
  className?: string;
}) {
  const mirror = hand === 'left' ? 'translate(200,0) scale(-1,1)' : undefined;
  // Vẽ hai lớp: lớp viền (nét dày) rồi lớp da đè lên → một đường viền liền cho cả bàn tay.
  const shapes = (
    <>
      <path d={PALM_PATH} />
      {HAND_FINGERS.map((f) => (
        <path key={f.n} d={fingerPath(f)} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`} />
      ))}
    </>
  );
  return (
    <svg viewBox="0 0 200 230" className={className} role="img" aria-label={`Số ngón tay ${hand === 'right' ? 'phải' : 'trái'}`} data-testid="hand-figure">
      <g transform={mirror}>
        <g className="fill-[#d99a6c] stroke-[#d99a6c] dark:fill-[#a86e48] dark:stroke-[#a86e48]" strokeWidth="5" strokeLinejoin="round">
          {shapes}
        </g>
        <g className="fill-[#fbd8b6] dark:fill-[#e2ae86]">{shapes}</g>
        {/* Móng tay + nếp khớp ngón + chỉ tay */}
        {HAND_FINGERS.map((f) => (
          <g key={f.n} transform={`translate(${f.x} ${f.y}) rotate(${f.rot})`}>
            <ellipse cx="0" cy={f.wt * 0.85} rx={f.wt * 0.55} ry={f.wt * 0.65} className="fill-[#fff0e2] dark:fill-[#f2cfb2]" />
            {[0.62, 0.84].map((t) => {
              const y = f.len * t;
              const w = f.wt + (f.wb - f.wt) * t - 4;
              return <path key={t} d={`M ${-w} ${y} Q 0 ${y + 3} ${w} ${y}`} fill="none" strokeWidth="1.5" strokeLinecap="round" className="stroke-[#d99a6c]/60 dark:stroke-[#a86e48]/70" />;
            })}
          </g>
        ))}
        <path d="M 74 168 Q 100 160 132 150 M 82 186 Q 108 176 140 176" fill="none" strokeWidth="1.5" strokeLinecap="round" className="stroke-[#d99a6c]/50 dark:stroke-[#a86e48]/60" />
      </g>
      {HAND_FINGERS.map((f) => {
        // Vòng số nằm trên ngón, dưới móng tay (dọc theo trục ngón).
        const d = f.wt * 2 + 14;
        const rad = (f.rot * Math.PI) / 180;
        const rx = f.x - d * Math.sin(rad);
        const x = hand === 'left' ? 200 - rx : rx;
        const y = f.y + d * Math.cos(rad);
        const on = highlight === f.n;
        return (
          <g key={f.n} data-finger={f.n} data-highlighted={on || undefined}>
            <circle cx={x} cy={y} r={on ? 17 : 13} className={on ? 'fill-fuchsia-600 stroke-white' : highlight ? 'fill-orange-300' : 'fill-orange-500'} strokeWidth={on ? 2.5 : 0} />
            <text x={x} y={y + 5} textAnchor="middle" className="fill-white text-[15px] font-bold">
              {f.n}
            </text>
          </g>
        );
      })}
      <text x="100" y="226" textAnchor="middle" className="fill-slate-500 text-[13px] dark:fill-slate-400">
        {hand === 'right' ? 'Tay phải' : 'Tay trái'}
      </text>
    </svg>
  );
}

export function IllustrationView({ ill, id }: { ill: Illustration; id: string }) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  switch (ill.type) {
    case 'keyboard': {
      const highlighted = new Set(highlightedKeys(ill.highlight, ill.from, ill.to));
      if (ill.caption) {
        return (
          <FigureCard caption={text(ill.caption)} action={ill.listen && ill.listen.length > 0 ? <ListenNotesButton notes={ill.listen} /> : undefined} testId="figure-keyboard">
            <div className="h-36 w-full" data-testid="illustration-keyboard">
              <PianoKeyboard
                from={ill.from}
                to={ill.to}
                expected={null}
                detected={null}
                flash={null}
                labelStyle={labelStyle}
                highlighted={highlighted}
                fingers={ill.fingers}
                allLabels={ill.labels}
                labelFor={ill.noLabels ? NO_LABEL : undefined}
                onPress={(m) => soundOutput.playNote(m)}
              />
            </div>
          </FigureCard>
        );
      }
      return (
        <div className="grid gap-3">
          <div className="h-40 w-full" data-testid="illustration-keyboard">
            <PianoKeyboard
              from={ill.from}
              to={ill.to}
              expected={null}
              detected={null}
              flash={null}
              labelStyle={labelStyle}
              highlighted={highlighted}
              fingers={ill.fingers}
              allLabels={ill.labels}
              labelFor={ill.noLabels ? NO_LABEL : undefined}
              onPress={(m) => soundOutput.playNote(m)}
            />
          </div>
          {ill.listen && ill.listen.length > 0 && (
            <div>
              <ListenNotesButton notes={ill.listen} />
            </div>
          )}
        </div>
      );
    }
    case 'hand':
      return <HandFigure hand={ill.hand} highlight={ill.highlight} />;
    case 'staff':
      if (ill.caption) {
        return (
          <FigureCard caption={text(ill.caption)} action={ill.listen ? <ListenButton piece={ill.piece} /> : undefined} testId="figure-staff">
            <StaticScore piece={ill.piece} id={id} noteLabels={ill.noteLabels} showNames={ill.hideNames ? false : undefined} bare />
          </FigureCard>
        );
      }
      return (
        <div className="grid gap-3">
          <StaticScore piece={ill.piece} id={id} noteLabels={ill.noteLabels} showNames={ill.hideNames ? false : undefined} />
          {ill.listen && (
            <div>
              <ListenButton piece={ill.piece} />
            </div>
          )}
        </div>
      );
    case 'counting':
      return (
        <div className="grid gap-3">
          <StaticScore piece={ill.piece} id={id} showNames={false} />
          <div className="flex flex-wrap items-center gap-2" aria-label="Cách đếm">
            <span className="text-sm text-slate-500 dark:text-slate-400">Đếm:</span>
            {ill.counts.map((c, i) => (
              <span key={i} className="rounded-lg bg-amber-100 px-3 py-1 font-mono text-lg font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                {c}
              </span>
            ))}
          </div>
          <div>
            <ListenButton piece={ill.piece} />
          </div>
        </div>
      );
  }
}

const SOURCE_OPTIONS: { value: InputSourceSetting; label: string }[] = [
  { value: 'auto', label: 'Tự động' },
  { value: 'microphone', label: 'Micro' },
  { value: 'midi', label: 'Đàn MIDI' },
];

/** Chọn nguồn nốt (micro / đàn MIDI) + trạng thái + lỗi; bàn phím ảo luôn dùng được. */
export function InputSourceBar() {
  const source = useSettings((s) => s.settings.inputSource);
  const midiEnabled = useSettings((s) => s.settings.midiEnabled);
  const update = useSettings((s) => s.update);
  const midi = useMidi();
  const midiProblem =
    source === 'midi' && (!midiEnabled || midi.status === 'unsupported' || midi.devices.length === 0)
      ? midi.status === 'unsupported'
        ? 'Trình duyệt này không có Web MIDI (iPad / Safari) — hãy dùng micro.'
        : !midiEnabled
          ? 'Chưa bật đàn MIDI trong Cài đặt.'
          : 'Chưa thấy đàn MIDI — kiểm tra dây cắm.'
      : null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="input-source">
      <div className="inline-flex rounded-lg bg-violet-100 p-0.5 dark:bg-slate-700" role="radiogroup" aria-label="Nguồn nốt">
        {SOURCE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={source === o.value}
            onClick={() => update({ inputSource: o.value })}
            className={`min-h-8 rounded-md px-2.5 text-xs font-semibold ${source === o.value ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {source !== 'midi' && <MicButton compact small />}
      <MidiBadge small />
      {midiProblem && (
        <span className="text-xs text-amber-700 dark:text-amber-300" role="alert">
          {midiProblem}
        </span>
      )}
      <div className="basis-full empty:hidden">
        <MicError />
      </div>
    </div>
  );
}

/** Phản hồi ngắn sau mỗi lần trả lời; Kids Mode có biểu tượng vui. */
export function Feedback({ kind, mode, detail, eventKey }: { kind: 'correct' | 'wrong' | null; mode: UiMode; detail?: string; eventKey: number }) {
  if (!kind) return <div className="min-h-16" />;
  const kids = mode === 'kids';
  const title = kind === 'correct' ? (kids ? '🎉 Giỏi quá!' : 'Đúng') : kids ? '💪 Thử lại nào!' : 'Chưa đúng';
  return (
    <div
      key={eventKey}
      role="status"
      aria-live="polite"
      data-testid="feedback"
      className={`min-h-16 rounded-2xl px-5 py-3 text-center ${kind === 'correct' ? 'animate-pop bg-emerald-500 text-white' : 'animate-shake bg-rose-500 text-white'} ${kids ? 'text-2xl' : 'text-lg'}`}
    >
      <div className="font-bold">{title}</div>
      {detail && <div className="text-sm opacity-90">{detail}</div>}
    </div>
  );
}

/** Dải chấm tiến độ các lượt (xanh = đúng, cam = đúng sau khi sai, đỏ = sai). */
export function RoundDots({ results, index }: { results: readonly string[]; index: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Lượt ${index + 1}/${results.length}`} data-testid="round-dots">
      {results.map((r, i) => (
        <span
          key={i}
          className={`h-3 w-6 rounded-full ${
            r === 'correct' ? 'bg-emerald-500' : r === 'corrected' ? 'bg-amber-400' : r === 'wrong' ? 'bg-rose-500' : i === index ? 'bg-fuchsia-400' : 'bg-violet-200 dark:bg-slate-600'
          }`}
        />
      ))}
    </div>
  );
}

export function StepTitle({ title, instructions, children }: { title: string; instructions?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold" data-testid="step-title">
          {title}
        </h2>
        {instructions && <p className="mt-1 text-slate-600 dark:text-slate-300">{instructions}</p>}
      </div>
      {children}
    </div>
  );
}

export { text };
