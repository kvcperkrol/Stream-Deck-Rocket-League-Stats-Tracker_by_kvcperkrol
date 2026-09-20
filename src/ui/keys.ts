import { t } from "../core/i18n";
import { describePlaylist } from "../core/playlists";
import { rankFor, tierInfo } from "../core/ranks";
import type { TeamNum } from "../core/types";
import { convertSpeed, formatClock } from "../core/units";
import { emblem, iconBadge, teamDots } from "./art";
import { renderBannerSlice } from "./banner";
import { sideTeams, teamLabel, teamLook } from "./teams";
import { boostKey, carSpeedKey, possessionKey, pointsKey } from "./live-keys";
import type { RenderCtx, RenderOpts, Role } from "./context";
import { COLORS, doc, linear, stripes, text } from "./svg";

const panel = (id = "p", c1: string = COLORS.bg2, c2: string = COLORS.bg1) =>
	linear(id, c1, c2) + `<rect width="72" height="72" fill="url(#${id})"/>` + stripes(72, 72, 0, 0.045, "#7f8fe0", 30, 10);

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
function rankedContext(ctx: RenderCtx) {
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
			panel() +
				(ctx.rankIcon?.(0) ? iconBadge(ctx.rankIcon(0)!, 36, 25) : emblem(none, 36, 25, 0.95, "—")) +
				text(t(lang, "unranked"), { y: 54, size: 11.5, fill: none.color, skew: -6, maxWidth: 66 }) +
				text(pl.name.toUpperCase(), { y: 66, size: 8.5, fill: COLORS.dim, maxWidth: 66 }) +
				veil(ctx),
		);
	}
	const entry = rankFor(ctx.settings.ranks, pl.group);
	const tier = tierInfo(entry.tier);
	const div = tier.rank >= 1 && tier.rank <= 7 ? `${t(lang, "div")} ${entry.div}` : "";
	return doc(
		panel() +
			(ctx.rankIcon?.(tier.id) ? iconBadge(ctx.rankIcon(tier.id)!, 36, 25) : emblem(tier, 36, 25, 0.95)) +
			text(tier.rank === 0 ? t(lang, "setRank") : tier.family, { y: 54, size: tier.rank === 0 ? 10 : 11.5, fill: tier.color, skew: -6, maxWidth: 66 }) +
			text(tier.roman && tier.rank !== 8 ? `${tier.roman}${div ? "  ·  " + div : ""}` : div || pl.name.toUpperCase(), { y: 66, size: 8.5, fill: COLORS.dim, maxWidth: 66 }) +
			veil(ctx),
	);
}

function mmrKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const { wins, losses } = s.session;
	// In a match: that playlist. In the menu: the playlist queued last. The game log is the source; a value typed for a ranked
	// playlist is the fallback (it never applies to casual play, which has its own hidden MMR).
	const { id, pl } = rankedContext(ctx);
	const auto = id !== undefined ? ctx.autoMmr?.[id] : undefined;
	const typed = pl.ranked ? rankFor(ctx.settings.ranks, pl.group).mmr : null;
	const value = auto?.mmr ?? typed;
	const has = value !== null && value !== undefined;
	const delta = auto?.delta;
	return doc(
		panel() +
			text(!pl.ranked && has ? t(lang, "mmrCasual") : "MMR", { y: 15, size: !pl.ranked && has ? 8.5 : 10, fill: COLORS.dim, maxWidth: 66 }) +
			(delta ? text(`${delta > 0 ? "+" : "−"}${Math.abs(delta)}`, { x: 64, y: 14, size: 9.5, fill: delta > 0 ? COLORS.green : COLORS.red, anchor: "end", skew: -6 }) : "") +
			text(has ? String(value) : "—", { y: 45, size: has ? 28 : 26, fill: has ? "#ffffff" : COLORS.dim, skew: -9, maxWidth: 66 }) +
			`<rect x="10" y="51" width="52" height="1.5" fill="${COLORS.line}"/>` +
			text(`${wins}${t(lang, "w")}`, { x: 33, y: 64, size: 11, fill: COLORS.green, anchor: "end", skew: -6 }) +
			text(`${losses}${t(lang, "l")}`, { x: 39, y: 64, size: 11, fill: COLORS.red, anchor: "start", skew: -6 }) +
			veil(ctx),
	);
}

function modeKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	if (!s.gameRunning || s.phase === "menu") {
		return doc(panel() + text(t(lang, "menuTitle"), { y: 42, size: 20, fill: s.gameRunning ? "#ffffff" : COLORS.dim, skew: -9 }) + veil(ctx));
	}
	const pl = currentPlaylist(ctx);
	return doc(
		panel() +
			text(pl.name.toUpperCase(), { y: 27, size: 16, skew: -9, maxWidth: 66 }) +
			text(pl.ranked ? t(lang, "ranked_") : t(lang, "unranked"), { y: 42, size: 10.5, fill: pl.ranked ? COLORS.gold : COLORS.dim, maxWidth: 66 }) +
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
			text(teamLabel(s, team, t(lang, team === 0 ? "blue" : "orange")), { y: 15, size: 10, fill: look.ink, opacity: 0.92, maxWidth: 64 }) +
			text(String(s.scores[team]), { y: mine ? 53 : 56, size: mine ? 40 : 44, fill: look.ink, skew: -9, maxWidth: 62 }) +
			(mine ? `<rect x="0" y="62" width="72" height="10" fill="${look.ink}" fill-opacity="0.94"/>` + text(t(lang, "you"), { y: 70, size: 8, fill: look.c2 }) : "") +
			(flashOpacity > 0 ? `<rect width="72" height="72" fill="#ffffff" fill-opacity="${flashOpacity.toFixed(2)}"/>` : "") +
			veil(ctx),
	);
}

function timerKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const live = s.gameRunning && s.phase !== "menu";
	const urgent = live && !s.overtime && s.time <= 30 && s.phase === "live";
	const blink = urgent && Math.floor(ctx.now / 500) % 2 === 0;
	const color = s.overtime ? COLORS.orange1 : urgent ? (blink ? COLORS.red : "#ffffff") : "#ffffff";
	const label = s.paused ? t(lang, "paused") : s.overtime ? t(lang, "ot") : s.replay ? t(lang, "replay") : t(lang, "time");
	const clock = live ? (s.overtime ? `+${formatClock(s.time)}` : formatClock(s.time)) : "--:--";
	return doc(
		panel() +
			frame(s.overtime ? COLORS.orange1 : urgent ? COLORS.red : COLORS.line) +
			text(label, { y: 16, size: 9.5, fill: s.overtime || s.paused ? COLORS.orange1 : COLORS.dim, maxWidth: 62 }) +
			text(clock, { y: 51, size: 30, fill: live ? color : COLORS.dim, skew: -9, maxWidth: 66 }) +
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
		panel() +
			`<rect width="72" height="4" fill="${barColor}"/>` +
			text(t(lang, "lastGoal"), { y: 15, size: 8.5, fill: COLORS.dim, maxWidth: 66 }) +
			text(g ? g.scorer : t(lang, "noGoal"), { y: 30, size: 13, fill: g ? "#ffffff" : COLORS.dim, skew: -8, maxWidth: 66 }) +
			text(speed && speed.value > 0 ? String(speed.value) : "—", { y: 54, size: 27, fill: g ? barColor : COLORS.dim, skew: -9, maxWidth: 66 }) +
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
		panel() +
			text(t(lang, "ball"), { y: 15, size: 9.5, fill: COLORS.dim }) +
			text(String(v.value), { y: 43, size: 29, fill: "#ffffff", skew: -9, maxWidth: 66 }) +
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
			return mmrKey(ctx);
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
	}
}
