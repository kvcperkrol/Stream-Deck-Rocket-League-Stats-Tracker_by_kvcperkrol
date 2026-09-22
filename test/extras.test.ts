import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings } from "../src/core/types.ts";
import { parsePingMs, PingMonitor } from "../src/sys/ping.ts";
import { parseServerLine, readCurrentServer } from "../src/sys/rl-log.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { ROLES } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";
import { LAYOUT_XL } from "../src/ui/layout.ts";
import { renderStrip } from "../src/ui/strip.ts";

const fontSize = (svg: string, content: string): number => Number(new RegExp(`font-size="([\\d.]+)"[^>]*>${content}<`).exec(svg)?.[1] ?? NaN);

function ctxAt(when: Date, over: Partial<RenderCtx> & { twelve?: boolean; lang?: "en" | "pl" } = {}): RenderCtx {
	const store = new MatchStore(() => when.getTime());
	return { store, settings: mergeSettings({ lang: over.lang ?? "en", clock12h: over.twelve ?? false }), now: when.getTime(), restartHint: false, ...over };
}

// ---- settings ----------------------------------------------------------------------------------------------------------------

test("automatic profile switching is off by default, and stays on for whoever turned it on", () => {
	assert.equal(mergeSettings({}).autoSwitch, false);
	assert.equal(mergeSettings({ autoSwitch: true }).autoSwitch, true);
	assert.equal(mergeSettings({ autoSwitch: false }).autoSwitch, false);
});

// ---- clock -------------------------------------------------------------------------------------------------------------------

test("the clock key shows this computer's time and date (24-hour by default)", () => {
	const key = renderRole("clock", ctxAt(new Date(2026, 8, 22, 21, 37, 30))); // a Tuesday
	assert.ok(key.includes(">21<") && key.includes(">37<") && key.includes("TUE 22 SEP"), key.slice(-500));
	assert.ok(!key.includes("PM"));
});

test("12-hour clock: 9 PM, and midnight is 12 AM; Polish date names", () => {
	const pm = renderRole("clock", ctxAt(new Date(2026, 8, 22, 21, 37), { twelve: true }));
	assert.ok(pm.includes(">9<") && pm.includes(">PM<") && pm.includes(">37<"));
	const midnight = renderRole("clock", ctxAt(new Date(2026, 8, 22, 0, 5), { twelve: true }));
	assert.ok(midnight.includes(">12<") && midnight.includes(">AM<"));
	const pl = renderRole("clock", ctxAt(new Date(2026, 8, 22, 8, 0), { lang: "pl" }));
	assert.ok(pl.includes("WT 22 WRZ"));
});

test("the clock is drawn whether or not the game is running", () => {
	const ctx = ctxAt(new Date(2026, 8, 22, 6, 5));
	assert.equal(ctx.store.state.gameRunning, false);
	assert.ok(renderRole("clock", ctx).includes(">06<"));
});

// ---- ping --------------------------------------------------------------------------------------------------------------------

test("ping.exe output is read in any language; a lost packet gives nothing", () => {
	assert.equal(parsePingMs("Reply from 51.21.130.45: bytes=32 time=33ms TTL=112"), 33);
	assert.equal(parsePingMs("Odpowiedź z 51.21.130.45: bajtów=32 czas=33ms TTL=112"), 33);
	assert.equal(parsePingMs("Reply from 127.0.0.1: bytes=32 time<1ms TTL=128"), 1);
	assert.equal(parsePingMs("Request timed out."), undefined);
	assert.equal(parsePingMs("Upłynął limit czasu żądania."), undefined);
});

test("the game logs the server it joins and leaves", () => {
	assert.deepEqual(parseServerLine("[3142.95] Log: LoadMap: 51.21.130.45:9066"), { event: "join", ip: "51.21.130.45", port: 9066 });
	assert.deepEqual(parseServerLine("[3142.95] NetComeGo: Close TcpipConnection_1 51.21.130.45:9066"), { event: "leave", ip: "51.21.130.45", port: 9066 });
	assert.equal(parseServerLine("[1.00] Matchmaking: StartMatchmaking at 2026-09-20 in EU7"), undefined);
	assert.equal(parseServerLine("[1.00] Log: LoadMap: mall_day_p?game=TAGame.GameInfo_Soccar_TA"), undefined, "a map name is not a server");
});

