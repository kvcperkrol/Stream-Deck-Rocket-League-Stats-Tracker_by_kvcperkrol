/**
 * Records everything the real Rocket League Stats API sends, so assumptions can be checked against facts
 * (playlist ids, whether `Target` is you in normal play, which StatfeedEvent names exist …).
 *
 *   npm run record            → ws://127.0.0.1:49124, Ctrl+C to stop
 *   npm run record -- 49555   → other port
 *
 * Writes captures/rl-<timestamp>.ndjson (one JSON message per line, with a receive timestamp) and prints a summary.
 */
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const port = Number(process.argv[2]) || 49124;
const dir = path.resolve("captures");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `rl-${new Date().toISOString().replace(/[:.]/g, "-")}.ndjson`);
const out = fs.createWriteStream(file);

const events = new Map<string, number>();
const playlists = new Set<number>();
const arenas = new Set<string>();
const statfeed = new Map<string, string>();
const teamSizes = new Set<number>();
let spectatorFields = false;
let targetSeen: string | undefined;
let updates = 0;
let sample: unknown;

function summary(): void {
	console.log("\n──────── summary ────────");
	console.log(`file: ${file}`);
	console.log("events:", Object.fromEntries([...events].sort()));
	console.log(`UpdateState packets: ${updates}`);
	console.log("PlaylistId seen:", [...playlists].sort((a, b) => a - b).join(", ") || "-");
	console.log("Arena seen:", [...arenas].join(", ") || "-");
	console.log("players per team seen:", [...teamSizes].join(", ") || "-");
	console.log("StatfeedEvent names (EventName → Type):", Object.fromEntries(statfeed));
	console.log("spectator-only fields present in Players[]:", spectatorFields);
	console.log("Game.Target while playing:", targetSeen ?? "-");
}

function connect(): void {
	const ws = new WebSocket(`ws://127.0.0.1:${port}`);
	ws.on("open", () => console.log(`connected to ws://127.0.0.1:${port} — play a match; Ctrl+C to stop`));
	ws.on("message", (raw) => {
		const text = raw.toString();
		out.write(JSON.stringify({ t: Date.now(), raw: JSON.parse(text) }) + "\n");
		const msg = JSON.parse(text);
		events.set(msg.Event, (events.get(msg.Event) ?? 0) + 1);
		const d = msg.Data ?? {};
		if (msg.Event === "UpdateState") {
			updates++;
			sample ??= d;
			if (typeof d.Game?.PlaylistId === "number") playlists.add(d.Game.PlaylistId);
			if (d.Game?.Arena) arenas.add(d.Game.Arena);
			if (d.Game?.bHasTarget && d.Game?.Target?.Name) targetSeen = `${d.Game.Target.Name} (team ${d.Game.Target.TeamNum})`;
			const players: any[] = d.Players ?? [];
			if (players.some((p) => p.Speed !== undefined)) spectatorFields = true;
			const c = [0, 0];
			for (const p of players) c[p.TeamNum === 1 ? 1 : 0]!++;
			teamSizes.add(Math.max(...c));
		}
		if (msg.Event === "StatfeedEvent") statfeed.set(String(d.EventName), String(d.Type));
		if (msg.Event !== "UpdateState") console.log(`  ${msg.Event}${msg.Event === "StatfeedEvent" ? ` ${d.EventName}` : ""}`);
	});
	ws.on("error", () => {});
	ws.on("close", () => {
		console.log("disconnected — retrying in 2 s (Ctrl+C to stop)");
		setTimeout(connect, 2000);
	});
}

process.on("SIGINT", () => {
	out.end();
	summary();
	process.exit(0);
});
connect();
