/**
 * Renders an annotated picture of the default layouts — every key drawn as it looks in a running match, with its function named
 * underneath. English. Output: docs/screenshots/layout-*.png
 *
 * Run:  npm run preview:layout
 */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { MatchStore } from "../src/core/match-store.ts";
import type { RLMessage } from "../src/core/types.ts";
import { mergeSettings } from "../src/core/types.ts";
import { RankIcons } from "../src/sys/rank-icons.ts";
import type { RenderCtx, Role } from "../src/ui/context.ts";
import { type Cell, LAYOUT, LAYOUT_MINI, LAYOUT_NEO, LAYOUT_PLUS, LAYOUT_XL } from "../src/ui/layout.ts";
import { renderRole } from "../src/ui/keys.ts";
import { renderStrip } from "../src/ui/strip.ts";

const OUT = path.resolve("docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

/** What each key is for: a name and a short hint, as printed under it. */
const CAPTION: Record<Exclude<Role, "banner">, [string, string]> = {
	rank: ["RANK", "icon · division"],
	mmr: ["MMR", "change · wins / losses"],
	mode: ["MODE", "playlist · ranked or not"],
	blue: ["YOUR TEAM", "score · YOU tag"],
	orange: ["OPPONENT", "score · game colours"],
	timer: ["CLOCK", "time · overtime · pause"],
	lastgoal: ["LAST GOAL", "scorer · ball speed"],
	speed: ["BALL SPEED", "now · match maximum"],
	boost: ["BOOST", "0–100 ring"],
	carspeed: ["CAR SPEED", "SUPERSONIC alert"],
	possession: ["POSSESSION", "share per team"],
	points: ["SCORE", "points · shots · demos"],
};

// ---- one running match, as the deck shows it a few seconds after a goal --------------------------------------------------
const P = (name: string, id: string, team: number, x: object = {}) => ({ Name: name, PrimaryId: id, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0, ...x });
const update = (ballTeam: number): RLMessage => ({
	Event: "UpdateState",
	Data: {
		MatchGuid: "G",
		Players: [
			P("Player1", "Epic|1|0", 0, { Score: 457, Goals: 3, Assists: 0, Saves: 1, Shots: 3, Demos: 0, Boost: 62, Speed: 64, bBoosting: true, bSupersonic: false }),
			P("Mate", "Epic|2|0", 0),
			P("Rival", "Epic|3|0", 1),
			P("Rival2", "Epic|4|0", 1),
		],
		Game: {
			Teams: [{ Name: "Blue", TeamNum: 0, Score: 4 }, { Name: "Orange", TeamNum: 1, Score: 3 }],
			PlaylistId: 11,
			TimeSeconds: 72,
			bOvertime: false,
			Ball: { Speed: 78, TeamNum: ballTeam },
			bReplay: false,
			Arena: "Stadium_P",
			bHasTarget: false,
		},
	},
});

let now = 10_000;
const store = new MatchStore(() => now);
store.setLocalIdentity({ name: "Player1", id: "Epic|1|0" });
store.setGameRunning(true);
store.setConnected(true);
store.handle({ Event: "RoundStarted", Data: {} });
for (let i = 0; i < 100; i++) {
	now += 100;
	store.handle(update(i < 60 ? 0 : 1));
}
store.handle({ Event: "GoalScored", Data: { GoalSpeed: 81, Scorer: { Name: "Mate", TeamNum: 0 } } });
now += 7_000; // the goal banner is over: the banner keys are back to their resting state
store.handle(update(0));

const icons = new RankIcons(path.join(OUT, ".none"), Date.now, [path.resolve("mov.remake.rlhud.sdPlugin", "imgs", "ranks")]);
const ctx: RenderCtx = {
	store,
	settings: mergeSettings({ lang: "en", ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }),
	now,
	restartHint: false,
	autoMmr: { 11: { mmr: 964, at: "2026-09-20T15:00:00Z", delta: 10 } },
	rankIcon: (id) => icons.get(id),
};

// ---- drawing helpers ------------------------------------------------------------------------------------------------------
const FONT = "Bahnschrift, 'Segoe UI', Arial, sans-serif";
const INK = "#e8ecff";
const DIM = "#8c97c2";
const ACCENT = "#5d8bff";
let uid = 0;

/** A drawn key or strip segment, nested so its ids cannot clash with the others. */
function embed(svg: string, x: number, y: number, w: number, h: number, vb: string): string {
	const n = ++uid;
	const inner = svg
		.replace(/id="([^"]+)"/g, (_m, id) => `id="u${n}-${id}"`)
		.replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#u${n}-${id})`)
		.replace(/^<svg[^>]*>/, "")
		.replace(/<\/svg>$/, "");
	return `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`;
}

