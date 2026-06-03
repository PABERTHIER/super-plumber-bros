# 🍄 Super Plumber Bros — Vanilla JS

A self-contained 2D platformer inspired by the 80s Super Mario Bros. classic.
**No build step. No npm. No assets to download.** Just three files.

> Note: All sprites are drawn from pixel-art arrays at runtime, and every
> sound is synthesised through the WebAudio API. This avoids shipping any
> third-party copyrighted assets — the game is "Mario-style" but visually
> original.

## Files

| File         | Purpose                                                |
|--------------|--------------------------------------------------------|
| `index.html` | Page shell, canvas, HUD, title overlay                 |
| `style.css`  | Retro arcade styling                                   |
| `game.js`    | Engine, sprites, physics, levels, enemies, sound       |

## How to play

Just open `index.html` in a modern browser (Chrome / Firefox / Edge).
No server is required — the game runs from `file://` directly.

If your browser blocks `file://` scripts (rare), serve the folder with any
static server, e.g.:

```powershell
# Any of these works — pick whichever you have:
python -m http.server 8080
# or
npx --yes serve .
```

Then visit <http://localhost:8080>.

## Controls

| Key                    | Action       |
|------------------------|--------------|
| **← / →**              | Move         |
| **Space / Z / ↑**      | Jump (hold for higher jump) |
| **Shift / X**          | Run          |
| **↓**                  | Duck         |
| **P**                  | Pause        |
| **M**                  | Mute / unmute |

## Features

- 3 hand-crafted scrolling levels (`1-1`, `1-2`, `1-3`)
- Player physics: walk, run, variable-height jump, duck, friction, gravity
- Enemies:
  - **Goombas** — walk and patrol, get flattened when stomped
  - **Koopas** — when stomped retreat into a shell; kick the shell to wipe
    out other enemies in the way (shell-vs-enemy collisions included)
- Tile types: ground, hard blocks, breakable bricks, **? blocks** with coins,
  multi-segment **green pipes**, in-air coins, **flagpole** at level end
- Parallax background: clouds, hills, bushes
- HUD with score, coins, world, lives
- Pit detection, life loss, level transitions, win screen, game over screen
- Pure-JS chiptune SFX: jump, coin, stomp, bump, kick, death, level-clear

## Architecture (one-paragraph summary)

`game.js` is wrapped in an IIFE. Sprites are defined as arrays of
single-character pixel codes mapped to a small palette, baked once into
offscreen `<canvas>` elements at startup, then blitted via `drawImage`.
Levels are arrays of strings; `buildLevel` parses them into a 2D tile grid
plus an enemy spawn list. Movement uses axis-separated tile collision.
The main loop runs on `requestAnimationFrame`. Audio is generated on
demand from oscillators (no sample files).

Have fun! 🎮
