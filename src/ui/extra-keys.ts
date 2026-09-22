import { MONTHS, t, WEEKDAYS } from "../core/i18n";
import type { Lang } from "../core/types";
import type { RenderCtx } from "./context";
import { COLORS, doc, panel, text } from "./svg";

// ---- clock -------------------------------------------------------------------------------------------------------------------

export interface ClockParts {
	/** Hours, "07" (24-hour) or "7" (12-hour). */
	hh: string;
	mm: string;
	seconds: number;
	/** "AM" / "PM" in 12-hour mode, else "". */
	suffix: string;
	/** "TUE 22 SEP" */
	date: string;
}

/** The local time of the computer the plugin runs on. */
export function clockParts(ms: number, lang: Lang, twelveHour: boolean): ClockParts {
	const d = new Date(ms);
	const h24 = d.getHours();
	const h = twelveHour ? ((h24 + 11) % 12) + 1 : h24;
	return {
		hh: twelveHour ? String(h) : String(h).padStart(2, "0"),
		mm: String(d.getMinutes()).padStart(2, "0"),
		seconds: d.getSeconds(),
		suffix: twelveHour ? (h24 >= 12 ? "PM" : "AM") : "",
		date: `${WEEKDAYS[lang][(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[lang][d.getMonth()]}`,
	};
}

/**
 * The clock key. Layout 0: hours over minutes, big. Layout 1 (after a press): the time on one smaller line, kept 10 px away from
 * the edges of the key, with the seconds underneath. The date is on top and a thin bar along the bottom fills once a minute.
 * Always drawn, game or not.
 */
export function clockKey(ctx: RenderCtx, layout = 0): string {
	const c = clockParts(ctx.now, ctx.settings.lang, ctx.settings.clock12h);
	const bar = `<rect x="8" y="69" width="56" height="2" fill="${COLORS.line}"/>` + `<rect x="8" y="69" width="${((c.seconds / 60) * 56).toFixed(1)}" height="2" fill="${COLORS.blue1}"/>`;
	if (layout === 1) {
		const sub = `${c.suffix ? c.suffix + "  " : ""}:${String(c.seconds).padStart(2, "0")}`;
		return doc(panel(ctx.settings.keyTheme) + text(c.date, { y: 12, size: 8.5, fill: COLORS.dim, maxWidth: 56 }) + text(`${c.hh}:${c.mm}`, { y: 43, size: 21, skew: -9, maxWidth: 52 }) + text(sub, { y: 58, size: 9, fill: COLORS.dim, maxWidth: 52 }) + bar);
	}
	return doc(
		panel(ctx.settings.keyTheme) +
			text(c.date, { y: 12, size: 8.5, fill: COLORS.dim, maxWidth: 56 }) +
			text(c.hh, { y: 39, size: 26, skew: -9, maxWidth: 40 }) +
			(c.suffix ? text(c.suffix, { x: 60, y: 39, size: 8, fill: COLORS.dim, anchor: "end" }) : "") +
			text(c.mm, { y: 65, size: 26, skew: -9, maxWidth: 40 }) +
			bar,
	);
}

// ---- analog clock ---------------------------------------------------------------------------------------------------------------

const ANALOG = { cx: 36, cy: 36.5, r: 31 };
/** Point at `deg` degrees clockwise from twelve o'clock, `len` from the centre. */
const polar = (deg: number, len: number): [number, number] => {
	const a = ((deg - 90) * Math.PI) / 180;
	return [ANALOG.cx + len * Math.cos(a), ANALOG.cy + len * Math.sin(a)];
};

