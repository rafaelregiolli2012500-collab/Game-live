import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Home as HomeIcon, Pause, Play, Radio, RotateCcw, Settings2, Sparkles, Swords, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { toast, Toaster } from "sonner";

import { GiftCaptions } from "@/components/live/GiftCaptions";
import { LiveAdminPanel } from "@/components/live/LiveAdminPanel";
import { RoundCreditsCutscene } from "@/components/live/RoundCreditsCutscene";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CANVAS_H, CANVAS_W, CHARACTERS, portraitPath } from "@/game/assets";
import { ArenaEngine, emptyStats } from "@/game/engine";
import type { CharacterId, HudSnapshot } from "@/game/types";
import { useGiftSocket } from "@/hooks/useGiftSocket";
import { DEFAULT_LIVE_CONFIG, fetchLiveConfig, fetchLiveEvents, fetchLiveStatus, fetchRoundResults, giftEffectLabel, giftIcon, saveRoundResult, sendDemoGift, updateLiveConfig } from "@/lib/live";
import type { DemoGiftCreate, GiftEvent, LiveConfig, LiveStatus, RoundResult, RoundResultCreate } from "@/lib/live";

type Screen = "menu" | "arena";
type UltraScore = Record<CharacterId, number>;
interface RoundCredits { winner: CharacterId; round: number; contributors: string[] }

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const ULTRA_GOAL = 20;
const ROUND_HISTORY_KEY = "planalto-round-history";

const EMPTY_STATS = emptyStats();

function readWins(): Record<CharacterId, number> {
  try { return { lula: 0, flavio: 0, ...(JSON.parse(localStorage.getItem("planalto-wins") ?? "{}") as Partial<Record<CharacterId, number>>) }; } catch { return { lula: 0, flavio: 0 }; }
}

function readUltraScore(): UltraScore {
  try {
    const stored = JSON.parse(localStorage.getItem("planalto-ultra-dispute") ?? "{}") as Partial<UltraScore>;
    return { lula: Math.min(ULTRA_GOAL, Math.max(0, stored.lula ?? 0)), flavio: Math.min(ULTRA_GOAL, Math.max(0, stored.flavio ?? 0)) };
  } catch { return { lula: 0, flavio: 0 }; }
}

function readRoundHistory(): RoundResult[] {
  try { return JSON.parse(localStorage.getItem(ROUND_HISTORY_KEY) ?? "[]") as RoundResult[]; } catch { return []; }
}

function roundSessionId(): string {
  const stored = sessionStorage.getItem("planalto-round-session");
  if (stored) return stored;
  const created = crypto.randomUUID();
  sessionStorage.setItem("planalto-round-session", created);
  return created;
}

function persistRoundLocally(payload: RoundResultCreate): RoundResult {
  const saved: RoundResult = { ...payload, id: `local-${payload.session_id}-${payload.round}`, created_at: new Date().toISOString() };
  const next = [saved, ...readRoundHistory().filter((item) => !(item.session_id === payload.session_id && item.round === payload.round))].slice(0, 500);
  localStorage.setItem(ROUND_HISTORY_KEY, JSON.stringify(next));
  return saved;
}

