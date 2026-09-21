import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { ROLES } from "../src/ui/context.ts";
import { actionUuid, DeviceTypes, PLUGIN_UUID, PROFILE_NAME, PROFILES, profileNameFor, STRIP_ACTION } from "../src/ui/layout.ts";
import { pageDirName } from "../tools/profile-format.ts";

const PLUGIN = path.resolve(`${PLUGIN_UUID}.sdPlugin`);

test("every model gets its own profile: the table covers the Stream Deck, Mini, XL, Neo, + and the mobile app", () => {
	const covered = new Set(PROFILES.flatMap((p) => p.deviceTypes));
	for (const type of [DeviceTypes.StreamDeck, DeviceTypes.Mini, DeviceTypes.XL, DeviceTypes.Mobile, DeviceTypes.Plus, DeviceTypes.Neo]) assert.ok(covered.has(type), `device type ${type}`);
	assert.equal(new Set(PROFILES.map((p) => p.name)).size, PROFILES.length, "profile names are unique");
	const seen = new Set<number>();
	for (const p of PROFILES) for (const t of p.deviceTypes) assert.ok(!seen.has(t) && seen.add(t), `device type ${t} belongs to one profile`);
});

test("each profile layout fits its deck, has no duplicate cells and only known roles", () => {
	for (const p of PROFILES) {
		const cells = new Set<string>();
		for (const c of p.keys) {
			assert.ok(c.col >= 0 && c.col < p.columns && c.row >= 0 && c.row < p.rows, `${p.name}: ${c.col},${c.row} is outside ${p.columns}×${p.rows}`);
			assert.ok(!cells.has(`${c.col},${c.row}`), `${p.name}: duplicate cell ${c.col},${c.row}`);
			cells.add(`${c.col},${c.row}`);
			assert.ok(ROLES.includes(c.role), `${p.name}: unknown role ${c.role}`);
		}
		// the banner needs its three keys side by side, in one row
		const banner = p.keys.filter((c) => c.role === "banner");
		if (banner.length > 0) {
			assert.equal(banner.length, 3, `${p.name}: three banner keys`);
			assert.equal(new Set(banner.map((c) => c.row)).size, 1, `${p.name}: banner keys share a row`);
			const cols = banner.map((c) => c.col).sort();
			assert.deepEqual(cols, [cols[0]!, cols[0]! + 1, cols[0]! + 2], `${p.name}: banner keys are adjacent`);
		}
	}
});

test("the deck grids match the real devices", () => {
	const grid = (name: string) => PROFILES.find((p) => p.name === name)!;
	assert.deepEqual([grid(PROFILE_NAME).columns, grid(PROFILE_NAME).rows], [5, 3]);
	assert.deepEqual([grid("profiles/RL-Mini").columns, grid("profiles/RL-Mini").rows], [3, 2]);
	assert.deepEqual([grid("profiles/RL-XL").columns, grid("profiles/RL-XL").rows], [8, 4]);
	assert.deepEqual([grid("profiles/RL-Neo").columns, grid("profiles/RL-Neo").rows], [4, 2]);
	assert.deepEqual([grid("profiles/RL-Plus").columns, grid("profiles/RL-Plus").rows, grid("profiles/RL-Plus").dials], [4, 2, 4]);
});

test("the plugin switches a deck to the profile of its own model", () => {
	assert.equal(profileNameFor(DeviceTypes.StreamDeck, 5, 3), PROFILE_NAME);
	assert.equal(profileNameFor(DeviceTypes.Mobile, 5, 3), PROFILE_NAME);
	assert.equal(profileNameFor(DeviceTypes.Mini, 3, 2), "profiles/RL-Mini");
	assert.equal(profileNameFor(DeviceTypes.XL, 8, 4), "profiles/RL-XL");
	assert.equal(profileNameFor(DeviceTypes.Neo, 4, 2), "profiles/RL-Neo");
	assert.equal(profileNameFor(DeviceTypes.Plus, 4, 2), "profiles/RL-Plus");
	assert.equal(profileNameFor(99, 5, 3), PROFILE_NAME, "an unknown deck with a 5×3 grid still gets the 5×3 profile");
	assert.equal(profileNameFor(5, 0, 0), undefined, "a pedal has no keys: nothing to switch");
});

test("the manifest declares every profile for its device types, installed automatically but never switched to", () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"));
	for (const p of PROFILES) {
		for (const t of p.deviceTypes) {
			const entry = manifest.Profiles.find((m: { Name: string; DeviceType: number }) => m.Name === p.name && m.DeviceType === t);
			assert.ok(entry, `${p.name} for device type ${t}`);
			assert.equal(entry.AutoInstall, true);
			assert.equal(entry.DontAutoSwitchWhenInstalled, true);
		}
		assert.ok(fs.existsSync(path.join(PLUGIN, `${p.name}.streamDeckProfile`)), `${p.name} file exists`);
	}
});

test("every bundled profile places its layout, with a touch-strip action on each dial where there are dials", () => {
	for (const p of PROFILES) {
		const zip = new AdmZip(path.join(PLUGIN, `${p.name}.streamDeckProfile`));
		const names = zip.getEntries().map((e) => e.entryName);
		const outer = JSON.parse(zip.readAsText(names.find((n) => /^[0-9A-F-]{36}\.sdProfile\/manifest\.json$/.test(n))!));
		assert.equal(outer.Version, "2.0");
		assert.equal(outer.Device.Model, p.model);
		const page = JSON.parse(zip.readAsText(names.find((n) => n.endsWith(`/Profiles/${pageDirName(outer.Pages.Pages[0])}/manifest.json`))!));
		const keys = page.Controllers[0].Actions as Record<string, { UUID: string; ActionID: string }>;
		assert.equal(page.Controllers[0].Type, "Keypad");
		assert.equal(Object.keys(keys).length, p.keys.length, `${p.name}: key count`);
		for (const c of p.keys) assert.equal(keys[`${c.col},${c.row}`]?.UUID, actionUuid(c.role), `${p.name}: ${c.col},${c.row}`);
		const ids = Object.values(keys).map((a) => a.ActionID);
		if (p.dials > 0) {
			assert.equal(page.Controllers[1].Type, "Encoder");
			const dials = Object.values(page.Controllers[1].Actions) as { UUID: string; ActionID: string }[];
			assert.equal(dials.length, p.dials);
			assert.ok(dials.every((d) => d.UUID === STRIP_ACTION));
			ids.push(...dials.map((d) => d.ActionID));
		} else {
			assert.equal(page.Controllers.length, 1, `${p.name}: a deck without dials has only a keypad`);
		}
		assert.equal(new Set(ids).size, ids.length, `${p.name}: action ids are unique`);
	}
});
