import { t } from "../core/i18n";
import { describePlaylist } from "../core/playlists";
import { rankFor, tierInfo } from "../core/ranks";
import type { TeamNum } from "../core/types";
import { convertSpeed, formatClock } from "../core/units";
import { emblem, iconBadge, teamDots } from "./art";
import { renderBannerSlice } from "./banner";
import { sideTeams, teamLabel, teamLook } from "./teams";
import { boostKey, carSpeedKey, possessionKey, pointsKey } from "./live-keys";
import type { MmrView, RenderCtx, RenderOpts, Role } from "./context";
import { analogKey, clockKey, pingKey } from "./extra-keys";
import { COLORS, doc, linear, panel, stripes, text } from "./svg";

const frame = (color: string) => `<rect x="1" y="1" width="70" height="70" fill="none" stroke="${color}" stroke-width="1.6" stroke-opacity="0.55"/>`;

/** Dims a whole key while the game is not running so a stale HUD never looks live. */
const veil = (ctx: RenderCtx) => (ctx.store.state.gameRunning ? "" : `<rect width="72" height="72" fill="#05070f" fill-opacity="0.5"/>`);

function currentPlaylist(ctx: RenderCtx) {
	const s = ctx.store.state;
	return describePlaylist(s.playlistId, s.arena, ctx.store.teamSize());
}

/**
 * The playlist the rank and MMR keys talk about: the match being played, else (in the menu) the one queued last. Only ranked
 * playlists have a rank — casual, free play and private matches must never borrow the rank of a same-sized ranked mode.
 */
export function rankedContext(ctx: RenderCtx) {
	const s = ctx.store.state;
	const id = s.playlistId ?? ctx.lastQueuedPlaylist ?? s.lastPlaylistId;
	const pl = s.playlistId !== undefined ? currentPlaylist(ctx) : describePlaylist(id, undefined, 0);
	return { id, pl };
}

// ---- rank + MMR ------------------------------------------------------------------------------------

function rankKey(ctx: RenderCtx): string {
	const { pl } = rankedContext(ctx);
	const lang = ctx.settings.lang;
	if (!pl.ranked) {
		// Casual, free play, private: there is no rank to show, and the key says so instead of showing a ranked one.
		const none = tierInfo(0);
		return doc(
			panel(ctx.settings.keyTheme) +
				(ctx.rankIcon?.(0) ? iconBadge(ctx.rankIcon(0)!, 36, 25) : emblem(none, 36, 25, 0.95, "—")) +
				text(t(lang, "unranked"), { y: 54, size: 11.5, fill: none.color, skew: -6, maxWidth: 56 }) +
				text(pl.name.toUpperCase(), { y: 66, size: 8.5, fill: COLORS.dim, maxWidth: 56 }) +
				veil(ctx),
		);
	}
	const entry = rankFor(ctx.settings.ranks, pl.group);
	const tier = tierInfo(entry.tier);
	const div = tier.rank >= 1 && tier.rank <= 7 ? `${t(lang, "div")} ${entry.div}` : "";
	return doc(
		panel(ctx.settings.keyTheme) +
			(ctx.rankIcon?.(tier.id) ? iconBadge(ctx.rankIcon(tier.id)!, 36, 25) : emblem(tier, 36, 25, 0.95)) +
			text(tier.rank === 0 ? t(lang, "setRank") : tier.family, { y: 54, size: tier.rank === 0 ? 10 : 11.5, fill: tier.color, skew: -6, maxWidth: 56 }) +
			text(tier.roman && tier.rank !== 8 ? `${tier.roman}${div ? "  ·  " + div : ""}` : div || pl.name.toUpperCase(), { y: 66, size: 8.5, fill: COLORS.dim, maxWidth: 56 }) +
			veil(ctx),
	);
}

/**
 * The MMR the MMR key (and the touch strip) shows. In a match: that playlist. In the menu: the playlist queued last. The game
 * log is the source; a value typed for a ranked playlist is the fallback (it never applies to casual play, which has its own
 * hidden MMR).
 */
export function mmrInfo(ctx: RenderCtx) {
	const { id, pl } = rankedContext(ctx);
	const auto = id !== undefined ? ctx.autoMmr?.[id] : undefined;
	const typed = pl.ranked ? rankFor(ctx.settings.ranks, pl.group).mmr : null;
	const value = auto?.mmr ?? typed;
	return { pl, value: value ?? undefined, delta: auto?.delta };
}

