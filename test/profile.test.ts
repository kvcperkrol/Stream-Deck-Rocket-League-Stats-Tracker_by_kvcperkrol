import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { ROLES } from "../src/ui/context.ts";
import { actionUuid, DEVICE_TYPE_PLUS, LAYOUT, LAYOUT_PLUS, LEGACY_ACTIONS, legacyUuid, PLUGIN_UUID, PLUS_DIALS, PROFILE_PLUS_NAME, STRIP_ACTION } from "../src/ui/layout.ts";
import { pageDirName } from "../tools/profile-format.ts";

const PLUGIN = path.resolve(`${PLUGIN_UUID}.sdPlugin`);

test("page directory naming reproduces a page shipped by another plugin's profile", () => {
	assert.equal(pageDirName("e84126e6-de95-49bf-a812-93359e423de4"), "T10IDPMVIL4RWA0IICQPSGHTSGZ");
	// …and the page of Elgato's own Stream Deck + profile (Volume Controller+)
	assert.equal(pageDirName("9cb0b89b-2b37-43c2-9f08-7a31be82bd56"), "JIOBH6PB6T1S57O8F8ORT0LTAOZ");
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
	assert.deepEqual(visible.map((a: { UUID: string }) => a.UUID).sort(), [...ROLES.map(actionUuid), STRIP_ACTION].sort());
	// keys of older versions stay declared (hidden), so a deck that still has them keeps working
	const hidden = manifest.Actions.filter((a: { VisibleInActionsList?: boolean }) => a.VisibleInActionsList === false);
	assert.deepEqual(hidden.map((a: { UUID: string }) => a.UUID).sort(), Object.keys(LEGACY_ACTIONS).map(legacyUuid).sort());
	assert.equal(manifest.ApplicationsToMonitor.windows[0], "RocketLeague.exe");
	const refs: string[] = [manifest.Icon, manifest.CategoryIcon];
	for (const a of manifest.Actions) refs.push(a.Icon, ...a.States.map((s: { Image: string }) => s.Image), ...(a.Encoder?.Icon ? [a.Encoder.Icon] : []));
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

test("the Stream Deck + action is a dial action whose layout file exists and offers one 200×100 canvas", () => {
	const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN, "manifest.json"), "utf8"));
	const strip = manifest.Actions.find((a: { UUID: string }) => a.UUID === STRIP_ACTION);
	assert.deepEqual(strip.Controllers, ["Encoder"]);
	const layout = JSON.parse(fs.readFileSync(path.join(PLUGIN, strip.Encoder.layout), "utf8"));
	assert.deepEqual(layout.items, [{ key: "canvas", type: "pixmap", rect: [0, 0, 200, 100] }]);
	assert.ok(manifest.Profiles.some((p: { Name: string; DeviceType: number }) => p.Name === PROFILE_PLUS_NAME && p.DeviceType === DEVICE_TYPE_PLUS), "a profile is declared for the Stream Deck +");
	assert.ok(fs.existsSync(path.join(PLUGIN, `${PROFILE_PLUS_NAME}.streamDeckProfile`)));
});

function plusProfile() {
	const zip = new AdmZip(path.join(PLUGIN, "profiles", "RL-Plus.streamDeckProfile"));
	const names = zip.getEntries().map((e) => e.entryName);
	const outer = JSON.parse(zip.readAsText(names.find((n) => /^[0-9A-F-]{36}\.sdProfile\/manifest\.json$/.test(n))!));
	const pageDir = pageDirName(outer.Pages.Pages[0]);
	const page = JSON.parse(zip.readAsText(names.find((n) => n.endsWith(`/Profiles/${pageDir}/manifest.json`))!));
	return { outer, page };
}

test("the Stream Deck + profile: 8 keys and one touch-strip action per dial, in the structure Elgato's own + profile has", () => {
	const { outer, page } = plusProfile();
	assert.equal(outer.Device.Model, "20GBD9901", "the Stream Deck + model number");
	assert.deepEqual(page.Controllers.map((c: { Type: string }) => c.Type), ["Keypad", "Encoder"]);
	const keys = page.Controllers[0].Actions as Record<string, { UUID: string }>;
	assert.equal(Object.keys(keys).length, 8);
	for (const cell of LAYOUT_PLUS) assert.equal(keys[`${cell.col},${cell.row}`]?.UUID, actionUuid(cell.role));
	assert.ok(Object.keys(keys).every((k) => /^[0-3],[01]$/.test(k)), "4 columns × 2 rows");
	const dials = page.Controllers[1].Actions as Record<string, { UUID: string; ActionID: string }>;
	assert.deepEqual(Object.keys(dials).sort(), ["0,0", "1,0", "2,0", "3,0"].slice(0, PLUS_DIALS));
	assert.ok(Object.values(dials).every((d) => d.UUID === STRIP_ACTION));
	const ids = [...Object.values(keys), ...Object.values(dials)].map((a) => (a as unknown as { ActionID: string }).ActionID);
	assert.equal(new Set(ids).size, ids.length, "action ids are unique");
});

test("the Stream Deck + profile has the same shape as Elgato's Volume Controller+ profile (when that plugin is installed)", () => {
	const sample = path.join(process.env.APPDATA ?? "", "Elgato", "StreamDeck", "Plugins", "com.elgato.volume-controller.sdPlugin", "Volume Controller+ (Auto).streamDeckProfile");
	if (!fs.existsSync(sample)) return;
	const ref = new AdmZip(sample);
	const pageText = ref.readAsText(ref.getEntries().find((e) => /Profiles\/[^/]+\/manifest\.json$/.test(e.entryName))!);
	const outerText = ref.readAsText(ref.getEntries().find((e) => /^[^/]+\.sdProfile\/manifest\.json$/.test(e.entryName))!);
	if (!pageText || !outerText) return; // this zip library cannot read Elgato's archive on this machine
	const refPage = JSON.parse(pageText);
	const refOuter = JSON.parse(outerText);
	const { outer, page } = plusProfile();
	assert.equal(outer.Device.Model, refOuter.Device.Model);
	assert.deepEqual(page.Controllers.map((c: { Type: string }) => c.Type), refPage.Controllers.map((c: { Type: string }) => c.Type));
	assert.deepEqual(Object.keys(page.Controllers[1].Actions), Object.keys(refPage.Controllers[1].Actions).slice(0, 4), "dial actions are keyed 0,0 … 3,0");
});
