/**
 * Renders the 5×3 deck for a series of scripted match situations to PNG files — a hardware-free way to check
 * the look. Output: preview/*.png
 */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { MatchStore } from "../src/core/match-store.ts";
import type { GlobalSettings, RLMessage } from "../src/core/types.ts";
import { mergeSettings } from "../src/core/types.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { KEY_GAP } from "../src/ui/banner.ts";
import { LAYOUT } from "../src/ui/layout.ts";
import { renderRole } from "../src/ui/keys.ts";

import { RankIcons } from "../src/sys/rank-icons.ts";

const OUT = path.resolve("preview");
// the same lookup the plugin uses: no custom icons, the ones bundled with the plugin
const rankIcons = new RankIcons(path.join(OUT, ".no-custom-icons"), Date.now, [path.resolve("mov.remake.rlhud.sdPlugin", "imgs", "ranks")]);
fs.mkdirSync(OUT, { recursive: true });

const P = (name: string, team: number, x: object = {}) => ({ Name: name, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0, ...x });
const state = (over: { blue?: number; orange?: number; time?: number; ot?: boolean; ball?: number; me?: object; car?: object; ballTeam?: number; playlist?: number } = {}): RLMessage => ({
	Event: "UpdateState",
	Data: {
		MatchGuid: "G",
		Players: [P("Player1", 0, { ...(over.me ?? { Goals: 3, Assists: 0, Saves: 1 }), Score: 457, Shots: 3, Demos: 0, Boost: 45, Speed: 47, bBoosting: true, bSupersonic: false, ...(over.car ?? {}) }), P("Mate", 0), P("Rival", 1), P("Rival2", 1)],
		Game: {
			Teams: [
				{ Name: "Blue", TeamNum: 0, Score: over.blue ?? 0 },
				{ Name: "Orange", TeamNum: 1, Score: over.orange ?? 0 },
			],
			PlaylistId: over.playlist ?? 11,
			TimeSeconds: over.time ?? 300,
			bOvertime: over.ot ?? false,
			Ball: { Speed: over.ball ?? 0, TeamNum: over.ballTeam ?? 0 },
			bReplay: false,
			Arena: "Stadium_P",
			bHasTarget: true,
			Target: { Name: "Player1", TeamNum: 0 },
		},
	},
});

interface Scenario {
	name: string;
	settings?: Partial<GlobalSettings>;
	build: (store: MatchStore, clock: { t: number }) => void;
	/** ms after the last event at which to draw. */
	at?: number;
	restartHint?: boolean;
}

const SETTINGS: Partial<GlobalSettings> = {
	lang: "en",
	ranks: { doubles: { tier: 14, div: 2, mmr: 964 }, snowday: { tier: 5, div: 3, mmr: 447 } }, // Diamond II 954 → 964 after a win; Snow Day Silver II, division III
};

const scenarios: Scenario[] = [
	{ name: "01-offline", build: () => {} },
	{
		name: "02-menu",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
		},
	},
	{
		name: "03-live",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 4, orange: 3, time: 72, ball: 78 }));
s.handle({ Event: "GoalScored", Data: { GoalSpeed: 81, Scorer: { Name: "Mate", TeamNum: 0 } } });
s.handle(state({ blue: 4, orange: 3, time: 72, ball: 78 }));
		},
		at: 6000,
	},
	{
		name: "04-goal-blue",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 4, orange: 3, time: 72 }));
s.handle({ Event: "GoalScored", Data: { GoalSpeed: 86, GoalTime: 20, Scorer: { Name: "Player1", TeamNum: 0 }, Assister: { Name: "Mate", TeamNum: 0 } } });
		},
		at: 700,
	},
	{
		name: "05-goal-orange",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 2, orange: 2, time: 60 }));
			s.handle({ Event: "GoalScored", Data: { GoalSpeed: 122, Scorer: { Name: "Rival2", TeamNum: 1 } } });
		},
		at: 1200,
	},
	{
		name: "06-demo",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 3, orange: 3, time: 96, ball: 78, car: { Demos: 1 } }));
