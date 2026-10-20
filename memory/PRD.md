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
- Arena LIVE vertical com presentes configuráveis, fila serial de agradecimento/especial, disputa de 20 presentes, boosts, Domínio, Shoryuken, Ultra/Fatality, Invocadores e Genkidama.
- Áudio local sincronizado por fase, incluindo vozes alternadas do Lula, voz do Flávio, carga e explosão da Genkidama, além de volume/mudo globais.
- Cutscene de vitória em tela 9:16 completa com o vencedor e créditos deduplicados de todos os usuários que enviaram presentes na rodada.

## Fora do escopo
Autenticação, pagamentos, multiplayer online e conector real do TikTok (o provedor continua em modo demonstração).