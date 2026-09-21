import assert from "node:assert/strict";
import test from "node:test";
import { Resvg } from "@resvg/resvg-js";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings } from "../src/core/types.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { renderStrip } from "../src/ui/strip.ts";

const P = (name: string, id: string, team: number, x: object = {}) => ({ Name: name, PrimaryId: id, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0, ...x });

function live(playlist = 11) {
	let now = 10_000;
	const store = new MatchStore(() => now);
	store.setLocalIdentity({ name: "Me", id: "Epic|1|0" });
	store.setGameRunning(true);
	store.setConnected(true);
	store.handle({
		Event: "UpdateState",
		Data: {
			MatchGuid: "G",
			Players: [P("Me", "Epic|1|0", 0, { Score: 457, Goals: 3, Assists: 1, Saves: 2 }), P("Mate", "Epic|2|0", 0), P("Rival", "Epic|3|0", 1)],
			Game: { Teams: [{ Name: "Blue", TeamNum: 0, Score: 2 }, { Name: "Orange", TeamNum: 1, Score: 1 }], PlaylistId: playlist, TimeSeconds: 100, Ball: { Speed: 60, TeamNum: 0 }, bReplay: false, Arena: "Stadium_P", bHasTarget: false },
		},
	});
	const ctx = (): RenderCtx => ({
		store,
		settings: mergeSettings({ lang: "en", ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }),
		now,
		restartHint: false,
		autoMmr: { 11: { mmr: 964, at: "t", delta: 10 } },
	});
	return { store, ctx, advance: (ms: number) => (now += ms) };
}

const segments = (ctx: RenderCtx) => [0, 1, 2, 3].map((i) => renderStrip(ctx, i));

test("every segment is a valid 200×100 SVG", () => {
	const { ctx } = live();
	for (const svg of segments(ctx())) {
		assert.ok(svg.startsWith("<svg") && svg.includes('width="200" height="100"'));
		assert.doesNotThrow(() => new Resvg(svg).render());
	}
});

test("idle in a live match: four panels — rank, MMR, last goal, my stats", () => {
	const { ctx } = live();
	const [rank, mmr, goal, stats] = segments(ctx());
	assert.ok(rank!.includes("DIAMOND") && rank!.includes("DIV 2") && rank!.includes("DOUBLES"));
	assert.ok(mmr!.includes(">964<") && mmr!.includes(">MMR<") && mmr!.includes("+10"));
	assert.ok(goal!.includes("LAST GOAL") && goal!.includes("NONE"));
	assert.ok(stats!.includes("GOALS") && stats!.includes(">3<") && stats!.includes(">1<") && stats!.includes(">2<"));
	assert.ok(!rank!.includes("translate(-"), "panels are not slices of one scene");
});

test("casual play: the rank panel says UNRANKED, and the MMR panel is labelled casual", () => {
	const { ctx } = live(2);
	const [rank, mmr] = segments({ ...ctx(), autoMmr: { 2: { mmr: 1048, at: "t" } } });
	assert.ok(rank!.includes("UNRANKED") && !rank!.includes("DIAMOND"));
	assert.ok(mmr!.includes("CASUAL MMR") && mmr!.includes(">1048<"));
});

test("a goal takes over the whole strip: one scene, each segment showing its own quarter", () => {
	const { store, ctx, advance } = live();
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 86, GoalTime: 20, Scorer: { Name: "Me", TeamNum: 0 }, Assister: { Name: "Mate", TeamNum: 0 } } });
	advance(400);
	const segs = segments(ctx());
	segs.forEach((svg, i) => {
		assert.ok(svg.includes("GOAL!"), `segment ${i} carries the scene`);
		assert.ok(svg.includes(`translate(${i === 0 ? 0 : -i * 200} 0)`), `segment ${i} is offset by ${i * 200}px`);
	});
	assert.equal(new Set(segs).size, 4, "the four images differ");
	assert.ok(segs[0]!.includes(">86<") && segs[0]!.includes("KM/H"), "the ball speed is in the left slot");
	assert.ok(segs[3]!.includes("Mate") && segs[3]!.includes("ASSIST"), "the assist is in the right slot");
	advance(6_000);
	assert.ok(!renderStrip(ctx(), 1).includes("GOAL!"), "and the panels are back once the banner has expired");
});

test("a demo puts attacker and victim at the two ends", () => {
	const { store, ctx, advance } = live();
	store.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Me", TeamNum: 0 }, SecondaryTarget: { Name: "Rival", TeamNum: 1 } } });
	advance(300);
	const svg = renderStrip(ctx(), 0);
	assert.ok(svg.includes("DEMO!") && svg.includes(">Me<") && svg.includes(">Rival<"));
});

test("game not running / menu: the strip shows the state across its full width", () => {
	const store = new MatchStore(() => 5_000);
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en" }), now: 5_000, restartHint: false };
	assert.ok(renderStrip(ctx, 0).includes("ROCKET LEAGUE"));
	store.setGameRunning(true);
	store.setConnected(true);
	assert.ok(renderStrip(ctx, 3).includes("MENU"));
});

test("Polish texts are used when the language is Polish", () => {
	const { ctx } = live();
	const stats = renderStrip({ ...ctx(), settings: mergeSettings({ lang: "pl", ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }) }, 3);
	assert.ok(stats.includes("GOLE") && stats.includes("ASYSTY") && stats.includes("OBRONY"));
});
