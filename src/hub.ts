import streamDeck, { type KeyAction, type Logger } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MatchStore } from "./core/match-store";
import { describePlaylist } from "./core/playlists";
import { DEFAULT_SETTINGS, mergeSettings, type GlobalSettings } from "./core/types";
import { RLClient } from "./net/rl-client";
import { RankIcons } from "./sys/rank-icons";
import { MatchRecorder } from "./sys/recorder";
import { findLogDir, readExistingSamples, readLocalIdentity, RlLogWatcher, type LocalIdentity, type MmrSample } from "./sys/rl-log";
import { DEFAULT_WEB_PORT, findInstallDirs, patchStatsIni, type IniResult } from "./sys/ini";
import type { AutoMmr, RenderCtx, Role } from "./ui/context";
import { renderRole } from "./ui/keys";
import { PROFILE_NAME } from "./ui/layout";
import { svgDataUri } from "./ui/svg";

// The environment override exists only so automated tests can run without ever looking at a real, running game.
const GAME_EXE = process.env.RLHUD_GAME_EXE ?? "RocketLeague.exe";
const TICK_MS = 100;
/** After the game starts, how long we wait for the Stats API before telling the user to restart the game. */
const RESTART_HINT_AFTER_MS = 45_000;
/** Roles whose value changes many times per second; their redraw rate is capped to keep the deck responsive. */
const HIGH_RATE: ReadonlySet<Role> = new Set<Role>(["boost", "carspeed", "speed"]);
const HIGH_RATE_MIN_INTERVAL_MS = 150;

/** Per-key settings written by the property inspector. */
export type KeySettings = {
	/** "auto" (or missing) orders banner keys in a row left to right; 1–3 pins a key to a slice. */
	slice?: "auto" | 1 | 2 | 3;
};

interface KeyEntry {
	action: KeyAction;
	role: Role;
	settings: KeySettings;
	last?: string;
	lastSentAt?: number;
}

function isProcessRunning(exe: string): Promise<boolean> {
	return new Promise((resolve) => {
		execFile("tasklist", ["/FI", `IMAGENAME eq ${exe}`, "/FO", "CSV", "/NH"], { windowsHide: true }, (err, stdout) => {
			resolve(!err && stdout.toLowerCase().includes(exe.toLowerCase()));
		});
	});
}

/** Glue between the game (Stats API), the match state and the physical keys. */
export class Hub {
	readonly store = new MatchStore();
	settings: GlobalSettings = { ...DEFAULT_SETTINGS };

	private readonly keys = new Map<string, KeyEntry>();
	private readonly client: RLClient;
	private readonly switched = new Set<string>();
	private ini?: IniResult;
	private launchedAt?: number;
	private iniChangedWhileRunning = false;
	private timer?: NodeJS.Timeout;
	private pollTimer?: NodeJS.Timeout;
	private autoMmr: Record<number, AutoMmr> = {};
	private lastQueued?: number;
	private logWatcher?: RlLogWatcher;
	private logDir?: string;
	private recorder?: MatchRecorder;
	private local?: LocalIdentity;

	constructor(private readonly log: Logger) {
		this.client = new RLClient({
			port: () => this.ini?.webPort ?? DEFAULT_WEB_PORT,
			onMessage: (m) => {
				this.recorder?.record(m);
				this.store.handle(m);
			},
			onStatus: (c) => {
				this.log.info(c ? "Stats API connected" : "Stats API disconnected");
				this.store.setConnected(c);
				if (c && this.launchedAt === undefined) this.gameLaunched(false);
			},
			log: (l) => this.log.debug(l),
		});
	}

	// ---- lifecycle -------------------------------------------------------------------------------

