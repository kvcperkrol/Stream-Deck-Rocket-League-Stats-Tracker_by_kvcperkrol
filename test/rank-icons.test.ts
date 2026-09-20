import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings } from "../src/core/types.ts";
import { iconFileNames, RankIcons } from "../src/sys/rank-icons.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";

// The smallest valid PNG (1×1 transparent pixel).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

function folder() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "rlhud-icons-"));
}

test("file names follow the tier: diamond-2.png, grand-champion-3.png, supersonic-legend.png, unranked.png, or the tier number", () => {
	assert.deepEqual(iconFileNames(14), ["diamond-2.png", "14.png"]);
	assert.equal(iconFileNames(21)[0], "grand-champion-3.png");
	assert.deepEqual(iconFileNames(22), ["supersonic-legend.png", "ssl.png", "22.png"]);
	assert.deepEqual(iconFileNames(0), ["unranked.png", "0.png"]);
	assert.deepEqual(iconFileNames(99), []);
});

test("a PNG dropped into the folder is found; anything else is ignored", () => {
	const dir = folder();
	let now = 1_000;
	const icons = new RankIcons(dir, () => now);
	assert.equal(icons.get(14), undefined, "empty folder: nothing");
	fs.writeFileSync(path.join(dir, "diamond-2.png"), PNG);
	assert.equal(icons.get(14), undefined, "a lookup is trusted for a few seconds");
	now += 6_000;
	assert.ok(icons.get(14)?.startsWith("data:image/png;base64,"), "…then the new file is picked up without a restart");
	fs.writeFileSync(path.join(dir, "10.png"), "this is not a png");
	fs.writeFileSync(path.join(dir, "11.png"), Buffer.concat([PNG, Buffer.alloc(300 * 1024)]));
	assert.equal(icons.get(10), undefined, "a file that is not a PNG is ignored");
	assert.equal(icons.get(11), undefined, "a huge file is ignored (it would be embedded into every key image)");
	assert.equal(icons.count(), 1);
	fs.writeFileSync(path.join(dir, "15.png"), PNG);
	now += 6_000;
	assert.ok(icons.get(15), "the tier number works as a file name too");
});

test("the rank key uses the supplied icon, and the built-in emblem otherwise", () => {
	const store = new MatchStore(() => 5_000);
	store.setGameRunning(true);
	store.setConnected(true);
	const p = (n: string, t: number) => ({ Name: n, PrimaryId: `Epic|${n}|0`, TeamNum: t, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0 });
	store.handle({
		Event: "UpdateState",
		Data: { MatchGuid: "G", Players: [p("a", 0), p("b", 0), p("c", 1), p("d", 1)], Game: { Teams: [{ Name: "Blue", TeamNum: 0, Score: 0 }, { Name: "Orange", TeamNum: 1, Score: 0 }], PlaylistId: 11, TimeSeconds: 200, Ball: { Speed: 0, TeamNum: 255 }, bReplay: false, Arena: "Stadium_P", bHasTarget: false } },
	});
	const ctx: RenderCtx = { store, settings: mergeSettings({ ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }), now: 5_000, restartHint: false };
	const plain = renderRole("rank", ctx);
	assert.ok(!plain.includes("<image") && plain.includes("DIAMOND"), "no icon supplied: the drawn emblem");
	const withIcon = renderRole("rank", { ...ctx, rankIcon: (id) => (id === 14 ? "data:image/png;base64,AAAA" : undefined) });
	assert.ok(withIcon.includes("<image") && withIcon.includes("data:image/png;base64,AAAA"), "icon supplied: it is drawn");
	assert.ok(withIcon.includes("DIAMOND") && withIcon.includes("DIV 2"), "the text stays under the icon");
	assert.ok(!withIcon.includes("eg14"), "and the built-in emblem is not drawn on top of it");
});

test("bundled icons are the fallback, and a file in the user folder wins over them", () => {
	const user = folder();
	const bundled = folder();
	fs.writeFileSync(path.join(bundled, "diamond-2.png"), PNG);
	let now = 1_000;
	const icons = new RankIcons(user, () => now, [bundled]);
	const fromBundle = icons.get(14);
	assert.ok(fromBundle?.startsWith("data:image/png;base64,"), "nothing in the user folder: the bundled icon is used");
	assert.equal(icons.count(), 0, "bundled icons are not counted as custom ones");
	const custom = Buffer.concat([PNG, Buffer.from([0])]);
	fs.writeFileSync(path.join(user, "diamond-2.png"), custom);
	now += 6_000;
	assert.equal(icons.get(14), `data:image/png;base64,${custom.toString("base64")}`, "the user's file wins");
	assert.equal(icons.count(), 1);
});

test("the plugin ships an icon for every tier, all valid and small", () => {
	const dir = path.resolve("mov.remake.rlhud.sdPlugin", "imgs", "ranks");
	for (let id = 0; id <= 22; id++) {
		const file = path.join(dir, iconFileNames(id)[0]!);
		assert.ok(fs.existsSync(file), `missing ${path.basename(file)}`);
		const buf = fs.readFileSync(file);
		assert.ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), `${path.basename(file)} is not a PNG`);
		assert.ok(buf.length < 40 * 1024, `${path.basename(file)} is large`);
	}
	assert.ok(fs.existsSync(path.join(dir, "NOTICE.txt")), "the attribution notice ships with the icons");
});
