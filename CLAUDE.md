# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris (HTML5 Canvas). No dependencies, no package.json, no build, no tests, no linter. README is in Spanish; UI strings are Spanish too.

## Run

Open `index.html` directly, or serve statically: `python -m http.server 8000` → http://localhost:8000.

## Architecture

Three files: `index.html` (DOM + canvases), `style.css`, `game.js` (all logic, single script, `'use strict'`, global state).

- Global mutable state in `game.js`: `board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`. `init()` resets all of it; restart button calls `init()`.
- Board = `ROWS x COLS` matrix; 0 empty, 1–7 = piece type index into `COLORS`/`PIECES` (index 0 is `null` placeholder). Piece cells store their own type index, so shape matrices double as color data.
- Flow: `loop` (rAF, accumulates `dropAccum` vs `dropInterval`) → gravity or `lockPiece()` → `merge` → `clearLines` → `spawn`. `spawn` calls `endGame()` if new piece collides.
- `animId` rAF handle is cancelled in `endGame`, `togglePause`, `init`; resume path calls `loop` directly.
- Input: single `keydown` listener using `e.code`; `P` handled before the paused/gameOver guard.
- `clearLines` recomputes `level` and `dropInterval = max(100, 1000 - (level-1)*90)`; the `1000` initial value is duplicated in `init()`.
- Rotation: `rotateCW` + horizontal-only kicks `[0,-1,1,-2,2]` in `tryRotate` (no SRS tables).
- Records (`// ==== Records ====` en `game.js`): `localStorage['tetrisRecords']` = `{top:[{name,score,lines,level,date}] (máx 5), bestCombo, maxLines}`, saneado al leer; `tetrisLastName` = último nombre. Hooks: `trackCombo` en `clearLines`, `recordsOnInit` en `init`, `recordsOnGameOver` en `endGame`, `recordsKey` al inicio del `keydown` (ignora inputs; con `idle` solo deja pasar `T`, Enter = Jugar).
- Arranque: ya no se llama `init()` al cargar; `showStartScreen()` (`#start-screen`, `idle = true`, sin loop, `current`/`next` indefinidos) → Jugar/Enter → `init()`. No llamar `draw()` en idle; usar `drawIdle()`.

## Gotchas

- Changing `COLS`/`ROWS`/`BLOCK` requires manually updating `width`/`height` of `<canvas id="board">` in `index.html` (`COLS*BLOCK` x `ROWS*BLOCK`). The next-piece canvas is 120x120 with hardcoded `NB = 30` in `drawNext`.
- DOM ids used by `game.js` (`board`, `next-canvas`, `score`, `lines`, `level`, `overlay`, `overlay-title`, `overlay-score`, `restart-btn`, y los de records: `start-screen`, `start-btn`, `start-table`, `start-stats`, `reset-records-btn`, `reset-confirm`, `reset-yes`, `reset-no`, `overlay-records`, `record-form`, `record-msg`, `record-name`, `overlay-table`, `overlay-stats`) must stay in sync with `index.html`.
- README claims `↑` or `X` rotates; the on-page controls list only shows `↑`.
- Elementos con atributo `hidden` (records) dependen de `[hidden]{display:none!important}` en `style.css`; `#overlay` y `#start-screen` usan clase `.hidden`.
