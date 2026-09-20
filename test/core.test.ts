import assert from "node:assert/strict";
import test from "node:test";
import { describePlaylist } from "../src/core/playlists.ts";
import { MatchStore } from "../src/core/match-store.ts";
import type { RLMessage } from "../src/core/types.ts";
import { convertSpeed, formatClock } from "../src/core/units.ts";
import { patchIniText } from "../src/sys/ini.ts";

const P = (name: string, team: number, extra: object = {}) => ({ Name: name, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0, ...extra });
const update = (over: any = {}): RLMessage => ({
	Event: "UpdateState",
	Data: {
		MatchGuid: "G1",
		Players: [P("Me", 0), P("Mate", 0), P("Foe1", 1), P("Foe2", 1)],
		Game: {
			Teams: [
				{ Name: "Blue", TeamNum: 0, Score: 0 },
				{ Name: "Orange", TeamNum: 1, Score: 0 },
			],
			PlaylistId: 11,
			TimeSeconds: 300,
			bOvertime: false,
			Ball: { Speed: 0, TeamNum: 255 },
			bReplay: false,
			bHasWinner: false,
			Winner: "",
			Arena: "Stadium_P",
			bHasTarget: true,
			Target: { Name: "Me", Shortcut: 1, TeamNum: 0 },
			...over,
		},
	},
});

function setup() {
	let t = 1_000;
	const store = new MatchStore(() => t);
	store.setGameRunning(true);
	return { store, tick: (ms: number) => (t += ms), at: () => t };
}

test("UpdateState fills score, clock, playlist and detects me from the camera target", () => {
	const { store } = setup();
	store.handle(update({ Teams: [{ Name: "Blue", TeamNum: 0, Score: 2 }, { Name: "Orange", TeamNum: 1, Score: 1 }], TimeSeconds: 187 }));
	assert.deepEqual(store.state.scores, [2, 1]);
	assert.equal(store.state.time, 187);
	assert.equal(store.state.playlistId, 11);
	assert.equal(store.state.phase, "live");
	assert.equal(store.state.meName, "Me");
	assert.equal(store.state.meTeam, 0);
	assert.equal(store.teamSize(), 2);
});

test("'me' is learned once from the camera target and kept for the whole session", () => {
	const { store } = setup();
	const first = update();
	first.Data.Players[0].Speed = 40; // the real game sends per-car fields to the local player too
	store.handle(first);
	assert.equal(store.state.meName, "Me", "per-car fields do not block detection");
	// later the camera follows someone else — that must not change who 'me' is
	store.handle(update({ Target: { Name: "Foe1", TeamNum: 1 } }));
	assert.equal(store.state.meName, "Me");
	// a new match keeps it as well
	store.handle({ Event: "MatchDestroyed", Data: {} });
	store.handle({ Event: "MatchInitialized", Data: {} });
	store.handle(update());
	assert.equal(store.state.meName, "Me");
});

test("free play: a single player without a camera target is 'me'", () => {
	const { store } = setup();
	const m = update({ bHasTarget: false, Target: null });
	m.Data.Players = [P("Solo", 0)];
	store.handle(m);
	assert.equal(store.state.meName, "Solo");
});

test("configured player name wins over auto detection", () => {
	const { store } = setup();
	store.setPlayerName("mate");
	store.handle(update());
	assert.equal(store.state.meName, "Mate");
	assert.equal(store.state.meTeam, 0);
});

test("GoalScored raises a top-priority banner, updates last goal and flashes the scoring team", () => {
	const { store, tick } = setup();
	store.handle(update());
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 97, GoalTime: 95, Scorer: { Name: "Me", TeamNum: 0 }, Assister: { Name: "Mate", TeamNum: 0 } } });
	const b = store.activeBanner()!;
	assert.equal(b.kind, "goal");
	assert.equal(b.who, "Me");
	assert.equal(b.assist, "Mate");
	assert.equal(b.speedKmh, 97);
	assert.equal(store.state.scores[0], 0, "the score is UpdateState's business while packets flow");
	assert.equal(store.state.session.goals, 1);
	assert.ok(store.goalFlash(0) > 0.9);
	assert.equal(store.goalFlash(1), 0);
	tick(5000);
	assert.equal(store.goalFlash(0), 0);
	assert.equal(store.activeBanner(), undefined, "goal banner expires");
	assert.equal(convertSpeed(97, "kmh").value, 97);
});

