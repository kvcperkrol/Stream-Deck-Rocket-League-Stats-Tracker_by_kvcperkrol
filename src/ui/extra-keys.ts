import { MONTHS, t, WEEKDAYS } from "../core/i18n";
import type { Lang } from "../core/types";
import type { RenderCtx } from "./context";
import { COLORS, doc, linear, stripes, text } from "./svg";

const panel = () => linear("p", COLORS.bg2, COLORS.bg1) + `<rect width="72" height="72" fill="url(#p)"/>` + stripes(72, 72, 0, 0.045, "#7f8fe0", 30, 10);

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

/** The clock key: hours over minutes, the date on top and a thin bar that fills once a minute. Always drawn, game or not. */
export function clockKey(ctx: RenderCtx): string {
	const c = clockParts(ctx.now, ctx.settings.lang, ctx.settings.clock12h);
	return doc(
		panel() +
			text(c.date, { y: 12, size: 8.5, fill: COLORS.dim, maxWidth: 56 }) +
			text(c.hh, { y: 39, size: 26, skew: -9, maxWidth: 40 }) +
			(c.suffix ? text(c.suffix, { x: 60, y: 39, size: 8, fill: COLORS.dim, anchor: "end" }) : "") +
			text(c.mm, { y: 65, size: 26, skew: -9, maxWidth: 40 }) +
			`<rect x="8" y="69" width="56" height="2" fill="${COLORS.line}"/>` +
			`<rect x="8" y="69" width="${((c.seconds / 60) * 56).toFixed(1)}" height="2" fill="${COLORS.blue1}"/>`,
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
		panel() +
			text(t(lang, "ping"), { y: 15, size: 10, fill: COLORS.dim }) +
			text(has ? String(ms) : lost ? t(lang, "pingLoss") : "—", { y: 43, size: has ? 29 : lost ? 16 : 26, fill: color, skew: -9, maxWidth: 56 }) +
			(has ? text("ms", { y: 53, size: 8.5, fill: COLORS.dim }) : !match ? text(t(lang, "pingNone"), { y: 56, size: 8, fill: COLORS.dim, maxWidth: 56 }) : "") +
			`<rect x="8" y="57" width="56" height="12" fill="#000000" fill-opacity="0.35"/>` +
			(p ? sparkline(p.history, 8, 57, 56, 12, 28) : ""),
	);
}
