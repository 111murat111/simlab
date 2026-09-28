# Brief for sim-rebuild agents (read fully before starting)

## Goal
SimLab (/root/simlab) has 63 Three.js educational simulations. The owner rejected their visuals as primitive. EVERY sim
must now reach at least the visual quality of the "Açık Deniz" reference (reference/acik-deniz.png) — the target is to
exceed it. One standard for all sims, no tiering, no exceptions for abstract topics. A new visual engine exists for this.

## Read first (in this order)
1. QUALITY.md — the checklist every sim must pass.
2. SIM_GUIDE.md — rules + "Görsel motor" section (engine API) + verification commands.
3. src/sims/ruzgar-turbini/main.js — worked example of a sim rebuilt on the engine (compare with dev/orig/ruzgar-turbini/main.js
   to see exactly what changed); its screenshot: shots/ruzgar-turbini.png.
4. dev/lab.js — small engine demo scenes (ocean, coast+vegetation, studio, space, materials).
5. Skim src/core/gfx/{atmosphere,terrain,vegetation,materials,stage,ocean}.js and src/core/look.js for options.

## For each sim in your list (strictly one at a time, in the given order)
1. Read src/sims/<id>/ (main.js + helpers). The originals are backed up in dev/orig/<id>/.
2. Keep the science model, formulas, UI panel, controls, info text and behaviour. Rebuild the VISUAL scene on the engine:
   - pick the environment: `sky` (outdoor; + landscape/createTerrain/terrainSkirt/createVegetation/createOcean as fits),
     `studio` (objects, lab bench, body/micro scenes — or better, a real modelled room/bench with mat.* materials),
     `space` (astronomy/orbits);
   - remove `background`, `fog`, custom Hemisphere/Directional lights; the engine lights the scene;
   - every visible object gets engine materials (mat.*) or a procedural() material; no bare box/cylinder/sphere as a
     finished object — bevels, lathe profiles, extrusions, detail parts, variation; real-world scale in metres;
   - abstract topics (finance, misinformation, language, AI) get a concrete, photographic 3D metaphor/setting (e.g. a
     real city at dusk, a trading floor, an office desk with a monitor, a library, a village square) — still realistic;
   - data overlays (particles, heat maps, labels, graphs in 3D) sit on top of the realistic scene and stay toggleable;
     particles use soft round sprites, not square pixels.
3. Build: `cd /root/simlab && node build.mjs --only <id>` (must be error-free).
4. Capture and LOOK at it: `cd /root/simlab && flock /tmp/simlab-smoke.lock timeout 600 node dev/shot.mjs "file:///root/simlab/dist/sims/<id>/index.html?low" shots/<id>.png 8000 960 540`
   then Read shots/<id>.png. Judge it honestly against reference/acik-deniz.png and QUALITY.md. Console errors printed by
   shot.mjs must be fixed. Fix and recapture. Budget: at most 3 captures per sim (software WebGL: each capture 1–6 min and
   the single Chromium slot is shared by all agents and the lead), then move on.
5. Final functional check: `cd /root/simlab && SHOT_DIR=/root/simlab/shots flock /tmp/simlab-smoke.lock timeout 900 node smoke.mjs <id>` → must print ✓.
   (It exercises every slider/button; fix any error it reports.)

## Hard rules
- Do NOT edit anything outside src/sims/<your ids>/ (no src/core, build.mjs, smoke.mjs, catalog, style, QUALITY/SIM_GUIDE,
  other agents' sims). If the engine lacks something (e.g. underwater caustics, planet shader, human body), implement it
  locally inside the sim folder (helper file) and mention it in your report.
- Import only from '@core'. No CDN, network, external files; everything offline. All UI text Turkish with correct letters.
- Keep science accurate; do not invent numbers. Do not add gamification (no new scores/badges/win-lose).
- Only one Chromium at a time: ALWAYS wrap shot.mjs / smoke.mjs in `flock /tmp/simlab-smoke.lock`. Never `pkill -f`.
  Never run a sleep-polling loop; run commands in the foreground with timeouts.
- Do not spawn subagents. Low RAM server: no parallel heavy processes.
- Performance: must stay smooth on a mid laptop; `?low` / phones scale down (engine does most of it). InstancedMesh for crowds.

## Report (final message, compact)
A table: id | PASS / BELOW-BAR | environment used | 1-line summary of the new scene | known remaining issues.
PASS only if you would put the screenshot next to reference/acik-deniz.png without embarrassment. Be honest.