const label = (cx: number, y: number, title: string, hint: string, ts: number, hs: number, anchor = "middle") =>
	`<text x="${cx}" y="${y}" font-family="${FONT}" font-size="${ts}" font-weight="700" fill="${INK}" text-anchor="${anchor}" letter-spacing="0.6">${title}</text>` +
	`<text x="${cx}" y="${y + hs + 3}" font-family="${FONT}" font-size="${hs}" fill="${DIM}" text-anchor="${anchor}">${hint}</text>`;

/** A bracket under `x0…x1` with a caption centred beneath it. */
const bracket = (x0: number, x1: number, y: number) =>
	`<path d="M${x0},${y - 5} L${x0},${y} L${x1},${y} L${x1},${y - 5}" fill="none" stroke="${ACCENT}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;

const heading = (x: number, y: number, text: string) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="15" font-weight="700" fill="${INK}" letter-spacing="1">${text}</text>`;

function render(svg: string, file: string, zoom: number): void {
	fs.writeFileSync(path.join(OUT, file), new Resvg(svg, { fitTo: { mode: "zoom", value: zoom }, font: { loadSystemFonts: true, defaultFontFamily: "Bahnschrift" } }).render().asPng());
	console.log("wrote", path.join("docs", "screenshots", file));
}

// ---- the plain key grids (5×3, Mini, XL, Neo) ---------------------------------------------------------------------------------
function grid(title: string, cells: Cell[], file: string, note?: string): void {
	const KEY = 72;
	const PITCH_X = 90;
	const PITCH_Y = 128;
	const PAD = 26;
	const TOP = 44;
	const cols = Math.max(...cells.map((c) => c.col)) + 1;
	const rows = Math.max(...cells.map((c) => c.row)) + 1;
	const w = Math.max(PAD * 2 + (cols - 1) * PITCH_X + KEY, 330);
	const h = TOP + PAD + (rows - 1) * PITCH_Y + KEY + 36 + (note ? 18 : 0);
	// centre a narrow grid (the Mini) in the picture
	const offX = (w - ((cols - 1) * PITCH_X + KEY)) / 2;
	let body = `<rect width="${w}" height="${h}" rx="18" fill="#15161a"/>` + heading(PAD, 30, title);
	const banner = cells.filter((c) => c.role === "banner");
	for (const cell of cells) {
		const x = offX + cell.col * PITCH_X;
		const y = TOP + cell.row * PITCH_Y;
		body += embed(renderRole(cell.role, ctx, { slice: Math.max(0, banner.indexOf(cell)) }), x, y, KEY, KEY, "0 0 72 72");
		if (cell.role !== "banner") {
			const [t, hint] = CAPTION[cell.role];
			body += label(x + KEY / 2, y + KEY + 15, t, hint, 9.5, 7.6);
		}
	}
	if (banner.length > 0) {
		const x0 = offX + banner[0]!.col * PITCH_X;
		const x1 = offX + banner[banner.length - 1]!.col * PITCH_X + KEY;
		const by = TOP + banner[0]!.row * PITCH_Y + KEY + 8;
		body += bracket(x0, x1, by) + label((x0 + x1) / 2, by + 17, "EVENT BANNER  (3 keys)", "goal · demo · save · overtime · replay · result", 9.5, 7.6);
		body += `<text x="${(x0 + x1) / 2}" y="${by + 42}" font-family="${FONT}" font-size="7.6" fill="${DIM}" text-anchor="middle">at rest: your goals · assists · saves</text>`;
	}
	if (note) body += `<text x="${w / 2}" y="${h - 16}" font-family="${FONT}" font-size="8.5" fill="${DIM}" text-anchor="middle">${note}</text>`;
	render(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`, file, 3);
}

grid("STREAM DECK 5×3", LAYOUT, "layout-5x3.png");
grid("STREAM DECK MINI", LAYOUT_MINI, "layout-mini.png");
grid("STREAM DECK XL", LAYOUT_XL, "layout-xl.png", "the two lower rows are left free for your own keys");
grid("STREAM DECK NEO", LAYOUT_NEO, "layout-neo.png");

// ---- Stream Deck + -----------------------------------------------------------------------------------------------------------
{
	const PAD = 30;
	const SEG = 200;
	const KEY = 130;
	const TOP = 52;
	const ROW = 196;
	const stripY = TOP + 2 * ROW + 14;
	const w = PAD * 2 + 4 * SEG;
	const h = stripY + 100 + 74 + 60;
	let body = `<rect width="${w}" height="${h}" rx="22" fill="#15161a"/>` + heading(PAD, 34, "STREAM DECK +  ·  8 KEYS, TOUCH STRIP");
	for (const cell of LAYOUT_PLUS) {
		const x = PAD + cell.col * SEG + (SEG - KEY) / 2;
		const y = TOP + cell.row * ROW;
		const [title, hint] = CAPTION[cell.role as Exclude<Role, "banner">];
		body += embed(renderRole(cell.role, ctx), x, y, KEY, KEY, "0 0 72 72") + label(x + KEY / 2, y + KEY + 22, title, hint, 15, 11.5);
	}
	// the touch strip at rest: one panel per dial
	const panels: [string, string][] = [["RANK", "icon · division · mode"], ["MMR", "change · wins / losses"], ["LAST GOAL", "scorer · ball speed"], ["MY STATS", "goals · assists · saves"]];
	for (let i = 0; i < 4; i++) {
		body += embed(renderStrip(ctx, i), PAD + i * SEG, stripY, SEG, 100, "0 0 200 100");
		body += label(PAD + i * SEG + SEG / 2, stripY + 100 + 22, panels[i]![0], panels[i]![1], 15, 11.5);
	}
	body += `<text x="${PAD}" y="${stripY - 10}" font-family="${FONT}" font-size="12" fill="${DIM}" letter-spacing="1">TOUCH STRIP  ·  one panel per dial</text>`;
	// …and during an event: the same strip, one banner across all four dials
	now += 0;
	const eventStore = new MatchStore(() => now);
	eventStore.setLocalIdentity({ name: "Player1", id: "Epic|1|0" });
	eventStore.setGameRunning(true);
	eventStore.setConnected(true);
	eventStore.handle(update(0));
	eventStore.handle({ Event: "GoalScored", Data: { GoalSpeed: 86, GoalTime: 20, Scorer: { Name: "Player1", TeamNum: 0 }, Assister: { Name: "Mate", TeamNum: 0 } } });
	now += 500;
	const eventCtx: RenderCtx = { ...ctx, store: eventStore, now };
	const ey = stripY + 100 + 74;
	for (let i = 0; i < 4; i++) body += embed(renderStrip(eventCtx, i), PAD + i * SEG, ey, SEG, 100, "0 0 200 100");
	body += bracket(PAD, PAD + 4 * SEG, ey + 100 + 12) + label(PAD + 2 * SEG, ey + 100 + 32, "EVENT BANNER  (all four dials)", "goal · demo · save · overtime · replay · result — ball speed left, headline centre, assist right", 15, 11.5);
	const h2 = ey + 100 + 32 + 11.5 + 30;
	render(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h2}" viewBox="0 0 ${w} ${h2}">${body.replace(/^<rect[^>]*\/>/, `<rect width="${w}" height="${h2}" rx="22" fill="#15161a"/>`)}</svg>`, "layout-plus.png", 1.5);
}
