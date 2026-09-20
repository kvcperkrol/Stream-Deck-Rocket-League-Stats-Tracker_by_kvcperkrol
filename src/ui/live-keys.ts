import { t } from "../core/i18n";
import { convertSpeed } from "../core/units";
import type { RenderCtx } from "./context";
import { COLORS, doc, linear, stripes, text } from "./svg";
import { sideTeams, teamLook } from "./teams";

/** Keys driven by the local player's live data: boost, car speed, possession, points. */

const panel = () => linear("p", COLORS.bg2, COLORS.bg1) + `<rect width="72" height="72" fill="url(#p)"/>` + stripes(72, 72, 0, 0.045, "#7f8fe0", 30, 10);

/** Dims a key while the game is not running so a stale value never looks live. */
const veil = (ctx: RenderCtx) => (ctx.store.state.gameRunning ? "" : `<rect width="72" height="72" fill="#05070f" fill-opacity="0.5"/>`);

/** SVG path for an arc that starts at 12 o'clock and runs clockwise for `frac` of the circle (a full circle for 1). */
export function arc(cx: number, cy: number, r: number, frac: number): string {
	if (frac <= 0) return "";
	if (frac >= 0.999) return `M${cx},${cy - r} A${r},${r} 0 1 1 ${cx - 0.01},${cy - r} Z`;
	const a = -Math.PI / 2 + 2 * Math.PI * frac;
	const x = cx + r * Math.cos(a);
	const y = cy + r * Math.sin(a);
	return `M${cx},${cy - r} A${r},${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)},${y.toFixed(2)}`;
}

function liveMe(ctx: RenderCtx) {
	const s = ctx.store.state;
	const live = s.gameRunning && s.phase !== "menu";
	return { live, me: live ? ctx.store.myStats() : undefined };
}

export function boostKey(ctx: RenderCtx): string {
	const { me } = liveMe(ctx);
	const lang = ctx.settings.lang;
	const boost = me?.boost;
	const pct = boost === undefined ? 0 : Math.max(0, Math.min(100, Math.round(boost)));
	const low = boost !== undefined && pct < 15;
	const blink = low && Math.floor(ctx.now / 400) % 2 === 0;
	const color = pct >= 66 ? COLORS.orange1 : pct >= 33 ? COLORS.gold : blink ? "#ffffff" : COLORS.red;
	const glow = me?.boosting ? `<circle cx="36" cy="36" r="31" fill="none" stroke="${COLORS.orange1}" stroke-width="2" stroke-opacity="0.55"/>` : "";
	return doc(
		panel() +
			glow +
			`<circle cx="36" cy="36" r="26" fill="none" stroke="${COLORS.line}" stroke-width="7"/>` +
			(pct > 0 ? `<path d="${arc(36, 36, 26, pct / 100)}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>` : "") +
			text(boost === undefined ? (me ? "n/d" : "—") : String(pct), { y: 42, size: boost === undefined && me ? 18 : 25, fill: boost === undefined ? COLORS.dim : "#ffffff", skew: -9, maxWidth: 40 }) +
			text(t(lang, "boost"), { y: 54, size: 7.5, fill: COLORS.dim }) +
			veil(ctx),
	);
}

