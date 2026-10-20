import type { CSSProperties } from "react";
import { Sparkles, Trophy } from "lucide-react";

import { CHARACTERS, spritePath, thanksPath } from "@/game/assets";
import type { CharacterId } from "@/game/types";

interface RoundCreditsCutsceneProps {
  winner: CharacterId;
  round: number;
  contributors: string[];
}

export function RoundCreditsCutscene({ winner, round, contributors }: RoundCreditsCutsceneProps) {
  const fighter = CHARACTERS[winner];
  return (
    <div
      className={`round-credits-cutscene credits-${winner}`}
      data-testid="round-credits-cutscene"
      style={{ "--winner-accent": fighter.accent } as CSSProperties}
    >
      <img className="round-credits-art" src={thanksPath(winner)} alt="" data-testid="round-credits-background" />
      <div className="round-credits-shade" />
      <div className="round-credits-rays" />
      <header className="round-credits-header" data-testid="round-credits-header">
        <span data-testid="round-credits-round">ROUND {String(round).padStart(2, "0")}</span>
        <strong data-testid="round-credits-victory-label"><Trophy size={15} /> VITÓRIA CONFIRMADA</strong>
      </header>
      <img
        className="round-credits-winner"
        src={spritePath(winner, "victory")}
        alt={`${fighter.name} vencedor`}
        data-testid="round-credits-winner-sprite"
      />
      <section className="round-credits-copy" data-testid="round-credits-copy">
        <small data-testid="round-credits-kicker">O CAMPEÃO DA RODADA</small>
        <h2 data-testid="round-credits-winner-name">{fighter.name} VENCEU!</h2>
        <div className="round-credits-divider" />
        <p data-testid="round-credits-contributors-title"><Sparkles size={13} /> COLABORADORES DESTA RODADA</p>
        {contributors.length > 0 ? (
          <div className="round-credits-users" data-testid="round-credits-users">
            {contributors.map((username, index) => (
              <span key={`${username.toLocaleLowerCase()}-${index}`} data-testid={`round-credit-user-${index + 1}`}>@{username}</span>
            ))}
          </div>
        ) : (
          <span className="round-credits-empty" data-testid="round-credits-empty">SEM COLABORADORES NESTA RODADA</span>
        )}
      </section>
      <footer className="round-credits-footer" data-testid="round-credits-footer">OBRIGADO POR MUDAR O DESTINO DA LUTA</footer>
    </div>
  );
}