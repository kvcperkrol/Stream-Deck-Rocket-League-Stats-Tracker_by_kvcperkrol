import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Rocket League writes the local player's skill into its own log every time matchmaking starts:
 *
 *   Matchmaking: Pre-divide PartyLeaderMMR: 47.4225
 *   Matchmaking: Post-divide PartyLeaderMMR: 47.4225
 *   Matchmaking: PartyLeaderTier=(15)
 *   Matchmaking: StartMatchmaking at 2026-09-20 13:05:33 in EU7,… for playlists 2 on game server
 *   Matchmaking: PreferredRegions.Length=(5) PreferredPlaylists.Length=(1) Party.GetOrderedPartyMemberIDs().Length=(1)
 *
 * Verified against the player's rocketleague.tracker.network profile: the value is the internal skill rating `mu`, and the MMR the
 * game and trackers display is `mu × 20 + 100` (47.4225 → 1048 = the tracker's "Casual 1,048"; 28.5405 → 671, and the tracker
 * showed 655 after a lost duel: −16). `PartyLeaderTier` is NOT the playlist's rank — it stayed 15 (Diamond III) in every queue,
 * including a Platinum-level duel, so it looks like the highest tier the player holds in any playlist.
 *
 * "Pre-divide" is the sum over all selected playlists and "post-divide" their average, so a queue for several playlists carries
 * no usable per-playlist value and is ignored. A party leader other than the player would also be misleading, so only solo
 * queues (party of one) count.
 */
export const muToMmr = (mu: number): number => Math.round(mu * 20 + 100);

export interface MmrSample {
	/** Playlist id as the game numbers them (10 = ranked duel, 11 = ranked doubles, 13 = ranked standard, 2 = casual doubles …). */
	playlist: number;
	mu: number;
	mmr: number;
	/** UTC time the game wrote for the queue start, ISO 8601. */
	at: string;
	/** Highest tier the game reports for the player (informational). */
	tier?: number;
	/** The account (same format as the Stats API's PrimaryId) the log said was logged in when this queue was written, if any login line came before it in the same file. */
	playerId?: string;
}

const RE_POST = /Matchmaking: Post-divide PartyLeaderMMR: (-?[\d.]+)/;
const RE_TIER = /Matchmaking: PartyLeaderTier=\((\d+)\)/;
const RE_START = /Matchmaking: StartMatchmaking at (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) .*? for playlists ([\d,]+) on game server/;
const RE_PARTY = /Matchmaking: PreferredRegions\.Length=\(\d+\) PreferredPlaylists\.Length=\((\d+)\) Party\.GetOrderedPartyMemberIDs\(\)\.Length=\((\d+)\)/;

/** Incremental parser: feed it lines in order; it returns a sample whenever a complete, usable queue block has been seen. */
export class MatchmakingParser {
	private mu?: number;
	private tier?: number;
	private at?: string;
	private playlists: number[] = [];
	/** The most recent account the same line stream said was logged in, so every sample can be tagged with it. */
	private playerId?: string;

	feed(line: string): MmrSample | undefined {
		const login = RE_LOCAL.exec(line);
		if (login) {
			this.playerId = login[2];
			return undefined;
		}
		let m = RE_POST.exec(line);
		if (m) {
			this.mu = Number(m[1]);
			this.tier = undefined;
			this.at = undefined;
			this.playlists = [];
			return undefined;
		}
		if ((m = RE_TIER.exec(line))) {
			this.tier = Number(m[1]);
			return undefined;
		}
		if ((m = RE_START.exec(line))) {
			this.at = `${m[1]}T${m[2]}Z`;
			this.playlists = m[3]!.split(",").map(Number);
			return undefined;
		}
		if ((m = RE_PARTY.exec(line))) {
			const usable = this.mu !== undefined && Number.isFinite(this.mu) && this.at !== undefined && this.playlists.length === 1 && Number(m[1]) === 1 && Number(m[2]) === 1;
			const sample: MmrSample | undefined = usable
				? { playlist: this.playlists[0]!, mu: this.mu!, mmr: muToMmr(this.mu!), at: this.at!, tier: this.tier, playerId: this.playerId }
				: undefined;
			this.mu = undefined;
			this.at = undefined;
			this.playlists = [];
			return sample;
		}
		return undefined;
	}
}

