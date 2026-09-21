/**
 * End-to-end test without hardware or the game:
 *   mock Stream Deck app (speaks the plugin protocol)  ⇄  the BUILT plugin (bin/plugin.js)  ⇄  mock Rocket League Stats API
 *
 * Uses a throw-away fake game folder, so it never touches a real installation.
 * Run:  npm run bundle && npm run e2e
 */
import { Resvg } from "@resvg/resvg-js";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { KEY_GAP } from "../src/ui/banner.ts";
import { actionUuid, LAYOUT, legacyUuid, PLUGIN_UUID, PLUS_DIALS, PROFILE_NAME, PROFILE_PLUS_NAME, STRIP_ACTION } from "../src/ui/layout.ts";
import { freshSim, startMockRl, updateState } from "./mock-rl.ts";

const PLUGIN_DIR = path.resolve(`${PLUGIN_UUID}.sdPlugin`);
const RL_PORT = 49555;
const DEVICE = "DEVICE-5X3";
const DEVICE_PLUS = "DEVICE-PLUS";
const DEVICE_MINI = "DEVICE-MINI";
const DEVICE_XL = "DEVICE-XL";
const DEVICE_NEO = "DEVICE-NEO";
// Hermetic: never look at a real Rocket League that may be running on this machine.
const FAKE_GAME = "RLHUDTestGame.exe";

// ---- tiny assertion framework ----------------------------------------------------------------------------------------
let failed = 0;
const check = (name: string, ok: boolean, detail = ""): void => {
	console.log(`${ok ? "  ✔" : "  ✘"} ${name}${!ok && detail ? `\n      ${detail}` : ""}`);
	if (!ok) failed++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond: () => boolean, ms = 5000, step = 25): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (cond()) return true;
		await sleep(step);
	}
	return cond();
}

// ---- fake game folder (a copy of the real Epic default file, WebPort moved so it cannot clash with a running game) ----
const fake = fs.mkdtempSync(path.join(os.tmpdir(), "rlhud-e2e-"));
const cfgDir = path.join(fake, "TAGame", "Config");
fs.mkdirSync(cfgDir, { recursive: true });
const iniPath = path.join(cfgDir, "DefaultStatsAPI.ini");
// A fake game log folder holding one earlier ranked-doubles queue (mu 42.68 → 954 MMR).
const logDir = path.join(fake, "Logs");
fs.mkdirSync(logDir, { recursive: true });
const queueBlock = (mu: number, at: string, playlist = 11) =>
	`[0001.00] Matchmaking: Pre-divide PartyLeaderMMR: ${mu}\n[0001.00] Matchmaking: Post-divide PartyLeaderMMR: ${mu}\n[0001.00] Matchmaking: PartyLeaderTier=(15)\n` +
	`[0001.00] Matchmaking: StartMatchmaking at ${at} in EU7 for playlists ${playlist} on game server \n` +
	`[0001.00] Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)\n`;
