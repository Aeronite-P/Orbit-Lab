(function () {
  "use strict";

  const canvas = document.getElementById("simCanvas");
  const ctx = canvas.getContext("2d");

  const ui = {
    simPane: document.querySelector(".sim-pane"),
    difficultySelect: document.getElementById("difficultySelect"),
    runBtn: document.getElementById("runBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    resetBtn: document.getElementById("resetBtn"),
    burnBtn: document.getElementById("burnBtn"),
    statusText: document.getElementById("statusText"),
    missionBand: document.getElementById("missionBand"),
    missionSpeed: document.getElementById("missionSpeed"),
    missionTangential: document.getElementById("missionTangential"),
    missionHold: document.getElementById("missionHold"),
    missionEntry: document.getElementById("missionEntry"),
    missionRule: document.getElementById("missionRule"),
    missionGuidance: document.getElementById("missionGuidance"),
    missionProgress: document.getElementById("missionProgress"),
    scoreLive: document.getElementById("scoreLive"),
    dvLive: document.getElementById("dvLive"),
    timeLive: document.getElementById("timeLive"),
    safetyLive: document.getElementById("safetyLive"),
    consoleCard: document.getElementById("consoleCard"),
    consoleInput: document.getElementById("consoleInput"),
    queueView: document.getElementById("queueView"),
    consoleLog: document.getElementById("consoleLog"),
    trailToggle: document.getElementById("trailToggle"),
    vectorsToggle: document.getElementById("vectorsToggle"),
    mathToggle: document.getElementById("mathToggle"),
    helpButtons: Array.from(document.querySelectorAll(".help-btn")),
    helpBox: document.getElementById("helpBox"),
    orbitExplainOverlay: document.getElementById("orbitExplainOverlay"),
    completionBanner: document.getElementById("completionBanner"),
    bannerCloseBtn: document.getElementById("bannerCloseBtn"),
    bannerScore: document.getElementById("bannerScore"),
    bannerMedalIcon: document.getElementById("bannerMedalIcon"),
    bannerMedalLabel: document.getElementById("bannerMedalLabel"),
    bannerWinWhy: document.getElementById("bannerWinWhy"),
    bannerBreakdown: document.getElementById("bannerBreakdown")
  };

  const config = {
    mu: 120000,
    dtMax: 1 / 30,
    pxPerUnit: 1.35,
    planetRadius: 70,
    atmosphereThickness: 20,
    satelliteRadius: 5,
    maxDvPerBurnEasy: 25,
    fuelMax: 160,
    fuelPerDv: 1.0,
    trailMaxPoints: 1400,
    targetBandMinR: 225,
    targetBandMaxR: 285,
    speedToleranceFrac: 0.08,
    minSpeedFactorEasy: 0.85,
    holdRequired: 14,
    targetDv: 55,
    parTime: 38,
    safeMinR: 185,
    viewAspect: 16 / 9
  };

  const state = {
    running: false,
    paused: true,
    missionStarted: false,
    difficulty: "easy",
    controlMode: "mouse",
    fuel: config.fuelMax,
    dvUsed: 0,
    timeElapsed: 0,
    score: 100,
    safetyPenalty: 0,
    orbitHoldTime: 0,
    hasEnteredBand: false,
    hasBeenOutsideBand: false,
    objectiveComplete: false,
    showTrail: true,
    showVectors: true,
    showMathHud: true,
    sat: { r: { x: 320, y: 0 }, v: { x: 0, y: 0 } },
    trail: [],
    camera: { cx: 0, cy: 0, w: 0, h: 0, dpr: 1 },
    input: { isAiming: false, mouseWorld: null, clampedBurn: { x: 0, y: 0 }, requestedBurnMag: 0 },
    consoleQueue: [],
    consoleExecuting: false,
    waitTimer: 0,
    activeCommand: null,
    message: "Ready: press Run Simulation.",
    stars: [],
    math: { r: 0, v: 0, vcirc: 0, epsilon: 0, h: 0, e: 0 },
    bannerTimer: null
  };

  const helpText = {
    vcirc: "v_circ = sqrt(mu / r). Circular speed at radius r. It is the speed target used to stay in a round orbit.",
    epsilon: "epsilon = v^2/2 - mu/r. Specific orbital energy. Negative = bound orbit, near zero = escape boundary.",
    h: "h = |r x v| (2D scalar magnitude). Angular momentum controls orbit shape and orientation stability.",
    e: "e = sqrt(1 + 2*epsilon*h^2/mu^2). Eccentricity: 0 is circular, 0-1 elliptical, >=1 escape."
  };

  const vec = (x, y) => ({ x, y });
  const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
  const mag = (a) => Math.hypot(a.x, a.y);
  const norm = (a) => {
    const m = mag(a);
    return m < 1e-9 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
  };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const randRange = (min, max) => min + Math.random() * (max - min);
  const rotate = (v, angleRad) => {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  };
  const isInsideBand = (r) => r >= config.targetBandMinR && r <= config.targetBandMaxR;

  function resizeCanvasToFit() {
    const container = ui.simPane.getBoundingClientRect();
    const availableW = Math.max(1, container.width);
    const availableH = Math.max(1, container.height);
    const targetAspect = config.viewAspect;
    const containerAspect = availableW / availableH;
    let fittedW;
    let fittedH;
    if (containerAspect > targetAspect) {
      fittedH = availableH;
      fittedW = fittedH * targetAspect;
    } else {
      fittedW = availableW;
      fittedH = fittedW / targetAspect;
    }
    fittedW = Math.floor(fittedW);
    fittedH = Math.floor(fittedH);
    canvas.style.width = `${fittedW}px`;
    canvas.style.height = `${fittedH}px`;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(fittedW * dpr));
    canvas.height = Math.max(1, Math.floor(fittedH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.camera.w = fittedW;
    state.camera.h = fittedH;
    state.camera.dpr = dpr;
    generateStars();
  }

  function generateStars() {
    const count = Math.floor((state.camera.w * state.camera.h) / 2600);
    state.stars = [];
    for (let i = 0; i < count; i += 1) {
      state.stars.push({ x: Math.random() * state.camera.w, y: Math.random() * state.camera.h, s: Math.random() * 1.7 + 0.4, a: Math.random() * 0.6 + 0.2 });
    }
  }

  function worldToScreen(p) {
    const cx = state.camera.w / 2;
    const cy = state.camera.h / 2;
    return { x: cx + (p.x - state.camera.cx) * config.pxPerUnit, y: cy + (p.y - state.camera.cy) * config.pxPerUnit };
  }

  function screenToWorldFromEvent(ev) {
    const rect = canvas.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    return { x: (sx - state.camera.w / 2) / config.pxPerUnit + state.camera.cx, y: (sy - state.camera.h / 2) / config.pxPerUnit + state.camera.cy };
  }

  function clampSpawnRadiusOutsideBand(r0, preferOuter) {
    const bandW = config.targetBandMaxR - config.targetBandMinR;
    const halfW = state.camera.w / (2 * config.pxPerUnit);
    const halfH = state.camera.h / (2 * config.pxPerUnit);
    const maxVisibleR = Math.max(config.planetRadius + 30, Math.min(halfW, halfH) - 24);
    const minVisibleR = config.planetRadius + 35;
    let r = clamp(r0, minVisibleR, maxVisibleR);
    if (isInsideBand(r)) {
      const bump = Math.min(0.15 * bandW, 25);
      r = preferOuter ? clamp(config.targetBandMaxR + bump, minVisibleR, maxVisibleR) : clamp(config.targetBandMinR - bump, minVisibleR, maxVisibleR);
    }
    return r;
  }

  function chooseSpawnRadius() {
    const bandW = config.targetBandMaxR - config.targetBandMinR;
    const preferOuter = Math.random() > 0.5;
    if (state.difficulty === "hard") {
      const base = preferOuter ? config.targetBandMaxR + randRange(0.4 * bandW, 0.75 * bandW) : config.targetBandMinR - randRange(0.4 * bandW, 0.75 * bandW);
      return clampSpawnRadiusOutsideBand(base, preferOuter);
    }
    const base = preferOuter ? config.targetBandMaxR + randRange(0.15 * bandW, 0.35 * bandW) : config.targetBandMinR - randRange(0.15 * bandW, 0.35 * bandW);
    return clampSpawnRadiusOutsideBand(base, preferOuter);
  }

  function setSpawnState() {
    const r0 = chooseSpawnRadius();
    const theta = Math.random() * Math.PI * 2;
    const rHat = { x: Math.cos(theta), y: Math.sin(theta) };
    const tHat = norm({ x: -rHat.y, y: rHat.x });
    const vc0 = Math.sqrt(config.mu / r0);
    let vDir = tHat;
    let vMag = vc0;
    if (state.difficulty === "hard") {
      const eSpeed = randRange(-0.06, 0.06);
      const eAngleDeg = randRange(-6, 6);
      vDir = norm(rotate(tHat, eAngleDeg * (Math.PI / 180)));
      vMag = vc0 * (1 + eSpeed);
    }
    state.sat.r = scale(rHat, r0);
    state.sat.v = scale(vDir, vMag);
    state.hasBeenOutsideBand = !isInsideBand(r0);
  }

  function setMessage(m) {
    state.message = m;
    ui.statusText.textContent = m;
  }

  function syncDifficulty() {
    state.difficulty = ui.difficultySelect.value === "hard" ? "hard" : "easy";
    state.controlMode = state.difficulty === "hard" ? "console" : "mouse";
    ui.consoleCard.classList.toggle("hidden", state.difficulty !== "hard");
    ui.burnBtn.disabled = state.difficulty !== "easy";
    canvas.style.cursor = state.difficulty === "easy" ? "crosshair" : "default";
  }

  function renderQueue() {
    ui.queueView.textContent = state.consoleQueue.length === 0 ? "Queue: (empty)" : "Queue: " + state.consoleQueue.map((c, i) => `${i + 1}. ${c.raw}`).join(" | ");
  }

  function logConsole(msg) {
    const line = document.createElement("div");
    line.textContent = msg;
    ui.consoleLog.prepend(line);
  }

  function resetSimulation() {
    state.running = false;
    state.paused = true;
    state.fuel = config.fuelMax;
    state.dvUsed = 0;
    state.timeElapsed = 0;
    state.safetyPenalty = 0;
    state.orbitHoldTime = 0;
    state.hasEnteredBand = false;
    state.hasBeenOutsideBand = false;
    state.objectiveComplete = false;
    state.consoleQueue = [];
    state.consoleExecuting = false;
    state.waitTimer = 0;
    state.activeCommand = null;
    state.trail = [];
    state.input.isAiming = false;
    state.input.mouseWorld = null;
    state.input.clampedBurn = { x: 0, y: 0 };
    state.input.requestedBurnMag = 0;
    setSpawnState();
    setMessage("Ready: press Run Simulation.");
    hideCompletionBanner();
    renderQueue();
    syncDifficulty();
    updateMath();
    updateUi();
  }

  function parseConsoleCommand(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const parts = trimmed.toLowerCase().split(/\s+/);
    const cmd = parts[0];
    const arg = Number(parts[1]);
    if (cmd === "clear") {
      state.consoleQueue = [];
      state.consoleExecuting = false;
      state.waitTimer = 0;
      state.activeCommand = null;
      renderQueue();
      logConsole("Cleared queue.");
      return;
    }
    if (cmd === "execute") {
      if (state.consoleQueue.length === 0) {
        logConsole("Queue empty.");
        return;
      }
      state.consoleExecuting = true;
      state.activeCommand = null;
      state.waitTimer = 0;
      logConsole("Executing queue.");
      return;
    }
    if (cmd === "wait") {
      if (!Number.isFinite(arg) || arg < 0) {
        logConsole("Invalid wait value.");
        return;
      }
      state.consoleQueue.push({ type: "wait", seconds: arg, raw: trimmed });
      renderQueue();
      return;
    }
    if (["prograde", "retrograde", "radialout", "radialin"].includes(cmd)) {
      if (!Number.isFinite(arg) || arg <= 0) {
        logConsole("Invalid dv value.");
        return;
      }
      state.consoleQueue.push({ type: "burn", mode: cmd, dv: arg, raw: trimmed });
      renderQueue();
      return;
    }
    logConsole(`Unknown command: ${trimmed}`);
  }

  function computeBurnVectorFromMode(mode, dv) {
    const rHat = norm(state.sat.r);
    const vHat = norm(state.sat.v);
    if (mode === "prograde") return scale(vHat, dv);
    if (mode === "retrograde") return scale(vHat, -dv);
    if (mode === "radialout") return scale(rHat, dv);
    if (mode === "radialin") return scale(rHat, -dv);
    return vec(0, 0);
  }

  function applyBurn(dvVec, requestedMag) {
    const req = requestedMag != null ? requestedMag : mag(dvVec);
    if (req <= 0) {
      setMessage("Burn ignored: zero magnitude.");
      return;
    }
    const fuelNeeded = req * config.fuelPerDv;
    const usableFrac = fuelNeeded > state.fuel ? state.fuel / fuelNeeded : 1;
    const applied = scale(dvVec, usableFrac);
    const appliedMag = mag(applied);
    if (appliedMag <= 1e-6) {
      setMessage("No fuel remaining for burn.");
      return;
    }
    state.sat.v = add(state.sat.v, applied);
    state.fuel = clamp(state.fuel - appliedMag * config.fuelPerDv, 0, config.fuelMax);
    state.dvUsed += appliedMag;
    setMessage(usableFrac < 0.999 ? `Fuel-limited burn: applied ${appliedMag.toFixed(2)} / requested ${req.toFixed(2)}` : `Burn applied: ${appliedMag.toFixed(2)} m/s`);
  }

  function applyEasyBurnFromAim() {
    if (state.difficulty !== "easy") return;
    const burnMag = mag(state.input.clampedBurn);
    if (burnMag <= 0) {
      setMessage("Aim a burn first.");
      return;
    }
    applyBurn(state.input.clampedBurn, state.input.requestedBurnMag);
  }

  function updateAim() {
    if (state.difficulty !== "easy" || !state.input.isAiming || !state.input.mouseWorld) {
      state.input.clampedBurn = vec(0, 0);
      state.input.requestedBurnMag = 0;
      return;
    }
    const raw = sub(state.input.mouseWorld, state.sat.r);
    const requested = mag(raw) * 0.16;
    state.input.requestedBurnMag = requested;
    state.input.clampedBurn = scale(norm(raw), Math.min(config.maxDvPerBurnEasy, requested));
  }

  const acceleration = (r) => {
    const d = mag(r);
    const inv = 1 / Math.max(1e-6, d * d * d);
    return scale(r, -config.mu * inv);
  };

  function updateConsoleExecution(dt) {
    if (state.waitTimer > 0) {
      state.waitTimer = Math.max(0, state.waitTimer - dt);
      return;
    }
    if (!state.activeCommand) {
      state.activeCommand = state.consoleQueue.shift() || null;
      renderQueue();
      if (!state.activeCommand) {
        state.consoleExecuting = false;
        logConsole("Queue complete.");
        return;
      }
    }
    if (state.activeCommand.type === "wait") {
      state.waitTimer = state.activeCommand.seconds;
      logConsole(`Waiting ${state.activeCommand.seconds.toFixed(2)} s`);
      state.activeCommand = null;
      return;
    }
    if (state.activeCommand.type === "burn") {
      applyBurn(computeBurnVectorFromMode(state.activeCommand.mode, state.activeCommand.dv), state.activeCommand.dv);
      logConsole(`Executed ${state.activeCommand.raw}`);
      state.activeCommand = null;
    }
  }

  function updateMath() {
    const r = mag(state.sat.r);
    const v = mag(state.sat.v);
    const vc = Math.sqrt(config.mu / Math.max(r, 1e-6));
    const eps = (v * v) / 2 - config.mu / Math.max(r, 1e-6);
    const h = Math.abs(state.sat.r.x * state.sat.v.y - state.sat.r.y * state.sat.v.x);
    const e = Math.sqrt(Math.max(0, 1 + (2 * eps * h * h) / (config.mu * config.mu)));
    state.math = { r, v, vcirc: vc, epsilon: eps, h, e };
  }

  function getSpeedTargetsForDifficulty() {
    const vCirc = state.math.vcirc;
    const targetSpeedHard = vCirc;
    const minRequiredEasy = config.minSpeedFactorEasy * vCirc;
    const coachTarget = state.difficulty === "easy" ? minRequiredEasy : targetSpeedHard;
    return { vCirc, targetSpeedHard, minRequiredEasy, coachTarget };
  }

  function updateObjective(dt) {
    const r = state.math.r;
    const v = state.math.v;
    const rMid = (config.targetBandMinR + config.targetBandMaxR) / 2;
    const vTarget = Math.sqrt(config.mu / rMid);
    const speedTargets = getSpeedTargetsForDifficulty();
    const speedOk = state.difficulty === "easy"
      ? v >= speedTargets.minRequiredEasy
      : Math.abs(v - vTarget) <= config.speedToleranceFrac * vTarget;
    const bandOk = r >= config.targetBandMinR && r <= config.targetBandMaxR;

    if (!bandOk) state.hasBeenOutsideBand = true;
    if (!state.hasEnteredBand && state.hasBeenOutsideBand && bandOk) {
      state.hasEnteredBand = true;
      setMessage("Band entry confirmed. Hold timer is now active when all constraints are met.");
    }
    if (!state.objectiveComplete && state.hasEnteredBand && bandOk && speedOk) {
      state.orbitHoldTime += dt;
    }
    if (!state.objectiveComplete && state.orbitHoldTime >= config.holdRequired) {
      state.objectiveComplete = true;
      state.running = false;
      state.paused = true;
      setMessage("Mission complete.");
      showResults();
    }
    ui.missionProgress.textContent = `In-band hold remaining: ${Math.max(0, config.holdRequired - state.orbitHoldTime).toFixed(1)} s`;
  }

  function updateScore() {
    const dvPenalty = Math.max(0, state.dvUsed - config.targetDv) * 0.7;
    const timePenalty = Math.max(0, state.timeElapsed - config.parTime) * 0.8;
    const safetyPenalty = state.difficulty === "hard" ? state.safetyPenalty * 8 : 0;
    state.score = clamp(100 - dvPenalty - timePenalty - safetyPenalty, 0, 100);
  }

  function physicsStep(dt) {
    state.sat.v = add(state.sat.v, scale(acceleration(state.sat.r), dt));
    state.sat.r = add(state.sat.r, scale(state.sat.v, dt));
    if (mag(state.sat.r) < config.safeMinR && state.difficulty === "hard") state.safetyPenalty += 0.06 * dt;
    if (state.showTrail) {
      state.trail.push({ x: state.sat.r.x, y: state.sat.r.y });
      if (state.trail.length > config.trailMaxPoints) state.trail.shift();
    }
    if (state.consoleExecuting && state.difficulty === "hard") updateConsoleExecution(dt);
    updateMath();
    updateObjective(dt);
    updateScore();
  }

  function showResults() {
    const dvPenalty = Math.max(0, state.dvUsed - config.targetDv) * 0.7;
    const timePenalty = Math.max(0, state.timeElapsed - config.parTime) * 0.8;
    const safetyPenalty = state.difficulty === "hard" ? state.safetyPenalty * 8 : 0;
    const score = Math.round(state.score);
    showCompletionBanner(score);
  }

  function getMedalFromScore(score) {
    if (score === 100) {
      return { icon: "★", label: "Star", cls: "medal-star" };
    }
    if (score >= 85) {
      return { icon: "🥇", label: "Gold", cls: "medal-gold" };
    }
    if (score >= 70) {
      return { icon: "🥈", label: "Silver", cls: "medal-silver" };
    }
    if (score >= 55) {
      return { icon: "🥉", label: "Bronze", cls: "medal-bronze" };
    }
    return { icon: "•", label: "Pass", cls: "medal-pass" };
  }

  function hideCompletionBanner() {
    ui.completionBanner.classList.add("hidden");
    if (state.bannerTimer) {
      clearTimeout(state.bannerTimer);
      state.bannerTimer = null;
    }
  }

  function showCompletionBanner(score) {
    const medal = getMedalFromScore(score);
    ui.bannerScore.textContent = `Final score: ${score} / 100`;
    ui.bannerMedalIcon.className = `medal-disc ${medal.cls}`;
    ui.bannerMedalIcon.textContent = medal.icon;
    ui.bannerMedalLabel.textContent = medal.label;
    ui.bannerWinWhy.textContent = `Why you won: You held the target orbit band while maintaining the required speed for ${config.holdRequired.toFixed(1)} seconds.`;
    ui.bannerBreakdown.textContent = `Δv: ${state.dvUsed.toFixed(2)}/${config.targetDv.toFixed(2)}  Time: ${state.timeElapsed.toFixed(2)}/${config.parTime.toFixed(2)}`;
    ui.completionBanner.classList.remove("hidden");

    if (state.bannerTimer) clearTimeout(state.bannerTimer);
    state.bannerTimer = setTimeout(() => {
      hideCompletionBanner();
    }, 8000);
  }

  function drawBackground() {
    const w = state.camera.w;
    const h = state.camera.h;
    const nebula = ctx.createRadialGradient(w * 0.25, h * 0.3, 10, w * 0.25, h * 0.3, w * 0.85);
    nebula.addColorStop(0, "#123d5d");
    nebula.addColorStop(0.4, "#0a223a");
    nebula.addColorStop(1, "#040a12");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, w, h);
    const nebula2 = ctx.createRadialGradient(w * 0.8, h * 0.2, 20, w * 0.8, h * 0.2, w * 0.55);
    nebula2.addColorStop(0, "rgba(100,70,130,0.22)");
    nebula2.addColorStop(1, "rgba(20,10,30,0)");
    ctx.fillStyle = nebula2;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < state.stars.length; i += 1) {
      const s = state.stars[i];
      ctx.globalAlpha = s.a + Math.sin((performance.now() * 0.001) + i) * 0.08;
      ctx.fillStyle = "#d8ecff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlanet() {
    const center = worldToScreen({ x: 0, y: 0 });
    const r = config.planetRadius * config.pxPerUnit;
    const lightDir = norm({ x: -0.8, y: -0.35 });
    ctx.save();
    ctx.translate(center.x, center.y);
    const atm = ctx.createRadialGradient(0, 0, r * 0.9, 0, 0, r + config.atmosphereThickness * config.pxPerUnit);
    atm.addColorStop(0, "rgba(120,210,255,0.25)");
    atm.addColorStop(1, "rgba(120,210,255,0)");
    ctx.fillStyle = atm;
    ctx.beginPath();
    ctx.arc(0, 0, r + config.atmosphereThickness * config.pxPerUnit, 0, Math.PI * 2);
    ctx.fill();
    const grd = ctx.createRadialGradient(-lightDir.x * r * 0.45, -lightDir.y * r * 0.45, r * 0.2, 0, 0, r);
    grd.addColorStop(0, "#6eaecf");
    grd.addColorStop(0.6, "#2f6686");
    grd.addColorStop(1, "#14293a");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(160,220,255,0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTargetBand() {
    const c = worldToScreen({ x: 0, y: 0 });
    const rMin = config.targetBandMinR * config.pxPerUnit;
    const rMax = config.targetBandMaxR * config.pxPerUnit;
    ctx.save();
    if (state.difficulty === "hard") {
      ctx.setLineDash([7, 9]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = "rgba(126,242,154,0.18)";
      ctx.beginPath();
      ctx.arc(c.x, c.y, rMin, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, c.y, rMax, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.strokeStyle = "rgba(126,242,154,0.26)";
      ctx.lineWidth = Math.max(1, rMax - rMin);
      ctx.beginPath();
      ctx.arc(c.x, c.y, (rMin + rMax) * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTrail() {
    if (!state.showTrail || state.trail.length < 2) return;
    ctx.save();
    ctx.lineWidth = 1.3;
    for (let i = 1; i < state.trail.length; i += 1) {
      const a = worldToScreen(state.trail[i - 1]);
      const b = worldToScreen(state.trail[i]);
      const alpha = i / state.trail.length;
      ctx.strokeStyle = `rgba(132,220,255,${alpha * 0.45})`;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSatellite() {
    const p = worldToScreen(state.sat.r);
    const r = config.satelliteRadius;
    ctx.save();
    ctx.fillStyle = "#f3fbff";
    ctx.strokeStyle = "#99d5ff";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - r - 5, p.y);
    ctx.lineTo(p.x + r + 5, p.y);
    ctx.moveTo(p.x, p.y - r - 5);
    ctx.lineTo(p.x, p.y + r + 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawVector(from, vecWorld, color, width) {
    const a = worldToScreen(from);
    const b = worldToScreen(add(from, vecWorld));
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAiming() {
    if (state.difficulty !== "easy" || !state.input.isAiming || !state.input.mouseWorld) return;
    const sat = state.sat.r;
    const sSat = worldToScreen(sat);
    const sMouse = worldToScreen(state.input.mouseWorld);
    const clampedEnd = worldToScreen(add(sat, scale(norm(sub(state.input.mouseWorld, sat)), mag(state.input.clampedBurn) / 0.16)));
    const burnMag = mag(state.input.clampedBurn);
    const glow = clamp(0.2 + burnMag / config.maxDvPerBurnEasy, 0.2, 1);
    ctx.save();
    ctx.strokeStyle = "rgba(147,190,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sSat.x, sSat.y);
    ctx.lineTo(sMouse.x, sMouse.y);
    ctx.stroke();
    ctx.shadowColor = `rgba(255,80,80,${glow})`;
    ctx.shadowBlur = 16 * glow;
    ctx.strokeStyle = `rgba(255,75,75,${0.7 + glow * 0.3})`;
    ctx.lineWidth = 3.3;
    ctx.beginPath();
    ctx.moveTo(sSat.x, sSat.y);
    ctx.lineTo(clampedEnd.x, clampedEnd.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawHudOverlay() {
    const fuelPct = (state.fuel / config.fuelMax) * 100;
    const barW = 170;
    const barH = 12;
    const x = 16;
    const y = 16;
    ctx.save();
    ctx.fillStyle = "rgba(5,16,30,0.6)";
    ctx.fillRect(x - 8, y - 10, 230, 66);
    ctx.strokeStyle = "rgba(158,211,255,0.5)";
    ctx.strokeRect(x - 8, y - 10, 230, 66);
    ctx.fillStyle = "rgba(18,39,60,0.9)";
    ctx.fillRect(x, y + 12, barW, barH);
    const fuelColor = fuelPct > 40 ? "#7ef29a" : fuelPct > 18 ? "#ffd36f" : "#ff7f87";
    ctx.fillStyle = fuelColor;
    ctx.fillRect(x, y + 12, barW * (fuelPct / 100), barH);
    ctx.strokeStyle = "rgba(240,250,255,0.65)";
    ctx.strokeRect(x, y + 12, barW, barH);
    ctx.fillStyle = "#dff5ff";
    ctx.font = "13px Trebuchet MS";
    ctx.fillText(`Fuel ${fuelPct.toFixed(1)}%`, x, y + 9);
    if (state.showMathHud) {
      ctx.shadowColor = "rgba(80,220,255,0.65)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(194,240,255,0.96)";
      ctx.font = "14px Consolas, monospace";
      const mx = 16;
      const my = y + 47;
      ctx.fillText(`v_circ = sqrt(mu/r) = ${state.math.vcirc.toFixed(3)}`, mx, my + 20);
      ctx.fillText(`epsilon = v^2/2 - mu/r = ${state.math.epsilon.toFixed(3)}`, mx, my + 40);
      ctx.fillText(`h = |r x v| = ${state.math.h.toFixed(3)}`, mx, my + 60);
      ctx.fillText(`e = ${state.math.e.toFixed(5)}`, mx, my + 80);
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, state.camera.w, state.camera.h);
    drawBackground();
    drawTargetBand();
    drawTrail();
    drawPlanet();
    drawSatellite();
    if (state.showVectors) {
      drawVector(state.sat.r, scale(state.sat.v, 10), "rgba(84,230,255,0.92)", 1.6);
      drawVector(state.sat.r, scale(acceleration(state.sat.r), 2300), "rgba(255,146,146,0.8)", 1.2);
    }
    drawAiming();
    drawHudOverlay();
  }

  function updateUi() {
    const rMid = (config.targetBandMinR + config.targetBandMaxR) / 2;
    const vTarget = Math.sqrt(config.mu / rMid);
    const speed = state.math.v;
    const speedTargets = getSpeedTargetsForDifficulty();
    const vCirc = speedTargets.vCirc;
    const minRequiredEasy = speedTargets.minRequiredEasy;
    ui.statusText.textContent = state.message;
    ui.missionBand.textContent = `Target band radius: ${config.targetBandMinR.toFixed(0)} to ${config.targetBandMaxR.toFixed(0)}`;
    ui.missionSpeed.innerHTML =
      `Target v_circ: ${vCirc.toFixed(2)} u/s` +
      `<br>Speed: ${speed.toFixed(2)} u/s` +
      (state.difficulty === "easy"
        ? `<br>Min speed (Easy): ${minRequiredEasy.toFixed(2)} u/s`
        : `<br>Speed tolerance (Hard): ${vTarget.toFixed(2)} +/- ${(config.speedToleranceFrac * 100).toFixed(1)}%`);
    ui.missionTangential.textContent = "";
    ui.missionHold.textContent = `Hold time required: ${config.holdRequired.toFixed(1)} s`;
    ui.missionEntry.textContent = `Entered band: ${state.hasEnteredBand ? "✓ / ✗" : "✗ / ✓"}`;
    ui.missionRule.textContent = "Hold timer only starts after band entry.";
    ui.missionGuidance.textContent = state.difficulty === "hard"
      ? "Perform orbit insertion: adjust prograde/radial burns to merge into the target band."
      : "Use mouse burns to enter the target band, then trim speed and radial drift.";
    ui.scoreLive.textContent = `Score: ${state.score.toFixed(2)} / 100`;
    ui.dvLive.textContent = `Delta-v: ${state.dvUsed.toFixed(2)} / ${config.targetDv.toFixed(2)}`;
    ui.timeLive.textContent = `Time: ${state.timeElapsed.toFixed(2)} / ${config.parTime.toFixed(2)} s`;
    ui.safetyLive.textContent = `Safety penalties: ${state.difficulty === "hard" ? (state.safetyPenalty * 8).toFixed(2) : "0.00"}`;

    if (state.running) {
      let text = "";
      const coachTarget = speedTargets.coachTarget;
      if (speed < coachTarget) {
        text = "Too slow: You're below the target orbital speed at this radius, so gravity pulls you inward faster than you can move sideways.";
      } else if (state.difficulty === "easy" && speed > 30) {
        text = "Too fast: Your speed is well above what's needed for this orbit, increasing orbital energy and wasting fuel.";
      } else if (state.difficulty === "hard" && speed > 35) {
        text = "Too fast: Your speed is far above what's needed, making the orbit harder to control and inefficient.";
      } else {
        text = state.difficulty === "easy"
          ? "Good speed: You're near the target orbital speed, so sideways motion balances gravity and keeps you stable."
          : "Good speed: You're near the target orbital speed, allowing gravity and sideways motion to balance.";
      }
      ui.orbitExplainOverlay.innerHTML =
        state.difficulty === "easy"
          ? `${text}<br>Speed: ${speed.toFixed(2)}  Target (Min): ${coachTarget.toFixed(2)}`
          : `${text}<br>Speed: ${speed.toFixed(2)}  Target: ${coachTarget.toFixed(2)}`;
      ui.orbitExplainOverlay.classList.remove("hidden");
    } else {
      ui.orbitExplainOverlay.classList.add("hidden");
    }
  }

  function animateFrame(ts) {
    if (!animateFrame.lastTs) animateFrame.lastTs = ts;
    let dt = (ts - animateFrame.lastTs) / 1000;
    animateFrame.lastTs = ts;
    dt = Math.min(config.dtMax, Math.max(0, dt));
    updateAim();
    if (state.running && !state.paused && !state.objectiveComplete) {
      state.timeElapsed += dt;
      physicsStep(dt);
    }
    draw();
    requestAnimationFrame(animateFrame);
  }

  function isTyping() {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  function hookEvents() {
    window.addEventListener("resize", () => {
      resizeCanvasToFit();
      if (!state.running) {
        setSpawnState();
        updateMath();
      }
    });
    ui.difficultySelect.addEventListener("change", () => {
      syncDifficulty();
      resetSimulation();
      setMessage(state.difficulty === "hard" ? "HARD mode: use console commands." : "EASY mode: mouse burns enabled.");
    });
    ui.runBtn.addEventListener("click", () => {
      if (!state.missionStarted) {
        setMessage("Choose a difficulty and click Start Mission.");
        return;
      }
      state.running = true;
      state.paused = false;
      setMessage("Simulation running.");
    });
    ui.pauseBtn.addEventListener("click", () => {
      if (!state.running) return;
      state.paused = !state.paused;
      setMessage(state.paused ? "Simulation paused." : "Simulation resumed.");
    });
    ui.resetBtn.addEventListener("click", resetSimulation);
    ui.burnBtn.addEventListener("click", applyEasyBurnFromAim);
    ui.trailToggle.addEventListener("change", () => {
      state.showTrail = ui.trailToggle.checked;
      if (!state.showTrail) state.trail = [];
    });
    ui.vectorsToggle.addEventListener("change", () => {
      state.showVectors = ui.vectorsToggle.checked;
    });
    ui.mathToggle.addEventListener("change", () => {
      state.showMathHud = ui.mathToggle.checked;
    });
    canvas.addEventListener("mousedown", (ev) => {
      if (state.difficulty !== "easy") return;
      const world = screenToWorldFromEvent(ev);
      if (mag(sub(world, state.sat.r)) > 20) return;
      state.input.isAiming = true;
      state.input.mouseWorld = world;
    });
    canvas.addEventListener("mousemove", (ev) => {
      if (!state.input.isAiming || state.difficulty !== "easy") return;
      state.input.mouseWorld = screenToWorldFromEvent(ev);
    });
    window.addEventListener("mouseup", () => {
      state.input.isAiming = false;
    });
    ui.consoleInput.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      parseConsoleCommand(ui.consoleInput.value);
      ui.consoleInput.value = "";
    });
    window.addEventListener("keydown", (ev) => {
      if (isTyping()) return;
      if (ev.key.toLowerCase() === "b") applyEasyBurnFromAim();
      else if (ev.key === " ") {
        ev.preventDefault();
        if (state.running) {
          state.paused = !state.paused;
          setMessage(state.paused ? "Simulation paused." : "Simulation resumed.");
        }
      } else if (ev.key.toLowerCase() === "r") resetSimulation();
    });
    ui.helpButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        ui.helpBox.textContent = helpText[btn.getAttribute("data-metric")] || "";
      });
    });

    ui.bannerCloseBtn.addEventListener("click", hideCompletionBanner);
  }

  function ensureCanvasAttribution() {
    const host = canvas.parentElement;
    if (!host || host.querySelector(".canvas-attribution")) return;
    const tag = document.createElement("div");
    tag.className = "canvas-attribution";
    tag.textContent = "Orbit Lab (c) 2026 Shiv Prahalathan";
    host.appendChild(tag);
  }

  function ensureTutorialTooltip() {
    const panel = document.querySelector(".panel");
    if (!panel || panel.querySelector(".tutorial-wrap")) return;
    const header = panel.querySelector("h1");
    const wrap = document.createElement("div");
    wrap.className = "tutorial-wrap";
    wrap.innerHTML =
      `<span class="tutorial-trigger">Tutorial?</span>` +
      `<div class="tutorial-tooltip">Goal: Enter the target orbit band and keep the required speed until the hold timer finishes. Easy mode: drag from the satellite to aim a burn, then press Burn. Hard mode: queue console commands and press Execute, then use Pause or Reset to retry.</div>`;
    if (header) {
      header.insertAdjacentElement("afterend", wrap);
    } else {
      panel.prepend(wrap);
    }
  }

  function ensureStartOverlay() {
    const host = canvas.parentElement;
    if (!host || host.querySelector(".start-overlay")) return;
    let selectedDifficulty = "easy";

    const overlay = document.createElement("div");
    overlay.className = "start-overlay";
    overlay.innerHTML =
      `<div class="start-panel">` +
      `<h2 class="start-title">Orbit Lab</h2>` +
      `<p class="start-help">Choose a difficulty to begin.</p>` +
      `<div class="start-difficulty-row">` +
      `<button type="button" class="start-difficulty-btn active" data-difficulty="easy">Easy</button>` +
      `<button type="button" class="start-difficulty-btn" data-difficulty="hard">Hard</button>` +
      `</div>` +
      `<button type="button" class="start-primary">Start Mission</button>` +
      `</div>`;

    const difficultyButtons = Array.from(overlay.querySelectorAll(".start-difficulty-btn"));
    const startBtn = overlay.querySelector(".start-primary");

    function syncStartDifficultyButtons() {
      difficultyButtons.forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-difficulty") === selectedDifficulty);
      });
    }

    difficultyButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDifficulty = btn.getAttribute("data-difficulty") === "hard" ? "hard" : "easy";
        syncStartDifficultyButtons();
      });
    });

    startBtn.addEventListener("click", () => {
      ui.difficultySelect.value = selectedDifficulty;
      syncDifficulty();
      resetSimulation();
      state.missionStarted = true;
      state.running = true;
      state.paused = false;
      setMessage("Simulation running.");
      overlay.remove();
    });

    host.appendChild(overlay);
  }

  const hardBackgroundCache = {
    mode: null,
    canvas: null,
    twinkle: []
  };

  function invalidateHardBackgroundCache() {
    hardBackgroundCache.canvas = null;
    hardBackgroundCache.twinkle = [];
  }

  function buildHardBackgroundCache() {
    const w = Math.max(1, Math.floor(state.camera.w));
    const h = Math.max(1, Math.floor(state.camera.h));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const bctx = c.getContext("2d");
    const minDim = Math.min(w, h);

    const deep = bctx.createLinearGradient(0, 0, 0, h);
    deep.addColorStop(0, "#050a16");
    deep.addColorStop(0.52, "#0a1230");
    deep.addColorStop(1, "#1a1028");
    bctx.fillStyle = deep;
    bctx.fillRect(0, 0, w, h);

    const clouds = 36;
    const palette = [
      [94, 132, 146],
      [111, 97, 139],
      [130, 93, 131]
    ];
    for (let i = 0; i < clouds; i += 1) {
      const cx = randRange(-0.15 * w, 1.15 * w);
      const cy = randRange(-0.1 * h, 1.1 * h);
      const radius = randRange(minDim * 0.22, minDim * 0.5);
      const color = palette[Math.floor(Math.random() * palette.length)];
      let alpha = randRange(0.04, 0.12);
      if (cx < w * 0.34 && cy < h * 0.34) alpha *= 0.55;
      const g = bctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      g.addColorStop(0, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha.toFixed(3)})`);
      g.addColorStop(0.58, `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${(alpha * 0.45).toFixed(3)})`);
      g.addColorStop(1, `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0)`);
      bctx.fillStyle = g;
      bctx.beginPath();
      bctx.arc(cx, cy, radius, 0, Math.PI * 2);
      bctx.fill();
    }

    const starCount = Math.floor((w * h) / 1900);
    const twinkleStars = [];
    for (let i = 0; i < starCount; i += 1) {
      const p = Math.random();
      let s;
      let a;
      if (p < 0.82) {
        s = randRange(0.35, 1.05);
        a = randRange(0.2, 0.55);
      } else if (p < 0.97) {
        s = randRange(1.05, 1.8);
        a = randRange(0.32, 0.72);
      } else {
        s = randRange(1.8, 2.5);
        a = randRange(0.5, 0.9);
      }
      const x = Math.random() * w;
      const y = Math.random() * h;
      bctx.globalAlpha = a;
      bctx.fillStyle = "#d7e9ff";
      bctx.beginPath();
      bctx.arc(x, y, s, 0, Math.PI * 2);
      bctx.fill();
      if (Math.random() < 0.08) {
        twinkleStars.push({
          x,
          y,
          s: Math.max(0.5, s * 0.9),
          baseA: Math.min(0.34, a * 0.42),
          phase: Math.random() * Math.PI * 2,
          speed: randRange(0.25, 0.65),
          amp: randRange(0.035, 0.09)
        });
      }
    }
    bctx.globalAlpha = 1;

    const vignette = bctx.createRadialGradient(w * 0.5, h * 0.5, minDim * 0.2, w * 0.5, h * 0.5, minDim * 0.88);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.26)");
    bctx.fillStyle = vignette;
    bctx.fillRect(0, 0, w, h);

    hardBackgroundCache.canvas = c;
    hardBackgroundCache.twinkle = twinkleStars;
  }

  function drawBackground() {
    const w = state.camera.w;
    const h = state.camera.h;

    if (hardBackgroundCache.mode !== state.difficulty) {
      hardBackgroundCache.mode = state.difficulty;
      invalidateHardBackgroundCache();
    }

    if (state.difficulty === "hard") {
      if (!hardBackgroundCache.canvas || hardBackgroundCache.canvas.width !== w || hardBackgroundCache.canvas.height !== h) {
        buildHardBackgroundCache();
      }
      ctx.drawImage(hardBackgroundCache.canvas, 0, 0, w, h);
      if (hardBackgroundCache.twinkle.length > 0) {
        const t = performance.now() * 0.00012;
        ctx.save();
        ctx.fillStyle = "#e4f0ff";
        for (let i = 0; i < hardBackgroundCache.twinkle.length; i += 1) {
          const s = hardBackgroundCache.twinkle[i];
          const a = s.baseA + Math.sin(t * s.speed + s.phase) * s.amp;
          if (a <= 0.01) continue;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      return;
    }

    const nebula = ctx.createRadialGradient(w * 0.25, h * 0.3, 10, w * 0.25, h * 0.3, w * 0.85);
    nebula.addColorStop(0, "#123d5d");
    nebula.addColorStop(0.4, "#0a223a");
    nebula.addColorStop(1, "#040a12");
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, w, h);
    const nebula2 = ctx.createRadialGradient(w * 0.8, h * 0.2, 20, w * 0.8, h * 0.2, w * 0.55);
    nebula2.addColorStop(0, "rgba(100,70,130,0.22)");
    nebula2.addColorStop(1, "rgba(20,10,30,0)");
    ctx.fillStyle = nebula2;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < state.stars.length; i += 1) {
      const s = state.stars[i];
      ctx.globalAlpha = s.a + Math.sin((performance.now() * 0.001) + i) * 0.08;
      ctx.fillStyle = "#d8ecff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const hardPlanetCache = {
    mode: null,
    key: "",
    canvas: null
  };
  const easyPlanetCache = {
    key: "",
    canvas: null
  };
  let planetVisualMode = null;

  function drawSoftEllipseBlob(targetCtx, cx, cy, rx, ry, rot, rgbaCore, rgbaEdge) {
    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.rotate(rot);
    targetCtx.scale(1, ry / Math.max(1e-6, rx));
    const g = targetCtx.createRadialGradient(0, 0, rx * 0.18, 0, 0, rx);
    g.addColorStop(0, rgbaCore);
    g.addColorStop(1, rgbaEdge);
    targetCtx.fillStyle = g;
    targetCtx.beginPath();
    targetCtx.arc(0, 0, rx, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.restore();
  }

  function buildEasyPlanetSprite() {
    const r = config.planetRadius * config.pxPerUnit;
    const atm = config.atmosphereThickness * config.pxPerUnit;
    const pad = Math.ceil(r + atm + 20);
    const size = pad * 2;
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const pctx = sprite.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;

    const outerAtm = pctx.createRadialGradient(cx, cy, r * 0.95, cx, cy, r + atm * 0.9);
    outerAtm.addColorStop(0, "rgba(120, 205, 255, 0.18)");
    outerAtm.addColorStop(1, "rgba(120, 205, 255, 0)");
    pctx.fillStyle = outerAtm;
    pctx.beginPath();
    pctx.arc(cx, cy, r + atm, 0, Math.PI * 2);
    pctx.fill();

    const ocean = pctx.createRadialGradient(cx - r * 0.42, cy - r * 0.34, r * 0.12, cx, cy, r);
    ocean.addColorStop(0, "#709fbe");
    ocean.addColorStop(0.5, "#2a668f");
    ocean.addColorStop(1, "#163a58");
    pctx.fillStyle = ocean;
    pctx.beginPath();
    pctx.arc(cx, cy, r, 0, Math.PI * 2);
    pctx.fill();

    pctx.save();
    pctx.beginPath();
    pctx.arc(cx, cy, r, 0, Math.PI * 2);
    pctx.clip();

    const largeContinents = [
      { x: -0.43, y: -0.22, rx: 0.36, ry: 0.22, rot: -0.55, tint: 0 },
      { x: -0.11, y: -0.02, rx: 0.34, ry: 0.2, rot: 0.23, tint: 1 },
      { x: 0.28, y: -0.18, rx: 0.3, ry: 0.18, rot: 0.56, tint: 0 },
      { x: 0.36, y: 0.13, rx: 0.27, ry: 0.16, rot: -0.28, tint: 2 },
      { x: -0.27, y: 0.23, rx: 0.3, ry: 0.18, rot: 0.36, tint: 0 },
      { x: 0.03, y: 0.22, rx: 0.26, ry: 0.15, rot: -0.18, tint: 1 }
    ];
    const mediumPatches = [
      { x: -0.02, y: -0.34, rx: 0.16, ry: 0.09, rot: 0.1, tint: 1 },
      { x: 0.12, y: -0.36, rx: 0.14, ry: 0.08, rot: -0.42, tint: 0 },
      { x: -0.35, y: 0.06, rx: 0.18, ry: 0.11, rot: 0.62, tint: 2 },
      { x: 0.18, y: 0.34, rx: 0.16, ry: 0.1, rot: 0.48, tint: 1 },
      { x: -0.48, y: -0.02, rx: 0.13, ry: 0.08, rot: -0.1, tint: 0 },
      { x: 0.46, y: -0.04, rx: 0.12, ry: 0.07, rot: 0.25, tint: 2 },
      { x: -0.19, y: 0.4, rx: 0.11, ry: 0.07, rot: 0.15, tint: 1 }
    ];
    const islandClusters = [
      { x: -0.52, y: -0.16, rx: 0.08, ry: 0.05, rot: 0.12, tint: 0 },
      { x: -0.46, y: 0.2, rx: 0.07, ry: 0.045, rot: -0.42, tint: 1 },
      { x: -0.31, y: 0.42, rx: 0.07, ry: 0.04, rot: 0.52, tint: 2 },
      { x: 0.12, y: 0.44, rx: 0.065, ry: 0.04, rot: -0.25, tint: 0 },
      { x: 0.42, y: 0.32, rx: 0.07, ry: 0.045, rot: 0.31, tint: 1 },
      { x: 0.53, y: 0.09, rx: 0.06, ry: 0.038, rot: -0.12, tint: 2 },
      { x: 0.5, y: -0.24, rx: 0.075, ry: 0.045, rot: 0.49, tint: 0 },
      { x: -0.04, y: -0.46, rx: 0.06, ry: 0.036, rot: -0.62, tint: 1 }
    ];
    const landPalette = [
      ["rgba(86, 136, 72, 0.47)", "rgba(86, 136, 72, 0)"],
      ["rgba(102, 146, 78, 0.44)", "rgba(102, 146, 78, 0)"],
      ["rgba(124, 111, 82, 0.26)", "rgba(124, 111, 82, 0)"]
    ];
    function drawLandGroup(group, sizeMul, alphaMul, textureCount) {
      group.forEach((c) => {
        const bx = cx + c.x * r;
        const by = cy + c.y * r;
        const land = landPalette[c.tint % landPalette.length];
        drawSoftEllipseBlob(
          pctx,
          bx + r * 0.008,
          by + r * 0.008,
          c.rx * r * (sizeMul * 1.08),
          c.ry * r * (sizeMul * 1.05),
          c.rot,
          `rgba(72, 84, 64, ${(0.08 * alphaMul).toFixed(3)})`,
          "rgba(72, 84, 64, 0)"
        );
        drawSoftEllipseBlob(
          pctx,
          bx,
          by,
          c.rx * r * sizeMul,
          c.ry * r * sizeMul,
          c.rot,
          land[0].replace(/0\.\d+\)/, `${(parseFloat(land[0].match(/0\.\d+/)[0]) * alphaMul).toFixed(3)})`),
          land[1]
        );
        drawSoftEllipseBlob(
          pctx,
          bx - r * 0.018,
          by + r * 0.01,
          c.rx * r * sizeMul * 0.68,
          c.ry * r * sizeMul * 0.62,
          c.rot + 0.14,
          `rgba(112, 96, 70, ${(0.12 * alphaMul).toFixed(3)})`,
          "rgba(112, 96, 70, 0)"
        );
        for (let t = 0; t < textureCount; t += 1) {
          const ox = randRange(-0.55, 0.55) * c.rx * r * sizeMul;
          const oy = randRange(-0.55, 0.55) * c.ry * r * sizeMul;
          const texSize = randRange(r * 0.012, r * 0.028) * sizeMul;
          const texCore = Math.random() > 0.5
            ? `rgba(82, 122, 68, ${randRange(0.035, 0.065).toFixed(3)})`
            : `rgba(118, 102, 76, ${randRange(0.02, 0.048).toFixed(3)})`;
          drawSoftEllipseBlob(
            pctx,
            bx + ox,
            by + oy,
            texSize,
            texSize * randRange(0.62, 1.45),
            randRange(-0.9, 0.9),
            texCore,
            "rgba(0, 0, 0, 0)"
          );
        }
      });
    }
    drawLandGroup(largeContinents, 1, 1, 3);
    drawLandGroup(mediumPatches, 0.9, 0.92, 2);
    drawLandGroup(islandClusters, 0.72, 0.88, 1);

    const clouds = [
      { x: -0.3, y: -0.07, rx: 0.24, ry: 0.07, rot: -0.22, a: 0.12 },
      { x: 0.15, y: -0.14, rx: 0.22, ry: 0.062, rot: 0.18, a: 0.11 },
      { x: 0.07, y: 0.21, rx: 0.26, ry: 0.078, rot: -0.45, a: 0.1 },
      { x: -0.08, y: 0.3, rx: 0.2, ry: 0.055, rot: 0.12, a: 0.095 }
    ];
    clouds.forEach((cl) => {
      drawSoftEllipseBlob(
        pctx,
        cx + cl.x * r,
        cy + cl.y * r,
        cl.rx * r,
        cl.ry * r,
        cl.rot,
        `rgba(248, 252, 255, ${cl.a.toFixed(3)})`,
        "rgba(248, 252, 255, 0)"
      );
    });

    const terminator = pctx.createLinearGradient(cx - r * 0.18, cy, cx + r * 1.03, cy);
    terminator.addColorStop(0, "rgba(11, 33, 51, 0)");
    terminator.addColorStop(1, "rgba(11, 33, 51, 0.34)");
    pctx.fillStyle = terminator;
    pctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    pctx.restore();

    pctx.strokeStyle = "rgba(138, 218, 255, 0.34)";
    pctx.lineWidth = 1.5;
    pctx.beginPath();
    pctx.arc(cx, cy, r + 0.5, 0, Math.PI * 2);
    pctx.stroke();

    easyPlanetCache.canvas = sprite;
  }

  function drawHardRingBands(targetCtx, cx, cy, innerRx, outerRx, innerRy, outerRy, alphaScale) {
    const bands = 34;
    for (let i = 0; i < bands; i += 1) {
      const t = i / Math.max(1, bands - 1);
      const rx = innerRx + (outerRx - innerRx) * t;
      const ry = innerRy + (outerRy - innerRy) * t;
      const edgeFade = 1 - Math.abs(t - 0.5) * 1.7;
      const cassiniDip = Math.abs(t - 0.6) < 0.045 ? 0.28 : 1;
      const a = clamp((0.028 + edgeFade * 0.07) * cassiniDip * alphaScale, 0, 0.18);
      const warm = 172 + Math.floor(20 * t);
      const cool = 176 + Math.floor(14 * (1 - t));
      targetCtx.strokeStyle = `rgba(${warm}, ${cool}, ${188 + Math.floor(12 * t)}, ${a.toFixed(3)})`;
      targetCtx.lineWidth = 1 + (t > 0.72 ? 0.2 : 0);
      targetCtx.beginPath();
      targetCtx.ellipse(cx, cy, rx, ry, -0.22, 0, Math.PI * 2);
      targetCtx.stroke();
    }
  }

  function buildHardPlanetSprite() {
    const r = config.planetRadius * config.pxPerUnit;
    const atm = config.atmosphereThickness * config.pxPerUnit;
    const outerRingRx = r * 2.15;
    const outerRingRy = r * 0.62;
    const pad = Math.ceil(Math.max(outerRingRx, r + atm) + 22);
    const size = pad * 2;
    const sprite = document.createElement("canvas");
    sprite.width = size;
    sprite.height = size;
    const pctx = sprite.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;

    const innerRingRx = r * 1.32;
    const innerRingRy = r * 0.38;

    pctx.save();
    pctx.beginPath();
    pctx.rect(0, 0, size, cy + 1);
    pctx.clip();
    drawHardRingBands(pctx, cx, cy, innerRingRx, outerRingRx, innerRingRy, outerRingRy, 0.9);
    pctx.restore();

    pctx.save();
    const atmGlow = pctx.createRadialGradient(cx, cy, r * 0.92, cx, cy, r + atm * 0.96);
    atmGlow.addColorStop(0, "rgba(210, 196, 168, 0.16)");
    atmGlow.addColorStop(1, "rgba(210, 196, 168, 0)");
    pctx.fillStyle = atmGlow;
    pctx.beginPath();
    pctx.arc(cx, cy, r + atm, 0, Math.PI * 2);
    pctx.fill();

    const sphere = pctx.createRadialGradient(cx - r * 0.42, cy - r * 0.36, r * 0.12, cx, cy, r);
    sphere.addColorStop(0, "#e8d9b9");
    sphere.addColorStop(0.58, "#c8af86");
    sphere.addColorStop(1, "#8d7354");
    pctx.fillStyle = sphere;
    pctx.beginPath();
    pctx.arc(cx, cy, r, 0, Math.PI * 2);
    pctx.fill();

    pctx.beginPath();
    pctx.arc(cx, cy, r, 0, Math.PI * 2);
    pctx.clip();
    for (let y = -r; y <= r; y += Math.max(2, r * 0.075)) {
      const normalized = (y + r) / (2 * r);
      const stripe = 0.03 + 0.03 * Math.sin(normalized * Math.PI * 10.5);
      pctx.fillStyle = `rgba(120, 98, 74, ${stripe.toFixed(3)})`;
      pctx.fillRect(cx - r, cy + y, r * 2, Math.max(1.4, r * 0.04));
    }
    const terminator = pctx.createLinearGradient(cx - r * 0.1, cy, cx + r * 1.05, cy);
    terminator.addColorStop(0, "rgba(44,32,22,0)");
    terminator.addColorStop(1, "rgba(44,32,22,0.34)");
    pctx.fillStyle = terminator;
    pctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    pctx.fillStyle = "rgba(35, 31, 28, 0.12)";
    pctx.beginPath();
    pctx.ellipse(cx + r * 0.02, cy + r * 0.03, r * 1.08, r * 0.29, -0.22, 0, Math.PI * 2);
    pctx.fill();
    pctx.restore();

    pctx.strokeStyle = "rgba(236, 221, 185, 0.24)";
    pctx.lineWidth = 1.8;
    pctx.beginPath();
    pctx.arc(cx, cy, r, 0, Math.PI * 2);
    pctx.stroke();

    pctx.save();
    pctx.beginPath();
    pctx.rect(0, cy - 1, size, size - cy + 1);
    pctx.clip();
    drawHardRingBands(pctx, cx, cy, innerRingRx, outerRingRx, innerRingRy, outerRingRy, 1.08);
    pctx.restore();

    hardPlanetCache.canvas = sprite;
  }

  function drawPlanet() {
    const center = worldToScreen({ x: 0, y: 0 });
    const r = config.planetRadius * config.pxPerUnit;

    if (planetVisualMode !== state.difficulty) {
      planetVisualMode = state.difficulty;
      easyPlanetCache.canvas = null;
      easyPlanetCache.key = "";
      hardPlanetCache.mode = state.difficulty;
      hardPlanetCache.canvas = null;
      hardPlanetCache.key = "";
    }

    if (state.difficulty === "hard") {
      const key = `${state.camera.w}x${state.camera.h}:${r.toFixed(2)}`;
      if (!hardPlanetCache.canvas || hardPlanetCache.key !== key) {
        hardPlanetCache.key = key;
        buildHardPlanetSprite();
      }
      const sprite = hardPlanetCache.canvas;
      ctx.drawImage(sprite, center.x - sprite.width / 2, center.y - sprite.height / 2);
      return;
    }

    const easyKey = `${state.camera.w}x${state.camera.h}:${r.toFixed(2)}`;
    if (!easyPlanetCache.canvas || easyPlanetCache.key !== easyKey) {
      easyPlanetCache.key = easyKey;
      buildEasyPlanetSprite();
    }
    const easySprite = easyPlanetCache.canvas;
    ctx.drawImage(easySprite, center.x - easySprite.width / 2, center.y - easySprite.height / 2);
  }

  function boot() {
    ensureCanvasAttribution();
    ensureTutorialTooltip();
    ensureStartOverlay();
    hookEvents();
    resizeCanvasToFit();
    syncDifficulty();
    resetSimulation();
    ui.helpBox.textContent = "Select a metric to view equation details.";
    renderQueue();
    requestAnimationFrame(animateFrame);
    setInterval(updateUi, 120);
  }

  boot();
})();
