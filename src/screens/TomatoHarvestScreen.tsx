import { useEffect, useMemo, useRef, useState } from 'react';
import './tomato-harvest.css';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { InputSourceBar } from '../components/curriculum/common';
import { useStaffCards } from '../components/games/StaffShootView';
import { Stars, useFrameClock, useGameState, useKeyFlash } from '../components/games/shared';
import { Button, FullscreenButton, Icon, Segmented, Toggle } from '../components/ui';
import { soundOutput } from '../core/audio/SoundOutput';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { midiToLabel, midiToName } from '../core/music/notes';
import { TomatoFarmAudio } from '../core/tomatoHarvest/audio';
import { TOMATO_NOTES, TomatoHarvestGame, tomatoAccuracy, tomatoStars, type TomatoDifficulty, type TomatoEvent, type TomatoHarvestState, type TomatoPlant } from '../core/tomatoHarvest/TomatoHarvestGame';
import { loadTomatoAudio, loadTomatoProgress, recordTomatoResult, saveTomatoAudio, tomatoLeaderboard, TOMATO_DIFFICULTY_LABEL, TOMATO_TROPHY, type TomatoAudioSettings, type TomatoProgress } from '../core/tomatoHarvest/storage';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type Modal = 'settings' | 'trophies' | 'leaderboard' | null;
const ALL_NOTES = TOMATO_NOTES.hard;
const noteText = (midi: number) => midiToLabel(midi, 'solfege').replace(/-?\d+$/, '');

