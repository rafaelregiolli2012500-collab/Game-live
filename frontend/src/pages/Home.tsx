import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Home as HomeIcon, Pause, Play, Radio, RotateCcw, Settings2, Sparkles, Swords, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import { toast, Toaster } from "sonner";

import { GiftCaptions } from "@/components/live/GiftCaptions";
import { LiveAdminPanel } from "@/components/live/LiveAdminPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CANVAS_H, CANVAS_W, CHARACTERS, portraitPath } from "@/game/assets";
import { ArenaEngine, emptyStats } from "@/game/engine";
import type { CharacterId, HudSnapshot } from "@/game/types";
import { useGiftSocket } from "@/hooks/useGiftSocket";
import { DEFAULT_LIVE_CONFIG, fetchLiveConfig, fetchLiveEvents, fetchLiveStatus, giftIcon, sendDemoGift, updateLiveConfig } from "@/lib/live";
import type { DemoGiftCreate, GiftEvent, LiveConfig, LiveStatus } from "@/lib/live";

type Screen = "menu" | "arena";

const EMPTY_STATS = emptyStats();

function readWins(): Record<CharacterId, number> {
  try { return { lula: 0, flavio: 0, ...(JSON.parse(localStorage.getItem("planalto-wins") ?? "{}") as Partial<Record<CharacterId, number>>) }; } catch { return { lula: 0, flavio: 0 }; }
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
  const [lastGift, setLastGift] = useState<GiftEvent | null>(null);
  const [recent, setRecent] = useState<GiftEvent[]>([]);
  const [giftsThisFight, setGiftsThisFight] = useState(0);
  const [captions, setCaptions] = useState<GiftEvent[]>([]);
  const [roundResult, setRoundResult] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ArenaEngine | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const queryClient = useQueryClient();
  const right: CharacterId = left === "lula" ? "flavio" : "lula";
  const { events: socketEvents, status: socketStatus } = useGiftSocket("main-arena");

  const configQuery = useQuery({ queryKey: ["live-config"], queryFn: fetchLiveConfig, retry: false, staleTime: 30_000 });
  const eventQuery = useQuery({ queryKey: ["live-events"], queryFn: fetchLiveEvents, retry: false, staleTime: 10_000 });
  const statusQuery = useQuery({ queryKey: ["live-status"], queryFn: fetchLiveStatus, retry: false, staleTime: 15_000 });
  const saveConfig = useMutation({ mutationFn: updateLiveConfig, onSuccess: (saved) => { setLiveConfig(saved); queryClient.setQueryData(["live-config"], saved); queryClient.invalidateQueries({ queryKey: ["live-status"] }); toast.success("Configuração salva"); }, onError: () => toast.error("Não foi possível salvar a configuração") });
  const demoGift = useMutation({ mutationFn: sendDemoGift, onSuccess: (event) => { receiveGift(event); queryClient.invalidateQueries({ queryKey: ["live-events"] }); }, onError: (error) => toast.error(error instanceof Error ? error.message : "Falha ao simular presente") });

  useEffect(() => { if (configQuery.data) setLiveConfig(configQuery.data); }, [configQuery.data]);
  useEffect(() => { engineRef.current?.setSettings(liveConfig.combat); }, [liveConfig.combat]);

  /** Single entry point for every validated gift (socket or demo). The engine dedupes by event_id. */
  const receiveGift = useCallback((event: GiftEvent) => {
    // Gifts no longer trigger specials (removed); they are only announced until the new gifts are added.
    if (seenRef.current.has(event.event_id)) return;
    seenRef.current.add(event.event_id);
    setCaptions((current) => [...current, event]);
    setLastGift(event);
    setRecent((current) => [event, ...current.filter((item) => item.event_id !== event.event_id)].slice(0, 5));
    setGiftsThisFight((count) => count + event.quantity);
  }, []);

  useEffect(() => { [...socketEvents].reverse().forEach(receiveGift); }, [socketEvents, receiveGift]);

  useEffect(() => {
    if (screen !== "arena" || !canvasRef.current) return undefined;
    const engine = new ArenaEngine(canvasRef.current, liveConfig.combat, left, right, {
      onHud: setHud,
      onRoundStart: () => { setRoundResult(null); setGiftsThisFight(0); },
      onRoundEnd: (winner) => {
        setRoundResult(winner ? `${CHARACTERS[winner].name} VENCEU A RODADA` : "EMPATE");
        if (winner) setWins((current) => { const next = { ...current, [winner]: current[winner] + 1 }; localStorage.setItem("planalto-wins", JSON.stringify(next)); return next; });
      },
    });
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
    // Settings are pushed via setSettings; only fighters/screen recreate the engine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, left]);

  useEffect(() => { engineRef.current?.setPaused(paused); }, [paused]);
  useEffect(() => { engineRef.current?.setVolume(soundOn ? volume : 0); }, [soundOn, volume, screen]);

  const status: LiveStatus = statusQuery.data ?? socketStatus;
  const connection = connectionLabel(socketStatus.state === "connected" ? socketStatus : status, liveConfig);
  const goal = liveConfig.combat.collective_goal;
  const goalPct = Math.min(100, Math.round((giftsThisFight / goal) * 100));
  const hp = hud?.hp ?? { lula: liveConfig.combat.max_hp, flavio: liveConfig.combat.max_hp };
  const history = useMemo(() => (eventQuery.data ?? []).slice(0, 12), [eventQuery.data]);

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
            <p data-testid="tiktok-live-mode-subtitle">Os lutadores trocam golpes sozinhos. Os novos presentes da audiência chegam na próxima atualização.</p>
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
              {topPlayer(left, "left")}
              <div className="broadcast-round">
                <span data-testid="broadcast-round-label">ROUND {String(hud?.round ?? 1).padStart(2, "0")}</span>
                <strong className={`tone-${connection.tone}`} data-testid="broadcast-live-status"><Radio size={11} /> {connection.tone === "demo" ? "DEMO" : connection.tone === "ok" ? "LIVE" : "OFFLINE"}</strong>
                <em data-testid="broadcast-last-gifter">{lastGift ? `@${lastGift.username}` : "AGUARDANDO"}</em>
              </div>
              {topPlayer(right, "right")}
            </div>
            <div className="arcade-frame">
              <GiftCaptions captions={captions} durationMs={liveConfig.combat.caption_ms} onDone={(id) => setCaptions((current) => current.filter((item) => item.id !== id))} />
              <div className="canvas-wrap">
                <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} data-testid="game-canvas" />
                {roundResult && <div className="round-result" data-testid="round-result-banner">{roundResult}</div>}
              </div>
              <div className="hud-strip">
                <span data-testid="fight-mode-indicator">LUTA AUTOMÁTICA</span>
                <span data-testid="knockdown-count">QUEDAS <b>{hud?.stats.knockdowns ?? 0}</b></span>
                <span data-testid="timer-display">TEMPO <b>{Math.ceil(hud?.timeLeft ?? liveConfig.combat.fight_duration_sec)}</b></span>
              </div>
            </div>
            <div className="broadcast-bottom-bar" data-testid="broadcast-bottom-bar">
              <div className="gift-callout">
                <span data-testid="last-gift-label"><b className="gift-callout-icon" data-testid="last-gift-icon">{lastGift ? giftIcon(lastGift.gift_id) : "🎁"}</b>{lastGift ? `${lastGift.gift_name.toUpperCase()}${lastGift.quantity > 1 ? ` x${lastGift.quantity}` : ""}` : "AGUARDANDO PRESENTES"}{lastGift?.source === "demo" && <i className="demo-chip" data-testid="last-gift-simulated-chip">SIMULADO</i>}</span>
                <small data-testid="last-gift-user">{lastGift ? `ENVIADO POR: @${lastGift.username}` : "NENHUM PRESENTE NESTA LUTA"}</small>
                <strong data-testid="last-gift-action">{lastGift ? "PRESENTE RECEBIDO" : "PRESENTES: EM BREVE"}</strong>
                <em data-testid="last-gift-note">{lastGift ? `OBRIGADO, @${lastGift.username}!` : "NOVOS PRESENTES EM BREVE"}</em>
              </div>
              <div className="broadcast-stats">
                <div className="gift-history" data-testid="gift-history-strip">{recent.length === 0 ? <span data-testid="gift-history-empty">—</span> : recent.map((event) => <span key={event.event_id} title={`@${event.username}`} data-testid={`gift-history-chip-${event.sequence}`}>{giftIcon(event.gift_id)}</span>)}</div>
                <span data-testid="gift-count-display"><b>{giftsThisFight}</b> / {goal} PRESENTES</span>
                <div className="goal-bar" data-testid="gift-goal-bar"><i style={{ width: `${goalPct}%` }} /></div>
                <span data-testid="gift-goal-display">META DA LUTA <b>{goalPct}%</b></span>
              </div>
            </div>
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
