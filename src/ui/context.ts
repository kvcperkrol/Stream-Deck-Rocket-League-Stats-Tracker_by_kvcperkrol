import type { MatchStore } from "../core/match-store";
import type { GlobalSettings } from "../core/types";

/** MMR read from the game's own log, per playlist id (see sys/rl-log.ts). */
export interface AutoMmr {
	mmr: number;
	/** UTC time of the queue it was read at (ISO 8601). */
	at: string;
	/** Change since the previous, different value for the same playlist. */
	delta?: number;
}

/** Every key role the plugin can draw. Each maps 1:1 to an action in the manifest. */
export type Role =
	| "rank"
	| "mmr"
	| "mode"
	| "blue"
	| "orange"
	| "timer"
	| "lastgoal"
	| "banner"
	| "speed"
	| "boost"
	| "carspeed"
	| "possession"
	| "points"
	| "clock"
	| "analog"
	| "ping";

export const ROLES: Role[] = ["rank", "mmr", "mode", "blue", "orange", "timer", "lastgoal", "banner", "speed", "boost", "carspeed", "possession", "points", "clock", "analog", "ping"];

export interface RenderCtx {
	store: MatchStore;
	settings: GlobalSettings;
	now: number;
	/** The game runs but the Stats API is silent — most likely it was started before the ini was patched. */
	restartHint: boolean;
	/** MMR taken from the game log; wins over the value typed into the property inspector. */
	autoMmr?: Record<number, AutoMmr>;
	/** Playlist of the most recent queue — what the MMR key shows while no match is running. */
	lastQueuedPlaylist?: number;
	/** A rank icon (`data:` URI) the user supplied for a tier; without one the built-in emblem is drawn. */
	rankIcon?: (tierId: number) => string | undefined;
	/** Live ping to the game server of the running match (see sys/ping.ts). */
	ping?: { target?: string; ms?: number | null; history: (number | null)[] };
	/** True when the user pinned a panel to some dial of the touch strip: the strip then never turns into one wide scene while idle. */
	stripCustom?: boolean;
}

/** Which of the three views the MMR key shows, and the one it is animating away from (a press cycles them). */
export interface MmrView {
	/** MMR key: 0 = MMR with the record underneath, 1 = the record big with MMR underneath, 2 = the current streak. Clock key: 0 = stacked, 1 = one line. */
	index: number;
	from: number;
	/** When the last press happened (ms), for the swap animation. */
	at: number;
}

export interface RenderOpts {
	/** Which third of the banner this key shows (0 = left … 2 = right). */
	slice?: number;
	/** MMR key only. */
	view?: MmrView;
}
