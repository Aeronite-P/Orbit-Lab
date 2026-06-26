# Orbit Lab

**Orbit Lab** is a 2D orbital-mechanics game. Pilot a satellite into a target orbit by firing precise burns — matching radius, speed, and tangential motion, then holding that orbit long enough to complete the mission. Built with plain HTML, CSS, and JavaScript: no framework, no build step, no server.

## ▶️ Play now (no download)

**[Launch Orbit Lab →](https://aeronite-p.github.io/Orbit-Lab/)**

Just click the link — it runs in any modern desktop browser. The app always opens **paused** in a Ready state; press **Run Simulation** to begin.

## Goal

Keep the satellite inside the target orbit band while matching the required speed and staying mostly tangential. Hold all of those conditions continuously for the required duration to complete the mission. Live mission requirements are shown in the right panel.

## Difficulty modes

Switch from the right panel.

- **EASY** — mouse burn controls are enabled (drag-to-aim), with a near-stable starting orbit.
- **HARD** — mouse burns are disabled; you fly using the maneuver console only. The start is farther off-band with stronger uncertainty (velocity magnitude error up to ±35%, direction error up to ±24°), and the target band is drawn more subtly.

## Controls

### Global

| Action | Control |
|---|---|
| Start / resume the simulation | **Run Simulation** button |
| Pause / resume | **Pause** button, or **Space** |
| Reset to the initial Ready state | **Reset** button, or **R** |
| Apply an Easy burn | **B** |

*(Keyboard shortcuts are ignored while you're typing in an input field.)*

### EASY — mouse burns

1. Click near the satellite and drag.
2. A thin line shows the requested burn direction toward your cursor.
3. A thick red line shows the clamped applied burn vector.
4. Click **Burn** or press **B** to fire.

Burn magnitude is capped by `maxDvPerBurnEasy`.

### HARD — maneuver console

Type a command and press **Enter** to queue it, then run the queue:

| Command | Effect |
|---|---|
| `prograde <dv>` | Burn along velocity |
| `retrograde <dv>` | Burn opposite velocity |
| `radialout <dv>` | Burn away from the planet |
| `radialin <dv>` | Burn toward the planet |
| `wait <seconds>` | Delay the next command |
| `execute` | Run the queued commands |
| `clear` | Clear the queue and stop execution |

## Physics model

2D Newtonian gravity with consistent units and gravitational parameter `mu`:

```text
a = -mu * r / |r|^3
```

Physics only advances when the sim is running **and** not paused. The canvas is render-only — all controls are HTML UI elements.

### Math HUD

An optional canvas overlay (toggle in Options) shows the live orbital quantities:

```text
v_circ  = sqrt(mu / r)          # circular speed at current radius
epsilon = v^2/2 - mu/r          # specific orbital energy
h       = |r x v|               # specific angular momentum
e                               # eccentricity from r, v
```

The right panel also has **Math Help** buttons explaining, for each metric: what it is, its equation, and why it matters.

## Fuel

- Finite fuel pool shown as a compact fuel bar + percentage.
- Burn cost is proportional to `|Δv|`.
- If a requested burn exceeds available fuel, it's clamped and a message reports both the applied and requested amounts.

## Objective & anti-exploit conditions

The hold timer only accrues while **all** of these are true:

1. Radius is within the band `[minR, maxR]`.
2. Speed is within tolerance of the circular speed at the band midpoint.
3. Motion is mostly tangential: `|v_radial| <= radialTolerance * v_circ(midpoint)`.
4. **Entry gate:** the satellite must have been outside the band at least once and then entered it — the hold timer won't start before that.

## Scoring

Live score out of 100:

```text
score = 100 - dvPenalty - timePenalty - safetyPenalty
```

- `dvPenalty` — for exceeding the target delta-v.
- `timePenalty` — for exceeding par time.
- `safetyPenalty` (Hard only) — for flying inside the unsafe radius.

**Star Medal** requires *all* of: a score of exactly 100, `dvUsed <= targetDv`, `timeElapsed <= parTime`, and no safety penalties. Mission completion shows a result card in the panel.

## Notes

- Orbit trail, vectors, and the math HUD are toggleable in Options.
- The canvas uses responsive device-pixel-ratio handling to avoid stretching artifacts; mouse mapping is DPR-aware via `getBoundingClientRect()`.
- Satellite spawns are always outside the target band, with a margin, clamped to stay on-screen.

## Project files

| File | What's in it |
|---|---|
| `index.html` | App structure and UI sections |
| `style.css` | Responsive layout and visual design |
| `main.js` | State, rendering, physics, controls, objective, scoring |

## Running it locally (optional)

You don't need this to play — just open the [live link](https://aeronite-p.github.io/Orbit-Lab/). But since there's no build step, you can also run it straight from disk:

```bash
git clone https://github.com/Aeronite-P/Orbit-Lab.git
cd Orbit-Lab
# then open index.html in any modern browser
```

The live site is hosted on **GitHub Pages** and updates automatically whenever `main` changes.

---

Created by Shiv Prahalathan · 2026