test("Demolish shows DEMO, or DEMOLISHED when the victim is me", () => {
	const { store } = setup();
	store.handle(update());
	store.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Foe1", TeamNum: 1 }, SecondaryTarget: { Name: "Mate", TeamNum: 0 } } });
	assert.equal(store.activeBanner()!.kind, "demo");
	store.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Foe1", TeamNum: 1 }, SecondaryTarget: { Name: "Me", TeamNum: 0 } } });
	assert.equal(store.activeBanner()!.kind, "demoed");
	store.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Me", TeamNum: 0 }, SecondaryTarget: { Name: "Foe2", TeamNum: 1 } } });
	assert.equal(store.state.session.demos, 1);
});

test("goal outranks demo; replay banner is sticky until GoalReplayEnd", () => {
	const { store, tick } = setup();
	store.handle(update());
	store.handle({ Event: "GoalReplayStart", Data: {} });
	tick(30_000);
	assert.equal(store.activeBanner()!.kind, "replay");
	assert.equal(store.state.phase, "replay");
	store.handle({ Event: "GoalReplayEnd", Data: {} });
	assert.equal(store.activeBanner(), undefined);
	store.handle({ Event: "StatfeedEvent", Data: { EventName: "Demolish", MainTarget: { Name: "Foe1", TeamNum: 1 }, SecondaryTarget: { Name: "Mate", TeamNum: 0 } } });
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 40, Scorer: { Name: "Foe1", TeamNum: 1 } } });
	assert.equal(store.activeBanner()!.kind, "goal");
});

test("MatchEnded counts the session once and reports victory/defeat relative to me", () => {
	const { store } = setup();
	store.handle(update());
	store.handle({ Event: "MatchEnded", Data: { MatchGuid: "G1", WinnerTeamNum: 0 } });
	store.handle({ Event: "MatchEnded", Data: { MatchGuid: "G1", WinnerTeamNum: 0 } });
	assert.equal(store.state.session.wins, 1);
	assert.equal(store.activeBanner()!.kind, "victory");
	store.handle({ Event: "MatchDestroyed", Data: {} });
	assert.equal(store.state.phase, "menu");
	assert.equal(store.state.session.wins, 1, "session survives the match");
	assert.equal(store.activeBanner()!.kind, "victory", "result stays visible after leaving");

	store.handle(update({ Teams: [{ TeamNum: 0, Score: 0 }, { TeamNum: 1, Score: 3 }] }));
	store.handle({ Event: "MatchEnded", Data: { MatchGuid: "G2", WinnerTeamNum: 1 } });
	assert.equal(store.state.session.losses, 1);
	assert.equal(store.activeBanner()!.kind, "defeat");
});

test("overtime banner fires once when the clock flips to overtime", () => {
	const { store } = setup();
	store.handle(update());
	store.handle({ Event: "ClockUpdatedSeconds", Data: { TimeSeconds: 0, bOvertime: false } });
	assert.equal(store.activeBanner(), undefined);
	store.handle({ Event: "ClockUpdatedSeconds", Data: { TimeSeconds: 1, bOvertime: true } });
	assert.equal(store.activeBanner()!.kind, "overtime");
});

test("game quitting resets to offline but keeps nothing stale", () => {
	const { store } = setup();
	store.handle(update());
	store.setGameRunning(false);
	assert.equal(store.state.phase, "offline");
	assert.deepEqual(store.state.scores, [0, 0]);
	assert.equal(store.activeBanner(), undefined);
});

