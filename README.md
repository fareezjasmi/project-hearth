# Project Hearth — AI Civilization Sandbox

A TypeScript / Three.js / Vite civilization sandbox with two autonomous settlements, family and town growth, militia recruitment, a local rival commander, capital conquest, and articulated combat ragdolls. Each settlement starts with ten residents and its own economy.

## Launch

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173/. Use Node.js 20.19+ or 22.12+ (the workspace uses Node 26). `npm run build` performs TypeScript compilation and creates the client bundle. `npm run preview` serves that bundle with the same local Jev connection endpoints. A static `dist` upload alone supports local decisions but cannot connect to Jev; the server plugin is required. For the public build see **Hosting** below — the hosted demo is that static build, so it labels itself local-only.

## Connect your Jev key

1. Click **Connect Jev ↗** at the top right.
2. Paste your TypeSafe API key into the password field.
3. Click **Connect & use Jev**. The server checks the model catalog and clears the field.
4. Close the panel to resume village time. Open **Decisions** on the right to see live choices labeled **Jev** or **Local**.

The key is sent to the loopback server, used by the official `@typesafe-ai/sdk`, and held only in memory for this browser session. It is never placed in a URL, browser storage, project file, response, or application log. An HttpOnly / SameSite cookie identifies the session; it contains no API key. **Remove key** clears it and aborts pending calls. Restarting the server clears all keys. Sessions expire after eight hours of inactivity. Refreshing the page retains the connection but leaves Jev disabled until you explicitly enable it again.

Connecting authenticates through the model catalog, not an inference probe. Once enabled, live decisions consume TypeSafe credits. The scheduler spaces requests by at least three real seconds across all ten villagers (at most about twenty per minute), with no SDK retries, a ten-second server timeout, and a thirty-second fallback interval after failure. Pausing, hiding the tab, or opening settings stops new decision scheduling; already dispatched requests may finish. A server-side limit of twenty-four requests per minute per session is an additional guardrail, not a promise about account usage in other applications.

Jev is a structured decision model, not a generic JSON validator. It selects one offered **action + target** option and scores urgency using `systemOne`, `choice`, and `score`. The server checks the output shape and offered identifier; the simulation independently validates current target availability, inventory, reservations, reachability, and prerequisites. Player-facing explanations are compact summaries of the selected option's game facts, not model chain-of-thought. Confidence and action priority are displayed separately.

## Play and inspect

- **Camera:** left-drag / WASD / arrows to pan, right-drag / Q and E to orbit, wheel to zoom. Touch: one finger orbits, two fingers pan / pinch. Home view resets the camera.
- **Inspect:** click a villager, their label, or their roster name. **Find** centers the camera on them. Inspect needs, inventory, task, traits, relationships, memories, and the latest decision.
- **Decisions:** click an activity entry for its original input snapshot, trigger, options, selected target, summary, source, priority, confidence (Jev), latency, and validation status. Historical snapshots are explicitly labeled.
- **Agent view:** click the top-bar button to see live cards for all ten people. Select a person to follow their context → Jev/local choice → world validation lifecycle, available choices, selected target, confidence, priority, and request duration. **Follow latest** tracks new opportunities; click history to pin a snapshot. **Jev requests only** filters that person's history (including failed requests that fell back locally). The inspector also has a **Watch this person's Jev decisions** shortcut. The village continues while the view is open; viewing never schedules extra model calls. Each person retains sixteen traces in memory, separate from the shared activity log.
- **Town:** open the top-bar Town view for shared goals, work coverage, family members, home occupancy, shop meals, construction teams, and progress toward a small city. Plan cottages, markets, or bakeries, or leave automatic expansion enabled.
- **Priorities:** adjust Food, Timber, and Housing, then release the slider. This requests staggered reconsideration; it does not directly assign villagers.
- **Time:** Pause / 1× / 2× / 4× advance a fixed-step simulation. One game day is twelve real minutes at 1×. The game begins at 08:00.
- **Day cycle:** automatically follows game time. Moving the lighting slider turns on a visual-only preview; check Day cycle to return to game lighting. Needs and decision context always follow simulation time.
- **Immerse:** hides the interface. Escape restores it. Show names enables floating action labels.