test("the current server is the last one joined and not left again", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rlhud-srv-"));
	const write = (lines: string[]) => fs.writeFileSync(path.join(dir, "Launch.log"), lines.join("\n") + "\n");
	write(["[1.0] Log: LoadMap: 10.0.0.1:9001", "[2.0] NetComeGo: Close TcpipConnection_0 10.0.0.1:9001", "[3.0] Log: LoadMap: 10.0.0.2:9002"]);
	assert.equal(readCurrentServer(dir), "10.0.0.2");
	write(["[1.0] Log: LoadMap: 10.0.0.1:9001", "[2.0] NetComeGo: Close TcpipConnection_0 10.0.0.1:9001"]);
	assert.equal(readCurrentServer(dir), undefined, "left again");
});

test("the ping monitor measures the server, keeps a history, and ignores anything that is not an IPv4 address", async () => {
	const outputs = ["time=30ms", "time=45ms", "Request timed out.", "time=28ms"];
	let n = 0;
	const seen: string[] = [];
	const monitor = new PingMonitor(async (ip) => (seen.push(ip), outputs[n++] ?? ""), () => true, 2000, 3);
	await monitor.sample();
	assert.equal(monitor.state.ms, undefined, "nothing to measure without a match");
	monitor.setTarget("evil; calc.exe");
	assert.equal(monitor.state.target, undefined, "not an address: refused");
	monitor.setTarget("51.21.130.45");
	for (let i = 0; i < 4; i++) await monitor.sample();
	assert.deepEqual(seen, Array(4).fill("51.21.130.45"));
	assert.equal(monitor.state.ms, 28);
	assert.deepEqual(monitor.state.history, [45, null, 28], "the last three samples; a lost packet is null");
	monitor.setTarget(undefined);
	assert.deepEqual(monitor.state, { target: undefined, ms: undefined, history: [] });
});

test("the ping monitor only measures while the game runs, and a packet that returns after the match ended is dropped", async () => {
	let running = false;
	let release: (v: string) => void = () => undefined;
	const monitor = new PingMonitor(() => new Promise<string>((r) => (release = r)), () => running);
	monitor.setTarget("10.0.0.1");
	await monitor.sample();
	assert.equal(monitor.state.ms, undefined, "game not running: no packet sent");
	running = true;
	const pending = monitor.sample();
	monitor.setTarget(undefined);
	release("time=20ms");
	await pending;
	assert.equal(monitor.state.ms, undefined);
});

test("the ping key: no match, a good ping in green, a bad one in red, a lost packet", () => {
	const base = ctxAt(new Date(2026, 8, 22, 12, 0));
	const stale = renderRole("ping", { ...base, ping: { target: "1.2.3.4", ms: 33, history: [33] } });
	assert.ok(stale.includes("NO MATCH"), "game not running: an old server from a log means nothing");
	base.store.setGameRunning(true);
	const none = renderRole("ping", base);
	assert.ok(none.includes("NO MATCH") && !none.includes(">ms<"));
	const good = renderRole("ping", { ...base, ping: { target: "1.2.3.4", ms: 33, history: [30, 33] } });
	assert.ok(good.includes(">33<") && good.includes(">ms<") && good.includes("#2bd576"));
	const bad = renderRole("ping", { ...base, ping: { target: "1.2.3.4", ms: 140, history: [140] } });
	assert.ok(bad.includes(">140<") && bad.includes("#ff3b5c"));
	const lost = renderRole("ping", { ...base, ping: { target: "1.2.3.4", ms: null, history: [null] } });
	assert.ok(lost.includes(">LOSS<"));
});

// ---- the MMR key: record and streak ----------------------------------------------------------------------------------------

