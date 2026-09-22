import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findLogDir, MatchmakingParser, muToMmr, parseMatchmakingLog, readExistingSamples, RlLogWatcher, type MmrSample } from "../src/sys/rl-log.ts";

const real = fs.readFileSync(path.resolve("test", "fixtures", "matchmaking-real.log"), "utf8");

test("conversion is verified against the player's tracker profile (mu × 20 + 100)", () => {
	assert.equal(muToMmr(47.4225), 1048, "the tracker showed Casual 1,048 for a queue that logged 47.4225");
	assert.equal(muToMmr(28.5405), 671, "ranked duel before a lost match; the tracker showed 655 afterwards (Loss Strk. 2, 'Div Down 16')");
	assert.equal(muToMmr(42.7), 954, "ranked doubles 954 on the tracker");
	assert.equal(muToMmr(25), 600);
});

test("real log: solo single-playlist queues give MMR; a two-playlist queue (average) is ignored", () => {
	const samples = parseMatchmakingLog(real);
	assert.deepEqual(
		samples.map((s) => [s.playlist, s.mmr, s.at]),
		[
			[2, 1048, "2026-09-20T13:05:33Z"],
			[2, 1048, "2026-09-20T13:07:09Z"],
			[10, 671, "2026-09-20T13:27:11Z"],
		],
	);
	assert.ok(samples.every((s) => s.tier === 15), "PartyLeaderTier is the same in every queue: it is not the playlist's rank");
});

test("a queue in a party (leader may be someone else) is not used", () => {
	const block = (party: number) =>
		[
			"[0001.00] Matchmaking: Pre-divide PartyLeaderMMR: 40.0",
			"[0001.00] Matchmaking: Post-divide PartyLeaderMMR: 40.0",
			"[0001.00] Matchmaking: PartyLeaderTier=(12)",
			"[0001.00] Matchmaking: StartMatchmaking at 2026-09-20 10:00:00 in EU7 for playlists 11 on game server ",
			`[0001.00] Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(${party})`,
		].join("\n");
	assert.equal(parseMatchmakingLog(block(1)).length, 1);
	assert.equal(parseMatchmakingLog(block(2)).length, 0);
});

function tmp(): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), "rlhud-log-"));
}

test("an explicit override wins even where the usual Windows guesses find nothing (e.g. Rocket League under Proton)", () => {
	const dir = tmp();
	fs.writeFileSync(path.join(dir, "Launch.log"), "");
	assert.equal(findLogDir(dir), dir, "the override directory itself has Launch.log");
	assert.equal(findLogDir(path.join(dir, "no-such-subfolder")), undefined, "a bad override is not silently swapped for a guess");
	fs.rmSync(dir, { recursive: true, force: true });
});

test("existing logs (backups + current) are read oldest first", () => {
	const dir = tmp();
	const block = (mu: number, time: string) =>
		`Matchmaking: Post-divide PartyLeaderMMR: ${mu}\nMatchmaking: StartMatchmaking at 2026-09-20 ${time} in EU7 for playlists 11 on game server \nMatchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)\n`;
	fs.writeFileSync(path.join(dir, "Launch-backup-2026.09.20-15.00.00.log"), block(40, "10:00:00"));
	fs.writeFileSync(path.join(dir, "Launch-backup-2026.09.20-16.00.00.log"), block(41, "11:00:00"));
	fs.writeFileSync(path.join(dir, "Launch.log"), block(42, "12:00:00"));
	assert.deepEqual(readExistingSamples(dir).map((s) => s.mmr), [900, 920, 940]);
	fs.rmSync(dir, { recursive: true, force: true });
});

test("the watcher picks up new queues, copes with half-written lines and with the log being rotated on a game restart", () => {
	const dir = tmp();
	const file = path.join(dir, "Launch.log");
	fs.writeFileSync(file, "old content that must be ignored\n");
	const got: MmrSample[] = [];
	const w = new RlLogWatcher(dir, (s) => got.push(s), 60_000);
	w.start();

	const lines = [
		"Matchmaking: Post-divide PartyLeaderMMR: 42.7",
		"Matchmaking: StartMatchmaking at 2026-09-20 14:00:00 in EU7 for playlists 11 on game server ",
		"Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)",
	];
	fs.appendFileSync(file, lines[0] + "\n" + lines[1].slice(0, 30)); // the game is mid-line
	w.poll();
	assert.equal(got.length, 0);
	fs.appendFileSync(file, lines[1].slice(30) + "\n" + lines[2] + "\n");
	w.poll();
	assert.equal(got.length, 1);
	assert.deepEqual([got[0]!.playlist, got[0]!.mmr], [11, 954]);

	// game restarted: the old file is moved away and a new, shorter Launch.log starts
	fs.rmSync(file);
	fs.writeFileSync(file, lines.join("\n").replace("42.7", "43.2").replace("14:00:00", "15:00:00") + "\n");
	w.poll();
	assert.equal(got.length, 2);
	assert.equal(got[1]!.mmr, 964);
	w.stop();
	fs.rmSync(dir, { recursive: true, force: true });
});

test("parser keeps no state between unrelated lines", () => {
	const p = new MatchmakingParser();
	for (const l of ["random line", "Matchmaking: PartyLeaderTier=(15)", "Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)"]) assert.equal(p.feed(l), undefined);
});
