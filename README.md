# GLOAMING

*The light is failing. Bring the flock home.*

A 3D sheepdog game for desktop browsers. You are a border collie on the last
run of the day: thirteen named sheep, one darkening valley, and a stone fold
at the bottom of it. You never steer the sheep — you steer their **fear**.
Your body is pressure, your stare is a lens, your bark is a shockwave, and
the flock is a live flocking simulation that answers to all three. As dusk
turns to night, wolves slip out of the treeline after the stragglers.

Built with **Vite + TypeScript + Three.js**. No backend, no external runtime
assets — everything except two open-licensed fonts is generated procedurally
(terrain, creatures, audio, all of it).

## Why this concept

Almost every game lets you drive the thing that matters. Herding inverts
that: the thing that matters (the flock) drives itself, and your verbs are
all shapes of *pressure* feeding a per-sheep fear system. Panic makes sheep
fast, stupid and hazard-blind — so every tool that gives you speed costs you
control. That trade-off is the whole game, it's legible in the first ten
seconds, and it comes from systems rather than authored content, which makes
it endlessly replayable. The 3D-ness is load-bearing: valley walls funnel,
the river forces a chokepoint decision (wide ford vs. narrow bridge), the
treeline is where wolves live, and the difficulty ramp *is* the lighting.
`RESEARCH.md` documents the concept selection and inspiration.

## Controls

| Input | Action |
|---|---|
| `W A S D` / arrows | Run (camera-relative) |
| Mouse | Steer the camera (click to lock the pointer; LMB-drag or auto-follow if you decline) |
| `Shift` | Sprint (stamina) |
| **hold `RMB` or `E`** | **The Eye** — crouch and stare; presses sheep firmly where you look, barely frightens them, and wolves cannot bear it |
| `Space` | **Bark** — scatters sheep hard, spikes panic, sends wolves running |
| `Q` | **Gather whistle** — far-off sheep drift toward you for a moment |
| `F` | Shut the fold gate (ends the run) |
| `Esc` / `P` | Pause |
| `M` | Mute |

Everything above is also taught in-game (HOW TO HERD, shown on first run).

## Run it

```bash
npm install
npm run dev      # → http://127.0.0.1:5173
```

Production build & preview:

```bash
npm run build    # typechecks, then bundles to dist/
npm run preview
```

Desktop browser with WebGL required; tuned for 1080p. On weak or software
GPUs, add `?lowfx` to the URL (disables shadows/antialiasing, drops pixel
ratio).

## The run

1. **The High Meadow** — learn the verbs, get the flock moving.
2. **The Ford** — cross the river: the flock funnels naturally to the wide
   ford; a precise dog can send lined-up sheep over the plank bridge.
3. **The Pinewood** — the corridor narrows, the light dies, and the wolves
   get bold. Lantern light is sanctuary — wolves will not enter it.
4. **The Last Field** — funnel walls, the farm, the fold. Stand at the gate
   post and shut it (`F`) whenever you're willing to call the run.

Three golden-marked **stray sheep** graze off the path — detours that trade
daylight for score. Waypoint gates chime each sheep through. Score comes
from sheep folded, strays rescued, wolves driven off, and remaining
daylight; ranks run from *Lost Pup* to *Legend of the Vale*. Best run is
kept in `localStorage`.

## What was verified

Automated end-to-end checks ran headless (Chromium + SwiftShader) against
the dev server — the scripts are in `scripts/`:

- `verify.mjs` — full state-machine walk: title → how-to → run → pause →
  resume → win/end screen → replay → quit-to-title → loss screen; canvas
  renders; movement, bark, eye inputs; zero console errors/warnings.
- `herd-probe.mjs` — quantitative core-mechanic checks (presence displaces
  and startles the flock, bark spikes fear, the Eye stays low-fear).
- `shepherd-bot.mjs` — a robo-shepherd that herds like a real player:
  verified all 10 sheep funnel through waypoint gate 1, the full flock
  crosses the river at the ford with zero losses, and the endgame works
  (funnel → pen → `F` → win screen).
- `wolf-probe.mjs` — full predator loop: emerge → stalk → charge → grab →
  drag, then a sprint-and-bark rescue (sheep freed, wolf driven off).
- `art-shots.mjs` — staged full-quality screenshots for every game state
  (title, golden hour, sunset, night hunts, the farm, pause, end).
- `npm run build` (includes `tsc --noEmit`) passes clean.

## Known limitations

- Desktop keyboard + mouse only (by design); no touch/mobile support.
- Headless software-GL runs at low FPS; the fixed-substep simulation keeps
  gameplay correct anyway, and real GPUs run it easily.
- Audio starts after your first click (browser autoplay policy).
- The wolves' pathing is field-of-play only — they don't route around the
  river, they wade it (slowly, as wolves would).
