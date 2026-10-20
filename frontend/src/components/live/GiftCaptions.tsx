import { useEffect, useState } from "react";

import { CHARACTERS, thanksPath } from "@/game/assets";
import { giftEffectLabel, giftIcon, type GiftEvent } from "@/lib/live";

interface GiftCaptionsProps {
  captions: GiftEvent[];
  durationMs: number;
  /** Called when the cutscene of `event` ends — the gift's effect fires at this moment. */
  onDone: (event: GiftEvent) => void;
}

const FLAG_TEXT = { lula: "BANDEIRA VERMELHA", flavio: "BANDEIRA DO BRASIL" } as const;

/**
 * Thank-you cutscene shown for EVERY gift: the benefited fighter waving his flag
 * (Lula — red flag with a white star, Flávio — Brazilian flag) thanking the sender by name.
 * One at a time; a backlog shortens each cutscene so the queue never piles up.
 */
export function GiftCaptions({ captions, durationMs, onDone }: GiftCaptionsProps) {
  const current = captions[0];
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!current) return undefined;
    setLeaving(false);
    const base = Math.min(3200, Math.max(2200, durationMs));
    const total = captions.length > 2 ? 1400 : base;
    const exit = window.setTimeout(() => setLeaving(true), total - 380);
    const done = window.setTimeout(() => onDone(current), total);
    return () => { window.clearTimeout(exit); window.clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!current) return null;
  const id = current.benefited_character;
  const accent = CHARACTERS[id].accent;
  return (
    <div className={`thanks-cutscene thanks-${id} ${leaving ? "is-leaving" : ""}`} style={{ ["--accent" as string]: accent }} data-testid="thanks-cutscene" key={current.id}>
      <div className="thanks-bar thanks-bar-top" />
      <img className="thanks-art" src={thanksPath(id)} alt={`${CHARACTERS[id].name} com a ${FLAG_TEXT[id].toLowerCase()}`} data-testid="thanks-cutscene-image" />
      <div className="thanks-shade" />
      <div className="thanks-copy">
        <span className="thanks-kicker" data-testid="thanks-cutscene-character">{CHARACTERS[id].name} AGRADECE</span>
        <strong className="thanks-title" data-testid="thanks-cutscene-title">OBRIGADO,</strong>
        <strong className="thanks-user" data-testid="thanks-cutscene-user">@{current.username}!</strong>
        <span className="thanks-gift" data-testid="thanks-cutscene-gift">
          <b>{giftIcon(current.gift_id)}</b> {current.gift_name.toUpperCase()}{current.quantity > 1 ? ` x${current.quantity}` : ""}
          {current.source === "demo" && <i data-testid="thanks-cutscene-demo">SIMULADO</i>}
        </span>
        <em className="thanks-effect" data-testid="thanks-cutscene-effect">{giftEffectLabel(current)}</em>
      </div>
      {captions.length > 1 && <span className="thanks-backlog" data-testid="thanks-cutscene-backlog">+{captions.length - 1}</span>}
      <div className="thanks-bar thanks-bar-bottom" />
    </div>
  );
}
