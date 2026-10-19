import { useEffect, useState } from "react";

import { giftIcon, giftTier, type GiftEvent } from "@/lib/live";

interface GiftCaptionsProps {
  captions: GiftEvent[];
  durationMs: number;
  onDone: (id: string) => void;
}

/** Shows one animated caption at a time; backlog shortens display time so captions never pile up. */
export function GiftCaptions({ captions, durationMs, onDone }: GiftCaptionsProps) {
  const current = captions[0];
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!current) return undefined;
    setLeaving(false);
    const total = captions.length > 2 ? Math.max(1200, durationMs / 2) : durationMs;
    const exit = window.setTimeout(() => setLeaving(true), Math.max(400, total - 350));
    const done = window.setTimeout(() => onDone(current.id), total);
    return () => { window.clearTimeout(exit); window.clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, durationMs]);

  if (!current) return null;
  const tier = giftTier(current.reference_value);
  const received = current.gift_name.toUpperCase();
  return (
    <div className={`gift-caption tier-${tier} ${leaving ? "is-leaving" : ""}`} data-testid="gift-caption" key={current.id}>
      <span className="gift-caption-icon" data-testid="gift-caption-icon">{giftIcon(current.gift_id)}</span>
      <div className="gift-caption-body">
        <strong data-testid="gift-caption-title">{received}{current.quantity > 1 ? ` x${current.quantity}` : ""} RECEBIDO!{current.source === "demo" ? <i data-testid="gift-caption-demo"> SIMULADO</i> : null}</strong>
        <span data-testid="gift-caption-text">@{current.username}{current.special_move === "hadouken" ? " ATIVOU: HADOUKEN" : ""}</span>
      </div>
      {captions.length > 1 && <em data-testid="gift-caption-backlog">+{captions.length - 1}</em>}
    </div>
  );
}
