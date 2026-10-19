# Combate no Planalto — MVP

## Objetivo
Entregar uma experiência arcade de luta 2D inspirada no artefato `Jogo-tik-tom-main.zip`, pronta para jogar do início ao fim sem login ou dependências externas.

## Entrega atual
- Tela inicial com modos 1 jogador, 2 jogadores, treinamento e CPU vs CPU.
- Seleção de Lula ou Flávio, dificuldade e skin visual.
- Arena Canvas com sprites pixel-art do Palácio, HUD de vida, super, ultra, tempo, combo, defesa e golpes.
- Controles de teclado e botões touch para partidas desktop/mobile.
- Pausa, revanche, menu, vitória/derrota, score e salvamento de nome.
- Placar local persistido em `localStorage` e sincronização best-effort com `/api/scores`.

## Fora do escopo
Autenticação, pagamentos, integrações de terceiros, multiplayer online e áudio externo.