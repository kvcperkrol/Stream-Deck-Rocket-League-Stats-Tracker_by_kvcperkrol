/** Envelope used by every message of the Rocket League Stats API. */
export interface RLMessage {
	Event: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	Data: any;
}

export type TeamNum = 0 | 1;
export type Lang = "pl" | "en";
export type Units = "kmh" | "mph" | "uu";

export type RankGroup = "duel" | "doubles" | "solo" | "standard" | "hoops" | "rumble" | "dropshot" | "snowday";

export type RankEntry = {
	/** Index into the tier table (0 = unranked … 22 = Supersonic Legend). */
	tier: number;
	/** Division inside the tier, 1–4. */
	div: number;
	/** Current MMR; null when the user did not enter one. */
	mmr: number | null;
};

/** Persisted through Stream Deck "global settings" and edited in the property inspector. */
export type GlobalSettings = {
	lang: Lang;
	units: Units;
	/** Display name in the match. Empty = detect automatically. */
	playerName: string;
	/** Switch to the bundled profile when the game starts and back when it quits. */
	autoSwitch: boolean;
	/** UpdateState packets per second requested from the game (written to the ini). */
	packetRate: number;
	/** Optional manual install folder (auto-detected from Epic/Steam when empty). */
	installDir: string;
	/** Optional manual folder for Launch.log (auto-detected when empty; needed on e.g. Proton, where the registry lookup and the usual Documents guesses do not apply). */
	logFolder: string;
	/** Which team goes on the left score key: my own (as the game's HUD does) or always the blue one. */
	scoreOrder: "me-left" | "blue-left";
	/** Keep a small, anonymised log of the Stats API for diagnostics (local file only). */
	recordMatches: boolean;
	/** Shifts the kickoff countdown digits: + shows each number later, − earlier (ms). For calibrating against the game on a given deck. */
	countdownOffsetMs: number;
	/** The clock key and strip panel: 12-hour time with AM/PM instead of 24-hour. */
	clock12h: boolean;
	ranks: Partial<Record<RankGroup, RankEntry>>;
};

export const DEFAULT_SETTINGS: GlobalSettings = {
	lang: "en",
	units: "kmh",
	playerName: "",
	autoSwitch: false,
	packetRate: 10,
	installDir: "",
	logFolder: "",
	scoreOrder: "me-left",
	recordMatches: false,
	countdownOffsetMs: 0,
	clock12h: false,
	ranks: {},
};

export function mergeSettings(raw: Partial<GlobalSettings> | undefined | null): GlobalSettings {
	const r = raw ?? {};
	// Settings written by older versions may carry extra keys (e.g. `macros`); only known ones are kept.
	return {
		lang: r.lang === "pl" || r.lang === "en" ? r.lang : DEFAULT_SETTINGS.lang,
		units: r.units === "mph" || r.units === "uu" ? r.units : DEFAULT_SETTINGS.units,
		playerName: typeof r.playerName === "string" ? r.playerName : DEFAULT_SETTINGS.playerName,
		autoSwitch: r.autoSwitch === true,
		packetRate: typeof r.packetRate === "number" && r.packetRate > 0 ? r.packetRate : DEFAULT_SETTINGS.packetRate,
		installDir: typeof r.installDir === "string" ? r.installDir : DEFAULT_SETTINGS.installDir,
		logFolder: typeof r.logFolder === "string" ? r.logFolder : DEFAULT_SETTINGS.logFolder,
		scoreOrder: r.scoreOrder === "blue-left" ? "blue-left" : "me-left",
		recordMatches: r.recordMatches === true,
		clock12h: r.clock12h === true,
		countdownOffsetMs: typeof r.countdownOffsetMs === "number" && Number.isFinite(r.countdownOffsetMs) ? Math.max(-1500, Math.min(1500, Math.round(r.countdownOffsetMs))) : DEFAULT_SETTINGS.countdownOffsetMs,
		ranks: { ...(r.ranks ?? {}) },
	};
}