export function parseMatchmakingLog(text: string): MmrSample[] {
	const parser = new MatchmakingParser();
	const out: MmrSample[] = [];
	for (const line of text.split(/\r?\n/)) {
		const s = parser.feed(line);
		if (s) out.push(s);
	}
	return out;
}

// ---- who the local player is ------------------------------------------------------------------------------------

/**
 * The game states its own account when it logs in:
 *   Party: HandleLocalPlayerLoginStatusChanged PlayerName=SomePlayer PlayerID=Epic|<32 hex characters>|0 LoginStatus=LS_LoggedIn IsPrimary=True
 * `PlayerID` is exactly what the Stats API sends as `PrimaryId`, so this identifies the local player unambiguously.
 * (Only this one line is read. The log also contains command-line lines with one-time login codes; those are never touched.)
 */
export interface LocalIdentity {
	name: string;
	/** Same format as the Stats API's PrimaryId, e.g. "Epic|f4ae…|0". */
	id: string;
}

const RE_LOCAL = /Party: HandleLocalPlayerLoginStatusChanged PlayerName=(.*?) PlayerID=(\S+) LoginStatus=LS_LoggedIn IsPrimary=True/;

export function parseLocalIdentity(line: string): LocalIdentity | undefined {
	const m = RE_LOCAL.exec(line);
	return m ? { name: m[1]!, id: m[2]! } : undefined;
}

/** The most recent identity in the current log, else in the newest backup. */
export function readLocalIdentity(dir: string): LocalIdentity | undefined {
	const files = fs
		.readdirSync(dir)
		.filter((f) => /^Launch(-backup-.*)?\.log$/i.test(f))
		.sort((a, b) => (a === "Launch.log" ? -1 : b === "Launch.log" ? 1 : b.localeCompare(a)));
	for (const f of files) {
		let found: LocalIdentity | undefined;
		try {
			for (const line of fs.readFileSync(path.join(dir, f), "utf8").split(/\r?\n/)) found = parseLocalIdentity(line) ?? found;
		} catch {
			continue;
		}
		if (found) return found;
	}
	return undefined;
}

// ---- the game server of the running match ------------------------------------------------------------------------------

/**
 * The game logs the dedicated server it joins and leaves:
 *   Log: LoadMap: 51.21.130.45:9066
 *   NetComeGo: Close TcpipConnection_1 51.21.130.45:9066
 * The plugin measures the round trip to that address (see sys/ping.ts).
 */
export interface ServerEvent {
	event: "join" | "leave";
	ip: string;
	port: number;
}

const RE_JOIN = /Log: LoadMap: (\d{1,3}(?:\.\d{1,3}){3}):(\d+)/;
const RE_LEAVE = /NetComeGo: Close TcpipConnection_\d+ (\d{1,3}(?:\.\d{1,3}){3}):(\d+)/;

export function parseServerLine(line: string): ServerEvent | undefined {
	let m = RE_JOIN.exec(line);
	if (m) return { event: "join", ip: m[1]!, port: Number(m[2]) };
	m = RE_LEAVE.exec(line);
	return m ? { event: "leave", ip: m[1]!, port: Number(m[2]) } : undefined;
}

/** The server the current log says the game is on right now (joined, and not left again), if any. */
export function readCurrentServer(dir: string): string | undefined {
	let ip: string | undefined;
	try {
		for (const line of fs.readFileSync(path.join(dir, "Launch.log"), "utf8").split(/\r?\n/)) {
			const e = parseServerLine(line);
			if (!e) continue;
			if (e.event === "join") ip = e.ip;
			else if (e.ip === ip) ip = undefined;
		}
	} catch {
		return undefined;
	}
	return ip;
}

