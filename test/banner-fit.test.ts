import assert from "node:assert/strict";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings } from "../src/core/types.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";

function goalBanner(scorer: string): string {
	let now = 10_000;
	const store = new MatchStore(() => now);
	store.setGameRunning(true);
	store.setConnected(true);
	const p = (n: string, t: number) => ({ Name: n, PrimaryId: `Epic|${n}|0`, TeamNum: t, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0 });
	store.handle({
		Event: "UpdateState",
		Data: { MatchGuid: "G", Players: [p(scorer, 0), p("Mate", 0), p("Rival", 1)], Game: { Teams: [{ Name: "Blue", TeamNum: 0, Score: 1 }, { Name: "Orange", TeamNum: 1, Score: 0 }], PlaylistId: 11, TimeSeconds: 100, Ball: { Speed: 60, TeamNum: 0 }, bReplay: false, Arena: "Stadium_P", bHasTarget: false } },
	});
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 86, GoalTime: 20, Scorer: { Name: scorer, TeamNum: 0 } } });
	now += 500;
	const ctx: RenderCtx = { store, settings: mergeSettings({}), now, restartHint: false };
	return renderRole("banner", ctx, { slice: 2 });
}

test("a normal-length name is shown in full on the goal banner (rounding must not turn it into an ellipsis)", () => {
	const svg = goalBanner("Player1");
	assert.ok(svg.includes(">Player1<"), svg.slice(-300));
	assert.ok(!svg.includes("…"));
});

test("a very long name is cut with an ellipsis instead of running into the neighbouring key", () => {
	const svg = goalBanner("AVeryVeryLongPlayerNameIndeed");
	assert.ok(svg.includes("…"));
	assert.ok(!svg.includes("AVeryVeryLongPlayerNameIndeed"));
});
