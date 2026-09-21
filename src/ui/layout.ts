import type { Role } from "./context";

export const PLUGIN_UUID = "mov.remake.rlhud";
export const PROFILE_NAME = "profiles/RL";
/** Profile for the Stream Deck + (8 keys, 4 dials, touch strip). */
export const PROFILE_PLUS_NAME = "profiles/RL-Plus";
/** `DeviceType.StreamDeckPlus` in the Stream Deck SDK. */
export const DEVICE_TYPE_PLUS = 7;

/** The dial / touch-strip action: each of the four dials owns a 200×100 segment of the strip. */
export const STRIP_ACTION = `${PLUGIN_UUID}.strip`;
export const STRIP_LAYOUT_FILE = "layouts/strip.json";

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
 * Default layout of the Stream Deck + profile: 8 keys, and the touch strip (one action per dial) for everything else.
 *
 *   BLUE(you)  TIMER     ORANGE    BOOST
 *   CAR SPEED  POSSESSION POINTS   BALL SPEED
 *   ╔═══ touch strip: rank | MMR | last goal | my stats — and the event banner across all four ═══╗
 */
export const LAYOUT_PLUS: Cell[] = [
	{ col: 0, row: 0, role: "blue" },
	{ col: 1, row: 0, role: "timer" },
	{ col: 2, row: 0, role: "orange" },
	{ col: 3, row: 0, role: "boost" },

	{ col: 0, row: 1, role: "carspeed" },
	{ col: 1, row: 1, role: "possession" },
	{ col: 2, row: 1, role: "points" },
	{ col: 3, row: 1, role: "speed" },
];
export const PLUS_DIALS = 4;

/**
 * Stream Mini (3×2, 6 keys): the score row, and the event banner underneath (at rest it shows your goals / assists / saves).
 *
 *   BLUE(you)  TIMER   ORANGE
 *   ╔══════ EVENT BANNER ═════╗
 */
export const LAYOUT_MINI: Cell[] = [
	{ col: 0, row: 0, role: "blue" },
	{ col: 1, row: 0, role: "timer" },
	{ col: 2, row: 0, role: "orange" },
	{ col: 0, row: 1, role: "banner" },
	{ col: 1, row: 1, role: "banner" },
	{ col: 2, row: 1, role: "banner" },
];

/**
 * Stream Deck XL (8×4, 32 keys): the 5×3 layout with room around it. The two lower rows stay free for the user's own keys.
 *
 *   RANK   MODE       BLUE      TIMER     ORANGE     MMR         LAST GOAL  BALL SPEED
 *   BOOST  CAR SPEED  ╔═══════ EVENT BANNER ═══╗     POSSESSION  POINTS  PING
 */
export const LAYOUT_XL: Cell[] = [
	{ col: 0, row: 0, role: "rank" },
	{ col: 1, row: 0, role: "mode" },
	{ col: 2, row: 0, role: "blue" },
	{ col: 3, row: 0, role: "timer" },
	{ col: 4, row: 0, role: "orange" },
	{ col: 5, row: 0, role: "mmr" },
	{ col: 6, row: 0, role: "lastgoal" },
	{ col: 7, row: 0, role: "speed" },

	{ col: 0, row: 1, role: "boost" },
	{ col: 1, row: 1, role: "carspeed" },
	{ col: 2, row: 1, role: "banner" },
	{ col: 3, row: 1, role: "banner" },
	{ col: 4, row: 1, role: "banner" },
	{ col: 5, row: 1, role: "possession" },
	{ col: 6, row: 1, role: "points" },
	{ col: 7, row: 1, role: "ping" },
];

/**
 * Stream Deck Neo (4×2, 8 keys):
 *
 *   RANK   BLUE(you)  TIMER   ORANGE
 *   ╔═ EVENT BANNER ═╗        BOOST
 */
export const LAYOUT_NEO: Cell[] = [
	{ col: 0, row: 0, role: "rank" },
	{ col: 1, row: 0, role: "blue" },
	{ col: 2, row: 0, role: "timer" },
	{ col: 3, row: 0, role: "orange" },
	{ col: 0, row: 1, role: "banner" },
	{ col: 1, row: 1, role: "banner" },
	{ col: 2, row: 1, role: "banner" },
	{ col: 3, row: 1, role: "boost" },
];

/** `DeviceType` values of the Stream Deck SDK. */
export const DeviceTypes = { StreamDeck: 0, Mini: 1, XL: 2, Mobile: 3, Plus: 7, Neo: 9 } as const;

/**
 * One bundled profile per kind of device. Each is declared in the manifest for its device types, so installing the plugin
 * creates a separate "Rocket League HUD" profile on every connected deck of that kind (without switching to it).
 */
export interface DeviceProfile {
	/** Name in the manifest, e.g. `profiles/RL-Mini`, and the file `<name>.streamDeckProfile`. */
	name: string;
	deviceTypes: number[];
	/** Model number written into the profile; the real device replaces it on install. */
	model: string;
	columns: number;
	rows: number;
	keys: Cell[];
	/** Number of dials, each with the touch-strip action (0 for decks without a touch strip). */
	dials: number;
	/** Seed of the deterministic profile ids. */
	seed: string;
}

export const PROFILES: DeviceProfile[] = [
	// The 5×3 grid (Stream Deck / MK.2 / the mobile app). Its ids are the ones released before.
	{ name: PROFILE_NAME, deviceTypes: [DeviceTypes.StreamDeck, DeviceTypes.Mobile], model: "VSD/WiFi", columns: 5, rows: 3, keys: LAYOUT, dials: 0, seed: "RL" },
	{ name: "profiles/RL-Mini", deviceTypes: [DeviceTypes.Mini], model: "VSD/WiFi", columns: 3, rows: 2, keys: LAYOUT_MINI, dials: 0, seed: "RL-Mini" },
	{ name: "profiles/RL-XL", deviceTypes: [DeviceTypes.XL], model: "20GAT9901", columns: 8, rows: 4, keys: LAYOUT_XL, dials: 0, seed: "RL-XL" },
	{ name: "profiles/RL-Neo", deviceTypes: [DeviceTypes.Neo], model: "VSD/WiFi", columns: 4, rows: 2, keys: LAYOUT_NEO, dials: 0, seed: "RL-Neo" },
	{ name: PROFILE_PLUS_NAME, deviceTypes: [DeviceTypes.Plus], model: "20GBD9901", columns: 4, rows: 2, keys: LAYOUT_PLUS, dials: PLUS_DIALS, seed: "RL-Plus" },
];

/** The bundled profile to switch a deck to when the game starts; unknown kinds of deck with a 5×3 grid get the 5×3 profile. */
export function profileNameFor(deviceType: number, columns: number, rows: number): string | undefined {
	const byType = PROFILES.find((p) => p.deviceTypes.includes(deviceType));
	if (byType) return byType.name;
	return columns === 5 && rows === 3 ? PROFILE_NAME : undefined;
}

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