	async start(): Promise<void> {
		this.applySettings(await streamDeck.settings.getGlobalSettings<Partial<GlobalSettings>>().catch(() => ({}) as Partial<GlobalSettings>));
		streamDeck.settings.onDidReceiveGlobalSettings<Partial<GlobalSettings>>((ev) => this.applySettings(ev.settings));

		streamDeck.system.onApplicationDidLaunch((ev) => {
			if (ev.application.toLowerCase() === GAME_EXE.toLowerCase()) this.gameLaunched(true);
		});
		streamDeck.system.onApplicationDidTerminate((ev) => {
			if (ev.application.toLowerCase() === GAME_EXE.toLowerCase()) this.gameQuit();
		});

		// The app reports devices as "connected" only after the plugin registered; a game that is already running
		// must still switch the deck as soon as it shows up.
		streamDeck.devices.onDeviceDidConnect((ev) => {
			if (this.store.state.gameRunning && this.settings.autoSwitch) void this.switchDevice(ev.device, true);
		});

		this.recorder = this.settings.recordMatches ? new MatchRecorder(path.join(this.dataDir, "captures", "stats-api.ndjson"), this.local) : undefined;
		this.patchIni("start");
		this.startMmrLog();
		this.client.start();

		if (await isProcessRunning(GAME_EXE)) this.gameLaunched(true);
		// Safety net in case the app's launch/terminate events are missed (e.g. plugin restarted mid-game).
		this.pollTimer = setInterval(() => void this.pollProcess(), 20_000);
		this.timer = setInterval(() => this.tick(), TICK_MS);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		if (this.pollTimer) clearInterval(this.pollTimer);
		this.client.stop();
		this.logWatcher?.stop();
	}

	private async pollProcess(): Promise<void> {
		const running = await isProcessRunning(GAME_EXE);
		if (running && !this.store.state.gameRunning) this.gameLaunched(true);
		else if (!running && this.store.state.gameRunning && !this.client.isConnected) this.gameQuit();
	}

	private gameLaunched(switchProfile: boolean): void {
		this.log.info("Rocket League is running");
		this.launchedAt = Date.now();
		this.store.setGameRunning(true);
		if (switchProfile && this.settings.autoSwitch) void this.switchProfiles(true);
	}

	private gameQuit(): void {
		this.log.info("Rocket League closed");
		this.launchedAt = undefined;
		this.iniChangedWhileRunning = false;
		this.store.setGameRunning(false);
		if (this.settings.autoSwitch) void this.switchProfiles(false);
		this.patchIni("game-exit"); // the game may rewrite its config on exit
	}

	// ---- profile switching ---------------------------------------------------------------------

	private async switchProfiles(toGame: boolean): Promise<void> {
		for (const device of streamDeck.devices) await this.switchDevice(device, toGame);
	}

	private async switchDevice(device: { id: string; name: string; isConnected: boolean; size: { columns: number; rows: number } }, toGame: boolean): Promise<void> {
		if (!device.isConnected || device.size.columns !== 5 || device.size.rows !== 3) return;
		try {
			if (toGame) {
				await streamDeck.profiles.switchToProfile(device.id, PROFILE_NAME);
				this.switched.add(device.id);
			} else if (this.switched.delete(device.id)) {
				await streamDeck.profiles.switchToProfile(device.id); // back to the previously active profile
			}
		} catch (e) {
			this.log.warn(`profile switch failed for ${device.name}: ${e}`);
		}
	}

	// ---- settings + ini ------------------------------------------------------------------------------

	private applySettings(raw: Partial<GlobalSettings> | undefined): void {
		const previous = this.settings;
		this.settings = mergeSettings(raw);
		this.store.setPlayerName(this.settings.playerName);
		if (this.settings.recordMatches !== previous.recordMatches) {
			this.recorder = this.settings.recordMatches ? new MatchRecorder(path.join(this.dataDir, "captures", "stats-api.ndjson"), this.local) : undefined;
		}
		if (previous.installDir !== this.settings.installDir || previous.packetRate !== this.settings.packetRate) this.patchIni("settings");
	}

	private patchIni(reason: string): void {
		const dirs = findInstallDirs(this.settings.installDir);
		if (dirs.length === 0) {
			this.ini = { state: "not-found", files: [], webPort: DEFAULT_WEB_PORT, packetRate: this.settings.packetRate, message: "Rocket League installation not found" };
			this.log.warn(`ini (${reason}): ${this.ini.message}`);
			return;
		}
		let first: IniResult | undefined;
		for (const dir of dirs) {
			const result = patchStatsIni(dir, { packetRate: this.settings.packetRate });
			first ??= result;
			this.log.info(`ini (${reason}): ${dir} → ${result.state} [${result.files.join(", ")}] ${result.message ?? ""}`);
			if (result.state === "changed" && this.store.state.gameRunning) this.iniChangedWhileRunning = true;
		}
		this.ini = first;
	}

