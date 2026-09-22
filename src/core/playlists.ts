import type { RankGroup } from "./types";

export interface PlaylistInfo {
	/** Display name (English — game modes keep their names in the Polish client too). */
	name: string;
	ranked: boolean;
	group?: RankGroup;
	/** Players per team when the id alone determines it. */
	size?: number;
	/** True when the info was inferred and not taken from the id table. */
	inferred?: boolean;
	/** False when the mode has no fixed match length, so `TimeSeconds` is elapsed session time, not a countdown to zero (e.g. Free Play, which the game also reports training/local sessions under). Everything else counts down, so this defaults to true. */
	timed?: boolean;
}

/**
 * Playlist ids we are confident about. Every other id is described from what the match itself tells
 * us (team size, arena) and reported as "Playlist #n" so it can be added here after a real capture
 * (`npm run record` writes every message the game sends to a file).
 */
const KNOWN: Record<number, PlaylistInfo> = {
	1: { name: "Duel", ranked: false, group: "duel", size: 1 },
	2: { name: "Doubles", ranked: false, group: "doubles", size: 2 },
	3: { name: "Standard", ranked: false, group: "standard", size: 3 },
	4: { name: "Chaos", ranked: false, size: 4 },
	6: { name: "Private", ranked: false },
	// Seen in a live capture with a single player on TrainStation_Dawn_P (training / local match): TimeSeconds climbed
	// from 4 to 175 over the session instead of counting down, so this is elapsed time, not a countdown.
	9: { name: "Free Play", ranked: false, timed: false },
	10: { name: "Duel", ranked: true, group: "duel", size: 1 },
	11: { name: "Doubles", ranked: true, group: "doubles", size: 2 },
	12: { name: "Solo Standard", ranked: true, group: "solo", size: 3 },
	13: { name: "Standard", ranked: true, group: "standard", size: 3 },
	// Ranked extra modes. 30 is verified: the game log queued playlist 30 with MMR 404, the player's tracker showed "Snowday 404"
	// (and 447 after the win). 27-29 come from community lists and have not been seen in a capture yet.
	27: { name: "Hoops", ranked: true, group: "hoops" },
	28: { name: "Rumble", ranked: true, group: "rumble" },
	29: { name: "Dropshot", ranked: true, group: "dropshot" },
	30: { name: "Snow Day", ranked: true, group: "snowday" },
};

const SIZE_TO_GROUP: Record<number, { name: string; group: RankGroup }> = {
	1: { name: "Duel", group: "duel" },
	2: { name: "Doubles", group: "doubles" },
	3: { name: "Standard", group: "standard" },
};

export function describePlaylist(id: number | undefined, arena: string | undefined, teamSize: number): PlaylistInfo {
	const a = (arena ?? "").toLowerCase();
	if (a.includes("hoops")) return { name: "Hoops", ranked: id !== undefined && id >= 27, group: "hoops", inferred: true };
	if (a.includes("shatter")) return { name: "Dropshot", ranked: id !== undefined && id >= 27, group: "dropshot", inferred: true };

	if (id !== undefined && KNOWN[id]) return KNOWN[id]!;

	const bySize = SIZE_TO_GROUP[teamSize];
	if (bySize) return { name: bySize.name, ranked: false, group: bySize.group, size: teamSize, inferred: true };
	return { name: id !== undefined ? `Playlist #${id}` : "Match", ranked: false, inferred: true };
}