/** One clock hand from `tail` behind the centre to `len` in front of it, on a dark outline so it stays visible on the dial. */
function hand(id: string, deg: number, len: number, tail: number, width: number, color: string): string {
	const [x1, y1] = polar(deg + 180, tail);
	const [x2, y2] = polar(deg, len);
	const pts = `x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"`;
	return `<line ${pts} stroke="#05070f" stroke-width="${(width + 2.4).toFixed(1)}" stroke-linecap="round"/><line id="${id}" ${pts} stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
}

/** The analog clock key: a dial with hour ticks and thick, contrasting hands — hour and minute in white, the second hand red. */
export function analogKey(ctx: RenderCtx): string {
	const d = new Date(ctx.now);
	const s = d.getSeconds();
	const m = d.getMinutes() + s / 60;
	const h = (d.getHours() % 12) + m / 60;
	let ticks = "";
	for (let i = 0; i < 12; i++) {
		const big = i % 3 === 0;
		const [x1, y1] = polar(i * 30, ANALOG.r - 3 - (big ? 6 : 3));
		const [x2, y2] = polar(i * 30, ANALOG.r - 3);
		ticks += `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${i === 0 ? COLORS.orange1 : "#dfe6ff"}" stroke-width="${big ? 2.4 : 1.2}" stroke-linecap="round"/>`;
	}
	return doc(
		`<rect width="72" height="72" fill="${COLORS.bg1}"/>` +
			`<circle cx="${ANALOG.cx}" cy="${ANALOG.cy}" r="${ANALOG.r}" fill="#111a3a" stroke="${COLORS.line}" stroke-width="2"/>` +
			ticks +
			hand("h-hour", h * 30, 15, 3, 5, "#ffffff") +
			hand("h-minute", m * 6, 24, 4, 3.4, "#ffffff") +
			hand("h-second", s * 6, 26, 8, 1.6, COLORS.red) +
			`<circle cx="${ANALOG.cx}" cy="${ANALOG.cy}" r="3.2" fill="${COLORS.red}" stroke="#05070f" stroke-width="1"/>`,
	);
}

// ---- ping --------------------------------------------------------------------------------------------------------------------

/** Green up to 50 ms, gold up to 100 ms, red above. */
export const pingColor = (ms: number): string => (ms < 50 ? COLORS.green : ms < 100 ? COLORS.gold : COLORS.red);

/** Bars for the recent samples: height grows with the ping (150 ms fills the box); a lost packet is a red stub. */
export function sparkline(history: (number | null)[], x: number, y: number, w: number, h: number, count: number): string {
	const items = history.slice(-count);
	const step = w / count;
	let out = "";
	items.forEach((v, i) => {
		const bx = x + w - (items.length - i) * step;
		if (v === null) out += `<rect x="${bx.toFixed(1)}" y="${y}" width="${Math.max(1, step - 0.8).toFixed(1)}" height="${h}" fill="${COLORS.red}" fill-opacity="0.35"/>`;
		else {
			const bh = Math.max(1.5, Math.min(h, (v / 150) * h));
			out += `<rect x="${bx.toFixed(1)}" y="${(y + h - bh).toFixed(1)}" width="${Math.max(1, step - 0.8).toFixed(1)}" height="${bh.toFixed(1)}" fill="${pingColor(v)}"/>`;
		}
	});
	return out;
}

/** The ping key: the latest round trip to the game server, coloured by quality, with a small history graph. */
export function pingKey(ctx: RenderCtx): string {
	const lang = ctx.settings.lang;
	const p = ctx.store.state.gameRunning ? ctx.ping : undefined; // a stale server from an old log means nothing while the game is off
	const ms = p?.ms;
	const has = typeof ms === "number";
	const lost = ms === null;
	const match = !!p?.target;
	const color = has ? pingColor(ms) : lost ? COLORS.red : COLORS.dim;
	return doc(
		panel(ctx.settings.keyTheme) +
			text(t(lang, "ping"), { y: 15, size: 10, fill: COLORS.dim }) +
			text(has ? String(ms) : lost ? t(lang, "pingLoss") : "—", { y: 43, size: has ? 29 : lost ? 16 : 26, fill: color, skew: -9, maxWidth: 56 }) +
			(has ? text("ms", { y: 53, size: 8.5, fill: COLORS.dim }) : !match ? text(t(lang, "pingNone"), { y: 56, size: 8, fill: COLORS.dim, maxWidth: 56 }) : "") +
			`<rect x="8" y="57" width="56" height="12" fill="#000000" fill-opacity="0.35"/>` +
			(p ? sparkline(p.history, 8, 57, 56, 12, 28) : ""),
	);
}
