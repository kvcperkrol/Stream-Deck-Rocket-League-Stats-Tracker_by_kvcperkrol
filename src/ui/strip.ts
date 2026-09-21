import { t } from "../core/i18n";
import { rankFor, tierInfo } from "../core/ranks";
import { convertSpeed } from "../core/units";
import { emblem, iconBadge } from "./art";
import { clockParts, pingColor, sparkline } from "./extra-keys";
import { renderBannerStripSegment, stat, STRIP_SEGMENT, stripNeedsScene } from "./banner";
import type { RenderCtx } from "./context";
import { mmrInfo, rankedContext } from "./keys";
import { teamLook } from "./teams";
import { COLORS, linear, stripes, text } from "./svg";

const { width: W, height: H, count: SEGMENTS } = STRIP_SEGMENT;
const CX = W / 2;

const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;

/** Common look of a panel: the deck's dark gradient with a hairline where the next segment starts. */
const panel_ = (seg: number) =>
	linear("p", COLORS.bg2, COLORS.bg1) +
	`<rect width="${W}" height="${H}" fill="url(#p)"/>` +
	stripes(W, H, 0, 0.045, "#7f8fe0", 44, 14) +
	(seg < SEGMENTS - 1 ? `<rect x="${W - 1}" y="8" width="1" height="${H - 16}" fill="${COLORS.line}"/>` : "");

/** Segment 0: the rank icon with its name and division, and the mode underneath. */
function rankPanel(ctx: RenderCtx): string {
	const lang = ctx.settings.lang;
	const { pl } = rankedContext(ctx);
	const tier = pl.ranked ? tierInfo(rankFor(ctx.settings.ranks, pl.group).tier) : tierInfo(0);
	const icon = ctx.rankIcon?.(tier.id);
	const badge = icon ? iconBadge(icon, 46, 50, 68) : emblem(tier, 46, 50, 1.45, pl.ranked ? undefined : "—");
	if (!pl.ranked) {
		return badge + text(t(lang, "unranked"), { x: 142, y: 50, size: 17, fill: tier.color, skew: -6, maxWidth: 108 }) + text(pl.name.toUpperCase(), { x: 142, y: 70, size: 12, fill: COLORS.dim, maxWidth: 108 });
	}
	const entry = rankFor(ctx.settings.ranks, pl.group);
	const div = tier.rank >= 1 && tier.rank <= 7 ? `${t(lang, "div")} ${entry.div}` : "";
	const sub = tier.roman && tier.rank !== 8 ? `${tier.roman}${div ? "  ·  " + div : ""}` : div;
	return (
		badge +
		text(tier.rank === 0 ? t(lang, "setRank") : tier.family, { x: 142, y: 40, size: 17, fill: tier.color, skew: -6, maxWidth: 108 }) +
		(sub ? text(sub, { x: 142, y: 58, size: 12, fill: COLORS.dim, maxWidth: 108 }) : "") +
		text(`${pl.name.toUpperCase()} · ${t(lang, "ranked_")}`, { x: 142, y: 80, size: 11, fill: COLORS.gold, maxWidth: 108 })
	);
}

/** Segment 1: MMR, its change since the last queue, and this session's wins and losses. */
function mmrPanel(ctx: RenderCtx): string {
	const lang = ctx.settings.lang;
	const { wins, losses } = ctx.store.state.session;
	const { pl, value, delta } = mmrInfo(ctx);
	const has = value !== undefined;
	return (
		text(!pl.ranked && has ? t(lang, "mmrCasual") : "MMR", { x: CX, y: 22, size: 12, fill: COLORS.dim, maxWidth: 120 }) +
		(delta ? text(`${delta > 0 ? "+" : "−"}${Math.abs(delta)}`, { x: W - 14, y: 22, size: 14, fill: delta > 0 ? COLORS.green : COLORS.red, anchor: "end", skew: -6 }) : "") +
		text(has ? String(value) : "—", { x: CX, y: 66, size: has ? 46 : 40, fill: has ? "#ffffff" : COLORS.dim, skew: -9, maxWidth: 170 }) +
		text(`${wins}${t(lang, "w")}`, { x: CX - 6, y: 90, size: 15, fill: COLORS.green, anchor: "end", skew: -6 }) +
		text(`${losses}${t(lang, "l")}`, { x: CX + 6, y: 90, size: 15, fill: COLORS.red, anchor: "start", skew: -6 })
	);
}

/** Segment 2: the last goal — who, and how fast the ball was. It stays between matches. */
function lastGoalPanel(ctx: RenderCtx): string {
	const lang = ctx.settings.lang;
	const g = ctx.store.state.lastGoal;
	const accent = g ? teamLook(ctx.store.state, g.team).accent : COLORS.line;
	const speed = g ? convertSpeed(g.speedKmh, ctx.settings.units) : undefined;
	return (
		`<rect width="${W}" height="5" fill="${accent}"/>` +
		text(t(lang, "lastGoal"), { x: CX, y: 24, size: 12, fill: COLORS.dim, maxWidth: 170 }) +
		text(g ? g.scorer : t(lang, "noGoal"), { x: CX, y: 50, size: 22, fill: g ? "#ffffff" : COLORS.dim, skew: -8, maxWidth: 176 }) +
		text(speed && speed.value > 0 ? String(speed.value) : "—", { x: CX, y: 90, size: 40, fill: g ? accent : COLORS.dim, skew: -9, maxWidth: 150 }) +
		(speed && speed.value > 0 ? text(speed.unit, { x: W - 12, y: 90, size: 11, fill: COLORS.dim, anchor: "end" }) : "")
	);
}

