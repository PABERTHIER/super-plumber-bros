# 🍄 Super Plumber Bros — Vanilla JS

A self-contained 2D platformer inspired by the 80s Super Mario Bros. classic.
**No build step. No npm. No assets to download.** Just three files.

> Note: All sprites are drawn from pixel-art arrays at runtime, and every
> sound is synthesised through the WebAudio API. This avoids shipping any
> third-party copyrighted assets — the game is "Mario-style" but visually
> original.

## How to play

Open `index.html` in a modern browser (Chrome / Firefox / Edge).
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

The keyboard handling supports both **AZERTY/ZQSD** and **QWERTY/WASD** layouts,
plus arrow keys. Letter controls are checked with both layout-aware key values
and physical-key fallbacks so shortcuts stay usable across keyboards.

| Key                                 | Action                               |
| ----------------------------------- | ------------------------------------ |
| **← / →** or **Q / D** or **A / D** | Move                                 |
| **Space / ↑ / Z / W**               | Jump; hold briefly for a higher jump |
| **↓ / S**                           | Duck                                 |
| **Shift / X**                       | Run                                  |
| **P**                               | Pause / resume                       |
| **M**                               | Mute / unmute                        |
| **Enter / Space**                   | Start from the title screen          |

## Content

The game now includes **10 scrolling levels** across several biomes:

| World |  Biome   | Style                                        |
| ----- | -------- | -------------------------------------------- |
| `1-1` | Meadow   | Introductory grassland                       |
| `1-2` | Meadow   | Pipes, blocks, and wider enemy spacing       |
| `1-3` | Twilight | Larger hills and denser enemy groups         |
| `2-1` | Desert   | Sandy gaps, pipes, and coin trails           |
| `2-2` | Ice      | Cooler palette with platform chains          |
| `2-3` | Forest   | More vertical block routes                   |
| `3-1` | Cave     | Low ceiling, hard blocks, and darker scenery |
| `3-2` | Volcano  | Lava-colored backdrop and more Koopas        |
| `3-3` | Sky      | Floating island rhythm with safer gaps       |
| `4-1` | Night    | Longer final run with mixed hazards          |

## Gameplay features

- Responsive player movement with walking, running, ducking, friction, gravity,
  and a tuned variable-height jump.
- More reliable enemy stomps using previous-frame positioning, which prevents
  many cases where landing on an enemy was incorrectly treated as side damage.
- Goombas flatten when stomped; Koopas retreat into shells, can be kicked, and
  moving shells can clear other enemies.
- Tile interactions: solid ground, hard blocks, breakable bricks, coin blocks,
  floating coins, pipes, pits, and flagpoles.
- Per-biome procedural backgrounds with different skies, hills, clouds, stars,
  cave ceilings, and volcano embers.
- Score, coins, world, lives, pause state, game over, and win screens.
- Larger responsive game display while preserving crisp pixel rendering.
- Input reset on window blur / tab visibility changes to avoid stuck movement.

Parallax background: clouds, hills, bushes
HUD with score, coins, world, lives
Pit detection, life loss, level transitions, win screen, game over screen
Pure-JS chiptune SFX: jump, coin, stomp, bump, kick, death, level-clear

## Project files

| File         | Purpose                                                                  |
|--------------|--------------------------------------------------------------------------|
| `index.html` | Page shell, HUD, canvas, title overlay, and control text                 |
| `style.css`  | Responsive retro arcade layout and pixel-perfect canvas scaling          |
| `game.js`    | Engine, sprites, input, audio, physics, collision, levels, and rendering |

## Architecture

`game.js` is wrapped in an IIFE. Sprites are defined as arrays of
single-character pixel codes mapped to a small palette and baked into offscreen
canvases once at startup. Levels are represented by character maps and parsed by
`buildLevel()` into a tile grid and enemy spawn list. Movement uses
axis-separated tile collision, while player/enemy collision uses frame-to-frame
position data for fairer stomps. Rendering is handled by `requestAnimationFrame`,
and audio is generated on demand from short oscillator envelopes.

Have fun! 🎮
