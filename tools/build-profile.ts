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
import { actionUuid, LAYOUT, PLUGIN_UUID } from "../src/ui/layout.ts";
import { ACTION_INFO } from "./build-manifest.ts";
import { pageDirName } from "./profile-format.ts";

/** Deterministic UUID so rebuilding the plugin never changes ids. */
function uuidFrom(seed: string): string {
	const h = createHash("sha1").update(`${PLUGIN_UUID}/${seed}`).digest();
	h[6] = (h[6]! & 0x0f) | 0x50;
	h[8] = (h[8]! & 0x3f) | 0x80;
	const x = h.subarray(0, 16).toString("hex");
	return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

const profileUuid = uuidFrom("profile:RL");
const pageUuid = uuidFrom("page:RL:0");
const root = `${profileUuid.toUpperCase()}.sdProfile`;
const pageDir = pageDirName(pageUuid);

const actions: Record<string, unknown> = {};
for (const cell of LAYOUT) {
	actions[`${cell.col},${cell.row}`] = {
		ActionID: uuidFrom(`action:${cell.col},${cell.row}`),
		LinkedTitle: true,
		Name: ACTION_INFO[cell.role].name,
		// Banner keys deliberately carry no slice: they order themselves left to right, so the user can rearrange freely.
		Settings: {},
		State: 0,
		States: [{}],
		UUID: actionUuid(cell.role),
	};
}

const outer = { Device: { Model: "VSD/WiFi", UUID: "" }, Name: "Rocket League HUD", Pages: { Current: pageUuid, Pages: [pageUuid] }, Version: "2.0" };
const page = { Controllers: [{ Actions: actions, Type: "Keypad" }] };

const zip = new AdmZip();
zip.addFile(`${root}/`, Buffer.alloc(0));
zip.addFile(`${root}/manifest.json`, Buffer.from(JSON.stringify(outer)));
zip.addFile(`${root}/Profiles/`, Buffer.alloc(0));
zip.addFile(`${root}/Profiles/${pageDir}/`, Buffer.alloc(0));
zip.addFile(`${root}/Profiles/${pageDir}/Images/`, Buffer.alloc(0));
zip.addFile(`${root}/Profiles/${pageDir}/manifest.json`, Buffer.from(JSON.stringify(page)));

const out = path.resolve(`${PLUGIN_UUID}.sdPlugin`, "profiles", "RL.streamDeckProfile");
fs.mkdirSync(path.dirname(out), { recursive: true });
zip.writeZip(out);
console.log(`wrote ${path.relative(process.cwd(), out)}  (page dir ${pageDir})`);