## Implemented life and economy

Wood and food move from finite resource nodes into individual inventories, then to the central stockpile. Trees are exhausted after harvest and become stumps. Berry patches and farms regrow after depletion on game time (160 and 100 seconds respectively); harvesting still requires villager labor. No resource is awarded just because a decision was selected.

The initial stockpile contains 48 food and 12 wood. Meals reserve and consume 3 food and reduce hunger by 55. Interrupted meals return the reserved food to the villager's inventory. Villagers get tired, rest at home or safely in place, and recover energy. Severe hunger reduces health; villagers can die of starvation. Well-fed villagers recover health slowly. Helping a hungry neighbor consumes carried food and improves a relationship. Socializing records memories and improves affection and trust.

Two initial cottage projects and fourteen marked expansion plots support settlement growth. New cottages cost 24 timber and provide five beds; markets cost 30 timber and bakeries 36. Up to three builders can share one project. Materials are consumed once, and partial labor persists after interruption. Automatic planning balances spare family homes and shops; manual plans allow at most three active sites.

All adults see a shared settlement goal and current worker coverage in decision context. The local policy favors uncovered food/timber needs and collaborative construction rather than sending everyone to one job. Jev receives the same goals and coverage. Roles remain preferences; hunger, energy and safety still take precedence.

## Homes, families and a small city

Adults can choose GO_HOME, reach their home's approach, and enter it. Residents inside disappear from the outdoor model view, stop blocking paths, and appear as **Inside** in inspection and the Town household/home lists. Nighttime rest lasts until morning unless hunger interrupts it. The existing homes have three beds, while all new cottages have five.

Family formation is an explicit START_FAMILY decision. Both unrelated adults must have mutual affection of at least 55 and trust of at least 50, neither may belong to another household, and a private finished home and sufficient food must be available. Founders arrive with five mutual friendships, not pre-created families. A prospective partner waits briefly for the meeting, but urgent needs can interrupt it. Family homes and parent/child/sibling relationships are recorded.

The first child can arrive after one game day together, then at intervals of at least 1.5 days, up to three children per household. Births require living, healthy, adequately fed parents, a spare bed, and food reserves of at least three per resident plus twelve food. Twelve food is consumed for each new arrival. Families move to a larger empty cottage when one is available. Children inherit blended traits, use real food for household care, remain home as infants, and later play near home by day. They never receive resource, building, or shop jobs or issue Jev requests. Age is deliberately accelerated: one year per game day, adulthood at eighteen. This is a stylized growth mechanic, not realistic demographic timing.

Markets turn 9 food into 3 prepared meals. Bakeries turn 6 food and 1 timber into 3 meals. Adults travel to stocked shops to eat; shop stock and raw reserves remain separate, and interrupted meals are returned to the proper source. Unassigned adults can become shopkeepers or bakers after staffing a shop.

Settlement stages progress from hamlet to village (two families), town (sixteen residents and a shop), and small city (twenty-four residents, eight completed homes, two shops). The small-map prototype caps living residents at forty. The roster, character models and agent view grow with births. Use 4× to observe this over several game days; family growth is intentionally gradual.

Without Jev, a labeled deterministic policy balances needs, role preferences, traits, recent shortage memories, relationships, and village priorities. With Jev enabled, high-level opportunities use the real model when the request budget allows. Local continuity handles urgent survival, budget gaps, outages, and canceled requests. Every source is explicit in the activity log. Local execution never calls a model for movement, work ticks, resource arithmetic, animations, or pathfinding.

## Architecture