test("playlist description: known ids, inference by team size, arena based modes", () => {
	assert.deepEqual(describePlaylist(11, "Stadium_P", 2), { name: "Doubles", ranked: true, group: "doubles", size: 2 });
	assert.equal(describePlaylist(99, "Stadium_P", 3).group, "standard");
	assert.equal(describePlaylist(99, "Stadium_P", 3).inferred, true);
	assert.equal(describePlaylist(2, "HoopsStadium_P", 2).group, "hoops");
	assert.equal(describePlaylist(77, "Stadium_P", 0).name, "Playlist #77");
	assert.equal(describePlaylist(9, "TrainStation_Dawn_P", 1).name, "Free Play", "playlist 9 as seen in a real free-play capture");
	// reported after a real match: ranked Snow Day (playlist 30) was shown as a casual 3v3
	assert.deepEqual(describePlaylist(30, "Stadium_Winter_P", 3), { name: "Snow Day", ranked: true, group: "snowday" });
	assert.equal(describePlaylist(30, "SomeUnknownArena_P", 0).ranked, true, "the id alone decides, whatever the arena or roster");
	assert.equal(describePlaylist(27, "HoopsStadium_P", 3).group, "hoops");
});

test("units: the API already reports km/h", () => {
	assert.deepEqual(convertSpeed(82.8, "kmh"), { value: 83, unit: "km/h" });
	assert.deepEqual(convertSpeed(100, "mph"), { value: 62, unit: "mph" });
	assert.deepEqual(convertSpeed(82.8, "uu"), { value: 2300, unit: "uu/s" });
	assert.equal(formatClock(187), "3:07");
	assert.equal(formatClock(-4), "0:00");
});

test("score comes from UpdateState: a goal is never counted twice, in a replay or otherwise", () => {
	const { store, tick } = setup();
	store.handle(update());
	store.handle(update({ Teams: [{ TeamNum: 0, Score: 1 }, { TeamNum: 1, Score: 0 }] })); // goal scored → packet stream running
	tick(100);
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 57, GoalTime: 120, Scorer: { Name: "Me", TeamNum: 0 } } });
	assert.deepEqual(store.state.scores, [1, 0], "GoalScored does not add to a score UpdateState already reports");
	store.handle({ Event: "GoalReplayStart", Data: {} });
	store.handle(update({ bReplay: true, Teams: [{ TeamNum: 0, Score: 2 }, { TeamNum: 1, Score: 0 }] })); // replay re-simulates the goal
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 57, GoalTime: 120, Scorer: { Name: "Me", TeamNum: 0 } } }); // …and may announce it again
	assert.deepEqual(store.state.scores, [1, 0], "nothing that happens inside a replay changes the score");
	assert.equal(store.state.session.goals, 1);
	store.handle({ Event: "GoalReplayEnd", Data: {} });
	store.handle(update({ Teams: [{ TeamNum: 0, Score: 1 }, { TeamNum: 1, Score: 0 }] }));
	assert.deepEqual(store.state.scores, [1, 0]);
});

test("the same goal announced twice outside a replay is counted once", () => {
	const { store, tick } = setup();
	const g = { Event: "GoalScored", Data: { GoalSpeed: 57.4, GoalTime: 120, Scorer: { Name: "Me", TeamNum: 0 } } };
	store.handle(g);
	tick(400);
	store.handle(g);
	assert.equal(store.state.session.goals, 0, "me is not known yet, so nothing counted…");
	assert.equal(store.state.scores[0], 1, "…and the score only moved once");
});

test("the last goal (scorer + speed) survives leaving the match", () => {
	const { store } = setup();
	store.handle(update());
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 57.4, GoalTime: 120, Scorer: { Name: "Me", TeamNum: 0 } } });
	store.handle({ Event: "MatchDestroyed", Data: {} });
	assert.equal(store.state.phase, "menu");
	assert.equal(store.state.lastGoal?.scorer, "Me");
	assert.equal(store.state.lastGoal?.speedKmh, 57.4);
});

test("a replay never changes the live ball speed, clock or score", () => {
	const { store } = setup();
	store.handle(update({ TimeSeconds: 50, Ball: { Speed: 30, TeamNum: 0 } }));
	store.handle(update({ bReplay: true, TimeSeconds: 12, Ball: { Speed: 99, TeamNum: 0 }, Teams: [{ TeamNum: 0, Score: 5 }, { TeamNum: 1, Score: 5 }] }));
	assert.equal(store.state.time, 50);
	assert.equal(store.state.ballSpeedKmh, 30);
	assert.deepEqual(store.state.scores, [0, 0]);
});