s.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Player1", TeamNum: 0 }, SecondaryTarget: { Name: "Rival", TeamNum: 1 } } });
		},
		at: 900,
	},
	{
		name: "07-demoed-me",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 1, orange: 1, time: 200 }));
			s.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Rival", TeamNum: 1 }, SecondaryTarget: { Name: "Player1", TeamNum: 0 } } });
		},
		at: 900,
	},
	{
		name: "08-epic-save",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 0, orange: 0, time: 22, ball: 151 }));
			s.handle({ Event: "StatfeedEvent", Data: { EventName: "EpicSave", Type: "Epic Save", MainTarget: { Name: "Player1", TeamNum: 0 } } });
		},
		at: 800,
	},
	{
		name: "09-overtime",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 3, orange: 3, time: 0 }));
			s.handle({ Event: "ClockUpdatedSeconds", Data: { TimeSeconds: 12, bOvertime: true } });
			s.handle(state({ blue: 3, orange: 3, time: 12, ot: true }));
		},
		at: 800,
	},
	{
		name: "10-crossbar",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 1, orange: 0, time: 250 }));
			s.handle({ Event: "CrossbarHit", Data: { BallSpeed: 112, BallLastTouch: { Player: { Name: "Rival", TeamNum: 1 }, Speed: 1 } } });
		},
		at: 800,
	},
	{
		name: "11-victory",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 4, orange: 2, time: 0 }));
			s.handle({ Event: "MatchEnded", Data: { WinnerTeamNum: 0 } });
		},
		at: 1000,
	},
	{
		name: "12-defeat",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 1, orange: 3, time: 0 }));
			s.handle({ Event: "MatchEnded", Data: { WinnerTeamNum: 1 } });
		},
		at: 1000,
	},
	{
		name: "13-replay",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 2, orange: 1, time: 141 }));
			s.handle({ Event: "GoalReplayStart", Data: {} });
		},
		at: 4000,
	},
	{
		name: "14-restart-hint",
		build: (s) => s.setGameRunning(true),
		restartHint: true,
	},
	{
		name: "16-live-keys-supersonic",
		build: (s, clock) => {
			s.setGameRunning(true);
			s.setConnected(true);
			const car = { Speed: 82.8, Boost: 18, bBoosting: true, bSupersonic: true, Score: 457, Shots: 3, Demos: 0 };
			s.handle({ Event: "RoundStarted", Data: {} });
			// 6 s of blue touching the ball last, then 4 s of orange (the store credits the time between updates)
			for (let i = 0; i < 100; i++) {
				clock.t += 100;
				s.handle(state({ blue: 4, orange: 3, time: 72, ball: 78, car, ballTeam: i < 60 ? 0 : 1 }));
			}
		},
	},
	{
		name: "17-orange-vs-black",
		build: (s, clock) => {
			s.setLocalIdentity({ name: "Player1", id: "Epic|1000|0" });
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle({ Event: "RoundStarted", Data: {} });
			const msg = (i: number): RLMessage => {
				const m = state({ blue: 3, orange: 4, time: 72, ball: 78, ballTeam: i < 55 ? 1 : 0, car: { Speed: 47, Boost: 45, bBoosting: false, bSupersonic: false, Score: 457, Shots: 3, Demos: 0 } });
				// the user plays ORANGE (team 1); the blue side is a BLACK team, as some players set it
				m.Data.Players[0].TeamNum = 1;
				m.Data.Players[1].TeamNum = 1;
				m.Data.Players[2].TeamNum = 0;
				m.Data.Players[3].TeamNum = 0;
				m.Data.Game.Teams[0].ColorPrimary = "262626";
m.Data.Game.Teams[0].Name = "Club";
m.Data.Game.Teams[1].ColorPrimary = "C26418";
				m.Data.Game.Target = { Name: "Rival", TeamNum: 0 }; // the camera may show anybody at the start
				return m;
			};
			for (let i = 0; i < 100; i++) {
				clock.t += 100;
				s.handle(msg(i));
			}
			},
	},
	{
		name: "15-polish-mph",
		settings: { lang: "pl", units: "mph" },
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 4, orange: 3, time: 72, ball: 78 }));
s.handle({ Event: "GoalScored", Data: { GoalSpeed: 86, Scorer: { Name: "Player1", TeamNum: 0 }, Assister: { Name: "Mate", TeamNum: 0 } } });
		},
		at: 900,
	},
	{
		// a casual match: no rank is shown, the keys say UNRANKED (the same-size ranked mode has a rank set above)
		name: "18-casual-unranked",
		build: (s) => {
			s.setGameRunning(true);
			s.setConnected(true);
			s.handle(state({ blue: 4, orange: 3, time: 72, ball: 78, playlist: 2 }));
		},
		at: 300,
	},
];

const CELL = 72;
const GAP = KEY_GAP; // same as the banner geometry, so the preview shows what the hardware will show
const PAD = 22;
const SCALE = 3;

function deckSvg(ctx: RenderCtx): string {
	const w = PAD * 2 + CELL * 5 + GAP * 4;
	const h = PAD * 2 + CELL * 3 + GAP * 2;
	let body = `<rect width="${w}" height="${h}" rx="16" fill="#15161a"/>`;
	let n = 0;
	for (const cell of LAYOUT) {
		n++;
		const x = PAD + cell.col * (CELL + GAP);
		const y = PAD + cell.row * (CELL + GAP);
		// On the device every key is a separate document; here they share one, so ids must be made unique.
		const svg = renderRole(cell.role, ctx, { slice: Number(cell.settings?.slice ?? 0) })
			.replace(/id="([^"]+)"/g, (_m, id) => `id="k${n}-${id}"`)
			.replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#k${n}-${id})`);
		// Embed the key as a nested <svg> and clip it to a rounded key shape like the hardware.
		const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
		const vb = /viewBox="([^"]+)"/.exec(svg)![1];
		body += `<svg x="${x}" y="${y}" width="${CELL}" height="${CELL}" viewBox="${vb}">${inner}</svg>`;
		body += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="6" fill="none" stroke="#15161a" stroke-width="3"/>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

const only = process.argv[2];
for (const sc of scenarios) {
	if (only && !sc.name.includes(only)) continue;
	const clock = { t: 10_000 };
	const store = new MatchStore(() => clock.t);
	sc.build(store, clock);
	clock.t += sc.at ?? 0;
	const ctx: RenderCtx = {
		store,
		settings: mergeSettings({ ...SETTINGS, ...sc.settings }),
		now: clock.t,
		restartHint: !!sc.restartHint,
		rankIcon: (id) => rankIcons.get(id),
		// what the game log gave: ranked doubles 954 → 964 after a win (+10); casual 1048
		autoMmr: { 11: { mmr: 964, at: "2026-09-20T15:00:00Z", delta: 10 }, 2: { mmr: 1048, at: "2026-09-20T15:00:00Z" } },
	};
	const svg = deckSvg(ctx);
	const png = new Resvg(svg, { fitTo: { mode: "zoom", value: SCALE }, font: { loadSystemFonts: true, defaultFontFamily: "Bahnschrift" } }).render().asPng();
	fs.writeFileSync(path.join(OUT, `${sc.name}.png`), png);
	console.log("wrote", `${sc.name}.png`);
}