export function TomatoHarvestScreen() {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const profiles = useProfiles((s) => s.profiles);
  const inputSource = useSettings((s) => s.settings.inputSource);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const micLive = useMic((s) => s.live);
  const [difficulty, setDifficulty] = useState<TomatoDifficulty>('easy');
  const [run, setRun] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [audio, setAudio] = useState<TomatoAudioSettings>(loadTomatoAudio);
  const [progress, setProgress] = useState<TomatoProgress>(loadTomatoProgress);
  const audioEngine = useRef<TomatoFarmAudio | null>(null);
  const game = useMemo(() => new TomatoHarvestGame({ difficulty, profileId: profile?.id ?? null }), [difficulty, profile?.id, run]);
  const state = useGameState(game);
  const active = state.gameStatus === 'playing' || state.gameStatus === 'waitingForRegrowth';
  useFrameClock(active, (now) => game.tick(now));
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome);

  const cards = useMemo(() => ALL_NOTES.map((midi) => ({ key: midi, notation: `${midiToName(midi)}/q`, clef: 'treble' as const })), []);
  const staffSvgs = useStaffCards(cards, undefined, { timeSignature: false });
  const [effect, setEffect] = useState<TomatoEvent | null>(null);
  const seenEvent = useRef(0);
  useEffect(() => {
    const fresh = state.eventLog.filter((entry) => entry.sequence > seenEvent.current);
    if (fresh.length === 0) return;
    seenEvent.current = fresh[fresh.length - 1].sequence;
    const important = [...fresh].reverse().find((e) => ['rain', 'butterfly', 'worms', 'correct', 'wrong'].includes(e.event.type));
    if (!important) return;
    setEffect(important.event);
    const id = window.setTimeout(() => setEffect(null), important.event.type === 'rain' ? 2600 : 1500);
    return () => window.clearTimeout(id);
  }, [state.eventSequence, state.eventLog]);

  useNoteInput(
    {
      onNote: (event) => {
        const result = game.answer(event.midi, event.time);
        if (result === 'ignored') return;
        if (event.source === 'virtual') soundOutput.playNote(event.midi, 0.35);
        if (inputSource !== 'microphone') {
          if (result === 'correct') soundOutput.scheduleNote(96, 0.02, 0.08, 45);
          else soundOutput.scheduleNote(43, 0, 0.12, 35);
        }
      },
    },
    inputSource,
    { baseMidi: 60 },
  );

  useEffect(() => {
    if (!audioEngine.current) return;
    audioEngine.current.setEnabled(audio.music && active, audio.nature && active);
  }, [audio, active]);
  useEffect(() => () => audioEngine.current?.stop(), []);

  const recordedRun = useRef(-1);
  useEffect(() => {
    if (state.gameStatus !== 'won' || !profile || recordedRun.current === run) return;
    recordedRun.current = run;
    const accuracy = tomatoAccuracy(state);
    const next = recordTomatoResult(progress, {
      profileId: profile.id,
      difficulty,
      score: state.score,
      stars: tomatoStars(accuracy),
      accuracy,
      durationMs: Math.max(0, (state.completedAt ?? 0) - (state.startedAt ?? 0)),
      goldenHarvested: state.goldenTomatoesHarvested,
      correct: state.totalCorrectNotes,
      wrong: state.totalWrongNotes,
      achievedAt: Date.now(),
    });
    setProgress(next);
  }, [state.gameStatus, state, profile, difficulty, progress, run]);

  const updateAudio = (patch: Partial<TomatoAudioSettings>) => {
    const next = { ...audio, ...patch };
    setAudio(next);
    saveTomatoAudio(next);
  };
  const start = () => {
    soundOutput.unlock();
    audioEngine.current ??= new TomatoFarmAudio();
    audioEngine.current.start(audio.music, audio.nature);
    game.start(performance.now());
  };
  const restart = () => {
    setModal(null);
    setEffect(null);
    setRun((v) => v + 1);
  };
  const chooseDifficulty = (value: TomatoDifficulty) => {
    setDifficulty(value);
    setRun((v) => v + 1);
  };

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-sky-200 via-sky-100 to-emerald-100 text-slate-900 dark:from-sky-950 dark:via-slate-900 dark:to-emerald-950" data-testid="tomato-harvest" data-status={state.gameStatus} data-harvested={state.harvestedCount} data-score={state.score} data-target={state.targetNote}>
      <header className="z-10 flex flex-wrap items-center gap-2 bg-white/80 pr-3 pl-16 pt-[calc(.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-2 shadow-sm backdrop-blur dark:bg-slate-900/80">
        <Button variant="ghost" className="px-2" aria-label="Về mục Trò chơi" onClick={() => navigate({ name: 'games' })}><Icon name="back" /></Button>
        <div className="min-w-44 flex-1">
          <h1 className="text-xl font-black sm:text-2xl">🍅 Thu hoạch cà chua</h1>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Cấp {TOMATO_DIFFICULTY_LABEL[difficulty]} · không giới hạn thời gian</p>
        </div>
        <Hud state={state} />
        <Button onClick={() => { game.pause(performance.now()); setModal('settings'); }} aria-label="Cài đặt" className="px-3">⚙</Button>
        <Button variant="primary" onClick={() => state.gameStatus === 'paused' ? game.resume(performance.now()) : game.pause(performance.now())} disabled={!active && state.gameStatus !== 'paused'} data-testid="tomato-pause" className="px-3">
          <Icon name={state.gameStatus === 'paused' ? 'play' : 'pause'} /> <span className="hidden sm:inline">{state.gameStatus === 'paused' ? 'Tiếp' : 'Dừng'}</span>
        </Button>
        <FullscreenButton />
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(220px,1fr)_auto_auto] gap-2 overflow-y-auto px-2 py-2 sm:px-4" aria-label="Nông trại cà chua">
        <Farm state={state} effect={effect} />
        <section className={`grid min-h-32 grid-cols-[minmax(180px,1fr)_auto] items-center gap-3 rounded-3xl bg-white/90 px-3 py-2 shadow-md ring-2 ${effect?.type === 'wrong' ? 'animate-shake ring-rose-400' : 'ring-amber-200'} dark:bg-slate-800/90`} data-testid="tomato-note-card">
          <div className="mx-auto h-28 w-full max-w-md overflow-hidden [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: staffSvgs?.get(state.targetNote) ?? '' }} />
          <div className="grid min-w-24 justify-items-center gap-1 text-center">
            <span className="text-xs font-bold text-slate-500">NỐT CẦN ĐÁNH</span>
            {difficulty !== 'hard' ? <strong className="text-3xl text-violet-700 dark:text-violet-300" data-testid="tomato-note-name">{noteText(state.targetNote)}</strong> : <strong className="text-3xl text-violet-700" aria-label="Ẩn tên nốt">?</strong>}
            <span className={`min-h-5 text-sm font-bold ${effect?.type === 'wrong' ? 'text-rose-600' : effect?.type === 'correct' ? 'text-emerald-600' : 'text-slate-500'}`} aria-live="polite">
              {effect?.type === 'wrong' ? 'Chưa đúng — thử lại nhé!' : effect?.type === 'correct' ? `Hái được +${effect.points} điểm!` : 'Đánh nốt trên khuông'}
            </span>
          </div>
        </section>
        <section className="h-28 shrink-0 sm:h-32" data-testid="tomato-keyboard">
          <PianoKeyboard from={60} to={71} expected={null} detected={micLive?.midi ?? null} flash={flash} labelStyle={labelStyle} allLabels={difficulty === 'easy'} onPress={(midi) => virtualInput.press(midi)} onRelease={(midi) => virtualInput.release(midi)} />
        </section>
      </main>

      {state.gameStatus === 'ready' && <ReadyOverlay difficulty={difficulty} onDifficulty={chooseDifficulty} canStart={!!profile} onStart={start} onTrophies={() => setModal('trophies')} onLeaderboard={() => setModal('leaderboard')} />}
      {state.gameStatus === 'paused' && !modal && <CenterOverlay><h2 className="text-3xl font-black">⏸ Đang tạm dừng</h2><p>Cây cũng tạm ngừng mọc lại.</p><Button variant="primary" onClick={() => game.resume(performance.now())}>▶ Chơi tiếp</Button></CenterOverlay>}
      {state.gameStatus === 'won' && <Victory state={state} difficulty={difficulty} onAgain={restart} onTrophies={() => setModal('trophies')} onLeaderboard={() => setModal('leaderboard')} onExit={() => navigate({ name: 'games' })} />}
      {modal === 'settings' && <SettingsModal audio={audio} updateAudio={updateAudio} onClose={() => { setModal(null); if (state.gameStatus === 'paused') game.resume(performance.now()); }} />}
      {modal === 'trophies' && <TrophyModal progress={progress} profileId={profile?.id ?? null} onClose={() => setModal(null)} />}
      {modal === 'leaderboard' && <LeaderboardModal progress={progress} profiles={profiles} onClose={() => setModal(null)} />}
      {state.gameStatus === 'ready' && <div className="absolute bottom-2 left-3 z-30 right-3"><ProfileSwitcher className="" hint="Tạo biệt danh và avatar để lưu cúp, sao và bảng xếp hạng riêng." /></div>}
    </div>
  );
}

