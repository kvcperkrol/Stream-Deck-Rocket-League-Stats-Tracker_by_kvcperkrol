/** Renders every PNG the manifest refers to (plugin icon, category icon, action icons, default key images). */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings } from "../src/core/types.ts";
import { ROLES, type Role } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";
import { PLUGIN_UUID } from "../src/ui/layout.ts";

const root = path.resolve(`${PLUGIN_UUID}.sdPlugin`, "imgs");

function png(svg: string, width: number, file: string): void {
	if (process.env.DEBUG_ASSETS) console.log("render", path.basename(path.dirname(file)), path.basename(file));
	const data = new Resvg(svg, { fitTo: { mode: "width", value: width }, font: { loadSystemFonts: true, defaultFontFamily: "Bahnschrift" } }).render().asPng();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, data);
}
const both = (svg: string, base: number, file: string) => {
	png(svg, base, `${file}.png`);
	png(svg, base * 2, `${file}@2x.png`);
};

// ---- plugin icon: original mark (blue/orange split + speed stripes + ball), not the game's logo -----------------
const ball = (cx: number, cy: number, r: number, stroke = "#ffffff") =>
	`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${r * 0.16}"/>` +
	`<polygon points="${cx},${cy - r * 0.42} ${cx + r * 0.4},${cy - r * 0.13} ${cx + r * 0.25},${cy + r * 0.34} ${cx - r * 0.25},${cy + r * 0.34} ${cx - r * 0.4},${cy - r * 0.13}" fill="${stroke}"/>`;

const marketplace = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
<defs>
<linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f7dff"/><stop offset="1" stop-color="#0a2f8f"/></linearGradient>
<linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffa53a"/><stop offset="1" stop-color="#d94400"/></linearGradient>
<clipPath id="c"><rect width="256" height="256" rx="46"/></clipPath>
</defs>
<g clip-path="url(#c)">
<rect width="256" height="256" fill="url(#b)"/>
<polygon points="256,0 256,256 60,256 196,0" fill="url(#o)"/>
<polygon points="0,200 70,0 96,0 26,200" fill="#ffffff" opacity="0.10"/>
<polygon points="150,256 226,40 246,40 170,256" fill="#ffffff" opacity="0.10"/>
${ball(128, 128, 62)}
</g></svg>`;
both(marketplace, 256, path.join(root, "plugin", "marketplace"));

// ---- category icon: single-colour glyph on transparent ----------------------------------------------------------
const category = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">${ball(14, 14, 11)}</svg>`;
both(category, 28, path.join(root, "plugin", "category-icon"));

