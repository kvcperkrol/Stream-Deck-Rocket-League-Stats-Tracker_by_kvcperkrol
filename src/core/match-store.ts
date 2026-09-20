import type { RLMessage, TeamNum } from "./types";

export type Phase = "offline" | "menu" | "countdown" | "live" | "replay" | "ended";

export type BannerKind =
	| "goal"
	| "demo"
	| "demoed"
	| "save"
	| "epic"
	| "shot"
	| "crossbar"
	| "overtime"
	| "replay"
	| "countdown"
	| "go"
	| "victory"
	| "defeat"
	| "win"
	| "paused"
	| "stat";

/** A transient message for the 3-key event banner. Text is composed at render time (language + units). */
export interface Banner {
	id: number;
	kind: BannerKind;
	born: number;
	/** Lifetime in ms; ignored while {@link sticky} is set. */
	ttl: number;
	prio: number;
	team?: TeamNum;
	who?: string;
	other?: string;
	assist?: string;
	/** Ball speed in km/h. */
	speedKmh?: number;
	/** Free label (e.g. the game's own name for a stat). */
	label?: string;
	/** Stays until removed with {@link MatchStore.clearSticky}. */
	sticky?: string;
}

export interface PlayerStat {
	name: string;
	team: TeamNum;
	score: number;
	goals: number;
	assists: number;
	saves: number;
	shots: number;
	demos: number;
	touches: number;
	/** The Stats API's PrimaryId ("Epic|…|0"), the unambiguous identity of a player. */
	id?: string;
	/** Live car data, present only for players the game reports it for (the local player). */
	boost?: number;
	speedKmh?: number;
	supersonic?: boolean;
	boosting?: boolean;
}

export interface LastGoal {
	scorer: string;
	team: TeamNum;
	speedKmh: number;
	assist?: string;
	at: number;
	goalTime: number;
}

export interface TeamColors {
	primary?: string;
	secondary?: string;
}

export interface Session {
	wins: number;
	losses: number;
	goals: number;
	saves: number;
	demos: number;
}

export interface GameState {
	gameRunning: boolean;
	connected: boolean;
	phase: Phase;
	guid?: string;
	playlistId?: number;
	arena?: string;
	time: number;
	overtime: boolean;
	paused: boolean;
	scores: [number, number];
	teamNames: [string, string];
	/** Team colours as the game reports them (hex without #). */
	teamColors: [TeamColors, TeamColors];
	ballSpeedKmh: number;
	maxBallSpeedKmh: number;
	replay: boolean;
	countdownAt?: number;
	players: PlayerStat[];
	meName?: string;
	meTeam?: TeamNum;
	lastTouch?: { name: string; team: TeamNum };
	/** Team that touched the ball last (undefined before the first touch of a round). */
	ballTeam?: TeamNum;
	/** Milliseconds each team has been the last to touch the ball, this match. */
	possessionMs: [number, number];
	/** Timestamp of the previous possession sample; undefined while counting is suspended. */
	possessionAt?: number;
	/** Set by a goal, cleared by the next kickoff: the ball is dead in between and nobody "holds" it. */
	possessionHold?: boolean;
	lastGoal?: LastGoal;
	winner?: TeamNum;
	session: Session;
	/** Timestamp of the last UpdateState packet (0 = none yet). */
	lastUpdateAt: number;
	/** Last playlist id seen — surfaced in diagnostics so unknown ids can be mapped. */
	lastPlaylistId?: number;
}

const FRESH_SESSION: Session = { wins: 0, losses: 0, goals: 0, saves: 0, demos: 0 };