// The game states its own account when it logs in; the mock game's local player ("Player1") has PrimaryId Epic|1000|0.
fs.writeFileSync(
	path.join(logDir, "Launch.log"),
	"[0014.78] Party: HandleLocalPlayerLoginStatusChanged PlayerName=Player1 PlayerID=Epic|1000|0 LoginStatus=LS_LoggedIn IsPrimary=True IsInParty=False\n" + queueBlock(42.68, "2026-09-20 10:00:00") + "[0020.00] Log: LoadMap: 127.0.0.1:9000\n",
);
// One rank icon the "user" dropped into the plugin's rank-icons folder (a 1×1 PNG stands in for real artwork).
const iconDir = path.join(fake, "data", "rank-icons");
fs.mkdirSync(iconDir, { recursive: true });
fs.writeFileSync(path.join(iconDir, "diamond-2.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
fs.writeFileSync(iniPath, `[TAGame.MatchStatsExporter_TA]\r\n\r\n; tcp\r\nPort=49123\r\n\r\n; web\r\nWebPort=${RL_PORT}\r\n\r\n; rate\r\nPacketSendRate=0`);

// ---- mock Stream Deck ------------------------------------------------------------------------------------------------
type Msg = Record<string, any>;
const images = new Map<string, string>(); // context → latest svg
const imageCount = new Map<string, number>();
const feedback = new Map<string, string>(); // dial context → latest touch-strip SVG
const received: Msg[] = [];
let sd: WebSocket | undefined;
const ctxOf = (col: number, row: number) => `KEY-${col}-${row}`;
const send = (m: Msg) => sd?.send(JSON.stringify(m));

const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise<void>((r) => wss.once("listening", () => r()));
const sdPort = (wss.address() as { port: number }).port;

wss.on("connection", (ws) => {
	sd = ws;
	ws.on("message", (raw) => {
		const m = JSON.parse(raw.toString()) as Msg;
		received.push(m);
		if (m.event === "registerPlugin") {
			// The real app announces every connected device right after the plugin registers.
			send({ event: "deviceDidConnect", device: DEVICE, deviceInfo: info.devices[0] });
			send({ event: "deviceDidConnect", device: DEVICE_PLUS, deviceInfo: info.devices[1] });
			for (const d of info.devices.slice(2)) send({ event: "deviceDidConnect", device: d.id, deviceInfo: d });
		}
		if (m.event === "getGlobalSettings") {
			send({
				event: "didReceiveGlobalSettings",
				payload: { settings: { installDir: fake, lang: "pl", autoSwitch: true, recordMatches: true, ranks: { doubles: { tier: 14, div: 2, mmr: 900 } } } },
			});
		}
		if (m.event === "setFeedback") {
			// A Stream Deck + touch-strip segment: `canvas` is a base64 SVG data URI.
			const uri: string = m.payload.canvas;
			feedback.set(m.context, Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64").toString("utf8"));
		}
		if (m.event === "setImage") {
			const uri: string = m.payload.image;
			const svg = decodeURIComponent(uri.slice(uri.indexOf(",") + 1));
			images.set(m.context, svg);
			imageCount.set(m.context, (imageCount.get(m.context) ?? 0) + 1);
		}
	});
});

const info = {
	application: { font: "Segoe UI", language: "en", platform: "windows", platformVersion: "10.0.26200", version: "7.0.3.22071" },
	colors: { buttonMouseOverBackgroundColor: "#464646", buttonPressedBackgroundColor: "#303030", buttonPressedBorderColor: "#646464", buttonPressedTextColor: "#969696", disabledColor: "#787878" },
	devicePixelRatio: 1,
	devices: [
		{ id: DEVICE, name: "Stream Deck MK.2", size: { columns: 5, rows: 3 }, type: 0 },
		{ id: DEVICE_PLUS, name: "Stream Deck +", size: { columns: 4, rows: 2 }, type: 7 },
		{ id: DEVICE_MINI, name: "Stream Deck Mini", size: { columns: 3, rows: 2 }, type: 1 },
		{ id: DEVICE_XL, name: "Stream Deck XL", size: { columns: 8, rows: 4 }, type: 2 },
		{ id: DEVICE_NEO, name: "Stream Deck Neo", size: { columns: 4, rows: 2 }, type: 9 },
	],
	plugin: { uuid: PLUGIN_UUID, version: "1.0.0.0" },
};

// ---- helpers --------------------------------------------------------------------------------------------------------
const svgOf = (col: number, row: number) => images.get(ctxOf(col, row)) ?? "";
const has = (col: number, row: number, needle: string) => svgOf(col, row).includes(needle);

function deckPng(file: string): void {
	const CELL = 72, GAP = KEY_GAP, PAD = 22;
	const w = PAD * 2 + CELL * 5 + GAP * 4;
	const h = PAD * 2 + CELL * 3 + GAP * 2;
	let body = `<rect width="${w}" height="${h}" rx="16" fill="#15161a"/>`;
	let n = 0;
	for (const cell of LAYOUT) {
		n++;
		const svg = svgOf(cell.col, cell.row)
			.replace(/id="([^"]+)"/g, (_m, id) => `id="k${n}-${id}"`)
			.replace(/url\(#([^)]+)\)/g, (_m, id) => `url(#k${n}-${id})`);
		const x = PAD + cell.col * (CELL + GAP);
		const y = PAD + cell.row * (CELL + GAP);
		body += `<svg x="${x}" y="${y}" width="${CELL}" height="${CELL}" viewBox="0 0 72 72">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg>`;
	}
	const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, new Resvg(doc, { fitTo: { mode: "zoom", value: 3 }, font: { loadSystemFonts: true, defaultFontFamily: "Bahnschrift" } }).render().asPng());
}

// ---- run ----------------------------------------------------------------------------------------------------------------
let plugin: ChildProcess | undefined;
let rl: Awaited<ReturnType<typeof startMockRl>> | undefined;
const pluginLog: string[] = [];

async function main(): Promise<void> {
	console.log("\n[1] launch the built plugin (the game is not running yet)");

	plugin = spawn(process.execPath, ["bin/plugin.js", "-port", String(sdPort), "-pluginUUID", PLUGIN_UUID, "-registerEvent", "registerPlugin", "-info", JSON.stringify(info)], {
		cwd: PLUGIN_DIR,
		env: { ...process.env, RLHUD_ONLY_MANUAL_INSTALL: "1", RLHUD_GAME_EXE: FAKE_GAME, RLHUD_LOG_DIR: logDir, RLHUD_DATA_DIR: path.join(fake, "data") },
		stdio: ["ignore", "pipe", "pipe"],
	});
	plugin.stdout?.on("data", (d) => pluginLog.push(String(d)));
	plugin.stderr?.on("data", (d) => pluginLog.push(String(d)));
	let exited: number | null | undefined;
	plugin.on("exit", (c) => (exited = c ?? -1));

	check("plugin registers with the Stream Deck app", await waitFor(() => received.some((m) => m.event === "registerPlugin" || m.uuid === PLUGIN_UUID), 8000), pluginLog.join("").slice(0, 600));
	if (exited !== undefined) throw new Error(`plugin exited early (${exited}): ${pluginLog.join("").slice(0, 800)}`);

	console.log("\n[2] keys appear");
	for (const cell of LAYOUT) {
		send({
			event: "willAppear",
			action: actionUuid(cell.role),
			context: ctxOf(cell.col, cell.row),
			device: DEVICE,
			payload: { controller: "Keypad", coordinates: { column: cell.col, row: cell.row }, isInMultiAction: false, settings: {}, state: 0 },
		});
	}
	check("all 15 keys receive an image", await waitFor(() => images.size === 15, 5000), `got ${images.size}`);
	const allValid = [...images.values()].every((svg) => {
		try {
			new Resvg(svg).render();
			return svg.startsWith("<svg");
		} catch {
			return false;
		}
	});
	check("every image is a valid, renderable SVG", allValid);
	// the clock and ping keys are not part of the 5×3 layout: place them by hand, as a user would
	for (const [role, ctx] of [["clock", "KEY-clock"], ["ping", "KEY-ping"], ["analog", "KEY-analog"]] as const) {
		send({ event: "willAppear", action: actionUuid(role), context: ctx, device: DEVICE, payload: { controller: "Keypad", coordinates: { column: 0, row: 0 }, isInMultiAction: false, settings: {}, state: 0 } });
	}
	check("the clock key draws this computer's time, game or not", await waitFor(() => (images.get("KEY-clock")?.match(/>\d{1,2}<\/text>/g)?.length ?? 0) >= 2, 3000), images.get("KEY-clock")?.slice(-300));
	check("the analog clock key draws a dial with hour, minute and second hands", await waitFor(() => ["h-hour", "h-minute", "h-second"].every((h) => (images.get("KEY-analog") ?? "").includes(`id="${h}"`)), 3000));
	check("the ping key says there is no match yet", await waitFor(() => (images.get("KEY-ping") ?? "").includes("BRAK MECZU"), 3000), images.get("KEY-ping")?.slice(-200));
	check("game not running → banner says so", has(3, 1, "ROCKET LEAGUE") || has(2, 1, "ROCKET LEAGUE") || has(4, 1, "ROCKET LEAGUE"), svgOf(3, 1).slice(-300));

	console.log("\n[2b] Stream Deck +: the four dials of the touch strip appear");
	const dialCtx = (i: number) => `DIAL-${i}`;
	for (let i = 0; i < PLUS_DIALS; i++) {
		send({ event: "willAppear", action: STRIP_ACTION, context: dialCtx(i), device: DEVICE_PLUS, payload: { controller: "Encoder", coordinates: { column: i, row: 0 }, isInMultiAction: false, settings: {}, state: 0 } });
	}
	check("all four dials get a touch-strip image", await waitFor(() => feedback.size === PLUS_DIALS, 5000), `got ${feedback.size}`);
	check(
		"every strip segment is a valid 200×100 SVG",
		[...feedback.values()].every((svg) => {
			try {
				new Resvg(svg).render();
				return svg.includes('width="200" height="100"');
			} catch {
				return false;
			}
		}),
	);
	check("game not running → the whole strip says so", [0, 1, 2, 3].every((i) => (feedback.get(dialCtx(i)) ?? "").includes("ROCKET LEAGUE")));
	check("each segment shows its own quarter of the same scene", new Set([0, 1, 2, 3].map((i) => feedback.get(dialCtx(i)))).size === 4 && (feedback.get(dialCtx(2)) ?? "").includes("translate(-400 0)"));

	console.log("\n[3] game config is patched automatically");
	const ini = fs.readFileSync(iniPath, "utf8");
	check("PacketSendRate switched on in DefaultStatsAPI.ini", /PacketSendRate=10\s*$/.test(ini), ini);
	check("backup of the original file was kept", fs.existsSync(`${iniPath}.rlhud.bak`));
	check("user's WebPort/comments preserved", ini.includes(`WebPort=${RL_PORT}`) && ini.includes("; web") && ini.includes("\r\n"));

	console.log("\n[4] the game starts → the plugin connects to the Stats API on its own");
	rl = await startMockRl(RL_PORT);
	check("plugin connects to the mock game on the port from the ini", await waitFor(() => rl!.clientCount() === 1, 8000));
	check("menu state is shown once connected", await waitFor(() => has(3, 1, "MENU") || has(4, 1, "MENU") || has(2, 1, "MENU"), 3000));

	console.log("\n[5] game launch switches the profile");
	send({ event: "applicationDidLaunch", payload: { application: FAKE_GAME } });
	const sw = () => received.find((m) => m.event === "switchToProfile" && m.payload?.profile === PROFILE_NAME);
	check("switchToProfile → profiles/RL for the 5×3 device", await waitFor(() => !!sw(), 3000));
	check("…targets the right device", sw()?.device === DEVICE, JSON.stringify(sw()));
	const swPlus = () => received.find((m) => m.event === "switchToProfile" && m.payload?.profile === PROFILE_PLUS_NAME);
	check("switchToProfile → profiles/RL-Plus for the Stream Deck +", (await waitFor(() => !!swPlus(), 3000)) && swPlus()?.device === DEVICE_PLUS, JSON.stringify(swPlus()));
	for (const [device, profile] of [[DEVICE_MINI, "profiles/RL-Mini"], [DEVICE_XL, "profiles/RL-XL"], [DEVICE_NEO, "profiles/RL-Neo"]] as const) {
		const hit = () => received.find((m) => m.event === "switchToProfile" && m.payload?.profile === profile);
		check(`switchToProfile → ${profile} for the ${device.replace("DEVICE-", "")} deck (each model gets its own profile)`, (await waitFor(() => !!hit(), 3000)) && hit()?.device === device, JSON.stringify(hit()));
	}

	console.log("\n[6] live match");
	const sim = freshSim();
	sim.blue = 2;
	sim.orange = 1;
	sim.time = 141;
	rl.send("MatchInitialized");
	rl.send("CountdownBegin");
	rl.send("RoundStarted");
	rl.send("UpdateState", updateState(sim));
	check("blue score key shows 2", await waitFor(() => has(2, 0, ">2<"), 2000), svgOf(2, 0).slice(0, 300));
	check("orange score key shows 1", has(4, 0, ">1<"));
	// The mock game reports team colours 0000FF / FF8800; the keys now use what the game reports. The user (Player1) is on the blue team,
	// so the left key is blue and the right key orange.
	check("keys use the team colours the game reports (left = own team = blue, right = orange)", has(2, 0, "#0000ff") && has(4, 0, "#ff8800"), svgOf(2, 0).slice(0, 260));
	check("clock shows 2:21", has(3, 0, "2:21"));
	check("mode key: DOUBLES / ranked (playlist 11, 2v2)", has(1, 0, "DOUBLES") && has(1, 0, "RANKINGOWY"));
	check("rank key: Diamond II from the user's settings", has(0, 0, "DIAMOND"));
	check("…drawn with the icon found in the rank-icons folder instead of the built-in emblem", has(0, 0, "<image") && has(0, 0, "data:image/png;base64,"), svgOf(0, 0).slice(0, 300));
	check("MMR key: 954, read from the game log — it wins over the 900 typed into the settings", has(0, 1, ">954<") && !has(0, 1, ">900<"), svgOf(0, 1).slice(-350));
	fs.appendFileSync(path.join(logDir, "Launch.log"), queueBlock(43.2, "2026-09-20 11:00:00")); // the next queue, after a win worth +10
	check("a new queue in the game log updates the MMR (964) and shows the change (+10)", await waitFor(() => has(0, 1, ">964<") && has(0, 1, ">+10<"), 6000), svgOf(0, 1).slice(-350));
	check("the value is stored for the next start", fs.existsSync(path.join(fake, "data", "mmr.json")));
	check("'me' auto-detected from the camera target → blue key marked TY", has(2, 0, ">TY<"));

	console.log("\n[7] goal");
	sim.blue = 3;
	rl.send("GoalScored", { GoalSpeed: 102, GoalTime: 60, Scorer: { Name: "Player1", Shortcut: 1, TeamNum: 0 }, Assister: { Name: "Mate", Shortcut: 2, TeamNum: 0 }, BallLastTouch: { Player: { Name: "Player1", TeamNum: 0 }, Speed: 102 } });
	rl.send("UpdateState", updateState(sim));
	check("banner (middle key) shows GOL!", await waitFor(() => has(3, 1, "GOL!"), 2000));
	check("banner (left key) shows ball speed 102 km/h", has(2, 1, ">102<"), svgOf(2, 1).slice(-400));
	check("banner (right key) shows the assist", has(4, 1, "Mate"));
	check("scorer named on the banner", has(3, 1, "Player1"));
	check("last-goal key: scorer + speed", has(1, 1, "Player1") && has(1, 1, ">102<"));
	check(
		"touch strip: GOL! across the dials, with the speed on the left and the scorer in the middle",
		(await waitFor(() => [0, 1, 2, 3].every((i) => (feedback.get(dialCtx(i)) ?? "").includes("GOL!")), 2000)) && (feedback.get(dialCtx(0)) ?? "").includes(">102<") && (feedback.get(dialCtx(1)) ?? "").includes("Player1"),
		(feedback.get(dialCtx(1)) ?? "").slice(-300),
	);
	await sleep(350);
	deckPng(path.resolve("preview", "e2e-goal.png"));

	console.log("\n[7b] goal replay — the score must not move");
	const shown = () => svgOf(2, 0).match(/>\d+<\/text>/g)?.join(" ") ?? "";
	rl.send("GoalReplayStart");
	sim.replay = true;
	sim.blue = 4; // the replay re-simulates the goal and its world reports a higher score…
	rl.send("UpdateState", updateState(sim));
	rl.send("GoalScored", { GoalSpeed: 102, GoalTime: 60, Scorer: { Name: "Player1", Shortcut: 1, TeamNum: 0 } }); // …and may announce the goal again
	await sleep(500);
	check("blue score key still shows 3 during the replay", has(2, 0, ">3<") && !has(2, 0, ">4<") && !has(2, 0, ">6<"), shown());
	sim.replay = false;
	sim.blue = 3;
	rl.send("GoalReplayEnd");
	rl.send("UpdateState", updateState(sim));
	await sleep(300);
	check("…and still 3 after it", has(2, 0, ">3<") && !has(2, 0, ">4<"), shown());

	console.log("\n[8] demo (after the goal banner has expired)");
	await sleep(4600);
	rl.send("StatfeedEvent", { EventName: "Demolish", Type: "Demolition", MainTarget: { Name: "Player1", Shortcut: 1, TeamNum: 0 }, SecondaryTarget: { Name: "Rival", Shortcut: 3, TeamNum: 1 } });
	check("banner shows DEMO! with attacker and victim", await waitFor(() => has(3, 1, "DEMO!") && has(2, 1, "Player1") && has(4, 1, "Rival"), 2000));
	await sleep(350);
	deckPng(path.resolve("preview", "e2e-demo.png"));

	console.log("\n[9] live keys: boost, car speed, possession, points");
	sim.boost = 62;
	sim.carSpeed = 64.2;
	sim.ballTeam = 0;
	sim.stats.Player1!.shots = 4;
	sim.stats.Player1!.demos = 1;
	rl.send("UpdateState", updateState(sim));
	check("boost key shows 62", await waitFor(() => has(0, 2, ">62<"), 2500), svgOf(0, 2).slice(-260));
	check("car speed key shows 64 km/h", await waitFor(() => has(1, 2, ">64<") && has(1, 2, "km/h"), 2500), svgOf(1, 2).slice(-260));
	check("possession key is drawn", has(2, 2, "POSIADANIE"));
	check("points key shows shots and demos", has(3, 2, "STRZAŁY 4") && has(3, 2, "DEMOLKI 1"), svgOf(3, 2).slice(-300));
	sim.carSpeed = 83;
	rl.send("UpdateState", updateState(sim));
	check("breaking the sound barrier flashes SUPERSONIC", await waitFor(() => has(1, 2, "SUPERSONIC"), 2500));
	sim.boost = 0;
	sim.carSpeed = 10;
	rl.send("UpdateState", updateState(sim));
	check("empty boost shows 0", await waitFor(() => has(0, 2, ">0<"), 2500));
	// a deck that still has a key of an older version keeps working: the old id draws the key that replaced it
	send({ event: "willAppear", action: legacyUuid("find"), context: "KEY-legacy", device: DEVICE, payload: { controller: "Keypad", coordinates: { column: 0, row: 2 }, isInMultiAction: false, settings: {}, state: 0 } });
	check("an old 'find match' key now draws the boost key", await waitFor(() => (images.get("KEY-legacy") ?? "").includes(">BOOST<"), 2500));
	send({ event: "keyDown", action: actionUuid("boost"), context: ctxOf(0, 2), device: DEVICE, payload: { controller: "Keypad", coordinates: { column: 0, row: 2 }, isInMultiAction: false, settings: {}, state: 0 } });
	await sleep(300);
	check("pressing a key does nothing (no alert, nothing sent to the game)", !received.some((m) => m.event === "showAlert" || m.event === "showOk"));

	console.log("\n[10] property inspector");
	send({ event: "propertyInspectorDidAppear", action: actionUuid("banner"), context: ctxOf(3, 1), device: DEVICE });
	await sleep(100);
	send({ event: "sendToPlugin", action: actionUuid("banner"), context: ctxOf(3, 1), payload: { cmd: "status" } });
	const status = () => received.find((m) => m.event === "sendToPropertyInspector" && m.payload?.type === "status");
	check("status request is answered", await waitFor(() => !!status(), 3000));
	check("status reports game running + API connected + ini ok", status()?.payload?.connected === true && status()?.payload?.ini?.state !== undefined, JSON.stringify(status()?.payload));
	check("status reports the rank icons found", status()?.payload?.rankIcons?.count === 1, JSON.stringify(status()?.payload?.rankIcons));
	check("status names the local player found in the game log", status()?.payload?.localPlayer?.name === "Player1", JSON.stringify(status()?.payload?.localPlayer));
	const captured = path.join(fake, "data", "captures", "stats-api.ndjson");
	check("an anonymised diagnostics log of the match was written", fs.existsSync(captured) && fs.readFileSync(captured, "utf8").includes('"Event":"GoalScored"') && !fs.readFileSync(captured, "utf8").includes("Rival"), captured);

	console.log("\n[10b] leaving the match keeps the last goal on the deck");
	rl.send("MatchDestroyed");
	await sleep(500);
	check("last-goal key still shows the scorer and 102 km/h in the menu", has(1, 1, "Player1") && has(1, 1, ">102<"), svgOf(1, 1).slice(-300));

	console.log("\n[10c] switching the language in the inspector");
	check("the deck was Polish", has(2, 2, "POSIADANIE"));
	send({ event: "didReceiveGlobalSettings", payload: { settings: { installDir: fake, lang: "en", autoSwitch: true, recordMatches: true, ranks: { doubles: { tier: 14, div: 2, mmr: 900 } } } } });
	check("the keys switch to English at once", await waitFor(() => has(2, 2, "POSSESSION"), 2500), svgOf(2, 2).slice(-200));
	check("…and no Polish word is left on the possession key", !has(2, 2, "POSIADANIE"));

	console.log("\n[10d] rank icons: the bundled ones are the fallback");
	fs.rmSync(path.join(iconDir, "diamond-2.png"));
	const tiny = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
	check("without the user's file the key switches to the icon bundled with the plugin", await waitFor(() => has(0, 0, "<image") && !has(0, 0, tiny), 9000), svgOf(0, 0).slice(0, 200));

	console.log("\n[10e] ping, the MMR key's views and a pinned strip panel");
	check("ping: the server from the game log is measured once the game runs (loopback stands in for it)", await waitFor(() => (images.get("KEY-ping") ?? "").includes(">ms<"), 12000), images.get("KEY-ping")?.slice(-300));
	const press = async (col: number, row: number) => {
		send({ event: "keyDown", action: actionUuid("mmr"), context: ctxOf(col, row), device: DEVICE, payload: { controller: "Keypad", coordinates: { column: col, row }, isInMultiAction: false, settings: {}, state: 0 } });
		await sleep(700); // the swap animation lasts 0.4 s
	};
	check("the MMR key starts on MMR", has(0, 1, ">MMR<") && !has(0, 1, ">RECORD<"));
	await press(0, 1);
	check("one press: the record (wins / losses) becomes the big number", has(0, 1, ">RECORD<") && !has(0, 1, ">STREAK<"), svgOf(0, 1).slice(-400));
	await press(0, 1);
	check("second press: the current streak", has(0, 1, ">STREAK<"), svgOf(0, 1).slice(-400));
	await press(0, 1);
	check("third press: back to MMR", has(0, 1, ">MMR<") && !has(0, 1, ">STREAK<") && !has(0, 1, ">RECORD<"), svgOf(0, 1).slice(-400));
	const oneLine = () => /\d{1,2}:\d{2}</.test(images.get("KEY-clock") ?? "");
	const pressClock = async () => {
		send({ event: "keyDown", action: actionUuid("clock"), context: "KEY-clock", device: DEVICE, payload: { controller: "Keypad", coordinates: { column: 0, row: 0 }, isInMultiAction: false, settings: {}, state: 0 } });
		await sleep(400);
	};
	check("the clock key starts with hours over minutes", !oneLine());
	await pressClock();
	check("one press puts the time on a single, smaller line", oneLine(), (images.get("KEY-clock") ?? "").slice(-300));
	await pressClock();
	check("another press goes back to hours over minutes", !oneLine());
	send({ event: "didReceiveSettings", action: STRIP_ACTION, context: dialCtx(0), device: DEVICE_PLUS, payload: { settings: { panel: "clock" }, coordinates: { column: 0, row: 0 }, isInMultiAction: false } });
	check("a dial pinned to the clock shows the time on the touch strip", await waitFor(() => />\d{1,2}:\d{2}</.test(feedback.get(dialCtx(0)) ?? ""), 3000), (feedback.get(dialCtx(0)) ?? "").slice(-300));

	console.log("\n[11] game closes");
	send({ event: "applicationDidTerminate", payload: { application: FAKE_GAME } });
	const back = () => received.filter((m) => m.event === "switchToProfile" && m.payload?.profile === undefined).length >= 5; // one per deck
	check("previous profile is restored on every deck", await waitFor(back, 3000));
	const last = received.filter((m) => m.event === "switchToProfile").at(-1);
	check("…by switching without a profile name", last?.payload?.profile === undefined, JSON.stringify(last));
	check("banner is back to 'launch the game'", await waitFor(() => has(3, 1, "ROCKET LEAGUE") || has(2, 1, "ROCKET"), 2000));
}

try {
	await main();
} catch (e) {
	failed++;
	console.log(`\n  ✘ aborted: ${(e as Error).message}`);
} finally {
	plugin?.kill();
	await rl?.close();
	wss.close();
	fs.rmSync(fake, { recursive: true, force: true });
}

console.log(failed === 0 ? "\nE2E: all checks passed" : `\nE2E: ${failed} check(s) FAILED`);
if (failed && pluginLog.length) console.log("--- plugin output ---\n" + pluginLog.join("").slice(0, 2000));
process.exit(failed === 0 ? 0 : 1);
