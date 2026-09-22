/** Generates mov.remake.rlhud.sdPlugin/manifest.json so action ids/names stay in sync with src/ui. */
import fs from "node:fs";
import path from "node:path";
import { ROLES, type Role } from "../src/ui/context.ts";
import { actionUuid, LEGACY_ACTIONS, legacyUuid, PLUGIN_UUID, PROFILES, STRIP_ACTION, STRIP_LAYOUT_FILE } from "../src/ui/layout.ts";

export const ACTION_INFO: Record<Role, { name: string; tooltip: string }> = {
	rank: { name: "Rank", tooltip: "Your rank for the mode being played (set in the property inspector)." },
	mmr: { name: "MMR + session", tooltip: "MMR for the current mode and this session's wins/losses. Press to swap MMR and the record, press again for your current win streak, again to go back." },
	mode: { name: "Mode", tooltip: "Current playlist: Duel / Doubles / Standard …, ranked or casual." },
	blue: { name: "Score (left team)", tooltip: "Goals of the team on the left of the score: your own team, in the colours the game shows it in." },
	orange: { name: "Score (right team)", tooltip: "Goals of the team on the right of the score: the opponent, in the colours the game shows it in." },
	timer: { name: "Match clock", tooltip: "Time left, overtime and pause." },
	lastgoal: { name: "Last goal", tooltip: "Who scored the last goal, and how fast the ball was." },
	banner: { name: "Event banner", tooltip: "Place three in a row: goals, demos, saves, overtime, victory …" },
	speed: { name: "Ball speed", tooltip: "Live ball speed with a bar and the match maximum." },
	boost: { name: "Boost", tooltip: "Your boost, 0–100, as a ring. Turns red when it runs low." },
	carspeed: { name: "Car speed", tooltip: "Your car's speed; SUPERSONIC flashes when you break the sound barrier." },
	possession: { name: "Possession", tooltip: "Which team touched the ball last, and each team's share of the match." },
	points: { name: "Score", tooltip: "Your points, with shots and demolitions." },
	clock: { name: "Clock", tooltip: "The current time of this computer, with the date (24-hour or 12-hour in the inspector). Press it to switch between hours over minutes and one smaller line. Also a panel for the Stream Deck + touch strip." },
	analog: { name: "Analog clock", tooltip: "A round clock face with clearly visible hour, minute and second hands, showing the time of this computer." },
	ping: { name: "Ping", tooltip: "Live ping to the game server of the running match, coloured by quality, with a small history graph." },
};

/** The Stream Deck + touch-strip action (one per dial; each draws a quarter of the strip). */
export const STRIP_INFO = {
	name: "Touch strip (Stream Deck +)",
	tooltip: "For the Stream Deck +: put this on all four dials. The touch strip shows rank, MMR, last goal and your stats, and the animated event banner across its full width.",
};

const manifest = {
	$schema: "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
	SDKVersion: 2,
	UUID: PLUGIN_UUID,
	Name: "Rocket League HUD",
	Version: "1.10.3.0",
	Author: "kvcperkrol",
	Description:
		"Live Rocket League HUD for a 15-key Stream Deck and the Stream Deck + (touch strip): score, clock, rank, MMR, goals with scorer and ball speed, demos, saves, boost and possession. Turns the game's Stats API on by itself — install, start the game, play.",
	Icon: "imgs/plugin/marketplace",
	Category: "Rocket League HUD",
	CategoryIcon: "imgs/plugin/category-icon",
	CodePath: "bin/plugin.js",
	Nodejs: { Version: "20", Debug: "disabled" },
	Software: { MinimumVersion: "6.6" },
	OS: [{ Platform: "windows", MinimumVersion: "10" }],
	ApplicationsToMonitor: { windows: ["RocketLeague.exe"] },
	PropertyInspectorPath: "ui/pi.html",
	// One bundled profile per kind of deck: installing the plugin creates a separate "Rocket League HUD" profile on every connected deck.
	Profiles: PROFILES.flatMap((p) => p.deviceTypes.map((t) => ({ Name: p.name, DeviceType: t, DontAutoSwitchWhenInstalled: true, AutoInstall: true }))),
	Actions: [
		...ROLES.map((role) => ({
			Name: ACTION_INFO[role].name,
			UUID: actionUuid(role),
			Icon: `imgs/actions/${role}/icon`,
			Tooltip: ACTION_INFO[role].tooltip,
			Controllers: ["Keypad"],
			States: [{ Image: `imgs/actions/${role}/key`, TitleAlignment: "middle", ShowTitle: false }],
		})),
		{
			Name: STRIP_INFO.name,
			UUID: STRIP_ACTION,
			Icon: "imgs/actions/strip/icon",
			Tooltip: STRIP_INFO.tooltip,
			Controllers: ["Encoder"],
			Encoder: { layout: STRIP_LAYOUT_FILE, Icon: "imgs/actions/strip/encoder-icon", TriggerDescription: { Rotate: "", Push: "", Touch: "", LongTouch: "" } },
			States: [{ Image: "imgs/actions/strip/key", TitleAlignment: "middle", ShowTitle: false }],
		},
		// Ids of keys that existed in earlier versions. Hidden from the actions list, but a deck that still has them in its
		// profile keeps working: each one draws the key that replaced it.
		...Object.entries(LEGACY_ACTIONS).map(([id, role]) => ({
			Name: `${ACTION_INFO[role].name} (previous key)`,
			UUID: legacyUuid(id),
			Icon: `imgs/actions/${role}/icon`,
			Tooltip: ACTION_INFO[role].tooltip,
			VisibleInActionsList: false,
			Controllers: ["Keypad"],
			States: [{ Image: `imgs/actions/${role}/key`, TitleAlignment: "middle", ShowTitle: false }],
		})),
	],
};

const out = path.resolve(`${PLUGIN_UUID}.sdPlugin`, "manifest.json");
fs.writeFileSync(out, JSON.stringify(manifest, null, "\t") + "\n");
console.log("wrote", path.relative(process.cwd(), out));
