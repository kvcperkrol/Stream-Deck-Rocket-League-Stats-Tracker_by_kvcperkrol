import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings, type RLMessage } from "../src/core/types.ts";
import { MatchRecorder } from "../src/sys/recorder.ts";
import { parseLocalIdentity, readLocalIdentity } from "../src/sys/rl-log.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";
import { sideTeams, teamLook } from "../src/ui/teams.ts";

// The identity line exactly as the game writes it (format taken from a real log, values made up).
const LOGIN = "[0014.78] Party: HandleLocalPlayerLoginStatusChanged PlayerName=TestPlayer PlayerID=Epic|0123456789abcdef0123456789abcdef|0 LoginStatus=LS_LoggedIn IsPrimary=True IsInParty=False";

const P = (name: string, id: string, team: number, x: object = {}) => ({ Name: name, PrimaryId: id, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0, ...x });
const ME_ID = "Epic|0123456789abcdef0123456789abcdef|0";

/** A 2v2 online match where the user (TestPlayer) plays ORANGE, and the camera target at the start points at somebody else. */
function onlineUpdate(over: { target?: { Name: string; TeamNum: number } | null; colors?: [string, string]; me?: object; others?: object } = {}): RLMessage {
	return {
		Event: "UpdateState",
		Data: {
			MatchGuid: "ABC",
			Players: [
				P("Opp1", "Epic|1|0", 0, { Score: 480, Boost: 12, Speed: 40 }), // first in the list: the top scorer
				P("Opp2", "Epic|2|0", 0, { Score: 120 }),
				P("TestPlayer", ME_ID, 1, { Score: 210, Boost: 71, Speed: 63, Shots: 3, Demos: 1, ...(over.me ?? {}) }),
				P("Mate", "Epic|4|0", 1, { Score: 90 }),
			],
			Game: {
				Teams: [
					{ Name: "Niebiescy", TeamNum: 0, Score: 1, ColorPrimary: over.colors?.[0] ?? "2F7DFF", ColorSecondary: "0A38A8" },
					{ Name: "Pomarańczowi", TeamNum: 1, Score: 2, ColorPrimary: over.colors?.[1] ?? "FF9A26", ColorSecondary: "E04A00" },
				],
				PlaylistId: 11,
				TimeSeconds: 120,
				bOvertime: false,
				Ball: { Speed: 50, TeamNum: 1 },
				bReplay: false,
				Arena: "Stadium_P",
				bHasTarget: over.target !== null,
				Target: over.target === undefined ? { Name: "Opp1", TeamNum: 0 } : over.target,
			},
		},
	};
}

function setup() {
	let t = 1_000;
	const store = new MatchStore(() => t);
	store.setGameRunning(true);
	return { store, tick: (ms: number) => (t += ms) };
}

