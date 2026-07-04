# DELIVERY_NOTES.md

## Final concept

**GLOAMING** — a 3D sheepdog game about indirect control. The player is a
border collie driving a flock of thirteen *named* sheep down a darkening
valley into a stone fold, while wolves hunt the stragglers. The core twist:
you never control the flock — you control **pressure** (presence, the Eye,
the bark, the whistle), all feeding a per-sheep fear scalar that trades
speed for control. The dusk cycle is the difficulty ramp; lantern light is
wolf-free sanctuary; the river is a chokepoint (wide ford vs. narrow
bridge); three off-path strays are risk/reward detours; the run ends when
the player shuts the fold gate — wherever the rest of the flock stands.

## Implementation summary

- **Stack:** Vite 7, TypeScript (strict), Three.js r182. No other runtime
  dependencies; no backend. `playwright-core` is a dev-only dependency for
  the verification harness.
- **World** (`src/game/world.ts`): analytic heightfield (FBM noise + authored
  valley profile), carved river with ford/bridge, bogs, farm plateau;
  vertex-coloured flat-shaded terrain mesh; static collision (circles +
  segments in a uniform grid) with slide-on-contact resolution; layout
  annotations (gates, fold, lanterns, strays) that gameplay reads.
- **Flock** (`sheep.ts`): boids (separation/cohesion/alignment) + fear system
  (startle, panic bolts, lantern calming), dog-pressure/Eye-cone/bark/whistle
  responses, hazard sense with persistent "crossing intent" (flocks funnel to
  the ford; lined-up sheep take the bridge), gate-opening seek, procedural
  bodies and animation, per-sheep names and one black sheep.
- **Wolves** (`wolves.ts`): darkness-scaled director; emerge → stalk (most
  isolated target) → charge → grab → drag-to-treeline; repelled by dog
  proximity, bark, and the Eye; lantern avoidance; rescue returns the sheep
  panicked but alive.
- **Dog** (`dog.ts`, `camera.ts`, `input.ts`): velocity-steered controller
  with exact speed caps, sprint stamina, Eye stance (camera-aimed), swim/bog
  modifiers; spring third-person camera with pointer lock, drag/auto-follow
  fallback, terrain clearance, sprint FOV, Eye zoom; night "hero light".
- **Presentation:** dusk lighting pipeline (one directional light plays sun
  then moon, hemisphere + fog + gradient dome + stars + moon), instanced
  scenery, procedural WebAudio (wind, crickets, folk drone, plucks, barks,
  bleats, growls, bells), particle FX, hitstop + camera shake, IM Fell
  typography over an almanac-styled DOM UI (title, how-to, pause, end,
  HUD with flock tally / dusk arc / verbs / edge pips / message feed).
- **Robustness:** fixed-substep simulation (correct at any framerate),
  `?lowfx` flag for weak GPUs, WebGL failure screen, pause-on-pointer-unlock,
  localStorage best score, `?debug` hooks used by the test harness.

## Verification checklist

- [x] `npm install` clean (no vulnerabilities reported)
- [x] `npm run build` passes (`tsc --noEmit` + Vite bundle, ~612 KB / 164 KB gzip)
- [x] `npm run typecheck` passes
- [x] Dev server boots; first screen renders (not blank) — screenshot-verified
- [x] Title → how-to → gameplay entry works (click path automated)
- [x] WASD/mouse/sprint/bark/Eye/whistle inputs verified headless
- [x] Core herding loop measured: walking drive-through displaces 9/13 sheep,
      startle raises fear (0 → ~0.37), bark spikes (→ 0.84), Eye stays low-fear
- [x] Waypoint gate: robo-shepherd funnelled 10/10 sheep through, chime path hit
- [x] River: full flock crossed at the ford, zero losses; bridge usable when lined up
- [x] Wolf loop: emerge → stalk → charge → grab → drag observed; sprint + bark
      rescue frees the sheep and credits "driven off"
- [x] Endgame: funnel → pen → `F` → gate-shut animation → win screen with stats,
      named fates, rank, new-best handling
- [x] Loss screen ("The fold stands empty") verified
- [x] Pause/resume (Esc + button), quit-to-title, run-again all verified
- [x] Zero console errors or warnings across every automated pass
- [x] Full-quality screenshots reviewed for: golden hour, sunset, night wolves,
      farm arrival, HUD states, both end screens

### Checks not performed

- No human playtest (environment is headless) — pacing beyond the robo-shepherd
  baseline and audio mix are tuned by construction, not by ear. The synthesized
  audio path is exercised only up to the WebAudio API surface.
- No cross-browser pass (Chromium only); Firefox/Safari should work (standard
  WebGL2 + WebAudio) but were not exercised.

## Known limitations

- Desktop-only by design; no touch input.
- Wolves wade rather than path around water (intentional, but means they can
  be slow to arrive from across the river).
- On software rasterizers the game runs slow-motion below ~8 FPS despite
  substepping (use `?lowfx`).

## Branch / commit

- Branch: `claude/3d-browser-game-vmpsci`
- Commit: recorded in the follow-up docs commit after the main commit was cut
  (see `git log --oneline` — the gameplay commit is the one titled
  "GLOAMING: a 3D sheepdog game about herding with fear").