/** Segment 3: the player's own goals, assists and saves. */
function statsPanel(ctx: RenderCtx): string {
	const lang = ctx.settings.lang;
	const me = ctx.store.myStats();
	const labels = [stat(lang, "goals"), stat(lang, "assists"), stat(lang, "saves")];
	const values = me ? [me.goals, me.assists, me.saves] : [0, 0, 0];
	let out = "";
	for (let i = 0; i < 3; i++) {
		const x = 34 + i * 66;
		out += text(labels[i]!, { x, y: 28, size: 10, fill: COLORS.dim, maxWidth: 58 });
		out += text(String(values[i]), { x, y: 72, size: 40, fill: "#ffffff", skew: -9, maxWidth: 58 });
	}
	return out;
}

/** Segment "clock": the time of this computer, the date, and the second hand as a line along the bottom. */
function clockPanel(ctx: RenderCtx): string {
	const c = clockParts(ctx.now, ctx.settings.lang, ctx.settings.clock12h);
	return (
		text(`${c.hh}:${c.mm}`, { x: CX, y: 60, size: 54, skew: -9, maxWidth: 180 }) +
		(c.suffix ? text(c.suffix, { x: W - 12, y: 30, size: 14, fill: COLORS.dim, anchor: "end" }) : "") +
		text(c.date, { x: CX, y: 84, size: 14, fill: COLORS.dim, maxWidth: 176 }) +
		`<rect x="12" y="93" width="${W - 24}" height="2" fill="${COLORS.line}"/>` +
		`<rect x="12" y="93" width="${(((c.seconds + 1) / 60) * (W - 24)).toFixed(1)}" height="2" fill="${COLORS.blue1}"/>`
	);
}

/** Segment "ping": the latest round trip to the game server and how it has been doing. */
function pingPanel(ctx: RenderCtx): string {
	const lang = ctx.settings.lang;
	const p = ctx.store.state.gameRunning ? ctx.ping : undefined;
	const ms = p?.ms;
	const has = typeof ms === "number";
	const lost = ms === null;
	const color = has ? pingColor(ms) : lost ? COLORS.red : COLORS.dim;
	return (
		text(t(lang, "ping"), { x: CX, y: 22, size: 12, fill: COLORS.dim }) +
		text(has ? String(ms) : lost ? t(lang, "pingLoss") : "—", { x: CX - (has ? 10 : 0), y: 62, size: has ? 46 : 30, fill: color, skew: -9, maxWidth: 150 }) +
		(has ? text("ms", { x: W - 14, y: 62, size: 12, fill: COLORS.dim, anchor: "end" }) : !p?.target ? text(t(lang, "pingNone"), { x: CX, y: 80, size: 11, fill: COLORS.dim }) : "") +
		`<rect x="14" y="74" width="${W - 28}" height="18" fill="#000000" fill-opacity="0.35"/>` +
		(p ? sparkline(p.history, 14, 74, W - 28, 18, 34) : "")
	);
}

/** What a dial's segment can show. "auto" is the default arrangement: rank, MMR, last goal, my stats. */
export type StripPanel = "auto" | "rank" | "mmr" | "lastgoal" | "stats" | "clock" | "ping";
export const STRIP_PANELS: StripPanel[] = ["auto", "rank", "mmr", "lastgoal", "stats", "clock", "ping"];

const PANELS: Record<Exclude<StripPanel, "auto">, (ctx: RenderCtx) => string> = { rank: rankPanel, mmr: mmrPanel, lastgoal: lastGoalPanel, stats: statsPanel, clock: clockPanel, ping: pingPanel };
const DEFAULT_PANEL: Exclude<StripPanel, "auto">[] = ["rank", "mmr", "lastgoal", "stats"];

/**
 * One segment (0…3) of the Stream Deck + touch strip. While something happens (a goal, a demo, a save …) — or while the game is
 * not running / in the menu — the four segments together show the same animated banner as three banner keys would, only
 * wider. In between, each segment is a small panel: rank, MMR, last goal, my stats.
 */
export function renderStrip(ctx: RenderCtx, segment: number, panel: StripPanel = "auto"): string {
	const seg = Math.max(0, Math.min(SEGMENTS - 1, Math.trunc(segment)));
	// An event always takes the whole strip. Otherwise a segment shows its pinned panel — or, on "auto", the default one, unless
	// the game is not running / in the menu and nothing on the strip is customised (then all four show that state together).
	if (ctx.store.activeBanner() || (panel === "auto" && stripNeedsScene(ctx))) return renderBannerStripSegment(ctx, seg);
	const which = panel === "auto" ? DEFAULT_PANEL[seg]! : panel;
	return wrap(panel_(seg) + PANELS[which](ctx));
}