function played(results: ("W" | "L")[]) {
	const store = new MatchStore(() => 1_000);
	store.setHistory(results);
	return store;
}

test("the streak counts the newest run of identical results", () => {
	assert.equal(played([]).streak(), undefined);
	assert.deepEqual(played(["L", "W", "W", "W"]).streak(), { kind: "W", count: 3 });
	assert.deepEqual(played(["W", "W", "L"]).streak(), { kind: "L", count: 1 });
});

test("a finished match is added to the history exactly once, and the hub is told", () => {
	const store = new MatchStore(() => 1_000);
	store.setLocalIdentity({ name: "Me", id: "Epic|1|0" });
	store.setGameRunning(true);
	store.setConnected(true);
	const saved: string[] = [];
	store.onHistory = (h) => saved.push(h.join(""));
	const match = (guid: string, winner: number) => {
		const p = (n: string, id: string, t: number) => ({ Name: n, PrimaryId: id, TeamNum: t, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0 });
		store.handle({ Event: "UpdateState", Data: { MatchGuid: guid, Players: [p("Me", "Epic|1|0", 0), p("R", "Epic|2|0", 1)], Game: { Teams: [{ Name: "Blue", TeamNum: 0, Score: 0 }, { Name: "Orange", TeamNum: 1, Score: 0 }], PlaylistId: 11, TimeSeconds: 0, Ball: { Speed: 0, TeamNum: 255 }, bReplay: false, Arena: "Stadium_P", bHasTarget: false } } });
		store.handle({ Event: "MatchEnded", Data: { MatchGuid: guid, WinnerTeamNum: winner } });
		store.handle({ Event: "MatchEnded", Data: { MatchGuid: guid, WinnerTeamNum: winner } }); // repeated announcement
	};
	match("A", 0);
	match("B", 0);
	match("C", 1);
	assert.deepEqual(saved, ["W", "WW", "WWL"]);
	assert.deepEqual(store.streak(), { kind: "L", count: 1 });
});

test("the MMR key has three views; each press moves MMR, the record and the streak to their places", () => {
	const store = played(["W", "W", "W"]);
	store.state.session.wins = 7;
	store.state.session.losses = 2;
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en", ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }), now: 10_000, restartHint: false, autoMmr: { 11: { mmr: 964, at: "t", delta: 10 } }, lastQueuedPlaylist: 11 };
	const view = (index: number, from: number, at: number) => renderRole("mmr", { ...ctx, now: 10_000 }, { view: { index, from, at } });
	const mmr = view(0, 0, 0);
	assert.equal(fontSize(mmr, "964"), 28, "view 0: MMR is the big number…");
	assert.equal(fontSize(mmr, "7W"), 11, "…with the record small underneath");
	const record = view(1, 0, 0);
	// Shrunk from the 23 the layout asks for: unclamped, "7W" would spill past the key's safe area (reported with "4W 2L").
	assert.equal(fontSize(record, "7W"), 20.8, "view 1: the record is big…");
	assert.equal(fontSize(record, "964"), 12.5, "…and MMR small underneath");
	assert.ok(record.includes(">RECORD<"));
	const streak = view(2, 1, 0);
	assert.ok(streak.includes(">3W<") && streak.includes(">STREAK<"), "view 2: the streak");
	assert.equal(fontSize(streak, "964"), 12.5);
	const back = view(0, 2, 0);
	assert.equal(fontSize(back, "964"), 28, "and one more press returns to MMR");
});

test("a double-digit record shrinks further still, so it keeps fitting next to its opponent", () => {
	const store = played([]);
	store.state.session.wins = 14;
	store.state.session.losses = 2;
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en" }), now: 0, restartHint: false };
	const record = renderRole("mmr", ctx, { view: { index: 1, from: 1, at: 0 } });
	const wins = fontSize(record, "14W");
	const losses = fontSize(record, "2L");
	assert.ok(wins < 20.8, `"14W" must shrink below the single-digit size: ${wins}`);
	assert.ok(losses <= 20.8, `losses stays at the single-digit size: ${losses}`);
});

