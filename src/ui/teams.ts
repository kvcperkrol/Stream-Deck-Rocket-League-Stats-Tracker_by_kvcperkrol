import type { GameState } from "../core/match-store";
import type { TeamNum } from "../core/types";
import { COLORS } from "./svg";

export interface TeamLook {
	/** Gradient from `c1` (top-left) to `c2` (bottom-right). */
	c1: string;
	c2: string;
	/** Text colour that stays readable on the gradient (white, or dark ink on light colours such as grey). */
	ink: string;
	/** Flat accent colour: bars, dots. */
	accent: string;
}

const DEFAULTS: [TeamLook, TeamLook] = [
	{ c1: COLORS.blue1, c2: COLORS.blue2, ink: "#ffffff", accent: COLORS.blue1 },
	{ c1: COLORS.orange1, c2: COLORS.orange2, ink: "#ffffff", accent: COLORS.orange1 },
];

function rgb(hex: string): [number, number, number] {
	return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
const toHex = (c: [number, number, number]) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const luminance = (c: [number, number, number]) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/**
 * The colours of a team as the game itself shows them. Players can recolour teams (a black or grey opponent is common), and the
 * Stats API reports the result in `Teams[].ColorPrimary`. Offline modes report one neutral grey for both teams — that carries no
 * information, so it falls back to the classic blue/orange.
 */
export function teamLook(state: GameState, team: TeamNum): TeamLook {
	const a = state.teamColors[0]?.primary;
	const b = state.teamColors[1]?.primary;
	const own = state.teamColors[team]?.primary;
	if (!own || !a || !b || a.toLowerCase() === b.toLowerCase()) return DEFAULTS[team];
	const base = rgb(own);
	const dark: [number, number, number] = [base[0] * 0.5, base[1] * 0.5, base[2] * 0.5];
	const lum = luminance(base);
	return { c1: toHex(base), c2: toHex(dark), ink: lum > 0.62 ? COLORS.ink : "#ffffff", accent: readableOnDark(base, lum) };
}

/**
 * The accent is drawn on the near-black deck (bars, dots, percentages), so a very dark team colour has to be lifted to stay
 * visible. Real example: a club with colour 262626 (luminance 0.15) made the possession bar and its percentage vanish.
 * The key face itself keeps the exact colour from the game.
 */
function readableOnDark(base: [number, number, number], lum: number): string {
	const MIN_LUM = 0.3;
	if (lum >= MIN_LUM) return toHex(base);
	const mix = (0.42 - lum) / (1 - lum);
	return toHex(base.map((v) => v + (255 - v) * mix) as [number, number, number]);
}

/**
 * Which team goes on the left score key. The game's own HUD puts the local player's team on the left, so by default the deck does
 * the same (an orange player sees orange on the left); "blue-left" always puts the blue team there.
 */
export function sideTeams(state: GameState, order: "me-left" | "blue-left"): [TeamNum, TeamNum] {
	if (order === "me-left" && state.meTeam === 1) return [1, 0];
	return [0, 1];
}

/** The names the game itself gives the two teams when nobody renamed them (English and Polish client). */
const DEFAULT_TEAM_NAMES: [string[], string[]] = [["blue", "niebiescy"], ["orange", "pomarańczowi"]];

/**
 * The label of a team: a real custom name (a club) as the game sends it, else the plugin's own word for it — so the keys follow
 * the language chosen in the plugin, not the language the game happens to run in.
 */
export function teamLabel(state: GameState, team: TeamNum, fallback: string): string {
	const name = state.teamNames[team];
	const isDefault = !name || DEFAULT_TEAM_NAMES[team].includes(name.toLowerCase());
	return (isDefault ? fallback : name).toUpperCase();
}