- `src/simulation/types.ts`: serializable entities, bounded memories, relationships, tasks, world events, and decision snapshots.
- `src/simulation/people.ts`: authoritative state, needs, events, reservations, prerequisites, lifecycle, and resource ownership.
- `src/simulation/tasks.ts`: deterministic travel / work / delivery state machines for all ten prototype actions.
- `src/simulation/navigation.ts`: renderer-independent grid navigation, continuous segment clearance, crowd-aware paths, and safe connectors from actual positions. Stall time resets only after actual movement; reroutes are staggered and truly blocked routes eventually release their destinations.
- `src/simulation/town.ts`: households, birth prerequisites, child care, coming of age, automatic planning, and settlement milestones.
- `src/ui/townView.ts`: shared goals, homes, families, shops, plans, and collaborative project teams.
- `src/decisions/context.ts`: scoped observations, relevant memory / relationship selection, and feasible action-target candidates.
- `src/decisions/provider.ts`: explicitly labeled local policy and remote Jev provider; no credentials are stored here.
- `src/decisions/scheduler.ts`: staggered opportunities, cooldowns, pending results, stale-result rejection, and decisions applied only at simulation ticks.
- `server/jev.ts`: loopback-only credential sessions, official SDK integration, bounded requests, timeouts, and runtime validation.
- `src/world`: seeded terrain and procedural visual assets, resource metadata, and depletion / construction views.
- `src/render`: lighting, models, selection indicators, inventory props, and animation reflecting simulation state.
- `src/peopleUI.ts`: village dashboard, priority controls, inspection, activity snapshots, and Jev connection panel.
- `src/ui/agentView.ts`: per-person live observatory and retained request lifecycle snapshots, driven by scheduler telemetry rather than simulated status animations.

The simulation uses no Three.js objects. It can be moved into a worker or authoritative server later. Each settlement uses a 117×117 navigation grid; armies cross the combined 255×117 battlefield. Positions use separate x/z data. There is no multiplayer, diplomacy, technology tree, or unrestricted construction.

## Prototype limitations and validation

- This is an in-memory sandbox. Refresh resets the village; save/load, inheritance, and full generational aging are not implemented.
- Crowd navigation is conservative and may yield or abandon a blocked task before choosing another. It is not a full RTS navigation mesh.
- Memory is bounded to twelve records per villager; decision and world-event logs retain the latest 120 and 80 entries. The visible activity lists show the latest 45 entries.
- TypeScript and production build checks pass. No automated gameplay tests, browser playtesting, or paid inference calls were run. Balance and emergent behavior are for manual inspection.
- The Jev key flow and live service responses require your key to verify end to end.

Family growth, cooperative balancing, and the traffic fix have not been gameplay-tested; only compile/build checks were run. The world uses seed 1847. All geometry is procedural; fonts optionally load from Google Fonts with local fallbacks.

