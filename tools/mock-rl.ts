/**
 * A stand-in for Rocket League's Stats API: a WebSocket server that sends the same messages the game does
 * (shapes from https://www.rocketleague.com/developer/stats-api).
 *
 *   npm run mock            → plays a looping demo match on ws://127.0.0.1:49124 (only when the real game is NOT running)
 *   startMockRl(port)       → used by the end-to-end test
 */
import { WebSocketServer, type WebSocket } from "ws";

export interface MockRl {
	port: number;
	send(event: string, data?: object): void;
	clientCount(): number;
	close(): Promise<void>;
}

export async function startMockRl(port: number): Promise<MockRl> {
	const wss = new WebSocketServer({ host: "127.0.0.1", port });
	await new Promise<void>((res, rej) => {
		wss.once("listening", () => res());
		wss.once("error", rej);
	});
	return {
		port,
		send(event, data = {}) {
			// The real game sends Data as a JSON *string* (not an object as its documentation shows) — mimic that.
			const msg = JSON.stringify({ Event: event, Data: JSON.stringify({ MatchGuid: "MOCKMATCH0000000000000000000000", ...data }) });
			for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
		},
		clientCount: () => wss.clients.size,
		close: () =>
			new Promise<void>((res) => {
				for (const c of wss.clients as Set<WebSocket>) c.terminate();
				wss.close(() => res());
			}),
	};
}

// ---- payload builders --------------------------------------------------------------------------------------------

export interface Sim {
	blue: number;
	orange: number;
	time: number;
	overtime: boolean;
	ball: number;
	carSpeed: number;
	boost: number;
	ballTeam: number;
	replay: boolean;
	playlist: number;
	winner?: 0 | 1;
	stats: Record<string, { team: 0 | 1; goals: number; assists: number; saves: number; shots: number; demos: number }>;
}

export const PLAYERS: [string, 0 | 1][] = [
	["Player1", 0],
	["Mate", 0],
	["Rival", 1],
	["Rival2", 1],
];

export function freshSim(): Sim {
	const stats: Sim["stats"] = {};
	for (const [n, t] of PLAYERS) stats[n] = { team: t, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0 };
	return { blue: 0, orange: 0, time: 90, overtime: false, ball: 0, carSpeed: 0, boost: 100, ballTeam: 255, replay: false, playlist: 11, stats };
}

export function updateState(sim: Sim): object {
	return {
		Players: PLAYERS.map(([name, team], i) => {
			const s = sim.stats[name]!;
			return {
				Name: name,
				PrimaryId: `Epic|${1000 + i}|0`,
				Shortcut: i + 1,
				TeamNum: team,
				Score: s.goals * 100 + s.assists * 50 + s.saves * 50 + s.shots * 20,
				Goals: s.goals,
				Shots: s.shots,
				Assists: s.assists,
				Saves: s.saves,
				Touches: 10 + i,
				CarTouches: 1,
				Demos: s.demos,
				Loadout: ["body_grain", "None", "None", "None", "None", "None"],
				// Per-car live data, as the real game sends it (the local player is index 0): km/h and 0–100 boost.
				...(i === 0 ? { bHasCar: true, Speed: sim.carSpeed, Boost: sim.boost, bBoosting: sim.carSpeed > 60, bSupersonic: sim.carSpeed >= 82.8 } : {}),
			};
		}),
		Game: {
			Teams: [
				{ Name: "Blue", TeamNum: 0, Score: sim.blue, ColorPrimary: "0000FF", ColorSecondary: "0000AA" },
				{ Name: "Orange", TeamNum: 1, Score: sim.orange, ColorPrimary: "FF8800", ColorSecondary: "AA5500" },
			],
			PlaylistId: sim.playlist,
			TimeSeconds: Math.max(0, Math.round(sim.time)),
			bOvertime: sim.overtime,
			Ball: { Speed: sim.ball, TeamNum: sim.ballTeam },
			bReplay: sim.replay,
			bHasWinner: sim.winner !== undefined,
			Winner: sim.winner === undefined ? "" : sim.winner === 0 ? "Blue" : "Orange",
			Arena: "Stadium_P",
			bHasTarget: true,
			Target: { Name: "Player1", Shortcut: 1, TeamNum: 0 },
		},
	};
}

// ---- looping demo -----------------------------------------------------------------------------------------------