export function carSpeedKey(ctx: RenderCtx): string {
	const { me } = liveMe(ctx);
	const lang = ctx.settings.lang;
	const v = me?.speedKmh === undefined ? undefined : convertSpeed(me.speedKmh, ctx.settings.units);
	const sonic = !!me?.supersonic;
	const blink = sonic && Math.floor(ctx.now / 300) % 2 === 0;
	const ratio = Math.max(0, Math.min(1, (me?.speedKmh ?? 0) / 82.8)); // 82.8 km/h is the supersonic threshold (2300 uu/s)
	const barW = Math.round(56 * ratio);
	const bg = sonic ? linear("cs", "#e11d8a", "#3b1a8f") + `<rect width="72" height="72" fill="url(#cs)"/>` + stripes(72, 72, 6, 0.14) : panel();
	return doc(
		bg +
			text(sonic ? t(lang, "supersonic") : t(lang, "carSpeed"), { y: 15, size: 9.5, fill: sonic ? "#ffffff" : COLORS.dim, opacity: sonic && !blink ? 0.55 : 1, maxWidth: 66 }) +
			text(v ? String(v.value) : me ? "n/d" : "—", { y: 46, size: v ? 31 : 24, fill: v ? "#ffffff" : COLORS.dim, skew: -9, maxWidth: 66 }) +
			text(v ? v.unit : "", { y: 57, size: 8.5, fill: sonic ? "#ffd3f0" : COLORS.dim }) +
			`<rect x="8" y="62" width="56" height="4" fill="#000000" fill-opacity="0.45"/>` +
			(barW > 0 ? `<rect x="8" y="62" width="${barW}" height="4" fill="${sonic ? "#ffffff" : COLORS.blue1}"/>` : "") +
			veil(ctx),
	);
}

export function possessionKey(ctx: RenderCtx): string {
	const s = ctx.store.state;
	const lang = ctx.settings.lang;
	const live = s.gameRunning && s.phase !== "menu";
	const pct = live ? ctx.store.possessionPct() : undefined; // [blue %, orange %]
	// Same order and colours as the score keys: the left team first, each in the colour the game shows it in.
	const [leftTeam, rightTeam] = sideTeams(s, ctx.settings.scoreOrder);
	const leftPct = pct ? pct[leftTeam] : 50;
	const leftColor = teamLook(s, leftTeam).accent;
	const rightColor = teamLook(s, rightTeam).accent;
	const barW = 56;
	const leftW = Math.round((barW * leftPct) / 100);
	// A small marker over the bar shows who touched the ball last, right now.
	const markX = s.ballTeam === undefined || !live ? undefined : s.ballTeam === leftTeam ? 8 + leftW / 2 : 8 + leftW + (barW - leftW) / 2;
	return doc(
		panel() +
			text(t(lang, "possession"), { y: 14, size: 8.5, fill: COLORS.dim, maxWidth: 66 }) +
			(markX !== undefined ? `<polygon points="${markX - 4},19 ${markX + 4},19 ${markX},25" fill="#ffffff"/>` : "") +
			`<rect x="8" y="28" width="${barW}" height="14" fill="${COLORS.line}"/>` +
			(pct ? `<rect x="8" y="28" width="${leftW}" height="14" fill="${leftColor}"/><rect x="${8 + leftW}" y="28" width="${barW - leftW}" height="14" fill="${rightColor}"/>` : "") +
			text(pct ? `${pct[leftTeam]}%` : "—", { x: 20, y: 62, size: 15, fill: pct ? leftColor : COLORS.dim, skew: -9, maxWidth: 30 }) +
			text(pct ? `${pct[rightTeam]}%` : "—", { x: 52, y: 62, size: 15, fill: pct ? rightColor : COLORS.dim, skew: -9, maxWidth: 30 }) +
			veil(ctx),
	);
}

export function pointsKey(ctx: RenderCtx): string {
	const { me } = liveMe(ctx);
	const lang = ctx.settings.lang;
	return doc(
		panel() +
			text(t(lang, "points"), { y: 14, size: 9.5, fill: COLORS.dim }) +
			text(me ? String(me.score) : "—", { y: 42, size: 30, fill: me ? "#ffffff" : COLORS.dim, skew: -9, maxWidth: 66 }) +
			`<rect x="10" y="48" width="52" height="1.5" fill="${COLORS.line}"/>` +
			text(me ? `${t(lang, "shots")} ${me.shots}` : "", { y: 58, size: 8.5, fill: COLORS.dim, maxWidth: 64 }) +
			text(me ? `${t(lang, "demosLabel")} ${me.demos}` : "", { y: 68, size: 8.5, fill: COLORS.dim, maxWidth: 64 }) +
			veil(ctx),
	);
}