test("the game's own login line identifies the local account", () => {
	assert.deepEqual(parseLocalIdentity(LOGIN), { name: "TestPlayer", id: ME_ID });
	assert.equal(parseLocalIdentity("Log: Command line: -AUTH_LOGIN=unused -AUTH_PASSWORD=whatever -epicusername=TestPlayer"), undefined, "command-line lines with login codes are never parsed");
	assert.equal(parseLocalIdentity("Party: HandleLocalPlayerLoginStatusChanged PlayerName=x PlayerID=Epic|1|0 LoginStatus=LS_NotLoggedIn IsPrimary=True"), undefined);
	// a name with spaces
	assert.equal(parseLocalIdentity("Party: HandleLocalPlayerLoginStatusChanged PlayerName=Two Words PlayerID=Steam|7656|0 LoginStatus=LS_LoggedIn IsPrimary=True")?.name, "Two Words");
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rlhud-id-"));
	fs.writeFileSync(path.join(dir, "Launch.log"), `line\n${LOGIN}\nmore\n`);
	assert.equal(readLocalIdentity(dir)?.id, ME_ID);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("reported bug: the camera pointing at an opponent at the start of an online match no longer makes them 'me'", () => {
	const { store } = setup();
	store.setLocalIdentity({ name: "TestPlayer", id: ME_ID });
	store.handle(onlineUpdate({ target: { Name: "Opp1", TeamNum: 0 } })); // start of the match: the camera shows somebody else
	assert.equal(store.state.meName, "TestPlayer");
	assert.equal(store.state.meTeam, 1, "the user plays orange");
	assert.equal(store.myStats()?.score, 210, "points are the user's own, not the first player of the scoreboard (480)");
	assert.equal(store.myStats()?.boost, 71);
	assert.equal(store.myStats()?.speedKmh, 63);
});

test("without a login line the camera target is only a first guess; a real identity replaces it", () => {
	const { store } = setup();
	store.handle(onlineUpdate({ target: { Name: "Opp1", TeamNum: 0 } }));
	assert.equal(store.state.meName, "Opp1", "the old behaviour: a guess, and here a wrong one");
	store.setLocalIdentity({ name: "TestPlayer", id: ME_ID });
	assert.equal(store.state.meName, "TestPlayer", "the identity from the log wins immediately");
	assert.equal(store.state.meTeam, 1);
});

test("the identity is known before the roster arrives, and goal events are attributed correctly", () => {
	const { store } = setup();
	store.setLocalIdentity({ name: "TestPlayer", id: ME_ID });
	assert.equal(store.state.meName, "TestPlayer");
	store.handle({ Event: "GoalScored", Data: { GoalSpeed: 70, GoalTime: 30, Scorer: { Name: "TestPlayer", TeamNum: 1 } } });
	assert.equal(store.state.session.goals, 1);
});

test("a match the user only watches (not in the roster) has no 'me'", () => {
	const { store } = setup();
	store.setLocalIdentity({ name: "SomeoneElse", id: "Epic|999|0" });
	store.handle(onlineUpdate());
	assert.equal(store.myStats(), undefined);
	assert.equal(store.state.meTeam, undefined);
});

// ---- sides and colours ----------------------------------------------------------------------------------------------------

test("the left score key shows the user's own team (orange when playing orange), the right one the opponent", () => {
	const { store } = setup();
	store.setLocalIdentity({ name: "TestPlayer", id: ME_ID });
	store.handle(onlineUpdate());
	assert.deepEqual(sideTeams(store.state, "me-left"), [1, 0]);
	assert.deepEqual(sideTeams(store.state, "blue-left"), [0, 1], "the setting forces blue to the left");
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "pl" }), now: 5_000, restartHint: false };
	const left = renderRole("blue", ctx); // the first score key is the LEFT key
	const right = renderRole("orange", ctx);
	assert.ok(left.includes("#ff9a26") && left.includes(">2<"), "left = orange, score 2");
	assert.ok(right.includes("#2f7dff") && right.includes(">1<"), "right = blue, score 1");
	assert.ok(left.includes(">TY<") && !right.includes(">TY<"), "the 'you' marker is on the left (own) key");
	assert.ok(left.includes("POMARAŃCZOWI"), "the game's own team name is used");
});