	// ---- MMR from the game's own log -------------------------------------------------------------------

	private get dataDir(): string {
		return process.env.RLHUD_DATA_DIR ?? path.join(process.env.APPDATA ?? "", "RLHUD");
	}

	private iconStore?: RankIcons;
	/** Rank icons the user dropped into `<data dir>/rank-icons` (the plugin does not ship the game's artwork). */
	private get rankIcons(): RankIcons {
		if (!this.iconStore) {
			this.iconStore = new RankIcons(path.join(this.dataDir, "rank-icons"));
			this.iconStore.ensureDir();
		}
		return this.iconStore;
	}

	private get mmrFile(): string {
		return path.join(this.dataDir, "mmr.json");
	}

	private startMmrLog(): void {
		// What was known last time (the game keeps only a few old logs), then whatever the logs still contain, oldest first.
		try {
			const saved = JSON.parse(fs.readFileSync(this.mmrFile, "utf8")) as { autoMmr?: Record<number, AutoMmr>; lastQueued?: number };
			this.autoMmr = saved.autoMmr ?? {};
			this.lastQueued = saved.lastQueued;
		} catch {
			/* first run */
		}
		this.logDir = findLogDir(process.env.RLHUD_LOG_DIR);
		if (!this.logDir) {
			this.log.warn("Rocket League log folder not found — MMR falls back to the values typed into the property inspector");
			return;
		}
		try {
			for (const sample of readExistingSamples(this.logDir)) this.applySample(sample, false);
			this.setLocal(readLocalIdentity(this.logDir));
		} catch (e) {
			this.log.warn(`could not read existing logs: ${e}`);
		}
		this.saveMmr();
		this.logWatcher = new RlLogWatcher(this.logDir, (sample) => this.applySample(sample, true), 2000, (id) => this.setLocal(id));
		this.logWatcher.start();
		this.log.info(`MMR log: ${this.logDir} (${Object.keys(this.autoMmr).length} playlist(s) known)`);
	}

	/** The account the game is logged in with — the reliable way to know which player in a match is the user. */
	private setLocal(identity: LocalIdentity | undefined): void {
		if (!identity || (this.local?.id === identity.id && this.local.name === identity.name)) return;
		this.local = identity;
		this.store.setLocalIdentity(identity);
		this.recorder?.setLocal(identity);
		this.log.info(`local player: ${identity.name} (${identity.id})`);
	}

	private applySample(sample: MmrSample, save: boolean): void {
		const prev = this.autoMmr[sample.playlist];
		if (prev && sample.at <= prev.at) return; // an older queue than what we already have
		// The value is read before the match. A change since the last queue is the result of the match played in between.
		const delta = prev && prev.mmr !== sample.mmr ? sample.mmr - prev.mmr : prev?.delta;
		this.autoMmr[sample.playlist] = { mmr: sample.mmr, at: sample.at, delta };
		this.lastQueued = sample.playlist;
		if (save) {
			this.log.info(`MMR for playlist ${sample.playlist}: ${sample.mmr}${delta ? ` (${delta > 0 ? "+" : ""}${delta})` : ""}`);
			this.saveMmr();
		}
	}

	private saveMmr(): void {
		try {
			fs.mkdirSync(path.dirname(this.mmrFile), { recursive: true });
			fs.writeFileSync(this.mmrFile, JSON.stringify({ autoMmr: this.autoMmr, lastQueued: this.lastQueued }));
		} catch {
			/* not critical: the logs are read again next time */
		}
	}

	// ---- keys ------------------------------------------------------------------------------------------

	register(action: KeyAction, role: Role, settings: KeySettings): void {
		this.keys.set(action.id, { action, role, settings });
		this.renderOne(action.id);
	}

	unregister(id: string): void {
		this.keys.delete(id);
	}

	updateSettings(id: string, settings: KeySettings): void {
		const e = this.keys.get(id);
		if (!e) return;
		e.settings = settings;
		e.last = undefined;
		this.renderOne(id);
	}