function connectionLabel(status: LiveStatus, config: LiveConfig) {
  if (config.integration_mode === "demo") return { text: "MODO DEMONSTRAÇÃO", tone: "demo" as const };
  if (status.state === "connected") return { text: "TIKTOK CONECTADO", tone: "ok" as const };
  return { text: status.state === "reconnecting" ? "RECONECTANDO…" : "TIKTOK DESCONECTADO", tone: "off" as const };
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [adminOpen, setAdminOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [left, setLeft] = useState<CharacterId>("lula");
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("planalto-sound") !== "off");
  const [volume, setVolume] = useState(() => Number(localStorage.getItem("planalto-volume") ?? "0.6"));
  const [liveConfig, setLiveConfig] = useState<LiveConfig>(DEFAULT_LIVE_CONFIG);
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [wins, setWins] = useState<Record<CharacterId, number>>(readWins);
  const [ultraScore, setUltraScore] = useState<UltraScore>(readUltraScore);
  const [fatalityWinner, setFatalityWinner] = useState<CharacterId | null>(null);
  const [lastGift, setLastGift] = useState<GiftEvent | null>(null);
  const [recent, setRecent] = useState<GiftEvent[]>([]);
  const [giftsThisFight, setGiftsThisFight] = useState(0);
  const [captions, setCaptions] = useState<GiftEvent[]>([]);
  const [captionSpeed, setCaptionSpeed] = useState(1);
  const [roundResult, setRoundResult] = useState<string | null>(null);
  const [roundCredits, setRoundCredits] = useState<RoundCredits | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const giftQueueRef = useRef<GiftEvent[]>([]);
  const activeGiftRef = useRef<GiftEvent | null>(null);
  const giftSpeedRef = useRef<Map<string, number>>(new Map());
  const ultraScoreRef = useRef<UltraScore>(ultraScore);
  const fatalityLockRef = useRef(false);
  const fatalityEventsRef = useRef<Set<string>>(new Set());
  const roundContributorsRef = useRef<string[]>([]);
  const giftsThisFightRef = useRef(0);
  const hudRef = useRef<HudSnapshot | null>(null);
  const roundSessionRef = useRef(roundSessionId());
  const queryClient = useQueryClient();
  const right: CharacterId = left === "lula" ? "flavio" : "lula";
  const { events: socketEvents, status: socketStatus } = useGiftSocket("main-arena");

  const beginNextGift = useCallback(() => {
    if (activeGiftRef.current || giftQueueRef.current.length === 0) return;
    const event = giftQueueRef.current.shift()!;
    activeGiftRef.current = event;
    const speed = giftSpeedRef.current.get(event.id) ?? 1;
    engineRef.current?.notifyGift(speed);
    setCaptionSpeed(speed);
    setCaptions([event]);
  }, []);

  const configQuery = useQuery({ queryKey: ["live-config"], queryFn: fetchLiveConfig, retry: false, staleTime: 30_000 });
  const eventQuery = useQuery({ queryKey: ["live-events"], queryFn: fetchLiveEvents, retry: false, staleTime: 10_000 });
  const statusQuery = useQuery({ queryKey: ["live-status"], queryFn: fetchLiveStatus, retry: false, staleTime: 15_000 });
  const resultsQuery = useQuery({ queryKey: ["round-results"], queryFn: fetchRoundResults, retry: false, staleTime: 10_000 });
  const saveConfig = useMutation({ mutationFn: updateLiveConfig, onSuccess: (saved) => { setLiveConfig(saved); queryClient.setQueryData(["live-config"], saved); queryClient.invalidateQueries({ queryKey: ["live-status"] }); toast.success("Configuração salva"); }, onError: () => toast.error("Não foi possível salvar a configuração") });
  const demoGift = useMutation({ mutationFn: sendDemoGift, onSuccess: (event) => { receiveGift(event); queryClient.invalidateQueries({ queryKey: ["live-events"] }); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao simular presente") });
  const recordResult = useMutation({ mutationFn: saveRoundResult, onSuccess: (saved) => { queryClient.setQueryData<RoundResult[]>(["round-results"], (current = []) => [saved, ...current.filter((item) => !(item.session_id === saved.session_id && item.round === saved.round))].slice(0, 500)); } });

  useEffect(() => { if (configQuery.data) setLiveConfig(configQuery.data); }, [configQuery.data]);
  useEffect(() => { engineRef.current?.setSettings(liveConfig.combat); }, [liveConfig.combat]);

  const addRoundContributor = useCallback((username: string) => {
    const clean = username.trim();
    if (!clean || roundContributorsRef.current.some((item) => item.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
    roundContributorsRef.current = [...roundContributorsRef.current, clean];
  }, []);

  /** Single entry point for every validated gift (socket or demo), deduped by event_id. */
  const receiveGift = useCallback((event: GiftEvent) => {
    if (seenRef.current.has(event.event_id)) return;
    seenRef.current.add(event.event_id);
    // Strict pipeline: cutscene → its complete effect → next cutscene. Repeated gifts run at 2×.
    const previous = giftQueueRef.current.at(-1) ?? activeGiftRef.current;
    const speed = event.quantity > 1 || previous?.username === event.username ? 2 : 1;
    giftSpeedRef.current.set(event.id, speed);
    giftQueueRef.current.push(event);
    beginNextGift();
    setLastGift(event);
    addRoundContributor(event.username);
    setRecent((current) => [event, ...current.filter((item) => item.event_id !== event.event_id)].slice(0, 5));
    giftsThisFightRef.current += event.quantity;
    setGiftsThisFight(giftsThisFightRef.current);
    if (!fatalityLockRef.current) {
      const id = event.benefited_character;
      const previous = ultraScoreRef.current[id];
      const next: UltraScore = { ...ultraScoreRef.current, [id]: Math.min(ULTRA_GOAL, previous + event.quantity) };
      ultraScoreRef.current = next;
      setUltraScore(next);
      localStorage.setItem("planalto-ultra-dispute", JSON.stringify(next));
      if (previous < ULTRA_GOAL && next[id] >= ULTRA_GOAL) {
        fatalityLockRef.current = true;
        fatalityEventsRef.current.add(event.id);
        setFatalityWinner(id);
      }
    }
  }, [addRoundContributor, beginNextGift]);

  useEffect(() => { [...socketEvents].reverse().forEach(receiveGift); }, [socketEvents, receiveGift]);

  /** Fires a gift's effect (boost / hadouken / domain) right after its thank-you cutscene. */
  const applyGift = useCallback((event: GiftEvent) => {
    setCaptions((current) => current.filter((item) => item.id !== event.id));
    const fatality = fatalityEventsRef.current.has(event.id);
    const speed = giftSpeedRef.current.get(event.id) ?? 1;
    if (engineRef.current) {
      fatalityEventsRef.current.delete(event.id);
      if (fatality) engineRef.current.triggerFatality(event.benefited_character, event.username, event.id, speed);
      else engineRef.current.triggerSpecial(event, speed);
    }
  }, []);

  useEffect(() => {
    if (screen !== "arena" || !canvasRef.current) return undefined;
    const engine = new ArenaEngine(canvasRef.current, liveConfig.combat, left, right, {
      onHud: (snapshot) => { hudRef.current = snapshot; setHud(snapshot); },
      onRoundStart: () => {
        setRoundResult(null);
        setRoundCredits(null);
        roundContributorsRef.current = [];
        giftsThisFightRef.current = 0;
        setGiftsThisFight(0);
        if (fatalityLockRef.current && ultraScoreRef.current.lula === 0 && ultraScoreRef.current.flavio === 0) fatalityLockRef.current = false;
        if (!fatalityLockRef.current) setFatalityWinner(null);
      },
      onRoundEnd: (winner, endedRound) => {
        setRoundResult(winner ? `${CHARACTERS[winner].name} VENCEU A RODADA` : "EMPATE");
        if (winner) setRoundCredits({ winner, round: endedRound, contributors: [...roundContributorsRef.current] });
        if (winner) {
          engineRef.current?.notifyVictory();
          const loser: CharacterId = winner === "lula" ? "flavio" : "lula";
          const payload: RoundResultCreate = { game_id: "main-arena", session_id: roundSessionRef.current, round: endedRound, winner, loser, contributors: [...roundContributorsRef.current], gifts_count: giftsThisFightRef.current };
          const local = persistRoundLocally(payload);
          queryClient.setQueryData<RoundResult[]>(["round-results"], (current = []) => [local, ...current.filter((item) => !(item.session_id === payload.session_id && item.round === payload.round))].slice(0, 500));
          recordResult.mutate(payload);
          setWins((current) => { const next = { ...current, [winner]: current[winner] + 1 }; localStorage.setItem("planalto-wins", JSON.stringify(next)); return next; });
        }
      },
      onFatalityComplete: () => {
        const reset = { lula: 0, flavio: 0 };
        ultraScoreRef.current = reset;
        setUltraScore(reset);
        localStorage.setItem("planalto-ultra-dispute", JSON.stringify(reset));
      },
      onSpecialComplete: (eventId) => {
        if (activeGiftRef.current?.id !== eventId) return;
        activeGiftRef.current = null;
        giftSpeedRef.current.delete(eventId);
        window.setTimeout(beginNextGift, 0);
      },
    });
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
    // Settings are pushed via setSettings; only fighters/screen recreate the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, left]);

  useEffect(() => { engineRef.current?.setPaused(paused || captions.length > 0); }, [paused, captions.length, screen]);
  useEffect(() => { engineRef.current?.setVolume(soundOn ? volume : 0); }, [soundOn, volume, screen]);
  useEffect(() => {
    if (!roundCredits) return undefined;
    const timer = window.setTimeout(() => setRoundCredits(null), 6000);
    return () => window.clearTimeout(timer);
  }, [roundCredits]);

  const status: LiveStatus = statusQuery.data ?? socketStatus;
  const connection = connectionLabel(socketStatus.state === "connected" ? socketStatus : status, liveConfig);
  const goal = liveConfig.combat.collective_goal;
  const goalPct = Math.min(100, Math.round((giftsThisFight / goal) * 100));
  const hp = hud?.hp ?? { lula: liveConfig.combat.max_hp, flavio: liveConfig.combat.max_hp };
  const history = useMemo(() => (eventQuery.data ?? []).slice(0, 12), [eventQuery.data]);
  const roundHistory = useMemo(() => resultsQuery.data ?? readRoundHistory(), [resultsQuery.data, roundCredits]);

  const toggleSound = () => setSoundOn((current) => { const next = !current; localStorage.setItem("planalto-sound", next ? "on" : "off"); return next; });
  const simulate = (payload: DemoGiftCreate) => demoGift.mutate(payload);
  const enterArena = () => { setPaused(false); setScreen("arena"); };

  const topPlayer = (id: CharacterId, side: "left" | "right") => (
    <div className={`broadcast-player broadcast-player-${side}`} data-testid={`broadcast-${side}-player`}>
      <img src={portraitPath(id)} alt="" data-testid={`broadcast-${side}-portrait`} />
      <div>
        <strong data-testid={`broadcast-${side}-name`}>{CHARACTERS[id].name}</strong>
        <span className="broadcast-wins" data-testid={`broadcast-${side}-wins`}>★{wins[id]} VITÓRIAS</span>
        <div className="broadcast-health"><i style={{ width: `${Math.max(0, (hp[id] / liveConfig.combat.max_hp) * 100)}%`, background: CHARACTERS[id].accent }} /></div>
        <small data-testid={`broadcast-${side}-hp`}>{Math.round(hp[id])} / {liveConfig.combat.max_hp} HP</small>
        <div className="boost-chips" data-testid={`broadcast-${side}-boosts`}>
          {(hud?.boosts[id]?.damage ?? 0) > 0 && <span className="boost-chip boost-damage" data-testid={`broadcast-${side}-damage-boost`}>⚔ +{hud!.boosts[id].damage}% {clock(hud!.boosts[id].damageLeft)}</span>}
          {(hud?.boosts[id]?.defense ?? 0) > 0 && <span className="boost-chip boost-defense" data-testid={`broadcast-${side}-defense-boost`}>🛡 +{hud!.boosts[id].defense}% {clock(hud!.boosts[id].defenseLeft)}</span>}
        </div>
      </div>
    </div>
  );

  return (
    <main className="game-shell">
      <Toaster position="top-center" theme="dark" />
      <div className="ambient-glow ambient-glow-pink" /><div className="ambient-glow ambient-glow-cyan" />
      <header className="top-nav" data-testid="game-header">
        <button type="button" className="brand-lockup" data-testid="brand-home-button" onClick={() => setScreen("menu")}>
          <span className="brand-mark"><Swords size={16} /></span><span><strong data-testid="brand-title">BRASIL FIGHT ARENA</strong><small data-testid="brand-subtitle">TIKTOK LIVE // BRASÍLIA PIXEL</small></span>
        </button>
        <div className="nav-actions">
          <span className={`connection-pill tone-${connection.tone}`} data-testid="connection-indicator">{connection.tone === "ok" ? <Wifi size={13} /> : <WifiOff size={13} />} {connection.text}</span>
          <button type="button" className="admin-nav-button" data-testid="open-live-admin-button" onClick={() => setAdminOpen(true)}><Settings2 size={14} /> ADMIN</button>
          <button type="button" className="icon-button" data-testid="sound-toggle-button" onClick={toggleSound} aria-label="Alternar som">{soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
        </div>
      </header>

      {screen === "menu" && (
        <section className="live-menu" data-testid="start-screen">
          <Badge className="eyebrow-badge" data-testid="game-eyebrow"><Sparkles size={12} /> ARENA INTERATIVA</Badge>
          <h1 data-testid="game-title">BRASIL<br /><span>FIGHT ARENA</span></h1>
          <div className="live-mode-card arcade-panel" data-testid="tiktok-live-mode-card">
            <div className="live-mode-head"><span className="live-dot-icon"><Radio size={22} /></span><div><b data-testid="tiktok-live-mode-label">TIKTOK LIVE</b><small data-testid="tiktok-live-mode-status">{connection.text}</small></div></div>
            <p data-testid="tiktok-live-mode-subtitle">Rosa = +dano, Coração = +defesa, Rosquinha = Shoryuken, Leão = Domínio, Universo = Ultra, Martelo = Invocação do Xande e Galáxia = Genkidama. O primeiro time com 20 presentes ativa o Fatality!</p>
            <Button type="button" className="start-button live-enter-button" data-testid="enter-live-arena-button" onClick={enterArena}><span>ENTRAR NA ARENA LIVE</span><ChevronRight size={22} /></Button>
            {liveConfig.integration_mode === "demo" || connection.tone !== "ok"
              ? <small className="live-mode-note" data-testid="demo-mode-note">Sem conexão real com o TikTok: a arena abre em modo demonstração e os presentes são simulados pelo painel ADMIN.</small>
              : <small className="live-mode-note" data-testid="live-mode-note">Conectado ao serviço de presentes.</small>}
          </div>
        </section>
      )}

      {screen === "arena" && (
        <section className="fight-layout vertical-fight-layout" data-testid="gameplay-screen">
          <div className={`stream-composition backdrop-${liveConfig.combat.backdrop}`} data-testid="vertical-stream-composition">
            <div className="broadcast-top-bar" data-testid="broadcast-top-bar">
              <div className={`ultra-dispute ${fatalityWinner ? "is-fatality" : ""}`} data-testid="ultra-special-dispute">
                <div className="ultra-dispute-title" data-testid="ultra-special-dispute-title">
                  <span>ULTRA ESPECIAL</span><b>DISPUTA DE PRESENTES</b>
                  {fatalityWinner && <em data-testid="fatality-definitivo-banner">FATALITY DEFINITIVO · {CHARACTERS[fatalityWinner].name}</em>}
                </div>
                <div className="ultra-dispute-track" data-testid="ultra-special-dispute-bar">
                  <div className="ultra-team ultra-team-flavio"><i style={{ width: `${(ultraScore.flavio / ULTRA_GOAL) * 100}%` }} /></div>
                  <strong data-testid="ultra-special-vs">VS</strong>
                  <div className="ultra-team ultra-team-lula"><i style={{ width: `${(ultraScore.lula / ULTRA_GOAL) * 100}%` }} /></div>
                </div>
                <div className="ultra-dispute-scores">
                  <span data-testid="ultra-blue-score">TIME VERDE <b>{ultraScore.flavio}/{ULTRA_GOAL}</b></span>
                  <span data-testid="ultra-red-score"><b>{ultraScore.lula}/{ULTRA_GOAL}</b> TIME VERMELHO</span>
                </div>
              </div>
              <div className="broadcast-match-row" data-testid="broadcast-match-row">
                {topPlayer(left, "left")}
                <div className="broadcast-round">
                  <span data-testid="broadcast-round-label">ROUND {String(hud?.round ?? 1).padStart(2, "0")}</span>
                  <strong className={`tone-${connection.tone}`} data-testid="broadcast-live-status"><Radio size={11} /> {connection.tone === "demo" ? "DEMO" : connection.tone === "ok" ? "LIVE" : "OFFLINE"}</strong>
                  <em data-testid="broadcast-last-gifter">{lastGift ? `@${lastGift.username}` : "AGUARDANDO"}</em>
                </div>
                {topPlayer(right, "right")}
              </div>
            </div>
            <div className="arcade-frame">
              <div className="canvas-wrap">
                <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} data-testid="game-canvas" />
                <GiftCaptions captions={captions} durationMs={liveConfig.combat.caption_ms} speed={captionSpeed} backlog={giftQueueRef.current.length} onDone={applyGift} />
                {roundResult && <div className="round-result" data-testid="round-result-banner">{roundResult}</div>}
              </div>
              <div className="hud-strip">
                <span data-testid="fight-mode-indicator">{fatalityWinner ? `FATALITY DEFINITIVO: ${CHARACTERS[fatalityWinner].name}` : hud?.domain ? `DOMÍNIO: ${hud.domain}` : hud && hud.specials > 0 ? `ESPECIAIS NA FILA: ${hud.specials}` : "LUTA AUTOMÁTICA"}</span>
                <span data-testid="knockdown-count">QUEDAS <b>{hud?.stats.knockdowns ?? 0}</b></span>
                <span data-testid="timer-display">TEMPO <b>{Math.ceil(hud?.timeLeft ?? liveConfig.combat.fight_duration_sec)}</b></span>
              </div>
            </div>
            <div className="broadcast-bottom-bar" data-testid="broadcast-bottom-bar">
              <div className="gift-callout">
                <span data-testid="last-gift-label"><b className="gift-callout-icon" data-testid="last-gift-icon">{lastGift ? giftIcon(lastGift.gift_id) : "🎁"}</b>{lastGift ? `${lastGift.gift_name.toUpperCase()}${lastGift.quantity > 1 ? ` x${lastGift.quantity}` : ""}` : "AGUARDANDO PRESENTES"}{lastGift?.source === "demo" && <i className="demo-chip" data-testid="last-gift-simulated-chip">SIMULADO</i>}</span>
                <small data-testid="last-gift-user">{lastGift ? `ENVIADO POR: @${lastGift.username}` : "NENHUM PRESENTE NESTA LUTA"}</small>
                <strong data-testid="last-gift-action">{lastGift ? giftEffectLabel(lastGift) : "🌹 DANO · 💗 DEFESA · 🍩 SHORYUKEN · 🦁 DOMÍNIO · 🌌 ULTRA · 🔨 XANDE · 🌠 GENKIDAMA"}</strong>
                <em data-testid="last-gift-note">{lastGift ? `OBRIGADO, @${lastGift.username}!` : "ENVIE PRESENTES E MUDE A LUTA"}</em>
              </div>
              <div className="broadcast-stats">
                <div className="gift-history" data-testid="gift-history-strip">{recent.length === 0 ? <span data-testid="gift-history-empty">—</span> : recent.map((event) => <span key={event.event_id} title={`@${event.username}`} data-testid={`gift-history-chip-${event.sequence}`}>{giftIcon(event.gift_id)}</span>)}</div>
                <span data-testid="gift-count-display"><b>{giftsThisFight}</b> / {goal} PRESENTES</span>
                <div className="goal-bar" data-testid="gift-goal-bar"><i style={{ width: `${goalPct}%` }} /></div>
                <span data-testid="gift-goal-display">META DA LUTA <b>{goalPct}%</b></span>
              </div>
            </div>
            {roundCredits && <RoundCreditsCutscene winner={roundCredits.winner} round={roundCredits.round} contributors={roundCredits.contributors} />}
          </div>
          <div className="arena-toolbar">
            <button type="button" className="toolbar-button" data-testid="exit-to-menu-button" onClick={() => setScreen("menu")}><HomeIcon size={15} /> MENU</button>
            <button type="button" className="toolbar-button" data-testid="pause-game-button" onClick={() => setPaused((value) => !value)}>{paused ? <Play size={15} /> : <Pause size={15} />} {paused ? "RETOMAR" : "PAUSAR"}</button>
            <button type="button" className="toolbar-button" data-testid="restart-round-button" onClick={() => engineRef.current?.restartRound()}><RotateCcw size={15} /> REINICIAR RODADA</button>
          </div>
          {paused && <div className="paused-chip" data-testid="pause-overlay">PAUSADO</div>}
        </section>
      )}

      <LiveAdminPanel
        open={adminOpen}
        config={liveConfig}
        status={status}
        connectionText={connection.text}
        events={history}
        results={roundHistory}
        stats={hud?.stats ?? EMPTY_STATS}
        saving={saveConfig.isPending}
        onClose={() => setAdminOpen(false)}
        onSave={(config) => saveConfig.mutate(config)}
        onSimulate={simulate}
        onCheckConnection={() => { queryClient.invalidateQueries({ queryKey: ["live-status"] }); toast("Verificando conexão…"); }}
        arena={{
          inFight: screen === "arena", paused, character: left, volume,
          onStart: enterArena, onTogglePause: () => setPaused((value) => !value), onRestart: () => engineRef.current?.restartRound(),
          onCharacter: setLeft, onAdjustHp: (id, delta) => engineRef.current?.adjustHp(id, delta),
          onVolume: (value) => { setVolume(value); localStorage.setItem("planalto-volume", String(value)); },
        }}
      />
    </main>
  );
}