test("the swap is animated: halfway through, MMR and the record are between their two places", () => {
	const store = played(["W"]);
	store.state.session.wins = 7;
	store.state.session.losses = 2;
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en", ranks: { doubles: { tier: 14, div: 2, mmr: 964 } } }), now: 10_190, restartHint: false, autoMmr: { 11: { mmr: 964, at: "t" } }, lastQueuedPlaylist: 11 };
	const mid = renderRole("mmr", ctx, { view: { index: 1, from: 0, at: 10_000 } }); // 190 ms into a 380 ms swap
	const mmrSize = fontSize(mid, "964");
	const recSize = fontSize(mid, "7W");
	assert.ok(mmrSize > 12.5 && mmrSize < 28, `MMR is shrinking: ${mmrSize}`);
	assert.ok(recSize > 11 && recSize < 23, `the record is growing: ${recSize}`);
	const done = renderRole("mmr", { ...ctx, now: 10_400 }, { view: { index: 1, from: 0, at: 10_000 } });
	assert.equal(fontSize(done, "964"), 12.5);
	assert.notEqual(mid, done);
});

test("possession percentages are small enough not to run into each other", () => {
	const store = new MatchStore(() => 1_000);
	store.state.possessionMs = [60_000, 40_000];
	store.setGameRunning(true);
	store.state.phase = "live";
	const svg = renderRole("possession", { store, settings: mergeSettings({ lang: "en" }), now: 1_000, restartHint: false });
	const size = fontSize(svg, "60%");
	assert.ok(size <= 12, `size ${size}`);
	// widest case: 100% next to 0%, each centred at x = 19 and 53 with the width the layout estimates (0.6 em per character)
	const halfWidth = (chars: number) => (chars * size * 0.6) / 2;
	assert.ok(19 + halfWidth(4) < 53 - halfWidth(2));
});

// ---- touch strip ----------------------------------------------------------------------------------------------------------------

test("a strip segment can be pinned to the clock or the ping, and an event still takes the whole strip", () => {
	const store = new MatchStore(() => 1_000);
	store.setGameRunning(true);
	store.setConnected(true);
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en" }), now: new Date(2026, 8, 22, 21, 37, 15).getTime(), restartHint: false, stripCustom: true, ping: { target: "1.2.3.4", ms: 41, history: [40, 41] } };
	const clock = renderStrip(ctx, 0, "clock");
	assert.ok(clock.includes("21:37") && clock.includes("TUE 22 SEP"));
	const ping = renderStrip(ctx, 1, "ping");
	assert.ok(ping.includes(">41<") && ping.includes(">PING<"));
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 80, Scorer: { Name: "A", TeamNum: 0 } } });
	assert.ok(renderStrip({ ...ctx, now: ctx.now + 300 }, 0, "clock").includes("GOAL!"), "a goal replaces the clock while it lasts");
});

test("once any dial is pinned, the strip no longer turns into one wide message while idle", () => {
	const store = new MatchStore(() => 1_000); // game not running
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en" }), now: 1_000, restartHint: false };
	assert.ok(renderStrip(ctx, 2).includes("ROCKET LEAGUE"), "default strip: the whole strip says the game is not running");
	const custom = renderStrip({ ...ctx, stripCustom: true }, 2);
	assert.ok(!custom.includes("ROCKET LEAGUE") && custom.includes("LAST GOAL"), "customised strip: the segment keeps its own panel");
});

// ---- layouts and roles -------------------------------------------------------------------------------------------------------------

test("clock and ping are keys of their own, and the XL layout gets a ping key", () => {
	assert.ok(ROLES.includes("clock") && ROLES.includes("ping"));
	assert.ok(LAYOUT_XL.some((c) => c.role === "ping"));
});

// ---- clock layouts and the analog clock -----------------------------------------------------------------------------------------

