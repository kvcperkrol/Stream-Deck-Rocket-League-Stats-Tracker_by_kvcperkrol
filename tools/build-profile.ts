/**
 * Builds profiles/RL.streamDeckProfile — the pre-arranged 5×3 page the plugin switches to when the game starts.
 *
 * Format (reverse-engineered from profiles shipped by other plugins and from Stream Deck's own ProfilesV2):
 *   <PROFILE-UUID>.sdProfile/manifest.json                      → device, name, page list
 *   <PROFILE-UUID>.sdProfile/Profiles/<PAGE-ID>/manifest.json   → actions keyed "col,row"
 * PAGE-ID is the page UUID's 16 bytes, base32-encoded with alphabet 0-9A-TVW (left aligned) plus a trailing "Z".
 */
import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { actionUuid, type Cell, PLUGIN_UUID, PROFILES, STRIP_ACTION } from "../src/ui/layout.ts";
import { ACTION_INFO, STRIP_INFO } from "./build-manifest.ts";
import { pageDirName } from "./profile-format.ts";

/** Deterministic UUID so rebuilding the plugin never changes ids. */
function uuidFrom(seed: string): string {
	const h = createHash("sha1").update(`${PLUGIN_UUID}/${seed}`).digest();
	h[6] = (h[6]! & 0x0f) | 0x50;
	h[8] = (h[8]! & 0x3f) | 0x80;
	const x = h.subarray(0, 16).toString("hex");
	return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}


function actionEntry(seed: string, name: string, uuid: string): Record<string, unknown> {
	return {
		ActionID: uuidFrom(seed),
		LinkedTitle: true,
		Name: name,
		// Banner keys deliberately carry no slice: they order themselves left to right, so the user can rearrange freely.
		Settings: {},
		State: 0,
		States: [{}],
		UUID: uuid,
	};
}

interface ProfileSpec {
	/** Seed of the deterministic ids: rebuilding the plugin never changes them. */
	seed: string;
	fileName: string;
	/** Model number Stream Deck matches the profile to (the real device replaces it on install). */
	model: string;
	keys: Cell[];
	/** Number of dials (each gets the touch-strip action), 0 for a deck without any. */
	dials: number;
	keySeedPrefix?: string;
}

function writeProfile(spec: ProfileSpec): void {
	const profileUuid = uuidFrom(`profile:${spec.seed}`);
	const pageUuid = uuidFrom(`page:${spec.seed}:0`);
	const root = `${profileUuid.toUpperCase()}.sdProfile`;
	const pageDir = pageDirName(pageUuid);
	const prefix = spec.keySeedPrefix ?? `action:${spec.seed}:`;

	const keyActions: Record<string, unknown> = {};
	for (const cell of spec.keys) keyActions[`${cell.col},${cell.row}`] = actionEntry(`${prefix}${cell.col},${cell.row}`, ACTION_INFO[cell.role].name, actionUuid(cell.role));
	const controllers: unknown[] = [{ Actions: keyActions, Type: "Keypad" }];
	if (spec.dials > 0) {
		// One touch-strip action per dial: each draws its own 200×100 quarter of the strip.
		const dialActions: Record<string, unknown> = {};
		for (let i = 0; i < spec.dials; i++) dialActions[`${i},0`] = actionEntry(`${prefix}dial:${i}`, STRIP_INFO.name, STRIP_ACTION);
		controllers.push({ Actions: dialActions, Type: "Encoder" });
	}

	const outer = { Device: { Model: spec.model, UUID: "" }, Name: "Rocket League HUD", Pages: { Current: pageUuid, Pages: [pageUuid] }, Version: "2.0" };
	const page = { Controllers: controllers };

	const zip = new AdmZip();
	zip.addFile(`${root}/`, Buffer.alloc(0));
	zip.addFile(`${root}/manifest.json`, Buffer.from(JSON.stringify(outer)));
	zip.addFile(`${root}/Profiles/`, Buffer.alloc(0));
	zip.addFile(`${root}/Profiles/${pageDir}/`, Buffer.alloc(0));
	zip.addFile(`${root}/Profiles/${pageDir}/Images/`, Buffer.alloc(0));
	zip.addFile(`${root}/Profiles/${pageDir}/manifest.json`, Buffer.from(JSON.stringify(page)));

	const out = path.resolve(`${PLUGIN_UUID}.sdPlugin`, "profiles", spec.fileName);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	zip.writeZip(out);
	console.log(`wrote ${path.relative(process.cwd(), out)}  (page dir ${pageDir})`);
}

// One profile per kind of deck (see PROFILES). The 5×3 one keeps the ids it was released with, so decks that have it stay matched.
for (const p of PROFILES) {
	const file = `${p.name.replace(/^profiles\//, "")}.streamDeckProfile`;
	writeProfile({ seed: p.seed, fileName: file, model: p.model, keys: p.keys, dials: p.dials, keySeedPrefix: p.seed === "RL" ? "action:" : undefined });
}
