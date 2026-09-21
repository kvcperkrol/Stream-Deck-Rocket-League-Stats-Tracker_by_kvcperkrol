import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { KICKOFF_COUNTDOWN_MS, MatchStore } from "../src/core/match-store.ts";
import { mergeSettings } from "../src/core/types.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";
import { renderStrip } from "../src/ui/strip.ts";

function setup(offset = 0) {
	let now = 10_000;
	const store = new MatchStore(() => now);
	store.setGameRunning(true);
	store.setConnected(true);
	store.handle({ Event: "CountdownBegin", Data: {} });
	const ctx = (): RenderCtx => ({ store, settings: mergeSettings({ lang: "en", countdownOffsetMs: offset }), now, restartHint: false });
	return { store, ctx, at: (age: number) => ((now = 10_000 + age), ctx()) };
}

/** What the middle banner key shows: a digit, the KICKOFF pre-roll, or something else. */
function shown(ctx: RenderCtx): string {
	const key = renderRole("banner", ctx, { slice: 1 });
	const digit = /font-weight="700"[^>]*>([123])<\/text>/.exec(key)?.[1];
	return digit ?? (key.includes("KICKOFF") ? "kickoff" : "other");
}

test("the countdown length is what the game does: 4.0 s from CountdownBegin to RoundStarted", () => {
	const { deltasMs } = JSON.parse(fs.readFileSync("test/fixtures/countdown-real.json", "utf8")) as { deltasMs: number[] };
	const sorted = [...deltasMs].sort((a, b) => a - b);
	const median = sorted[Math.floor(sorted.length / 2)]!;
	assert.ok(Math.abs(KICKOFF_COUNTDOWN_MS - median) <= 30, `median ${median} ms`);
	assert.ok(sorted[0]! > 3900 && sorted.at(-1)! < 4100, "the real durations are steady");
});

test("3 – 2 – 1 fill the last three seconds before the round starts; the first second is the kickoff camera", () => {
	const { at } = setup();
	assert.equal(shown(at(300)), "kickoff", "0.3 s: nothing to count yet");
	assert.equal(shown(at(950)), "kickoff");
	assert.equal(shown(at(1100)), "3");
	assert.equal(shown(at(2100)), "2");
	assert.equal(shown(at(3100)), "1");
	assert.equal(shown(at(3900)), "1", "still 1 until the round starts");
});

test("the banner stays up until the round really starts, then GO! takes over", () => {
	const { store, at } = setup();
	assert.equal(shown(at(4300)), "1", "the old 3.4 s lifetime dropped the banner 0.6 s early");
	store.handle({ Event: "RoundStarted", Data: {} });
	const go = renderRole("banner", at(4100), { slice: 1 });
	assert.ok(go.includes("GO!") && !go.includes("KICKOFF"));
});

test("the calibration offset shifts the digits: + later, − earlier", () => {
	assert.equal(shown(setup(+500).at(1100)), "kickoff", "500 ms later: still waiting at 1.1 s");
	assert.equal(shown(setup(+500).at(1600)), "3");
	assert.equal(shown(setup(-500).at(600)), "3", "500 ms earlier: the 3 is already up at 0.6 s");
	assert.equal(shown(setup(-500).at(2600)), "1");
});

test("on the touch strip the same digit is centred, with the KICKOFF label above it", () => {
	const { at } = setup();
	const seg = renderStrip(at(2100), 1);
	assert.ok(/>2<\/text>/.test(seg) && seg.includes("KICKOFF"));
	const pre = renderStrip(at(300), 2);
	assert.ok(pre.includes("KICKOFF") && !/>[123]<\/text>/.test(pre), "pre-roll on the strip");
});

test("the offset setting is a whole number of milliseconds within ±1.5 s", () => {
	assert.equal(mergeSettings({}).countdownOffsetMs, 0);
	assert.equal(mergeSettings({ countdownOffsetMs: 250.4 }).countdownOffsetMs, 250);
	assert.equal(mergeSettings({ countdownOffsetMs: 9999 }).countdownOffsetMs, 1500);
	assert.equal(mergeSettings({ countdownOffsetMs: -9999 }).countdownOffsetMs, -1500);
	assert.equal(mergeSettings({ countdownOffsetMs: "x" as never }).countdownOffsetMs, 0);
});