test("custom team colours from the game (a black or grey opponent) are used, with readable text", () => {
	const { store, tick } = setup();
	store.setLocalIdentity({ name: "TestPlayer", id: ME_ID });
	store.handle(onlineUpdate({ colors: ["1A1A1A", "FF9A26"] })); // opponent (blue side) is black
	const dark = teamLook(store.state, 0);
	assert.equal(dark.c1, "#1a1a1a");
	assert.equal(dark.ink, "#ffffff");
	assert.notEqual(dark.accent, "#1a1a1a", "a black accent would vanish on the dark deck, so it is lifted to a visible grey");
	// the colour really sent by the game for a dark club in a casual match (recorded 2026-09-20)
	const club = teamLook((store.handle(onlineUpdate({ colors: ["262626", "C26418"] })), store.state), 0);
	assert.equal(club.c1, "#262626", "the key face keeps the exact hex from the game");
	assert.notEqual(club.accent, "#262626", "…but bars and percentages are lifted so they stay visible");
	assert.equal(teamLook(store.state, 1).accent, "#c26418", "the game's default orange is not altered");
	assert.equal(teamLook((store.handle(onlineUpdate({ colors: ["1873FF", "C26418"] })), store.state), 0).accent, "#1873ff", "the default blue is not altered");
	const light = teamLook((store.handle(onlineUpdate({ colors: ["E5E5E5", "FF9A26"] })), store.state), 0);
	assert.equal(light.c1, "#e5e5e5");
	assert.equal(light.ink, "#0b1024", "dark text on a light grey team");
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "pl" }), now: 5_000, restartHint: false };
	assert.ok(renderRole("orange", ctx).includes("#e5e5e5"), "the right key is drawn in the opponent's grey");
	// possession is drawn in the same colours and order once there is data to show
	store.handle({ Event: "RoundStarted", Data: {} });
	for (let i = 0; i < 60; i++) {
		tick(100);
		store.handle(onlineUpdate({ colors: ["E5E5E5", "FF9A26"] }));
	}
	const pos = renderRole("possession", { ...ctx, now: 20_000 });
	assert.ok(pos.includes("#ff9a26") && pos.includes("#e5e5e5"), "own (orange) segment and the grey opponent segment");
	assert.ok(pos.indexOf("#ff9a26") < pos.indexOf("#e5e5e5"), "the own team's segment comes first (left), like the score keys");
});

test("offline modes report one grey for both teams — that is not a colour scheme, so the classic blue/orange stays", () => {
	const { store } = setup();
	store.handle({ Event: "UpdateState", Data: { Players: [P("Solo", "Epic|1|0", 0)], Game: { Teams: [{ TeamNum: 0, Name: "Blue", Score: 0, ColorPrimary: "959595" }, { TeamNum: 1, Name: "Orange", Score: 0, ColorPrimary: "959595" }], TimeSeconds: 300, Ball: { Speed: 0, TeamNum: 255 }, bReplay: false } } });
	assert.equal(teamLook(store.state, 0).c1, "#2f7dff");
	assert.equal(teamLook(store.state, 1).c1, "#ff9a26");
});

// ---- diagnostics recorder --------------------------------------------------------------------------------------------------

test("the recorder anonymises everybody except the local player, thins UpdateState and caps its size", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rlhud-rec-"));
	const file = path.join(dir, "captures", "stats-api.ndjson");
	let now = 0;
	const rec = new MatchRecorder(file, { name: "TestPlayer", id: ME_ID }, () => now, 4000);
	for (let i = 0; i < 10; i++) {
		now += 100; // ten UpdateState packets in one second
		rec.record(onlineUpdate());
	}
	rec.record({ Event: "GoalScored", Data: { Scorer: { Name: "Opp1", TeamNum: 0 }, Assister: { Name: "Opp2", TeamNum: 0 }, GoalSpeed: 80 } });
	const lines = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
	assert.ok(lines.filter((l) => l.Event === "UpdateState").length <= 3, "thinned to about two packets per second");
	const raw = fs.readFileSync(file, "utf8");
	assert.ok(!raw.includes("Opp1") && !raw.includes("Opp2") && !raw.includes("Mate") && !raw.includes("Epic|1|0"), "other players never appear");
	assert.ok(raw.includes("TestPlayer") && raw.includes(ME_ID), "the local player is kept, so the data can be read");
	const goal = lines.find((l) => l.Event === "GoalScored");
	const update = lines.find((l) => l.Event === "UpdateState");
	assert.equal(goal.Data.Scorer.Name, update.Data.Players[0].Name, "the same person keeps the same alias across events");
	// the cap: two files, never more than the limit each
	for (let i = 0; i < 200; i++) {
		now += 600;
		rec.record(onlineUpdate());
	}
	assert.ok(fs.statSync(file).size <= 4000 + 2000);
	assert.ok(fs.existsSync(`${file}.1`), "the previous file is kept once");
	fs.rmSync(dir, { recursive: true, force: true });
});