// ---- action icons (20px, white on transparent) --------------------------------------------------------------------
const W = "#ffffff";
const sw = `stroke="${W}" stroke-width="1.7" fill="none" stroke-linejoin="round" stroke-linecap="round"`;
const GLYPH: Record<Role, string> = {
	rank: `<path d="M10,1.5 L17,5.5 L17,13 L10,18.5 L3,13 L3,5.5 Z" ${sw}/><path d="M10,6 L10,13 M7.5,8 L10,6 L12.5,8" ${sw}/>`,
	mmr: `<rect x="2.5" y="11" width="3.4" height="6" fill="${W}"/><rect x="8.3" y="6" width="3.4" height="11" fill="${W}"/><rect x="14.1" y="2.5" width="3.4" height="14.5" fill="${W}"/>`,
	mode: `<circle cx="5" cy="10" r="2.6" fill="${W}"/><circle cx="11" cy="10" r="2.6" fill="${W}" opacity="0.6"/><rect x="15" y="7.4" width="3" height="5.2" fill="${W}" opacity="0.6"/>`,
	blue: `<rect x="3" y="3" width="14" height="14" rx="2" ${sw}/><path d="M7.5,6 L7.5,14 M7.5,6 L11,6 Q13,6 13,8 Q13,10 11,10 L7.5,10 M7.5,10 L11.5,10 Q13.5,10 13.5,12 Q13.5,14 11.5,14 L7.5,14" ${sw}/>`,
	orange: `<rect x="3" y="3" width="14" height="14" rx="2" fill="${W}" opacity="0.95"/>`,
	timer: `<circle cx="10" cy="11" r="6.6" ${sw}/><path d="M10,11 L10,7.2 M10,11 L12.6,12.6 M8,2 L12,2" ${sw}/>`,
	lastgoal: `<path d="M3,17 L3,4 L16,4" ${sw}/><circle cx="12" cy="11" r="3.4" ${sw}/><path d="M3,17 L8,12" ${sw}/>`,
	banner: `<rect x="1.5" y="6" width="17" height="8" rx="1.5" ${sw}/><path d="M7.2,6 L7.2,14 M12.8,6 L12.8,14" ${sw}/>`,
	speed: `<path d="M2.5,15 A7.5,7.5 0 1 1 17.5,15" ${sw}/><path d="M10,15 L14,8.5" ${sw}/>`,
	boost: `<path d="M11.5,1.5 L4.5,11 L9,11 L8.5,18.5 L15.5,8.5 L11,8.5 Z" fill="${W}"/>`,
	carspeed: `<path d="M2,13 L3.5,9 L7,8 L9,5 L13,5 L16,8.5 L18,9.5 L18,13 Z" fill="${W}"/><circle cx="6" cy="14" r="2.2" fill="#000" stroke="${W}" stroke-width="1.4"/><circle cx="14" cy="14" r="2.2" fill="#000" stroke="${W}" stroke-width="1.4"/>`,
	possession: `<rect x="2" y="7" width="9" height="6" fill="${W}"/><rect x="11" y="7" width="7" height="6" fill="${W}" fill-opacity="0.5"/><path d="M6.5,2.5 L9,6 L4,6 Z" fill="${W}"/>`,
	points: `<path d="M10,2 L12.2,7.2 L17.8,7.6 L13.5,11.2 L14.9,16.7 L10,13.7 L5.1,16.7 L6.5,11.2 L2.2,7.6 L7.8,7.2 Z" fill="${W}"/>`,
};
for (const role of ROLES) {
	const glyph = GLYPH[role];
	both(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">${glyph}</svg>`, 20, path.join(root, "actions", role, "icon"));
}

// ---- default key images: what each key looks like in a running match ------------------------------------------------
const store = new MatchStore(() => 1_000_000);
store.setGameRunning(true);
store.setConnected(true);
const P = (name: string, team: number, x: object = {}) => ({ Name: name, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0, ...x });
store.handle({
	Event: "UpdateState",
	Data: {
		MatchGuid: "demo",
		Players: [P("Player", 0, { Goals: 1, Saves: 2, Score: 340, Shots: 4, Demos: 1, Boost: 62, Speed: 64, bSupersonic: false }), P("Mate", 0), P("Rival", 1), P("Rival2", 1)],
		Game: {
			Teams: [
				{ Name: "Blue", TeamNum: 0, Score: 2 },
				{ Name: "Orange", TeamNum: 1, Score: 1 },
			],
			PlaylistId: 11,
			TimeSeconds: 141,
			bOvertime: false,
			Ball: { Speed: 68, TeamNum: 0 },
			bReplay: false,
			Arena: "Stadium_P",
			bHasTarget: true,
			Target: { Name: "Player", TeamNum: 0 },
		},
	},
});
store.handle({ Event: "GoalScored", Data: { GoalSpeed: 95, Scorer: { Name: "Player", TeamNum: 0 } } });
const ctx = {
	store,
	settings: mergeSettings({ ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }),
	now: 1_000_000 + 9_000,
	restartHint: false,
};
for (const role of ROLES) both(renderRole(role, ctx, { slice: 1 }), 72, path.join(root, "actions", role, "key"));

console.log(`assets written to ${path.relative(process.cwd(), root)}`);