const REAL_DEFAULT =
	"[TAGame.MatchStatsExporter_TA]\r\n\r\n; Port the client will listen for tcp connections on\r\nPort=49123\r\n\r\n; web\r\nWebPort=49124\r\n\r\n; rate\r\nPacketSendRate=0";

test("ini: enables the disabled rate, keeps comments and CRLF (real Epic default file)", () => {
	const r = patchIniText(REAL_DEFAULT, { packetRate: 10 });
	assert.equal(r.changed, true);
	assert.equal(r.packetRate, 10);
	assert.match(r.text, /PacketSendRate=10$/);
	assert.match(r.text, /; Port the client will listen/);
	assert.ok(!/[^\r]\n/.test(r.text), "no bare LF introduced");
	assert.equal(r.webPort, 49124);
});

test("ini: idempotent, and never overrides a rate the user already chose", () => {
	const once = patchIniText(REAL_DEFAULT, { packetRate: 10 });
	const twice = patchIniText(once.text, { packetRate: 10 });
	assert.equal(twice.changed, false);
	const custom = patchIniText("[TAGame.MatchStatsExporter_TA]\nPort=1\nWebPort=5555\nPacketSendRate=60\n", { packetRate: 10 });
	assert.equal(custom.changed, false);
	assert.equal(custom.packetRate, 60);
	assert.equal(custom.webPort, 5555);
});

test("ini: creates the section in an unrelated file and re-enables a disabled web port", () => {
	const r = patchIniText("[Other]\nA=1", { packetRate: 20 });
	assert.match(r.text, /\[Other\]\nA=1\n\n\[TAGame\.MatchStatsExporter_TA\]/);
	assert.match(r.text, /PacketSendRate=20/);
	assert.match(r.text, /WebPort=49124/);
	const off = patchIniText("[TAGame.MatchStatsExporter_TA]\nWebPort=0\nPacketSendRate=0\nPort=49123\n", { packetRate: 10 });
	assert.match(off.text, /WebPort=49124/);
});

// ---- decoding the frames the real game sends ------------------------------------------------------------------------

import { decodeFrame, fixString } from "../src/net/decode.ts";

test("decode: the real game wraps Data in a JSON string", () => {
	const frame = JSON.stringify({ Event: "GoalScored", Data: JSON.stringify({ MatchGuid: "", GoalSpeed: 57.45, Scorer: { Name: "TestPlayer", TeamNum: 0 } }) });
	const m = decodeFrame(frame)!;
	assert.equal(m.Event, "GoalScored");
	assert.equal(m.Data.GoalSpeed, 57.45);
	assert.equal(m.Data.Scorer.Name, "TestPlayer");
	// the documented shape (an object) keeps working
	assert.equal(decodeFrame(JSON.stringify({ Event: "X", Data: { a: 1 } }))!.Data.a, 1);
	assert.deepEqual(decodeFrame(JSON.stringify({ Event: "CountdownBegin", Data: "" }))!.Data, {});
});

test("decode: ANSI (windows-1250) strings are repaired, valid UTF-8 is left alone", () => {
	// "Pomarańczowi" with ń as the single byte 0xF1 (windows-1250), exactly what the live capture showed as U+FFFD
	const ansi = Buffer.concat([Buffer.from('{"Event":"UpdateState","Data":"{\\"Name\\":\\"Pomara'), Buffer.from([0xf1]), Buffer.from('czowi\\"}"}')]);
	assert.equal(decodeFrame(ansi)!.Data.Name, "Pomarańczowi");
	const utf8 = Buffer.from(JSON.stringify({ Event: "E", Data: JSON.stringify({ Name: "Żółć_ł" }) }), "utf8");
	assert.equal(decodeFrame(utf8)!.Data.Name, "Żółć_ł");
	assert.equal(fixString("plain ascii"), "plain ascii");
	assert.equal(decodeFrame("not json"), undefined);
});

// ---- live player data and possession ------------------------------------------------------------------------------------

import { mergeSettings } from "../src/core/types.ts";

function live(extra: object = {}, game: object = {}): RLMessage {
	const m = update(game);
	m.Data.Players[0] = { ...m.Data.Players[0], bHasCar: true, Speed: 64.2, Boost: 62, bBoosting: true, bSupersonic: false, Score: 340, Shots: 4, Demos: 1, ...extra };
	return m;
}