test("the clock key has a second layout: the time on one smaller line, away from the edges of the key", () => {
	const ctx = ctxAt(new Date(2026, 8, 22, 21, 37, 42));
	const stacked = renderRole("clock", ctx, { view: { index: 0, from: 0, at: 0 } });
	assert.ok(stacked.includes(">21<") && stacked.includes(">37<") && !stacked.includes(">21:37<"), "layout 0: hours over minutes");
	const line = renderRole("clock", ctx, { view: { index: 1, from: 0, at: 0 } });
	assert.ok(line.includes(">21:37<") && !line.includes(">21<"), "layout 1: one line");
	assert.ok(line.includes(">:42<") && line.includes("TUE 22 SEP"), "with the seconds and the date");
	const size = fontSize(line, "21:37");
	assert.ok(size < 26, `smaller than the stacked digits (${size})`);
	assert.ok(5 * size * 0.6 <= 52 + 0.5, `at most 52 px wide, 10 px from each edge (${(5 * size * 0.6).toFixed(1)})`);
	const pm = renderRole("clock", ctxAt(new Date(2026, 8, 22, 21, 37, 42), { twelve: true }), { view: { index: 1, from: 0, at: 0 } });
	assert.ok(pm.includes(">9:37<") && pm.includes("PM"));
});

/** Clockwise angle from twelve o'clock (degrees) and length of the hand with this id in an analog-clock key. */
function handOf(svg: string, id: string): { angle: number; len: number; width: number; color: string } {
	const m = new RegExp(`<line id="${id}" x1="([\\d.-]+)" y1="([\\d.-]+)" x2="([\\d.-]+)" y2="([\\d.-]+)" stroke="([^"]+)" stroke-width="([\\d.]+)"`).exec(svg);
	assert.ok(m, `hand ${id}`);
	const [x1, y1, x2, y2] = [1, 2, 3, 4].map((i) => Number(m[i]));
	const angle = (Math.atan2(x2! - x1!, -(y2! - y1!)) * 180) / Math.PI;
	return { angle: (angle + 360) % 360, len: Math.hypot(x2! - 36, y2! - 36.5), width: Number(m[6]), color: m[5]! };
}

test("the analog clock: the hands point at the right time and are thick enough to see", () => {
	const at = (h: number, m: number, s: number) => renderRole("analog", ctxAt(new Date(2026, 8, 22, h, m, s)));
	const three = at(3, 0, 0);
	assert.ok(Math.abs(handOf(three, "h-hour").angle - 90) < 1, "3:00 — the hour hand points right");
	assert.ok(handOf(three, "h-minute").angle < 1 || handOf(three, "h-minute").angle > 359, "…and the minute hand up");
	const t = at(10, 10, 30);
	assert.ok(Math.abs(handOf(t, "h-hour").angle - 305.25) < 1, "10:10:30 — the hour hand has moved 10.5 minutes past 10");
	assert.ok(Math.abs(handOf(t, "h-minute").angle - 63) < 1, "the minute hand is half a minute past 10");
	assert.ok(Math.abs(handOf(t, "h-second").angle - 180) < 1, "the second hand points down");
	const hour = handOf(t, "h-hour");
	const minute = handOf(t, "h-minute");
	const second = handOf(t, "h-second");
	assert.ok(hour.len < minute.len, "the hour hand is the shorter one");
	assert.ok(hour.width >= 4.5 && minute.width >= 3 && second.width >= 1.5, "clearly visible widths");
	assert.ok(hour.width > minute.width && minute.width > second.width);
	assert.equal(second.color, "#ff3b5c", "the second hand stands out in red");
	assert.ok(t.includes("stroke-width=\"7.4\""), "every hand sits on a dark outline");
});

test("the analog clock is drawn without the game, and 12 o'clock is marked", () => {
	const key = renderRole("analog", ctxAt(new Date(2026, 8, 22, 6, 5, 5)));
	assert.ok(key.startsWith("<svg") && key.includes("#ff9a26"));
	assert.equal((key.match(/stroke-width="2.4"/g) ?? []).length >= 4, true, "the four quarter marks");
});
