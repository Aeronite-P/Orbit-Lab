# Orbit Lab (Plain HTML/CSS/JS)

Orbit Lab is a 2D orbital mechanics game that runs by opening `index.html` directly in a browser.  
No framework, no build step, no server.

## Files
- `index.html`: App structure and UI sections.
- `style.css`: Responsive layout and visual design.
- `main.js`: State, rendering, physics, controls, objective, scoring.
- `README.md`: Gameplay and implementation reference.

## How To Run
1. Open `index.html` in any modern desktop browser.
2. Click `Run Simulation` to start.  
   The app always loads in a paused Ready state.

## Gameplay Overview
- Keep the satellite in the target orbit band while matching speed and tangential motion requirements.
- Hold those conditions continuously for the required duration to complete the mission.

## Modes
- `EASY`: Mouse burn controls are enabled.
- `HARD`: Mouse burns are fully disabled; use console commands only.

Switch difficulty from the right panel.

## Controls
### Global
- `Run Simulation`: Starts or resumes dynamic updates.
- `Pause`: Toggles pause while running.
- `Reset`: Returns to initial paused Ready state.
- Keyboard:
  - `B`: Apply Easy burn (when not typing in input fields).
  - `Space`: Pause/resume (when not typing).
  - `R`: Reset.

### EASY Mouse Burns
1. Click near the satellite and drag.
2. Thin line: requested burn direction to cursor.
3. Thick red line: clamped applied burn vector.
4. Click `Burn` or press `B`.

Burn magnitude is clamped by `maxDvPerBurnEasy`.

### HARD Maneuver Console
Commands:
- `prograde <dv>`: Along velocity.
- `retrograde <dv>`: Opposite velocity.
- `radialout <dv>`: Away from planet.
- `radialin <dv>`: Toward planet.
- `wait <seconds>`: Delay next command.
- `execute`: Run queued commands.
- `clear`: Clear queue and stop queued execution.

Press Enter to submit each command.

## Physics Model
- 2D Newtonian gravity with consistent units.
- Gravitational parameter: `mu`.
- Acceleration:

```text
a = -mu * r / |r|^3
```

The simulation updates physics only when:
- `state.running === true`
- `state.paused === false`

The canvas is rendering-only; all controls are HTML UI elements.

## Math HUD
Optional canvas overlay shows:
- `v_circ = sqrt(mu / r)`
- `epsilon = v^2/2 - mu/r`
- `h = |r x v|`
- `e` from `r, v` using energy + angular momentum relation

The right panel includes metric help buttons with:
- what it is
- equation
- why it matters

## Fuel
- Finite fuel pool shown as a compact canvas fuel bar + percent.
- Burn fuel cost is proportional to `|Δv|`.
- If requested burn exceeds available fuel, burn is clamped and message reports:
  - applied amount
  - requested amount

## Objective / Anti-Exploit Conditions
Hold timer accrues only if all are true:
1. Radius in band `[minR, maxR]`
2. Speed within tolerance around circular speed at band midpoint
3. Mostly tangential:
   `|v_radial| <= radialTolerance * v_circ(midpoint)`
4. Band entry gate: the satellite must be outside the band at least once, then enter it.  
   Hold timing does not start before this entry condition is met.

# Orbit Lab

Created by Your Shiv Prahalathan
Year: 2026
Mission requirements are displayed prominently in the right panel.

## Spawn Rules
- Satellite never spawns inside the target band.
- Spawn radius is chosen outside the band with a margin and clamped to stay visible.
- EASY: near-stable off-band start with small random variation in position/velocity.
- HARD: farther off-band start with stronger uncertainty:
  - velocity magnitude error up to +/-35%
  - velocity direction error up to +/-24 degrees
- HARD target band visuals are intentionally subtler (dashed, lower opacity).

## Scoring
Live score out of 100:

```text
score = 100 - dvPenalty - timePenalty - safetyPenalty
```

- `dvPenalty`: Cost for exceeding target delta-v.
- `timePenalty`: Cost for exceeding par time.
- `safetyPenalty` (Hard only): Cost when flying inside unsafe radius.

Star Medal requires all:
- score exactly 100
- `dvUsed <= targetDv`
- `timeElapsed <= parTime`
- no safety penalties

Mission completion displays a result card in-panel (not fullscreen).

## Notes
- Orbit trail, vectors, and math HUD are toggleable in Options.
- Canvas uses responsive DPR handling to avoid stretching artifacts.
- Mouse coordinate mapping uses `getBoundingClientRect()` and DPR-aware conversion.