function Hud({ state }: { state: TomatoHarvestState }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-emerald-50 px-3 py-1 text-sm font-black shadow-inner dark:bg-slate-800 sm:text-base">
    <span data-testid="tomato-score">⭐ {state.score}</span><span data-testid="tomato-progress">🧺 {state.harvestedCount}/50</span><span>✨ {state.correctStreak}</span><span aria-label={`${state.shieldCount} khiên`}>{'🛡️'.repeat(state.shieldCount)}<span className="opacity-30">{'🛡️'.repeat(2 - state.shieldCount)}</span></span>
  </div>;
}

function Farm({ state, effect }: { state: TomatoHarvestState; effect: TomatoEvent | null }) {
  return <section className="relative min-h-56 overflow-hidden rounded-[2rem] bg-gradient-to-b from-sky-300 via-sky-200 to-lime-200 shadow-inner ring-2 ring-white/60 dark:from-sky-900 dark:via-sky-950 dark:to-emerald-950" data-testid="tomato-farm">
    <div className="absolute top-3 left-6 text-4xl opacity-90">☀️</div><div className="absolute top-5 right-8 text-3xl">☁️</div>
    <div className="absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-green-500 to-emerald-700" />
    <div className="absolute inset-x-0 bottom-[39%] h-5 bg-amber-700/70" />
    <div className="absolute inset-x-2 bottom-4 grid grid-cols-5 gap-1 sm:gap-3">
      {state.plants.map((plant, i) => <Plant key={i} plant={plant} index={i} active={i === state.activePlantIndex && state.gameStatus !== 'waitingForRegrowth'} attacked={effect?.type === 'worms' && effect.plantIndex === i} />)}
    </div>
    <div className={`absolute bottom-2 left-[4%] z-10 text-5xl drop-shadow-lg transition-all sm:text-6xl ${effect?.type === 'correct' ? 'tomato-bunny-hop' : effect?.type === 'worms' && effect.blocked ? 'tomato-shield' : ''}`} aria-label="Thỏ nông dân">🐰<span className="text-3xl">🧺</span></div>
    {effect?.type === 'worms' && <div className={`absolute right-[12%] bottom-[32%] z-20 text-4xl ${effect.blocked ? 'tomato-worm-flee' : 'tomato-worm-attack'}`} aria-label="Đàn sâu">🐛🐛🐛</div>}
    {effect?.type === 'rain' && <div className="tomato-rain pointer-events-none absolute inset-0 z-20 grid place-items-center bg-sky-400/15 text-6xl" aria-label="Mưa thần kỳ"><span className="absolute top-2">☁️✨</span><span className="tracking-[.4em]">💧💧💧💧💧</span></div>}
    {effect?.type === 'butterfly' && <div className="tomato-butterfly absolute z-30 text-5xl" aria-label="Bướm cầu vồng">🦋<span className="ml-2 rounded-full bg-white/90 px-3 py-1 align-middle text-base font-black text-fuchsia-600">Bướm cầu vồng! +3 điểm</span></div>}
    {state.gameStatus === 'waitingForRegrowth' && <div className="absolute inset-0 z-20 grid place-items-center bg-emerald-950/25"><span className="rounded-full bg-white/90 px-5 py-3 text-lg font-black">🌱 Đang chờ cây mọc lại…</span></div>}
  </section>;
}