	// ---- property inspector ------------------------------------------------------------------------

	handleUiMessage(payload: unknown): void {
		const msg = payload as { cmd?: string } | undefined;
		if (!msg?.cmd) return;
		const pi = streamDeck.ui.current;
		if (!pi) return;
		if (msg.cmd === "status") void pi.sendToPropertyInspector({ type: "status", ...this.status() });
	}

	status() {
		const s = this.store.state;
		const pl = describePlaylist(s.playlistId, s.arena, this.store.teamSize());
		return {
			version: streamDeck.manifest.Version,
			gameRunning: s.gameRunning,
			connected: s.connected,
			phase: s.phase,
			meName: s.meName ?? "",
			playlistId: s.lastPlaylistId ?? null,
			playlist: pl.name,
			ranked: pl.ranked,
			restartHint: this.restartHint(Date.now()),
			nickMismatch: !!(this.settings.playerName.trim() && this.local && this.settings.playerName.trim().toLowerCase() !== this.local.name.toLowerCase()),
			localPlayer: this.local ? { name: this.local.name, id: this.local.id } : null,
			rankIcons: { dir: this.rankIcons.dir, count: this.rankIcons.count() },
			mmrLog: this.logDir ? { dir: this.logDir, playlists: Object.keys(this.autoMmr).length } : null,
			ini: this.ini ? { state: this.ini.state, files: this.ini.files, message: this.ini.message ?? "", webPort: this.ini.webPort, packetRate: this.ini.packetRate, installDir: this.ini.installDir ?? "" } : null,
		};
	}

	// ---- rendering -------------------------------------------------------------------------------------

	private restartHint(now: number): boolean {
		const s = this.store.state;
		if (!s.gameRunning || s.connected) return false;
		if (this.iniChangedWhileRunning) return true;
		return this.launchedAt !== undefined && now - this.launchedAt > RESTART_HINT_AFTER_MS;
	}

	private context(now: number): RenderCtx {
		return { store: this.store, settings: this.settings, now, restartHint: this.restartHint(now), autoMmr: this.autoMmr, lastQueuedPlaylist: this.lastQueued, rankIcon: (id) => this.rankIcons.get(id) };
	}

	/** Banner keys in one row form a single wide banner; slices are assigned left to right unless pinned. */
	private sliceMap(): Map<string, number> {
		const groups = new Map<string, KeyEntry[]>();
		for (const e of this.keys.values()) {
			if (e.role !== "banner") continue;
			const g = `${e.action.device.id}:${e.action.coordinates?.row ?? 0}`;
			const list = groups.get(g) ?? [];
			list.push(e);
			groups.set(g, list);
		}
		const out = new Map<string, number>();
		for (const list of groups.values()) {
			list.sort((a, b) => (a.action.coordinates?.column ?? 0) - (b.action.coordinates?.column ?? 0));
			list.forEach((e, i) => {
				const pinned = e.settings.slice;
				out.set(e.action.id, typeof pinned === "number" ? pinned - 1 : Math.min(2, i));
			});
		}
		return out;
	}

	private tick(): void {
		if (this.keys.size === 0) return;
		const now = Date.now();
		const ctx = this.context(now);
		const slices = this.sliceMap();
		for (const [id, e] of this.keys) this.draw(id, e, ctx, slices);
	}

	private renderOne(id: string): void {
		const e = this.keys.get(id);
		if (!e) return;
		this.draw(id, e, this.context(Date.now()), this.sliceMap());
	}

	private draw(id: string, e: KeyEntry, ctx: RenderCtx, slices: Map<string, number>): void {
		const svg = renderRole(e.role, ctx, { slice: slices.get(id) ?? 0 });
		if (svg === e.last) return;
		// Values that change ten times a second (boost, speeds) are sent at most every 150 ms; the next tick catches up.
		if (HIGH_RATE.has(e.role) && e.lastSentAt !== undefined && ctx.now - e.lastSentAt < HIGH_RATE_MIN_INTERVAL_MS) return;
		e.last = svg;
		e.lastSentAt = ctx.now;
		e.action.setImage(svgDataUri(svg)).catch((err) => this.log.debug(`setImage failed: ${err}`));
	}
}