// ---- locating and following the log ----------------------------------------------------------------------------

/** `Documents` can be redirected (OneDrive), so ask Windows before guessing. */
function documentsDirs(): string[] {
	const dirs: string[] = [];
	try {
		const raw = execFileSync("reg", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", "Personal"], { encoding: "utf8", windowsHide: true });
		const m = /Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/i.exec(raw);
		if (m) dirs.push(m[1]!.trim().replace(/%([^%]+)%/g, (_x, k: string) => process.env[k] ?? ""));
	} catch {
		/* fall through to the guesses */
	}
	dirs.push(path.join(os.homedir(), "Documents"), path.join(os.homedir(), "OneDrive", "Documents"));
	return dirs;
}

export function findLogDir(override?: string): string | undefined {
	const candidates = [override, ...documentsDirs().map((d) => path.join(d, "My Games", "Rocket League", "TAGame", "Logs"))];
	return candidates.find((d): d is string => !!d && fs.existsSync(path.join(d, "Launch.log")) || (!!d && fs.existsSync(d)));
}

/** Samples in the game's backup logs plus the current one, oldest first — used to know the last MMR right at start-up. */
export function readExistingSamples(dir: string): MmrSample[] {
	const files = fs
		.readdirSync(dir)
		.filter((f) => /^Launch(-backup-.*)?\.log$/i.test(f))
		.sort((a, b) => (a === "Launch.log" ? 1 : b === "Launch.log" ? -1 : a.localeCompare(b)));
	const out: MmrSample[] = [];
	for (const f of files) {
		try {
			out.push(...parseMatchmakingLog(fs.readFileSync(path.join(dir, f), "utf8")));
		} catch {
			/* locked or unreadable: skip */
		}
	}
	return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Follows Launch.log while the game runs (it is rotated to a backup when the game restarts). */
export class RlLogWatcher {
	private timer?: NodeJS.Timeout;
	private offset = 0;
	private partial = "";
	private readonly parser = new MatchmakingParser();

	constructor(
		private readonly dir: string,
		private readonly onSample: (s: MmrSample) => void,
		private readonly pollMs = 2000,
		private readonly onIdentity?: (i: LocalIdentity) => void,
		private readonly onServer?: (e: ServerEvent) => void,
	) {}

	start(): void {
		const file = path.join(this.dir, "Launch.log");
		try {
			this.offset = fs.statSync(file).size; // everything before now is handled by readExistingSamples
		} catch {
			this.offset = 0;
		}
		this.timer = setInterval(() => this.poll(), this.pollMs);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
	}

	/** Public for tests. */
	poll(): void {
		const file = path.join(this.dir, "Launch.log");
		let size: number;
		try {
			size = fs.statSync(file).size;
		} catch {
			return; // the game has not (re)created it yet
		}
		if (size < this.offset) {
			this.offset = 0; // rotated: a fresh log started
			this.partial = "";
		}
		if (size === this.offset) return;
		let fd: number | undefined;
		try {
			fd = fs.openSync(file, "r");
			const buf = Buffer.alloc(size - this.offset);
			fs.readSync(fd, buf, 0, buf.length, this.offset);
			this.offset = size;
			const chunk = this.partial + buf.toString("utf8");
			const lines = chunk.split(/\r?\n/);
			this.partial = lines.pop() ?? "";
			for (const line of lines) {
				const s = this.parser.feed(line);
				if (s) this.onSample(s);
				const id = this.onIdentity ? parseLocalIdentity(line) : undefined;
				if (id) this.onIdentity!(id);
				const sv = this.onServer ? parseServerLine(line) : undefined;
				if (sv) this.onServer!(sv);
			}
		} catch {
			/* the game holds the file open for writing; a failed read is retried on the next poll */
		} finally {
			if (fd !== undefined) fs.closeSync(fd);
		}
	}
}