function Plant({ plant, index, active, attacked }: { plant: TomatoPlant; index: number; active: boolean; attacked: boolean }) {
  const positions = ['left-[18%] top-[22%]', 'right-[18%] top-[18%]', 'left-[8%] top-[48%]', 'right-[8%] top-[48%]', 'left-[38%] top-[5%]'];
  return <div className={`relative mx-auto h-36 w-full max-w-36 rounded-3xl transition ${active ? 'scale-105 bg-yellow-200/35 ring-4 ring-yellow-300' : ''} ${attacked ? 'animate-shake' : ''}`} data-testid={`tomato-plant-${index + 1}`} data-count={plant.tomatoes.length}>
    <div className="absolute right-0 bottom-0 left-0 text-center text-xs font-black text-white drop-shadow">Cây {index + 1}</div>
    <div className="absolute bottom-3 left-1/2 h-[82%] w-3 -translate-x-1/2 rounded-full bg-green-800" />
    <div className="absolute inset-x-[8%] top-[10%] h-[68%] rounded-[50%] bg-green-600 shadow-lg ring-4 ring-green-700/30"><span className="absolute -top-2 left-[15%] text-3xl">🌿</span><span className="absolute top-[25%] right-[4%] text-3xl">🌿</span></div>
    {plant.tomatoes.map((tomato, i) => <span key={tomato.id} className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 drop-shadow-md ${positions[i]} ${tomato.kind === 'golden' ? 'tomato-golden text-3xl' : tomato.kind === 'giant' ? 'tomato-giant text-5xl' : 'text-3xl'}`} aria-label={tomato.kind === 'golden' ? 'Cà chua vàng' : tomato.kind === 'giant' ? 'Cà chua khổng lồ' : 'Cà chua đỏ'}>{tomato.kind === 'golden' ? '🟡' : '🍅'}</span>)}
    {plant.tomatoes.length === 0 && <span className="absolute inset-0 z-10 grid place-items-center text-3xl tomato-regrow" aria-label="Đang mọc lại">🌱</span>}
  </div>;
}

function ReadyOverlay({ difficulty, onDifficulty, canStart, onStart, onTrophies, onLeaderboard }: { difficulty: TomatoDifficulty; onDifficulty: (d: TomatoDifficulty) => void; canStart: boolean; onStart: () => void; onTrophies: () => void; onLeaderboard: () => void }) {
  return <CenterOverlay className="mb-24"><div className="text-6xl">🐰🍅</div><h2 className="text-3xl font-black">Thu hoạch đủ 50 quả!</h2><p className="max-w-xl text-sm">Đọc nốt trên khuông rồi đánh đàn. Không có đồng hồ, không phạt khi bạn suy nghĩ lâu.</p><Segmented value={difficulty} onChange={onDifficulty} options={[{ value: 'easy', label: '🌱 Dễ' }, { value: 'medium', label: '🌻 Vừa' }, { value: 'hard', label: '🏆 Khó' }]} /><p className="text-sm font-semibold">{difficulty === 'easy' ? 'Đô–Rê–Mi · có tên nốt · sai không trừ điểm' : difficulty === 'medium' ? 'Đô–Sol · có tên nốt · sai −2 điểm' : 'Đô–Si · ẩn tên nốt · có đàn sâu và khiên'}</p><div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={onStart} disabled={!canStart} data-testid="tomato-start" className="min-h-14 text-lg">▶ Bắt đầu</Button><Button onClick={onTrophies}>🏆 Bộ sưu tập cúp</Button><Button onClick={onLeaderboard}>👨‍👩‍👧‍👦 Bảng xếp hạng</Button></div>{!canStart && <p className="font-bold text-amber-700">Hãy tạo hoặc chọn hồ sơ ở phía dưới để lưu thành tích.</p>}</CenterOverlay>;
}

function Victory({ state, difficulty, onAgain, onTrophies, onLeaderboard, onExit }: { state: TomatoHarvestState; difficulty: TomatoDifficulty; onAgain: () => void; onTrophies: () => void; onLeaderboard: () => void; onExit: () => void }) {
  const accuracy = tomatoAccuracy(state); const stars = tomatoStars(accuracy); const trophy = TOMATO_TROPHY[difficulty];
  return <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-emerald-950/55 p-3"><section className="tomato-victory relative grid w-full max-w-2xl justify-items-center gap-3 overflow-hidden rounded-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-slate-800"><div className="pointer-events-none absolute inset-0 text-4xl opacity-70">🎊　　🎉　　　🎊</div><div className="tomato-bunny-hop text-7xl">🐰🏆</div><h2 className="text-3xl font-black text-emerald-700 dark:text-emerald-300">Thu hoạch thành công!</h2><div className="text-6xl" aria-label={trophy.label}>{trophy.icon}</div><strong className="text-xl">{trophy.label}</strong><Stars stars={stars} className="text-5xl" /><dl className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"><Stat label="Tổng điểm" value={state.score} /><Stat label="Cà chua vàng" value={state.goldenTomatoesHarvested} /><Stat label="Đúng / Sai" value={`${state.totalCorrectNotes}/${state.totalWrongNotes}`} /><Stat label="Chính xác" value={`${Math.round(accuracy * 100)}%`} /></dl><div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={onAgain}>↻ Chơi lại</Button><Button onClick={onTrophies}>🏆 Bộ sưu tập cúp</Button><Button onClick={onLeaderboard}>👨‍👩‍👧‍👦 Bảng xếp hạng</Button><Button variant="ghost" onClick={onExit}>Về VietPiano</Button></div></section></div>;
}

function SettingsModal({ audio, updateAudio, onClose }: { audio: TomatoAudioSettings; updateAudio: (p: Partial<TomatoAudioSettings>) => void; onClose: () => void }) {
  return <ModalShell title="⚙ Cài đặt nông trại" onClose={onClose}><InputSourceBar /><Toggle checked={audio.music} onChange={(music) => updateAudio({ music })} label="🎵 Nhạc nền vui nhộn" /><Toggle checked={audio.nature} onChange={(nature) => updateAudio({ nature })} label="🐦 Âm thanh thiên nhiên" /><p className="rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40">Không có giới hạn thời gian. Mở bảng này cũng tạm dừng cây mọc lại.</p></ModalShell>;
}

function TrophyModal({ progress, profileId, onClose }: { progress: TomatoProgress; profileId: string | null; onClose: () => void }) {
  return <ModalShell title="🏆 Bộ sưu tập cúp" onClose={onClose}><div className="grid grid-cols-3 gap-3">{(['easy', 'medium', 'hard'] as const).map((d) => { const best = profileId ? progress.best[profileId]?.[d] : undefined; const t = TOMATO_TROPHY[d]; return <div key={d} className={`grid justify-items-center rounded-3xl p-4 ring-2 ${best ? 'bg-amber-50 ring-amber-300 dark:bg-amber-950/30' : 'grayscale bg-slate-100 opacity-50 ring-slate-300 dark:bg-slate-700'}`}><span className="text-6xl">{best ? t.icon : '🔒'}</span><strong>{t.label}</strong><span>{best ? `${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}` : `Hoàn thành cấp ${TOMATO_DIFFICULTY_LABEL[d]}`}</span>{best && <small>{Math.round(best.accuracy * 100)}% · {new Date(best.achievedAt).toLocaleDateString('vi-VN')}</small>}</div>; })}</div></ModalShell>;
}

function LeaderboardModal({ progress, profiles, onClose }: { progress: TomatoProgress; profiles: ReturnType<typeof useProfiles.getState>['profiles']; onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<TomatoDifficulty>('easy'); const rows = tomatoLeaderboard(progress, profiles, difficulty);
  return <ModalShell title="👨‍👩‍👧‍👦 Bảng xếp hạng gia đình" onClose={onClose}><Segmented value={difficulty} onChange={setDifficulty} options={[{ value: 'easy', label: 'Dễ' }, { value: 'medium', label: 'Vừa' }, { value: 'hard', label: 'Khó' }]} /><div className="grid gap-2">{rows.length === 0 ? <p className="rounded-2xl bg-slate-100 p-5 text-center dark:bg-slate-700">Chưa có thành tích ở cấp này.</p> : rows.map((row, i) => <div key={row.profile.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30"><strong className="text-2xl">{i === 0 ? '👑' : `#${i + 1}`}</strong><span className="font-bold">{row.profile.avatar} {row.profile.name}</span><span className="text-right font-semibold">{'★'.repeat(row.best.stars)} · {Math.round(row.best.accuracy * 100)}%</span></div>)}</div><p className="text-xs text-slate-500">Xếp theo sao, độ chính xác, rồi thời gian hoàn thành nội bộ. Không có đồng hồ trong lúc chơi.</p></ModalShell>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4"><section className="mx-auto grid max-w-3xl gap-4 rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-800"><header className="flex items-center gap-3"><h2 className="flex-1 text-2xl font-black">{title}</h2><Button variant="ghost" onClick={onClose} aria-label="Đóng"><Icon name="close" /></Button></header>{children}</section></div>; }
function CenterOverlay({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <div className={`pointer-events-none absolute inset-0 z-20 grid place-items-center p-3 ${className}`}><section className="pointer-events-auto grid max-w-2xl justify-items-center gap-3 rounded-[2rem] bg-white/95 p-5 text-center shadow-2xl ring-2 ring-emerald-300 dark:bg-slate-900/95">{children}</section></div>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-slate-700"><dt className="text-xs text-slate-500 dark:text-slate-300">{label}</dt><dd className="text-xl font-black">{value}</dd></div>; }