test("boost, car speed and score of the local player are read from UpdateState", () => {
	const { store } = setup();
	store.handle(live());
	const me = store.myStats()!;
	assert.equal(me.boost, 62);
	assert.equal(me.speedKmh, 64.2);
	assert.equal(me.boosting, true);
	assert.equal(me.supersonic, false);
	assert.equal(me.score, 340);
	assert.equal(me.shots, 4);
	assert.equal(me.demos, 1);
	store.handle(live({ Speed: 82.8, bSupersonic: true, Boost: 0 }));
	assert.equal(store.myStats()!.supersonic, true);
	assert.equal(store.myStats()!.boost, 0);
});

test("a replay never changes the live boost or car speed", () => {
	const { store } = setup();
	store.handle(live({ Boost: 80 }));
	store.handle(live({ Boost: 3, Speed: 5 }, { bReplay: true }));
	assert.equal(store.myStats()!.boost, 80);
	assert.equal(store.myStats()!.speedKmh, 64.2);
});

test("possession: time is credited to the team that touched the ball last, and only while play is live", () => {
	const { store, tick } = setup();
	store.handle({ Event: "RoundStarted", Data: {} });
	const step = (teamNum: number, ms: number) => {
		for (let t = 0; t < ms; t += 100) {
			tick(100);
			store.handle(update({ Ball: { Speed: 30, TeamNum: teamNum } }));
		}
	};
	step(0, 4000);
	step(1, 2000);
	step(255, 3000); // nobody has touched it: nobody is credited
	const [blue, orange] = store.state.possessionMs;
	assert.ok(Math.abs(blue - 4000) < 300, `blue ${blue}`);
	assert.ok(Math.abs(orange - 2000) < 300, `orange ${orange}`);
	assert.deepEqual(store.possessionPct(), [67, 33]);
	assert.equal(store.state.ballTeam, undefined);
});

test("possession: a goal stops the clock until the next kickoff, and a replay never counts", () => {
	const { store, tick } = setup();
	store.handle({ Event: "RoundStarted", Data: {} });
	for (let i = 0; i < 40; i++) {
		tick(100);
		store.handle(update({ Ball: { Speed: 30, TeamNum: 0 } }));
	}
	const before = store.state.possessionMs[0];
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 50, GoalTime: 20, Scorer: { Name: "Me", TeamNum: 0 } } });
	for (let i = 0; i < 30; i++) {
		tick(100);
		store.handle(update({ Ball: { Speed: 5, TeamNum: 0 } })); // the ball rolls in the net, then the replay starts
	}
	store.handle({ Event: "GoalReplayStart", Data: {} });
	for (let i = 0; i < 30; i++) {
		tick(100);
		store.handle(update({ bReplay: true, Ball: { Speed: 90, TeamNum: 1 } }));
	}
	assert.equal(store.state.possessionMs[0], before, "nothing is added between the goal and the next kickoff");
	assert.equal(store.state.possessionMs[1], 0);
	store.handle({ Event: "GoalReplayEnd", Data: {} });
	store.handle({ Event: "RoundStarted", Data: {} });
	for (let i = 0; i < 20; i++) {
		tick(100);
		store.handle(update({ Ball: { Speed: 30, TeamNum: 1 } }));
	}
	assert.ok(store.state.possessionMs[1] > 1500, "counting resumes after the kickoff");
});

test("possession percentage stays undefined until there is a few seconds of data", () => {
	const { store } = setup();
	assert.equal(store.possessionPct(), undefined);
});

test("settings written by older versions (with macros) load cleanly and drop what no longer exists", () => {
	const s = mergeSettings({ lang: "en", units: "mph", ranks: { doubles: { tier: 14, div: 2, mmr: 1247 } }, macros: { find: "TAB" } } as never);
	assert.equal(s.lang, "en");
	assert.equal(s.units, "mph");
	assert.equal(s.ranks.doubles?.mmr, 1247);
	assert.ok(!("macros" in s));
	assert.deepEqual(mergeSettings(undefined), mergeSettings({}));
	assert.equal(mergeSettings({ autoSwitch: false }).autoSwitch, false);
});