async function demo(port: number): Promise<void> {
	const rl = await startMockRl(port);
	console.log(`mock Rocket League Stats API on ws://127.0.0.1:${port} — connect a client, the match starts when one is present`);
	const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
	const P = (n: string) => ({ Name: n, Shortcut: PLAYERS.findIndex(([x]) => x === n) + 1, TeamNum: PLAYERS.find(([x]) => x === n)![1] });

	for (;;) {
		while (rl.clientCount() === 0) await sleep(300);
		const sim = freshSim();
		let running = true;
		let tickerClock = false;
		const ticker = setInterval(() => {
			if (!running) return;
			sim.ball = Math.max(0, Math.min(160, sim.ball * 0.96 + (Math.random() - 0.3) * 9));
			sim.carSpeed = Math.max(0, Math.min(83, sim.carSpeed + (Math.random() - 0.42) * 9));
			sim.boost = Math.max(0, Math.min(100, sim.boost + (Math.random() - 0.6) * 4));
			if (Math.random() < 0.02) sim.ballTeam = Math.random() < 0.5 ? 0 : 1;
			rl.send("UpdateState", updateState(sim));
		}, 100);
		const clock = setInterval(() => {
			if (!tickerClock) return;
			if (sim.overtime) sim.time += 1;
			else sim.time = Math.max(0, sim.time - 1);
			rl.send("ClockUpdatedSeconds", { TimeSeconds: sim.time, bOvertime: sim.overtime });
		}, 1000);

		const goal = async (name: string, speed: number, assist?: string) => {
			const t = P(name).TeamNum;
			if (t === 0) sim.blue++;
			else sim.orange++;
			sim.stats[name]!.goals++;
			if (assist) sim.stats[assist]!.assists++;
			sim.ball = speed;
			rl.send("GoalScored", { GoalSpeed: speed, GoalTime: 90 - sim.time, ImpactLocation: { X: 0, Y: -5120, Z: 320 }, Scorer: P(name), ...(assist ? { Assister: P(assist) } : {}), BallLastTouch: { Player: P(name), Speed: speed } });
			tickerClock = false;
			await sleep(1500);
			sim.replay = true;
			rl.send("GoalReplayStart");
			await sleep(3500);
			rl.send("GoalReplayWillEnd");
			sim.replay = false;
			rl.send("GoalReplayEnd");
			rl.send("CountdownBegin");
			await sleep(3000);
			sim.ball = 0;
			rl.send("RoundStarted");
			tickerClock = true;
		};
		const stat = (EventName: string, Type: string, main: string, secondary?: string) =>
			rl.send("StatfeedEvent", { EventName, Type, MainTarget: P(main), ...(secondary ? { SecondaryTarget: P(secondary) } : {}) });

		rl.send("MatchInitialized");
		rl.send("MatchCreated");
		for (const [n] of PLAYERS) rl.send("PlayerJoined", { PlayerName: n, PrimaryId: "Epic|1|0" });
		await sleep(800);
		rl.send("CountdownBegin");
		await sleep(3000);
		rl.send("RoundStarted");
		tickerClock = true;

		await sleep(4000);
		sim.stats.Player1!.shots++;
		stat("Shot", "Shot on Goal", "Player1");
		await sleep(2500);
		await goal("Player1", 102, "Mate");
		await sleep(3000);
		sim.stats.Player1!.demos++;
		stat("Demolish", "Demolition", "Player1", "Rival");
		await sleep(4000);
		sim.stats.Player1!.saves++;
		stat("EpicSave", "Epic Save", "Player1");
		await sleep(3500);
		rl.send("CrossbarHit", { BallLocation: { X: 120, Y: 5120, Z: 320 }, BallSpeed: 112, ImpactForce: 120, BallLastTouch: { Player: P("Rival"), Speed: 100 } });
		await sleep(3500);
		stat("Demolish", "Demolition", "Rival2", "Player1");
		await sleep(3500);
		await goal("Rival2", 122);
		await sleep(3000);
		await goal("Rival", 61, "Rival2");
		sim.time = 3;
		await sleep(4500);
		sim.overtime = true;
		sim.time = 0;
		rl.send("ClockUpdatedSeconds", { TimeSeconds: 0, bOvertime: true });
		await sleep(5000);
		await goal("Player1", 76);
		sim.winner = 0;
		tickerClock = false;
		rl.send("MatchEnded", { WinnerTeamNum: 0 });
		await sleep(3000);
		rl.send("PodiumStart");
		await sleep(6000);
		rl.send("MatchDestroyed");
		running = false;
		clearInterval(ticker);
		clearInterval(clock);
		console.log("demo match finished — looping in 8 s");
		await sleep(8000);
	}
}

if (process.argv[1] && /mock-rl\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
	void demo(Number(process.argv[2]) || 49124);
}
