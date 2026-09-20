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
	| "points";

export const ROLES: Role[] = ["rank", "mmr", "mode", "blue", "orange", "timer", "lastgoal", "banner", "speed", "boost", "carspeed", "possession", "points"];

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
}

export interface RenderOpts {
	/** Which third of the banner this key shows (0 = left … 2 = right). */
	slice?: number;
}
