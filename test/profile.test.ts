import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { ROLES } from "../src/ui/context.ts";
import { actionUuid, LAYOUT, LEGACY_ACTIONS, legacyUuid, PLUGIN_UUID } from "../src/ui/layout.ts";
import { pageDirName } from "../tools/profile-format.ts";

const PLUGIN = path.resolve(`${PLUGIN_UUID}.sdPlugin`);

test("page directory naming reproduces a page shipped by another plugin's profile", () => {
	assert.equal(pageDirName("e84126e6-de95-49bf-a812-93359e423de4"), "T10IDPMVIL4RWA0IICQPSGHTSGZ");
});

test("layout is a full 5×3 grid without duplicates and uses only known roles", () => {
	assert.equal(LAYOUT.length, 15);
	const cells = new Set(LAYOUT.map((c) => `${c.col},${c.row}`));
	assert.equal(cells.size, 15);
	for (const c of LAYOUT) {
		assert.ok(c.col >= 0 && c.col < 5 && c.row >= 0 && c.row < 3);
		assert.ok(ROLES.includes(c.role));
	}
	assert.equal(LAYOUT.filter((c) => c.role === "banner").length, 3);
});

test("manifest declares an action for every role, and every referenced image exists", () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"));
	assert.equal(manifest.UUID, PLUGIN_UUID);
	const visible = manifest.Actions.filter((a: { VisibleInActionsList?: boolean }) => a.VisibleInActionsList !== false);
	assert.deepEqual(visible.map((a: { UUID: string }) => a.UUID).sort(), ROLES.map(actionUuid).sort());
	// keys of older versions stay declared (hidden), so a deck that still has them keeps working
	const hidden = manifest.Actions.filter((a: { VisibleInActionsList?: boolean }) => a.VisibleInActionsList === false);
	assert.deepEqual(hidden.map((a: { UUID: string }) => a.UUID).sort(), Object.keys(LEGACY_ACTIONS).map(legacyUuid).sort());
	assert.equal(manifest.ApplicationsToMonitor.windows[0], "RocketLeague.exe");
	const refs: string[] = [manifest.Icon, manifest.CategoryIcon];
	for (const a of manifest.Actions) refs.push(a.Icon, ...a.States.map((s: { Image: string }) => s.Image));
	for (const ref of refs) {
		for (const suffix of [".png", "@2x.png"]) assert.ok(fs.existsSync(path.join(PLUGIN, ref + suffix)), `${ref}${suffix} missing`);
	}
});

test("bundled profile matches the structure Stream Deck itself writes, and places every layout cell", () => {
	const zip = new AdmZip(path.join(PLUGIN, "profiles", "RL.streamDeckProfile"));
	const names = zip.getEntries().map((e) => e.entryName);
	const outerName = names.find((n) => /^[0-9A-F-]{36}\.sdProfile\/manifest\.json$/.test(n));
	assert.ok(outerName, "outer manifest");
	const outer = JSON.parse(zip.readAsText(outerName!));
	assert.equal(outer.Version, "2.0");
	assert.equal(outer.Pages.Pages.length, 1);
	assert.equal(outer.Pages.Current, outer.Pages.Pages[0]);

	const pageDir = pageDirName(outer.Pages.Pages[0]);
	const pageManifest = names.find((n) => n.endsWith(`/Profiles/${pageDir}/manifest.json`));
	assert.ok(pageManifest, `page folder ${pageDir} must be derived from the page UUID`);

	const page = JSON.parse(zip.readAsText(pageManifest!));
	const actions = page.Controllers[0].Actions as Record<string, { UUID: string; ActionID: string }>;
	assert.equal(page.Controllers[0].Type, "Keypad");
	assert.equal(Object.keys(actions).length, 15);
	for (const cell of LAYOUT) assert.equal(actions[`${cell.col},${cell.row}`]?.UUID, actionUuid(cell.role));
	assert.equal(new Set(Object.values(actions).map((a) => a.ActionID)).size, 15, "action ids are unique");
});

test("the profile matches the shape of a real one shipped by another plugin (same keys at every level)", () => {
	const sample = path.join(process.env.APPDATA ?? "", "Elgato", "StreamDeck", "Plugins", "dev.theca11.whack-a-mole.sdPlugin", "profiles", "SD.streamDeckProfile");
	if (!fs.existsSync(sample)) return; // reference profile not installed on this machine
	const ref = new AdmZip(sample);
	const refPage = JSON.parse(ref.readAsText(ref.getEntries().find((e) => /Profiles\/[^/]+\/manifest\.json$/.test(e.entryName))!));
	const ours = new AdmZip(path.join(PLUGIN, "profiles", "RL.streamDeckProfile"));
	const ourPage = JSON.parse(ours.readAsText(ours.getEntries().find((e) => /Profiles\/[^/]+\/manifest\.json$/.test(e.entryName))!));
	assert.deepEqual(Object.keys(ourPage), Object.keys(refPage));
	assert.deepEqual(Object.keys(ourPage.Controllers[0]).sort(), Object.keys(refPage.Controllers[0]).sort());
	const a = Object.values(ourPage.Controllers[0].Actions)[0] as object;
	const b = Object.values(refPage.Controllers[0].Actions)[0] as object;
	assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort());
});