// ---- the MMR key and its three views ---------------------------------------------------------------------------------------

const VIEW_MS = 380;
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

interface Style {
	x: number;
	y: number;
	size: number;
	/** 0 = hidden, 1 = fully visible */
	op: number;
}
const st = (x: number, y: number, size: number, op: number): Style => ({ x, y, size, op });
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
/**
 * A piece that stays visible only moves and resizes. One that appears or disappears fades in two steps — the old one out during
 * the first half of the swap, the new one in during the second — so two labels never overprint each other.
 */
const fade = (a: number, b: number, k: number) => (a === b ? a : b < a ? a * Math.max(0, 1 - 2 * k) : b * Math.max(0, 2 * k - 1));
const mix = (a: Style, b: Style, k: number): Style => st(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.size, b.size, k), fade(a.op, b.op, k));

/**
 * Where each piece sits in each view: 0 = MMR big with the record underneath, 1 = record big with MMR underneath,
 * 2 = the current streak big with MMR underneath. A press moves every piece from its place in the old view to its place in the
 * new one, so MMR and the record visibly swap places.
 */
const MMR_LAYOUT = {
	mmr: [st(36, 45, 28, 1), st(48, 64, 12.5, 1), st(48, 64, 12.5, 1)],
	tag: [st(22, 64, 8, 0), st(23, 64, 8, 1), st(23, 64, 8, 1)],
	delta: [st(64, 14, 9.5, 1), st(64, 14, 9.5, 0), st(64, 14, 9.5, 0)],
	record: [st(36, 64, 11, 1), st(36, 45, 23, 1), st(36, 64, 11, 0)],
	streak: [st(36, 52, 18, 0), st(36, 52, 18, 0), st(36, 45, 30, 1)],
	labelMmr: [st(36, 15, 10, 1), st(36, 15, 10, 0), st(36, 15, 10, 0)],
	labelRecord: [st(36, 15, 10, 0), st(36, 15, 10, 1), st(36, 15, 10, 0)],
	labelStreak: [st(36, 15, 10, 0), st(36, 15, 10, 0), st(36, 15, 10, 1)],
};

/** Text at an animated style; invisible pieces are left out, fully visible ones carry no opacity attribute. */
function styled(str: string, s: Style, o: { fill: string; anchor?: "start" | "middle" | "end"; skew?: number; maxWidth?: number }): string {
	if (s.op < 0.02) return "";
	return text(str, { x: s.x, y: s.y, size: s.size, fill: o.fill, anchor: o.anchor, skew: o.skew, maxWidth: o.maxWidth, opacity: s.op < 0.98 ? Number(s.op.toFixed(2)) : undefined });
}

function mmrKey(ctx: RenderCtx, view?: MmrView): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const { wins, losses } = s.session;
	const { pl, value, delta } = mmrInfo(ctx);
	const has = value !== undefined;
	const streak = ctx.store.streak();
	// Where every piece is right now: between the old view and the new one while the swap animates.
	const index = view?.index ?? 0;
	const from = view?.from ?? index;
	const k = view ? easeInOut(Math.max(0, Math.min(1, (ctx.now - view.at) / VIEW_MS))) : 1;
	const at = (piece: keyof typeof MMR_LAYOUT) => mix(MMR_LAYOUT[piece][from]!, MMR_LAYOUT[piece][index]!, k);
	const bigMmr = at("mmr");
	if (!has) bigMmr.size *= 26 / 28; // the dash is a little smaller than a number
	const streakText = streak ? `${streak.count}${streak.kind === "W" ? t(lang, "w") : t(lang, "l")}` : "—";
	const streakFill = streak ? (streak.kind === "W" ? COLORS.green : COLORS.red) : COLORS.dim;
	const rec = at("record");
	return doc(
		panel(ctx.settings.keyTheme) +
			styled(!pl.ranked && has ? t(lang, "mmrCasual") : "MMR", { ...at("labelMmr"), size: !pl.ranked && has ? 8.5 : 10 }, { fill: COLORS.dim, maxWidth: 56 }) +
			styled(t(lang, "record"), at("labelRecord"), { fill: COLORS.dim, maxWidth: 56 }) +
			styled(t(lang, "streak"), at("labelStreak"), { fill: COLORS.dim, maxWidth: 56 }) +
			(delta ? styled(`${delta > 0 ? "+" : "−"}${Math.abs(delta)}`, at("delta"), { fill: delta > 0 ? COLORS.green : COLORS.red, anchor: "end", skew: -6 }) : "") +
			styled(has ? String(value) : "—", bigMmr, { fill: has ? "#ffffff" : COLORS.dim, skew: -9, maxWidth: 56 }) +
			styled("MMR", at("tag"), { fill: COLORS.dim, anchor: "middle" }) +
			`<rect x="10" y="51" width="52" height="1.5" fill="${COLORS.line}"/>` +
			// maxWidth keeps double-digit wins/losses inside the key even in the big "record" view (index 1, size 23) —
			// without it a result like 14W spills past the left edge (reported with 4W 2L already crowding it).
			styled(`${wins}${t(lang, "w")}`, { ...rec, x: 33 }, { fill: COLORS.green, anchor: "end", skew: -6, maxWidth: 25 }) +
			styled(`${losses}${t(lang, "l")}`, { ...rec, x: 39 }, { fill: COLORS.red, anchor: "start", skew: -6, maxWidth: 25 }) +
			styled(streakText, at("streak"), { fill: streakFill, skew: -9, maxWidth: 56 }) +
			veil(ctx),
	);
}

function modeKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	if (!s.gameRunning || s.phase === "menu") {
		return doc(panel(ctx.settings.keyTheme) + text(t(lang, "menuTitle"), { y: 42, size: 20, fill: s.gameRunning ? "#ffffff" : COLORS.dim, skew: -9 }) + veil(ctx));
	}
	const pl = currentPlaylist(ctx);
	return doc(
		panel(ctx.settings.keyTheme) +
			text(pl.name.toUpperCase(), { y: 27, size: 14, skew: -9, maxWidth: 56 }) +
			text(pl.ranked ? t(lang, "ranked_") : t(lang, "unranked"), { y: 42, size: 10.5, fill: pl.ranked ? COLORS.gold : COLORS.dim, maxWidth: 56 }) +
			teamDots(pl.size ?? ctx.store.teamSize() ?? 3, 36, 58, teamLook(s, sideTeams(s, ctx.settings.scoreOrder)[0]).accent, teamLook(s, sideTeams(s, ctx.settings.scoreOrder)[1]).accent) +
			veil(ctx),
	);
}

// ---- score keys ------------------------------------------------------------------------------------

/** `side` 0 = the left score key, 1 = the right one; which team that is depends on who the local player is (see sideTeams). */
function teamKey(ctx: RenderCtx, side: 0 | 1): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const team: TeamNum = sideTeams(s, ctx.settings.scoreOrder)[side];
	const look = teamLook(s, team);
	const flash = ctx.store.goalFlash(team);
	// Quantised so the key is not re-sent to the device for every tiny change of opacity.
	const flashOpacity = Math.round(flash * 4) / 4 * 0.7;
	const mine = s.meTeam === team;
	return doc(
		linear("t", look.c1, look.c2, false) +
			`<rect width="72" height="72" fill="url(#t)"/>` +
			stripes(72, 72, 6, 0.13, look.ink) +
			text(teamLabel(s, team, t(lang, team === 0 ? "blue" : "orange")), { y: 15, size: 10, fill: look.ink, opacity: 0.92, maxWidth: 56 }) +
			text(String(s.scores[team]), { y: mine ? 53 : 56, size: mine ? 40 : 44, fill: look.ink, skew: -9, maxWidth: 56 }) +
			(mine ? `<rect x="0" y="62" width="72" height="10" fill="${look.ink}" fill-opacity="0.94"/>` + text(t(lang, "you"), { y: 70, size: 8, fill: look.c2 }) : "") +
			(flashOpacity > 0 ? `<rect width="72" height="72" fill="#ffffff" fill-opacity="${flashOpacity.toFixed(2)}"/>` : "") +
			veil(ctx),
	);
}

function timerKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const live = s.gameRunning && s.phase !== "menu";
	// Free Play / training has no fixed match length: TimeSeconds is elapsed time, not a countdown, so a low value there
	// is not "about to end" and must not flash red.
	const urgent = live && !s.overtime && s.time <= 30 && s.phase === "live" && currentPlaylist(ctx).timed !== false;
	const blink = urgent && Math.floor(ctx.now / 500) % 2 === 0;
	const color = s.overtime ? COLORS.orange1 : urgent ? (blink ? COLORS.red : "#ffffff") : "#ffffff";
	const label = s.paused ? t(lang, "paused") : s.overtime ? t(lang, "ot") : s.replay ? t(lang, "replay") : t(lang, "time");
	const clock = live ? (s.overtime ? `+${formatClock(s.time)}` : formatClock(s.time)) : "--:--";
	return doc(
		panel(ctx.settings.keyTheme) +
			frame(s.overtime ? COLORS.orange1 : urgent ? COLORS.red : COLORS.line) +
			text(label, { y: 16, size: 9.5, fill: s.overtime || s.paused ? COLORS.orange1 : COLORS.dim, maxWidth: 56 }) +
			text(clock, { y: 51, size: 30, fill: live ? color : COLORS.dim, skew: -9, maxWidth: 56 }) +
			veil(ctx),
	);
}

// ---- last goal + ball speed ------------------------------------------------------------------------

function lastGoalKey(ctx: RenderCtx): string {
	const g = ctx.store.state.lastGoal;
	const lang = ctx.settings.lang;
	const units = ctx.settings.units;
	const barColor = g ? teamLook(ctx.store.state, g.team).accent : COLORS.line;
	const speed = g ? convertSpeed(g.speedKmh, units) : undefined;
	return doc(
		panel(ctx.settings.keyTheme) +
			`<rect width="72" height="4" fill="${barColor}"/>` +
			text(t(lang, "lastGoal"), { y: 15, size: 8.5, fill: COLORS.dim, maxWidth: 56 }) +
			text(g ? g.scorer : t(lang, "noGoal"), { y: 30, size: 13, fill: g ? "#ffffff" : COLORS.dim, skew: -8, maxWidth: 56 }) +
			text(speed && speed.value > 0 ? String(speed.value) : "—", { y: 54, size: 27, fill: g ? barColor : COLORS.dim, skew: -9, maxWidth: 56 }) +
			text(speed ? speed.unit : "", { y: 66, size: 9, fill: COLORS.dim }) +
			veil(ctx),
	);
}

function speedKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const live = s.gameRunning && s.phase !== "menu";
	const v = convertSpeed(live ? s.ballSpeedKmh : 0, ctx.settings.units);
	const max = convertSpeed(s.maxBallSpeedKmh, ctx.settings.units);
	const ratio = Math.max(0, Math.min(1, (live ? s.ballSpeedKmh : 0) / 160)); // typical hard shots stay below 160 km/h; the bar saturates there
	const barW = Math.round(56 * ratio);
	const hot = ratio > 0.7 ? COLORS.red : ratio > 0.4 ? COLORS.orange1 : COLORS.blue1;
	return doc(
		panel(ctx.settings.keyTheme) +
			text(t(lang, "ball"), { y: 15, size: 9.5, fill: COLORS.dim }) +
			text(String(v.value), { y: 43, size: 29, fill: "#ffffff", skew: -9, maxWidth: 56 }) +
			text(v.unit, { y: 53, size: 8.5, fill: COLORS.dim }) +
			`<rect x="8" y="58" width="56" height="5" fill="#000000" fill-opacity="0.45"/>` +
			(barW > 0 ? `<rect x="8" y="58" width="${barW}" height="5" fill="${hot}"/>` : "") +
			text(max.value > 0 ? `${t(lang, "max")} ${max.value}` : "", { y: 70.5, size: 6.5, fill: COLORS.dim }) +
			veil(ctx),
	);
}

// ---- entry point -----------------------------------------------------------------------------------

export function renderRole(role: Role, ctx: RenderCtx, opts: RenderOpts = {}): string {
	switch (role) {
		case "rank":
			return rankKey(ctx);
		case "mmr":
			return mmrKey(ctx, opts.view);
		case "mode":
			return modeKey(ctx);
		case "blue":
			return teamKey(ctx, 0);
		case "orange":
			return teamKey(ctx, 1);
		case "timer":
			return timerKey(ctx);
		case "lastgoal":
			return lastGoalKey(ctx);
		case "speed":
			return speedKey(ctx);
		case "banner":
			return renderBannerSlice(ctx, opts.slice ?? 0);
		case "boost":
			return boostKey(ctx);
		case "carspeed":
			return carSpeedKey(ctx);
		case "possession":
			return possessionKey(ctx);
		case "points":
			return pointsKey(ctx);
		case "clock":
			return clockKey(ctx, opts.view?.index ?? 0);
		case "analog":
			return analogKey(ctx);
		case "ping":
			return pingKey(ctx);
	}
}
