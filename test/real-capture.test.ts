import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { decodeFrame } from "../src/net/decode.ts";

/**
 * Regression test on a REAL recording: a 7-minute free-play session (7 goals, each followed by a goal replay).
 * Every message is pushed through the same decoder the plugin uses. The score shown must be exactly what the game reports,
 * no matter how many replays are watched.
 */
const file = path.resolve("test", "fixtures", "real-freeplay.ndjson");
const rows = fs
	.readFileSync(file, "utf8")
	.split("\n")
	.filter(Boolean)
	.map((l) => JSON.parse(l) as { t: number; raw: unknown });

test("real free-play recording: the score is never double counted and never goes backwards", () => {
	let now = 0;
	const store = new MatchStore(() => now);
	store.setGameRunning(true);
	store.setConnected(true);

	let goals = 0;
	let lastScores: [number, number] = [0, 0];
	let lastReported: [number, number] | undefined;
	let replaySeen = false;

	for (const row of rows) {
		now = row.t;
		const msg = decodeFrame(JSON.stringify(row.raw));
		assert.ok(msg, "every recorded frame decodes");
		const before: [number, number] = [...store.state.scores];
		store.handle(msg);

		if (msg.Event === "UpdateState") {
			const g = msg.Data.Game;
			if (g.bReplay) replaySeen = true;
			else {
				lastReported = [g.Teams[0].Score, g.Teams[1].Score];
				assert.deepEqual(store.state.scores, lastReported, "the deck shows exactly what the game reports");
			}
		}
		if (msg.Event === "GoalScored") {
			goals++;
			assert.deepEqual(store.state.scores, before, "a goal announcement does not touch a score the game already reports");
		}
		assert.ok(store.state.scores[0] >= lastScores[0] && store.state.scores[1] >= lastScores[1], "the score never goes backwards");
		lastScores = [...store.state.scores];
	}

	assert.equal(goals, 7);
	assert.ok(replaySeen, "the recording contains replays");
	assert.deepEqual(store.state.scores, lastReported);
	assert.equal(store.state.scores[0], 8, "1 goal before the recording started + 7 recorded goals");
});

test("real free-play recording: last goal, ball speed, 'me' and the mode are read correctly", () => {
	let now = 0;
	const store = new MatchStore(() => now);
	store.setGameRunning(true);
	store.setConnected(true);
	let maxBall = 0;
	for (const row of rows) {
		now = row.t;
		store.handle(decodeFrame(JSON.stringify(row.raw))!);
		maxBall = Math.max(maxBall, store.state.ballSpeedKmh);
	}
	assert.equal(store.state.lastGoal?.scorer, "TestPlayer");
	assert.ok(Math.abs((store.state.lastGoal?.speedKmh ?? 0) - 92) < 0.5, "last goal speed 92 km/h");
	assert.ok(maxBall > 60 && maxBall < 130, `ball speed is in km/h, saw max ${maxBall}`);
	assert.equal(store.state.meName, "TestPlayer");
	assert.equal(store.state.playlistId, 9);
});