function num(v: unknown, fallback = 0): number {
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function team(v: unknown): TeamNum {
	return v === 1 ? 1 : 0;
}

export class MatchStore {
	state: GameState = this.freshState();
	banners: Banner[] = [];

	private nextId = 1;
	private listeners = new Set<() => void>();
	private configuredName = "";
	/** Learned from the in-match camera; kept for the whole session (a new match must not forget who "me" is). */
	private learnedName = "";
	/** The account logged in to the game, taken from its log: the reliable answer to "which player am I". */
	private local?: { name: string; id: string };
	private endedGuidCounted: string | undefined;

	constructor(private readonly now: () => number = Date.now) {}

	// ---- subscriptions -------------------------------------------------------------------------

	onChange(fn: () => void): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit(): void {
		for (const fn of this.listeners) fn();
	}

	// ---- external inputs -------------------------------------------------------------------------

	setLocalIdentity(identity: { name: string; id: string } | undefined): void {
		this.local = identity;
		this.resolveMe();
		this.emit();
	}

	setPlayerName(name: string): void {
		this.configuredName = name.trim();
		this.resolveMe();
		this.emit();
	}

	setGameRunning(running: boolean): void {
		if (this.state.gameRunning === running) return;
		if (!running) {
			const session = this.state.session;
			this.state = this.freshState();
			this.state.session = { ...session };
			this.banners = [];
		} else {
			this.state.gameRunning = true;
			this.state.phase = this.state.connected ? "menu" : "menu";
		}
		this.emit();
	}

	setConnected(connected: boolean): void {
		if (this.state.connected === connected) return;
		this.state.connected = connected;
		if (connected) this.state.gameRunning = true;
		if (!connected) this.resetMatch();
		if (this.state.gameRunning && this.state.phase === "offline") this.state.phase = "menu";
		this.emit();
	}

	// ---- reading ---------------------------------------------------------------------------------

	/** Highest priority, newest banner that has not expired yet. */
	activeBanner(): Banner | undefined {
		const now = this.now();
		this.banners = this.banners.filter((b) => b.sticky !== undefined || now - b.born < b.ttl);
		let best: Banner | undefined;
		for (const b of this.banners) {
			if (!best || b.prio > best.prio || (b.prio === best.prio && b.born >= best.born)) best = b;
		}
		return best;
	}

	/** 0…1 flash intensity for a team's score key right after that team scored. */
	goalFlash(teamNum: TeamNum, windowMs = 1400): number {
		const g = this.state.lastGoal;
		if (!g || g.team !== teamNum) return 0;
		const age = this.now() - g.at;
		return age >= 0 && age < windowMs ? 1 - age / windowMs : 0;
	}

	isMe(name: string | undefined): boolean {
		return !!name && !!this.state.meName && name.toLowerCase() === this.state.meName.toLowerCase();
	}

	/** Largest team size, used to infer the playlist. */
	teamSize(): number {
		const c = [0, 0];
		for (const p of this.state.players) c[p.team]!++;
		return Math.max(c[0]!, c[1]!);
	}

	myStats(): PlayerStat | undefined {
		return this.state.players.find((p) => this.isMe(p.name));
	}

	clearSticky(key: string): void {
		const before = this.banners.length;
		this.banners = this.banners.filter((b) => b.sticky !== key);
		if (this.banners.length !== before) this.emit();
	}

	// ---- event handling --------------------------------------------------------------------------

	handle(msg: RLMessage): void {
		const d = msg.Data ?? {};
		if (typeof d.MatchGuid === "string" && d.MatchGuid) this.state.guid = d.MatchGuid;

		switch (msg.Event) {
			case "UpdateState":
				this.onUpdateState(d);
				break;
			case "MatchInitialized":
			case "MatchCreated":
				this.newMatch();
				break;
			case "CountdownBegin":
				this.state.phase = "countdown";
				this.state.countdownAt = this.now();
				this.state.replay = false;
				this.clearStickyQuiet("replay");
				this.push({ kind: "countdown", ttl: 3400, prio: 40 });
				break;
			case "RoundStarted":
				this.state.possessionHold = false;
				this.state.possessionAt = this.now();
				this.state.phase = "live";
				this.state.countdownAt = undefined;
				this.banners = this.banners.filter((b) => b.kind !== "countdown");
				this.push({ kind: "go", ttl: 900, prio: 45 });
				break;
			case "ClockUpdatedSeconds": {
				const ot = !!d.bOvertime;
				if (ot && !this.state.overtime) this.push({ kind: "overtime", ttl: 3200, prio: 90 });
				this.state.time = num(d.TimeSeconds, this.state.time);
				this.state.overtime = ot;
				break;
			}
			case "BallHit": {
				const p = Array.isArray(d.Players) ? d.Players[d.Players.length - 1] : undefined;
				if (p?.Name) this.state.lastTouch = { name: String(p.Name), team: team(p.TeamNum) };
				const post = num(d.Ball?.PostHitSpeed, NaN);
				if (Number.isFinite(post)) this.trackBall(post);
				break;
			}
			case "GoalScored":
				this.onGoal(d);
				break;
			case "StatfeedEvent":
				this.onStatfeed(d);
				break;
			case "CrossbarHit":
				if (this.state.replay) break;
				this.push({
					kind: "crossbar",
					ttl: 2200,
					prio: 60,
					who: d.BallLastTouch?.Player?.Name,
					team: d.BallLastTouch?.Player ? team(d.BallLastTouch.Player.TeamNum) : undefined,
					speedKmh: num(d.BallSpeed, 0),
				});
				break;
			case "GoalReplayStart":
				this.state.phase = "replay";
				this.state.replay = true;
				this.push({ kind: "replay", ttl: 60000, prio: 20, sticky: "replay" });
				break;
			case "GoalReplayEnd":
				this.state.replay = false;
				this.clearStickyQuiet("replay");
				if (this.state.phase === "replay") this.state.phase = "countdown";
				break;
			case "MatchPaused":
				this.state.paused = true;
				this.push({ kind: "paused", ttl: 600000, prio: 85, sticky: "paused" });
				break;
			case "MatchUnpaused":
				this.state.paused = false;
				this.clearStickyQuiet("paused");
				break;
			case "MatchEnded":
				this.onMatchEnded(d);
				break;
			case "PodiumStart":
				this.state.phase = "ended";
				break;
			case "MatchDestroyed":
				this.resetMatch();
				break;
			default:
				break; // PlayerJoined/Left, ReplayCreated, BoostPickup, GoalReplayWillEnd …
		}
		this.emit();
	}

	// ---- handlers --------------------------------------------------------------------------------

	private onUpdateState(d: any): void {
		const s = this.state;
		s.lastUpdateAt = this.now();
		if (s.phase === "menu" || s.phase === "offline") s.phase = "live";
		s.gameRunning = true;

		const g = d.Game ?? {};
		const inReplay = !!g.bReplay;
		s.replay = inReplay;
		// While a replay plays, the world (and possibly the score) is being re-simulated: never let it touch the live numbers.
		if (!inReplay) {
			if (Array.isArray(g.Teams)) {
				for (const t of g.Teams) {
					const n = team(t.TeamNum);
					s.scores[n] = num(t.Score, s.scores[n]);
					if (typeof t.Name === "string" && t.Name) s.teamNames[n] = t.Name;
					const hex = (v: unknown) => (typeof v === "string" && /^[0-9a-f]{6}$/i.test(v) ? v : undefined);
					s.teamColors[n] = { primary: hex(t.ColorPrimary), secondary: hex(t.ColorSecondary) };
				}
			}
			s.time = num(g.TimeSeconds, s.time);
			s.overtime = !!g.bOvertime;
			this.trackBall(num(g.Ball?.Speed, s.ballSpeedKmh), true);
			this.trackPossession(g.Ball?.TeamNum);
			if (g.bHasWinner && typeof g.Winner === "string") s.winner = g.Winner === s.teamNames[1] ? 1 : 0;
		}
		if (typeof g.PlaylistId === "number") {
			s.playlistId = g.PlaylistId;
			s.lastPlaylistId = g.PlaylistId;
		}
		if (typeof g.Arena === "string") s.arena = g.Arena;

		if (!inReplay && Array.isArray(d.Players)) {
			s.players = d.Players.map(
				(p: any): PlayerStat => ({
					name: String(p.Name ?? ""),
					team: team(p.TeamNum),
					score: num(p.Score),
					goals: num(p.Goals),
					assists: num(p.Assists),
					saves: num(p.Saves),
					shots: num(p.Shots),
					demos: num(p.Demos),
					touches: num(p.Touches),
					id: typeof p.PrimaryId === "string" ? p.PrimaryId : undefined,
					boost: typeof p.Boost === "number" ? p.Boost : undefined,
					speedKmh: typeof p.Speed === "number" ? p.Speed : undefined,
					supersonic: typeof p.bSupersonic === "boolean" ? p.bSupersonic : undefined,
					boosting: typeof p.bBoosting === "boolean" ? p.bBoosting : undefined,
				}),
			);
			// Who am I? Best: the account the game is logged in with (see setLocalIdentity). Only when that is unknown, fall back
			// to the camera target — which is unreliable (at the start of an online match it can show any car), so it is
			// used once, never overrides a known identity, and is dropped as soon as a real identity arrives.
			if (!this.configuredName && !this.local && !this.learnedName && !inReplay && s.phase === "live") {
				if (g.bHasTarget && g.Target?.Name) this.learnedName = String(g.Target.Name);
				else if (s.players.length === 1) this.learnedName = s.players[0]!.name;
			}
			this.resolveMe();
		}
	}

	private onGoal(d: any): void {
		const s = this.state;
		if (s.replay) return; // a goal seen again inside a replay is not a new goal
		const scorer = d.Scorer ?? {};
		const teamNum = team(scorer.TeamNum);
		const speedKmh = num(d.GoalSpeed, 0);
		const assist = d.Assister?.Name ? String(d.Assister.Name) : undefined;
		const at = this.now();
		const name = String(scorer.Name ?? "?");

		// The same goal announced twice (same scorer, speed and round time within a short window) is counted once.
		const prev = s.lastGoal;
		if (prev && prev.scorer === name && prev.speedKmh === speedKmh && prev.goalTime === num(d.GoalTime) && at - prev.at < 30_000) return;

		s.lastGoal = { scorer: name, team: teamNum, speedKmh, assist, at, goalTime: num(d.GoalTime) };
		// The next UpdateState carries the authoritative score; only bridge the gap if that stream is not running.
		if (s.lastUpdateAt === 0 || this.now() - s.lastUpdateAt > 1500) s.scores[teamNum] += 1;
		this.trackBall(speedKmh);
		s.possessionHold = true;
		s.possessionAt = undefined;
		if (this.isMe(scorer.Name)) s.session.goals += 1;

		this.push({ kind: "goal", ttl: 4600, prio: 100, team: teamNum, who: name, assist, speedKmh });
	}

	private onStatfeed(d: any): void {
		if (this.state.replay) return; // replayed events are not new events
		const name = String(d.EventName ?? "");
		const main = d.MainTarget?.Name as string | undefined;
		const sec = d.SecondaryTarget?.Name as string | undefined;
		const mainTeam = d.MainTarget ? team(d.MainTarget.TeamNum) : undefined;

		switch (name) {
			case "Demolish": {
				const victimIsMe = this.isMe(sec);
				if (this.isMe(main)) this.state.session.demos += 1;
				this.push({ kind: victimIsMe ? "demoed" : "demo", ttl: 2400, prio: 70, who: main, other: sec, team: mainTeam });
				break;
			}
			case "Save":
			case "EpicSave":
				if (this.isMe(main)) this.state.session.saves += 1;
				this.push({ kind: name === "EpicSave" ? "epic" : "save", ttl: 2200, prio: name === "EpicSave" ? 68 : 65, who: main, team: mainTeam });
				break;
			case "Shot":
				if (this.isMe(main)) this.push({ kind: "shot", ttl: 1300, prio: 30, who: main, team: mainTeam });
				break;
			case "Goal":
			case "OwnGoal":
			case "Assist":
				break; // covered by GoalScored
			default:
				if (this.isMe(main) && typeof d.Type === "string") {
					this.push({ kind: "stat", ttl: 1500, prio: 25, who: main, label: d.Type, team: mainTeam });
				}
		}
	}

	private onMatchEnded(d: any): void {
		const s = this.state;
		const winner = team(d.WinnerTeamNum);
		s.winner = winner;
		s.phase = "ended";
		s.replay = false;
		this.clearStickyQuiet("replay");

		const key = s.guid ?? `${this.now()}`;
		if (this.endedGuidCounted !== key && s.meTeam !== undefined) {
			this.endedGuidCounted = key;
			if (winner === s.meTeam) s.session.wins += 1;
			else s.session.losses += 1;
		}
		const kind: BannerKind = s.meTeam === undefined ? "win" : winner === s.meTeam ? "victory" : "defeat";
		this.push({ kind, ttl: 20000, prio: 120, team: winner });
	}

	// ---- helpers ---------------------------------------------------------------------------------

	private trackBall(uuPerSec: number, fromUpdate = false): void {
		this.state.ballSpeedKmh = uuPerSec;
		if (!fromUpdate || !this.state.replay) this.state.maxBallSpeedKmh = Math.max(this.state.maxBallSpeedKmh, uuPerSec);
	}

	/** Adds the time since the previous sample to the team that touched the ball last. */
	private trackPossession(ballTeam: unknown): void {
		const s = this.state;
		const now = this.now();
		s.ballTeam = ballTeam === 0 || ballTeam === 1 ? ballTeam : undefined;
		const running = s.phase === "live" && !s.paused && !s.possessionHold;
		const counting = running && s.possessionAt !== undefined && s.ballTeam !== undefined;
		if (counting) s.possessionMs[s.ballTeam!] += Math.min(500, Math.max(0, now - s.possessionAt!));
		// Restart the clock only while play is live; goals and replays keep it stopped until the next kickoff.
		s.possessionAt = running ? now : undefined;
	}

	/** Share of the match each team has held the ball, in percent; undefined until there is enough data. */
	possessionPct(): [number, number] | undefined {
		const [a, b] = this.state.possessionMs;
		const total = a + b;
		if (total < 3000) return undefined;
		const blue = Math.round((a / total) * 100);
		return [blue, 100 - blue];
	}

	private resolveMe(): void {
		const s = this.state;
		const byName = (n: string) => s.players.find((x) => x.name.toLowerCase() === n.toLowerCase());
		let p: PlayerStat | undefined;
		if (this.configuredName) p = byName(this.configuredName);
		else if (this.local) p = s.players.find((x) => x.id && x.id.toLowerCase() === this.local!.id.toLowerCase()) ?? byName(this.local.name);
		else if (this.learnedName) p = byName(this.learnedName);
		if (p) {
			s.meName = p.name;
			s.meTeam = p.team;
		} else {
			// No roster yet (or we are not in it): keep the name so goal/stat events can still be attributed.
			s.meName = this.configuredName || this.local?.name || this.learnedName || undefined;
			s.meTeam = undefined;
		}
	}

	private push(b: Omit<Banner, "id" | "born">): void {
		const banner: Banner = { ...b, id: this.nextId++, born: this.now() };
		if (banner.sticky) this.banners = this.banners.filter((x) => x.sticky !== banner.sticky);
		this.banners.push(banner);
	}

	private clearStickyQuiet(key: string): void {
		this.banners = this.banners.filter((b) => b.sticky !== key);
	}

	private newMatch(): void {
		const keepGuid = this.state.guid;
		this.resetMatch();
		this.state.guid = keepGuid;
		this.state.phase = "countdown";
	}

	private resetMatch(): void {
		const { session, gameRunning, connected, lastPlaylistId, lastGoal } = this.state;
		const fresh = this.freshState();
		fresh.session = session;
		fresh.lastGoal = lastGoal; // "last goal" stays on the deck between matches
		fresh.gameRunning = gameRunning;
		fresh.connected = connected;
		fresh.lastPlaylistId = lastPlaylistId;
		fresh.phase = gameRunning ? "menu" : "offline";
		this.state = fresh;
		this.banners = this.banners.filter((b) => b.kind === "victory" || b.kind === "defeat" || b.kind === "win");
	}

	private freshState(): GameState {
		return {
			gameRunning: false,
			connected: false,
			phase: "offline",
			time: 300,
			overtime: false,
			paused: false,
			scores: [0, 0],
			teamNames: ["Blue", "Orange"],
			teamColors: [{}, {}],
			ballSpeedKmh: 0,
			maxBallSpeedKmh: 0,
			possessionMs: [0, 0],
			replay: false,
			players: [],
			session: { ...FRESH_SESSION },
			lastUpdateAt: 0,
		};
	}
}
