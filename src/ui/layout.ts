import type { Role } from "./context";

export const PLUGIN_UUID = "mov.remake.rlhud";
export const PROFILE_NAME = "profiles/RL";

export const actionUuid = (role: Role): string => `${PLUGIN_UUID}.${role}`;

export interface Cell {
	col: number;
	row: number;
	role: Role;
	settings?: Record<string, number | string>;
}

/**
 * Default 5×3 layout of the bundled profile (Stream Deck / MK.2):
 *
 *   RANK     MODE       BLUE      TIMER     ORANGE
 *   MMR      LAST GOAL  ╔═══════ EVENT BANNER ═══╗
 *   BOOST    CAR SPEED  POSSESSION  POINTS  BALL SPEED
 */
export const LAYOUT: Cell[] = [
	{ col: 0, row: 0, role: "rank" },
	{ col: 1, row: 0, role: "mode" },
	{ col: 2, row: 0, role: "blue" },
	{ col: 3, row: 0, role: "timer" },
	{ col: 4, row: 0, role: "orange" },

	{ col: 0, row: 1, role: "mmr" },
	{ col: 1, row: 1, role: "lastgoal" },
	{ col: 2, row: 1, role: "banner", settings: { slice: 0 } },
	{ col: 3, row: 1, role: "banner", settings: { slice: 1 } },
	{ col: 4, row: 1, role: "banner", settings: { slice: 2 } },

	{ col: 0, row: 2, role: "boost" },
	{ col: 1, row: 2, role: "carspeed" },
	{ col: 2, row: 2, role: "possession" },
	{ col: 3, row: 2, role: "points" },
	{ col: 4, row: 2, role: "speed" },
];

/**
 * The first releases had four menu-shortcut keys with these ids. They are gone, but a deck that already has them in its
 * profile must not break: the old ids stay registered (hidden from the actions list) and simply draw the new keys.
 */
export const LEGACY_ACTIONS: Record<string, Role> = {
	find: "boost",
	garage: "carspeed",
	ranked: "possession",
	freeplay: "points",
};
export const legacyUuid = (id: string): string => `${PLUGIN_UUID}.${id}`;
