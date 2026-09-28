# RESEARCH.md — concept selection & inspiration

A short research pass done before building. The goal was to pick a 3D concept that is
**legible** (a genre people instantly understand), **surprising** (a core mechanic that
isn't the obvious verb), and **reliably fun in a one-shot build** (fun that comes from
systems, not from hand-tuned content I can't playtest at scale).

## Concepts considered

| Concept | Twist | Why not |
|---|---|---|
| Lighthouse keeper | Everything follows your light; you control attention, not units | Moody + original, but risked feeling passive — you mostly stand still |
| Time-clone arena shooter | Your previous waves fight alongside you | Strong twist, but gameplay is planar (2D in 3D clothes) and combat feel is risky to tune blind |
| Bowling-siege roguelite | Bowl through castles, steer the ball mid-roll | Juicy, but heavy physics tuning + perf risk without human playtesting |
| **Sheepdog at dusk** ✅ | **You never control the flock — you control fear.** Body pressure, a stare, a bark: three analog inputs into a live boids simulation | Emergent AI is inherently alive; forgiving to tune; deeply 3D (terrain, chokepoints, line-of-sight); rare in the "AI-built game" space |

## Why the sheepdog game won

1. **Indirect control is the surprise.** In almost every game you steer the thing that
   matters. Here the thing that matters (the flock) steers *itself*, and your verbs are
   all forms of *pressure*. That inversion is immediately felt in the first 10 seconds.
2. **Boids are self-balancing fun.** A flocking sim looks alive even when imperfect —
   the classic Reynolds model (separation / alignment / cohesion) plus a flee force is
   well documented and battle-tested ([Reynolds' boids](https://www.red3d.com/cwr/boids/),
   [sheep-herding AI writeups](https://alexcmao.wordpress.com/2018/07/11/game-ai-sheep-herding/)).
3. **Validated by shipped games.** *Herdling* (2025) reviews consistently credit three
   things: the escort-*journey* structure, predators that threaten stragglers, and
   **named, individual animals** that make losses hurt
   ([GameSpot](https://www.gamespot.com/reviews/herdling-review-companion-quest/1900-6418398/),
   [Metacritic](https://www.metacritic.com/game/herdling/)). The *Kyon* devlog stresses
   that flock control verbs (their "stop bark / go bark") are the whole game
   ([Kyon blog](https://www.kyon-game.com/blog/2017/1/26/core-mechanics-herding-sheep-and-having-fun-doing-it)).
   All three lessons are built into GLOAMING: a journey home, wolves that pick off
   stragglers, and sixteen sheep with names — the end screen tells you *who* you lost.
4. **The 3D-ness is load-bearing.** Valley walls funnel the flock, a river forces a
   chokepoint decision (narrow bridge vs. wide slow ford), treeline shadows are where
   wolves live, and darkness itself — a lighting change — is the difficulty ramp.
   None of that works as a 2D game with the same feel.

## Design pillars distilled from research

- **Guidance, not precision.** Herding should feel like pressure and patience
  (Herdling reviews). Fear is an analog scalar per sheep, not a binary "scared" flag.
- **Three interacting verbs.** Presence (radial push, scales with your speed), the Eye
  (a border collie's real-world stare — precise directional cone, low panic), and the
  Bark (big radial impulse + wolf repellent, but it spikes panic). Panic makes sheep
  fast, stupid, and hazard-blind — every verb trades control now for control later.
- **Named animals raise stakes.** Losses are reported by name. The end screen lists
  who came home and who didn't.
- **Escort journeys need chokepoints and dread.** River crossing, pinewood corridor,
  and a real-time dusk cycle with wolves scaling on darkness.

## Web-game reference points

Browsed the small-3D-web-games space for scope calibration —
[itch.io Three.js jam games](https://itch.io/games/in-jam/made-with-threejs),
[js13kGames](https://en.wikipedia.org/wiki/Js13kGames), [Three.js showcase games](https://freefrontend.com/three-js-games/).
Takeaways: flat-shaded low-poly + fog + one strong light reads as *deliberate art
direction* (not missing assets) and keeps performance headroom huge; HTML/CSS overlay
UI beats in-canvas UI for polish per hour; procedural audio (WebAudio) avoids licensing
risk entirely and fits a folk-ambient soundscape.

## Asset sourcing considered

- **3D models:** Considered Kenney / Quaternius CC0 packs (excellent), but a coherent
  procedural low-poly look (crooked pines, drystone walls, boxy sheep) fits the woodcut
  art direction better than mixing pack styles, ships zero binary weight, and keeps the
  whole scene tintable by the dusk lighting system. Everything is generated in code.
- **Audio:** Considered CC0 SFX (freesound/Kenney audio), but wind, bleats, barks and a
  folk drone are all synthesizable with WebAudio — fully documented in `ASSETS.md`.
- **Fonts:** IM Fell English + IM Fell English SC (SIL Open Font License) — a digitization
  of 17th-century English printing types. Downloaded from Google Fonts and vendored
  locally. It *is* the visual identity: the game reads like a page from an old shepherd's
  almanac.

## Sources

- https://www.red3d.com/cwr/boids/
- https://alexcmao.wordpress.com/2018/07/11/game-ai-sheep-herding/
- https://www.kyon-game.com/blog/2017/1/26/core-mechanics-herding-sheep-and-having-fun-doing-it
- https://www.gamespot.com/reviews/herdling-review-companion-quest/1900-6418398/
- https://www.metacritic.com/game/herdling/
- https://ameiswhattodo.itch.io/sheepy
- https://itch.io/games/in-jam/made-with-threejs
- https://en.wikipedia.org/wiki/Js13kGames
- https://freefrontend.com/three-js-games/