Integration references: [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), [official quickstart](https://docs.typesafe.ai/introduction/quickstart), and [SDK source](https://github.com/typesafe-ai/typesafe-sdk-js).


## Game modes

The launch screen offers two independent modes. **World Building** creates only the peaceful settlement, with families, cooperative work, homes, shops, and optional Jev decisions. It does not instantiate the rival, military simulation, or ragdoll physics. **Conquest** creates both civilizations and starts with four trained soldiers per side facing each other at the frontier, with attack orders already issued and the camera on the battle. Conquest waits for physics initialization before advancing; a reported physics initialization failure allows gameplay to continue without ragdolls.

The header's **New game** button returns to mode selection and resets the current session. Mode URLs (`?mode=world` and `?mode=conquest`) can also launch a fresh session directly. There is no save/load or state transfer between modes.

## Two-civilization conquest

Open **Campaign** for the live battlefield map, both economies, army orders, recruitment, capture meters, and war chronicle. Camera shortcuts show Hearthwood, the frontier, Ashenford, or the whole valley. Both towns share the existing pause and speed clock; campaign controls also expose it.

- There is no opening truce in Conquest. Both sides receive identical starting allocations (80 food and 60 timber before paying for their four starting troops). Those troops begin trained at the frontier; subsequent recruits must train normally. Both towns gather, build, form families, and grow using the same civilian simulation. Ashenford's commander is explicitly local AI; Jev remains optional for Hearthwood civilians.
- Recruiting costs 8 timber and 6 carried food. A real healthy adult leaves their civilian job, walks to the founding hall, and trains there for 20 seconds. Four civilian adults must remain; the army cap is eight.
- Defend, secure either watchpost, attack, or recall the entire army. Release recalled troops at the capital, outside nearby enemy contact, to restore their old jobs. Gear is not refunded; remaining rations return to stores.
- Troops consume rations, replenish from actual home reserves, and retreat when badly wounded or starving. There are no free rival resources or combat bonuses. Civilian residents shelter when the capital is threatened and are not combat targets.
- Watchposts take 15 seconds of uncontested occupation. They display frontier control; they do not generate resources in this first version.
- Two fed, trained, standing attackers must hold the opposing founding hall's nine-pace zone for 45 seconds, with no active defenders. Contested or understaffed capture pauses; capture drains twice as fast when attackers leave. Both captures completing together produces a draw. Victory freezes the campaign and represents surrender; reload starts again.
- Buildings are not destructible. Siege, ranged units, diplomacy, permanent conquest progression, save/load, and fog of war are not implemented.

## Combat and ragdolls

Soldiers turn toward enemies, swing swords, react to hits, and suffer a 1.8-second knockdown on every third damaging blow. Damage is applied simultaneously after each combat tick. Terrain clearance is required for melee hits. Downed troops cannot attack or capture.

Rapier physics drives eleven articulated body parts with spherical joints and constrained elbow/knee hinges, gravity, impact velocity, terrain collision, and structure collision. Knocked-down survivors resume their authoritative gameplay position when recovering; ragdolls are a visual layer, not the source of combat damage or navigation. Fallen bodies remain for 90 simulation seconds, then their meshes and rigid bodies are removed. Physics advances with the simulation, including pause and speed changes. The physics module loads separately and its readiness or failure is visible in Campaign.

Implementation: `src/conquest/campaign.ts` owns gameplay; `view.ts` draws soldiers and flags; `ragdolls.ts` owns cosmetic physics; `ui.ts` exposes campaign commands. Joint reference: https://rapier.rs/docs/user_guides/javascript/joints/ .

This conquest and ragdoll slice has only been checked by TypeScript compilation and production build. No gameplay tests, browser playtesting, or paid Jev requests were run, as requested. Combat balance, crowd behavior, and ragdoll appearance await your manual inspection.


## Night lighting and villager-built roads

Finished homes, shops, and storage gain lanterns; house windows glow after dusk. Light intensity follows the day cycle and the manual lighting preview. Each settlement keeps six nearby point lights active, with emissive lanterns and windows across town. Newly finished roads gain lanterns too.

Use **Town → Plan road** to connect the next reachable finished building to the village green. With autonomous growth enabled, the town also queues roads when food and timber reserves allow and the construction queue has space. Each route follows the obstacle-aware navigation grid, costs at least four timber (scaled by length), and needs builder labor. Up to three builders can cooperate; the road becomes visible as they work. Finished roads give civilian walkers a 30% speed bonus while on their surface. Existing main dirt tracks remain scenery; new plot connections are no longer pre-drawn.

Roads appear in the town's projects, completed roads list, village construction panel, and decision context. They use the existing constrained BUILD action for both local and Jev choices. Both game modes support roads and night lighting. Compile/build validation only; no gameplay testing performed.

## Hosting

The public demo is a static build on **GitHub Pages**, deployed from `main` by
`.github/workflows/deploy.yml` (build with Node 22 → upload `dist` → `actions/deploy-pages`).

Two things make that work:

- **`base: '/project-hearth/'` in `vite.config.ts` for production builds.** A Pages project
  site is served from a subpath, so root-relative `/assets/...` URLs would 404. Development
  keeps `/` so `http://127.0.0.1:5173/` and the loopback Jev plugin are unaffected.
- **The Jev connection panel is disabled when no server answers.** `DecisionProvider.statusCheck()`
  sets `serverAvailable=false` if `/api/jev/status` is unreachable or malformed, and the panel then
  disables key entry and explains why instead of offering a form that cannot work.

What the hosted demo does and does not do:

| Works on the public demo | Needs the local server |
|---|---|
| Full simulation, both game modes, families, town growth, roads, conquest, ragdolls | Jev (`jev-latest`) live decisions |
| Deterministic local decision policy, labeled `Local` in every log entry | Connecting a TypeSafe API key |

`server/jev.ts` is a Vite plugin with a loopback-only guard (`127.0.0.1` / `localhost` / `[::1]`), so
live AI decisions cannot be served from a static host by design — that mode requires a stateful
process. Deep links `?mode=world` and `?mode=conquest` work on the static host because there is no
client-side router.
