# ASSETS.md

Everything in GLOAMING is either **procedurally generated in code** or a
**vendored open-licensed font**. Nothing is hotlinked at runtime; the game is
fully self-contained.

## Fonts (the only external assets)

| File | Family | Source | License | Use |
|---|---|---|---|---|
| `public/fonts/IMFellEnglishSC-Regular.woff2` | IM Fell English SC | [Google Fonts](https://fonts.google.com/specimen/IM+Fell+English+SC) | [SIL OFL 1.1](public/fonts/OFL.txt) | Display type: title, headings, HUD labels, buttons |
| `public/fonts/IMFellEnglish-Regular.woff2` | IM Fell English | [Google Fonts](https://fonts.google.com/specimen/IM+Fell+English) | [SIL OFL 1.1](public/fonts/OFL.txt) | Body text |
| `public/fonts/IMFellEnglish-Italic.woff2` | IM Fell English Italic | [Google Fonts](https://fonts.google.com/specimen/IM+Fell+English) | [SIL OFL 1.1](public/fonts/OFL.txt) | Messages, flavour text |

Creator/attribution: the IM Fell types were digitized by **Igino Marini**
(iginomarini.com) from the 17th-century types John Fell bequeathed to Oxford
University Press. The full OFL license text with the copyright notice is
vendored at `public/fonts/OFL.txt`. Files were downloaded from the official
Google Fonts CDN (`fonts.gstatic.com`) at build-authoring time and committed
to the repo; the game never fetches them from the network.

## Procedural 3D content (no external files)

All generated in TypeScript at load time (see `src/game/`):

- **Terrain** — analytic heightfield (value-noise FBM + authored valley
  profile, river carve, bogs, farm flattening), coloured per-vertex
  (`world.ts`).
- **Creatures** — dog, sheep, and wolves are built from primitive boxes and
  cones with flat-shaded vertex colours, animated in code (leg swings, gallop
  bob, grazing heads, panic hops, prowl crouch) (`dog.ts`, `sheep.ts`,
  `wolves.ts`).
- **Vegetation & props** — instanced pines, dry-grass tufts (with a small
  vertex-shader sway injected via `onBeforeCompile`), rocks, cairns, fences,
  the plank bridge, drystone fold walls, barn, cottage and lanterns
  (`scenery.ts`).
- **Sky** — gradient dome (small custom shader), canvas-texture moon sprite,
  point-cloud stars, and canvas-texture glow sprites for lanterns/fireflies
  (`sky.ts`, `scenery.ts`).
- **Particles** — canvas-generated soft-circle sprites for dust, splashes,
  bark rings, grab flashes and gate sparkles (`fx.ts`).
- **Favicon** — inline SVG data URI in `index.html`.

## Procedural audio (no external files)

All sound is synthesized live with the Web Audio API (`audio.ts`):

- Ambience: pink-ish noise wind through a wandering bandpass; pulsed
  high-band noise crickets that rise after sundown.
- Music: a low saw drone with three detuned oscillators walking a slow
  Am–F–G folk progression through a lowpass that darkens with dusk, plus
  sparse pentatonic plucks with a feedback-delay echo.
- SFX: bark (double saw yip + breath noise), gather whistle (sine gliss with
  vibrato), sheep bleats (tremolo saw through a formant bandpass, pitch
  per sheep), wolf growls/snarls (filtered noise + sub oscillator), gate
  chimes (partial-stacked bells walking up a scale), footsteps/splashes,
  win fanfare and loss drone.

No recorded samples are used anywhere, so there are no audio licenses to
track.
