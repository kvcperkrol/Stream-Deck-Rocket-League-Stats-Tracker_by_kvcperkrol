import { KICKOFF_COUNTDOWN_MS, type Banner, type BannerKind } from "../core/match-store";
import { t } from "../core/i18n";
import { convertSpeed } from "../core/units";
import type { RenderCtx } from "./context";
import { teamLook } from "./teams";
import { COLORS, doc, estimateWidth, fitSize, linear, stripes, text } from "./svg";

const KEY = 72;
/**
 * The physical gap between two keys, in key pixels. The scene is laid out with these gaps built in, so a
 * headline spanning three keys skips the gaps instead of losing letters inside them.
 */
export const KEY_GAP = 14;
const W = KEY * 3 + KEY_GAP * 2;
const H = 72;
/** Centre x of key `i` (0…2) inside the scene. */
const keyX = (i: number) => i * (KEY + KEY_GAP) + KEY / 2;

/**
 * Where things go inside a banner scene. A scene is always laid out 72 units high; a wider scene only means more room to
 * the sides. The three keys and the Stream Deck + touch strip (800×100 px = 576×72 units) share every event layout.
 */
export interface Geo {
	/** Width of the scene. */
	W: number;
	/** Centre x of the left slot (ball speed, attacker), the middle (headline) and the right slot (assist, victim). */
	left: number;
	mid: number;
	right: number;
	/** The widest text that belongs to one slot. */
	slotW: number;
	/** A headline up to `fitMax` keeps its size; up to `betweenMax` it is shrunk to `fitMax`; a longer one spans `spanW`. */
	fitMax: number;
	betweenMax: number;
	spanW: number;
	/** Where the small KICKOFF label goes next to the countdown digit. */
	kickoffLabel: { x: number; y: number };
}

/** Three keys with a physical gap between them: a headline either fits the middle key or is long enough to span all three. */
const KEYS_GEO: Geo = { W, left: keyX(0), mid: W / 2, right: keyX(2), slotW: KEY - 16, fitMax: 58, betweenMax: 108, spanW: W - 26, kickoffLabel: { x: keyX(0), y: 42 } };

/** The touch strip is one continuous surface: no gaps to avoid, so a headline just shrinks until it fits. */
export const STRIP_SEGMENT = { width: 200, height: 100, count: 4 } as const;
const STRIP_K = STRIP_SEGMENT.height / H;
const STRIP_W = (STRIP_SEGMENT.width * STRIP_SEGMENT.count) / STRIP_K;
const STRIP_GEO: Geo = { W: STRIP_W, left: STRIP_W / 8, mid: STRIP_W / 2, right: (STRIP_W * 7) / 8, slotW: STRIP_W / 4 - 20, fitMax: 300, betweenMax: 300, spanW: STRIP_W - 40, kickoffLabel: { x: STRIP_W / 2, y: 11 } };

/**
 * A short line of text that must stay inside ONE key: it shrinks (down to `minSize`) and is truncated with an
 * ellipsis if it still does not fit. Small text that crosses a physical gap would lose whole letters, so every
 * sub-line goes through here; only large headlines are allowed to span keys.
 */
function fitLine(str: string, o: { x: number; y: number; size: number; fill: string; opacity?: number; skew?: number; maxWidth?: number; minSize?: number }): string {
	const maxWidth = o.maxWidth ?? KEY - 16;
	const minSize = o.minSize ?? 9;
	let size = o.size;
	let out = str;
	if (estimateWidth(out, size) > maxWidth) size = Math.max(minSize, fitSize(out, maxWidth, size));
	if (estimateWidth(out, size) > maxWidth + 0.5) out = out.slice(0, Math.max(1, Math.floor(maxWidth / (size * 0.6)) - 1)) + "…";
	return text(out, { x: o.x, y: o.y, size, fill: o.fill, opacity: o.opacity, skew: o.skew ?? -6 });
}

interface Look {
	c1: string;
	c2: string;
	/** Text colour; light backgrounds use the dark ink. */
	ink: string;
	stripe: string;
}

const LOOKS: Record<Exclude<BannerKind, "goal">, Look> = {
	demo: { c1: "#ff3b5c", c2: "#8f0f34", ink: "#ffffff", stripe: "#ffffff" },
	demoed: { c1: "#5a1024", c2: "#210812", ink: "#ff8aa0", stripe: "#ff3b5c" },
	save: { c1: "#1fd58a", c2: "#07694a", ink: "#ffffff", stripe: "#ffffff" },
	epic: { c1: "#ffd24a", c2: "#e58a00", ink: COLORS.ink, stripe: "#ffffff" },
	shot: { c1: "#3c4a86", c2: "#1a2350", ink: "#ffffff", stripe: "#ffffff" },
	crossbar: { c1: "#dfe5f5", c2: "#8592b5", ink: COLORS.ink, stripe: "#ffffff" },
	overtime: { c1: "#ff7a00", c2: "#b3122a", ink: "#ffffff", stripe: "#ffffff" },
	replay: { c1: "#7c3aed", c2: "#2b0f63", ink: "#ffffff", stripe: "#ffffff" },
	countdown: { c1: "#1e55e6", c2: "#0a1a5e", ink: "#ffffff", stripe: "#ffffff" },
	go: { c1: "#2bd576", c2: "#0a6b3a", ink: "#ffffff", stripe: "#ffffff" },
	victory: { c1: "#ffd24a", c2: "#d97a00", ink: COLORS.ink, stripe: "#ffffff" },
	defeat: { c1: "#3a4266", c2: "#131a30", ink: "#c9d1ee", stripe: "#ffffff" },
	win: { c1: "#3a4266", c2: "#131a30", ink: "#ffffff", stripe: "#ffffff" },
	paused: { c1: "#4b5878", c2: "#1a2238", ink: "#ffffff", stripe: "#ffffff" },
	stat: { c1: "#1aa6ee", c2: "#0a4d80", ink: "#ffffff", stripe: "#ffffff" },
};

const IDLE: Look = { c1: "#101838", c2: "#0a0f24", ink: "#ffffff", stripe: "#5a6bc0" };

function look(b: Banner, state: RenderCtx["store"]["state"]): Look {
	if (b.kind === "goal") {
		const c = teamLook(state, b.team ?? 0);
		return { c1: c.c1, c2: c.c2, ink: c.ink, stripe: c.ink };
	}
	return LOOKS[b.kind];
}

interface Scene {
	look: Look;
	content: string;
	/** True while something moves — the hub uses it to decide how often to redraw. */
	animated: boolean;
}

/** The scene is drawn once at 216×72 and each key shows its own 72px window of it. */
function scene(ctx: RenderCtx, banner: Banner | undefined, g: Geo = KEYS_GEO): Scene {
	const { settings, store, now } = ctx;
	const lang = settings.lang;
	const s = store.state;
	const speed = (uu: number) => {
		const v = convertSpeed(uu, settings.units);
		return `${v.value} ${v.unit}`;
	};
	const cx = g.mid;
	const slotX = (i: number) => g.left + ((g.right - g.left) * i) / 2;

	// ---- transient event ---------------------------------------------------------------------------
	if (banner) {
		const l = look(banner, s);
		const age = now - banner.born;
		const pop = 1 + 0.22 * Math.max(0, 1 - age / 260);
		const centre = (inner: string) => `<g transform="translate(${cx} 36) scale(${pop.toFixed(3)}) translate(${-cx} -36)">${inner}</g>`;
		// Headline rule: a title either fits inside the middle key, or is long enough to span all three.
		// Anything in between would put half a glyph into a physical gap, so it is shrunk to the middle key.
		const headlineSize = (str: string, base: number) => {
			const w = estimateWidth(str, base);
			if (w <= g.fitMax) return base;
			if (w <= g.betweenMax) return fitSize(str, g.fitMax, base);
			return fitSize(str, g.spanW, base);
		};
		const big = (str: string, y: number, base: number) => text(str, { x: cx, y, size: headlineSize(str, base), fill: l.ink, skew: -9 });
		const mid = (str: string, y: number, size: number, opacity = 1) => text(str, { x: cx, y, size, fill: l.ink, skew: -6, maxWidth: g.W - 12, opacity });
		/** A player name inside one key (see fitLine). */
		const nameIn = (str: string, x: number, y: number, size: number, opacity = 1) => fitLine(str, { x, y, size, fill: l.ink, opacity, maxWidth: g.slotW });
		const arrowRight = (x: number, y: number) => `<polygon points="${x},${y - 4.5} ${x + 8},${y} ${x},${y + 4.5}" fill="${l.ink}" fill-opacity="0.85"/>`;

		switch (banner.kind) {
			case "goal": {
				// One fact per key so nothing has to cross the physical gaps between keys:
				// [ball speed] [GOAL! + scorer] [assist or team]
				const sp = convertSpeed(banner.speedKmh ?? 0, settings.units);
				const left = g.left;
				const right = g.right;
				const teamName = t(lang, banner.team === 1 ? "orange" : "blue");
				return {
					look: l,
					animated: true,
					content: centre(
						text(sp.unit.toUpperCase(), { x: left, y: 15, size: 9.5, fill: l.ink, opacity: 0.8 }) +
							text(sp.value > 0 ? String(sp.value) : "—", { x: left, y: 46, size: 31, fill: l.ink, skew: -9, maxWidth: g.slotW }) +
							big(t(lang, "goal"), 38, 30) +
							text(banner.assist ? t(lang, "assist") : "", { x: right, y: 15, size: 9.5, fill: l.ink, opacity: 0.8 }) +
							nameIn(banner.assist ?? teamName, right, banner.assist ? 44 : 42, banner.assist ? 15 : 12) +
							nameIn(banner.who ?? "", cx, 65, 14),
					),
				};
			}
			case "demo":
				// [attacker] [DEMO!] [victim] — reads left to right; the arrows under the headline show the direction.
				return {
					look: l,
					animated: true,
					content: centre(
						nameIn(banner.who ?? "?", g.left, 42, 15) +
							big(t(lang, "demo"), 42, 26) +
							nameIn(banner.other ?? "?", g.right, 42, 15, 0.85) +
							arrowRight(cx - 13, 58) +
							arrowRight(cx - 2, 58),
					),
				};
			case "demoed":
				return { look: l, animated: true, content: centre(big(t(lang, "demoed"), 40, 26) + nameIn(t(lang, "by", { name: banner.who ?? "?" }), cx, 62, 14)) };
			case "save":
			case "epic":
				return { look: l, animated: true, content: centre(big(t(lang, banner.kind === "epic" ? "epic" : "save"), 40, 32) + nameIn(banner.who ?? "", cx, 62, 15)) };
			case "shot":
				return { look: l, animated: false, content: centre(big(t(lang, "shot"), 40, 28) + nameIn(banner.who ?? "", cx, 62, 14)) };
			case "crossbar":
				return {
					look: l,
					animated: true,
					content: centre(big(t(lang, "crossbar"), 40, 30) + (banner.speedKmh ? nameIn(speed(banner.speedKmh), cx, 62, 14) : "")),
				};
			case "overtime":
				return { look: l, animated: true, content: centre(big(t(lang, "overtime"), 47, 34)) };
			case "replay": {
				const blink = Math.floor(now / 500) % 2 === 0 ? 1 : 0.35;
				return {
					look: l,
					animated: true,
					content: `<polygon points="${g.left - 9},26 ${g.left + 9},36 ${g.left - 9},46" fill="${l.ink}" fill-opacity="${blink}"/>` + big(t(lang, "replay"), 47, 30),
				};
			}
			case "countdown": {
				// The digits follow the round start (see KICKOFF_COUNTDOWN_MS): nothing to count in the first second, then 3 – 2 – 1.
				const remaining = KICKOFF_COUNTDOWN_MS - age + (settings.countdownOffsetMs ?? 0);
				if (remaining > 3000) return { look: l, animated: true, content: big(t(lang, "kickoff"), 45, 22) };
				const digit = Math.max(1, Math.min(3, Math.ceil(remaining / 1000)));
				return { look: l, animated: true, content: big(String(digit), 52, 50) + text(t(lang, "kickoff"), { x: g.kickoffLabel.x, y: g.kickoffLabel.y, size: 9, fill: l.ink, opacity: 0.75, maxWidth: g.slotW }) };
			}
			case "go":
				return { look: l, animated: true, content: centre(big(t(lang, "go"), 48, 38)) };
			case "victory":
			case "defeat": {
				const score = `${s.scores[0]}  :  ${s.scores[1]}`;
				return { look: l, animated: banner.kind === "victory", content: big(t(lang, banner.kind), 40, 30) + mid(score, 62, 18, 0.9) };
			}
			case "win":
				return { look: l, animated: false, content: big(t(lang, banner.team === 1 ? "orangeWins" : "blueWins"), 45, 22) };
			case "paused":
				return { look: l, animated: false, content: big(t(lang, "paused"), 47, 32) };
			case "stat":
				return { look: l, animated: false, content: big(banner.label ?? "", 42, 24) + nameIn(banner.who ?? "", cx, 62, 13, 0.85) };
		}
	}

	// ---- idle states -------------------------------------------------------------------------------
	// A big headline may span the keys; the small line under it stays inside the middle key.
	const idleText = (title: string, sub: string, tint = "#ffffff") =>
		text(title, { x: cx, y: 38, size: 26, fill: tint, skew: -9, maxWidth: g.W - 30 }) + fitLine(sub, { x: cx, y: 58, size: 13, fill: COLORS.dim, skew: 0, maxWidth: g.slotW });

	if (!s.gameRunning) return { look: IDLE, animated: false, content: idleText(t(lang, "offlineTitle"), t(lang, "offlineSub")) };
	if (ctx.restartHint) {
		// [Stats API enabled] [RESTART GAME] [spinner] — one fact per key, the spinner shows the plugin is waiting.
		const spin = (Math.floor(now / 125) * 30) % 360;
		const arc = `<g transform="translate(${g.right} 36) rotate(${spin})"><path d="M0,-15 A15,15 0 1 1 -15,0" fill="none" stroke="${COLORS.gold}" stroke-width="4" stroke-linecap="round"/><polygon points="-22,-3 -8,-3 -15,8" fill="${COLORS.gold}"/></g>`;
		return {
			look: IDLE,
			animated: true,
			content:
				fitLine(t(lang, "restartA"), { x: g.left, y: 33, size: 11, fill: COLORS.dim, skew: 0, maxWidth: g.slotW }) +
				fitLine(t(lang, "restartB"), { x: g.left, y: 48, size: 11, fill: COLORS.dim, skew: 0, maxWidth: g.slotW }) +
				text(t(lang, "restartTitle"), { x: cx, y: 33, size: 17, fill: COLORS.gold, skew: -9, maxWidth: g.slotW }) +
				text(t(lang, "restartWord"), { x: cx, y: 56, size: 24, fill: COLORS.gold, skew: -9, maxWidth: g.slotW }) +
				arc,
		};
	}
	if (s.phase === "menu") return { look: IDLE, animated: false, content: idleText(t(lang, "menuTitle"), t(lang, "menuSub")) };

	const me = store.myStats();
	if (!me) return { look: IDLE, animated: false, content: idleText(t(lang, "live"), `${s.scores[0]}  :  ${s.scores[1]}`) };

	// Live and idle: one personal stat per key (goals / assists / saves).
	const labels = [stat(lang, "goals"), stat(lang, "assists"), stat(lang, "saves")];
	const values = [me.goals, me.assists, me.saves];
	let out = "";
	for (let i = 0; i < 3; i++) {
		const x = slotX(i);
		out += text(labels[i]!, { x, y: 15, size: 9, fill: COLORS.dim, maxWidth: g.slotW });
		out += text(String(values[i]), { x, y: 52, size: 34, fill: "#ffffff", skew: -9 });
	}
	return { look: IDLE, animated: false, content: out };
}

export function stat(lang: "pl" | "en", k: "goals" | "assists" | "saves"): string {
	const pl = { goals: "GOLE", assists: "ASYSTY", saves: "OBRONY" };
	const en = { goals: "GOALS", assists: "ASSISTS", saves: "SAVES" };
	return (lang === "pl" ? pl : en)[k];
}

/** Whether the banner currently shows something that moves (drives the hub's redraw rate). */
export function bannerIsAnimated(ctx: RenderCtx): boolean {
	return scene(ctx, ctx.store.activeBanner()).animated;
}

export function renderBannerSlice(ctx: RenderCtx, slice: number): string {
	const banner = ctx.store.activeBanner();
	const sc = scene(ctx, banner);
	const frame = Math.floor(ctx.now / 125);
	const age = banner ? ctx.now - banner.born : 9999;

	const flash = banner && age < 260 ? Math.max(0, 0.75 - age / 350) : 0;
	const drift = sc.animated ? frame * 4 : 0;

	const inner =
		linear("bg", sc.look.c1, sc.look.c2, false) +
		`<rect width="${W}" height="${H}" fill="url(#bg)"/>` +
		stripes(W, H, drift, banner ? 0.11 : 0.05, sc.look.stripe) +
		`<rect x="0" y="${H - 3}" width="${W}" height="3" fill="${sc.look.ink}" fill-opacity="0.35"/>` +
		sc.content +
		(flash > 0.02 ? `<rect width="${W}" height="${H}" fill="#ffffff" fill-opacity="${flash.toFixed(2)}"/>` : "");

	const clamped = Math.max(0, Math.min(2, Math.trunc(slice)));
	// Shift the scene instead of offsetting the root viewBox: a plain 0 0 72 72 viewport is understood by every renderer.
	return doc(`<g transform="translate(${-clamped * (KEY + KEY_GAP)} 0)">${inner}</g>`);
}

/** Whether the wide scene (an event, or a state that needs the whole strip) is what the touch strip shows right now. */
export function stripNeedsScene(ctx: RenderCtx): boolean {
	const s = ctx.store.state;
	if (ctx.store.activeBanner()) return true;
	return !s.gameRunning || ctx.restartHint || s.phase === "menu" || !ctx.store.myStats();
}

/** One 200×100 segment (0…3) of the Stream Deck + touch strip showing the same scene the three banner keys would. */
export function renderBannerStripSegment(ctx: RenderCtx, segment: number): string {
	const banner = ctx.store.activeBanner();
	const sc = scene(ctx, banner, STRIP_GEO);
	const frame = Math.floor(ctx.now / 125);
	const age = banner ? ctx.now - banner.born : 9999;
	const flash = banner && age < 260 ? Math.max(0, 0.75 - age / 350) : 0;
	const drift = sc.animated ? frame * 4 : 0;
	const inner =
		linear("bg", sc.look.c1, sc.look.c2, false) +
		`<rect width="${STRIP_GEO.W}" height="${H}" fill="url(#bg)"/>` +
		stripes(STRIP_GEO.W, H, drift, banner ? 0.11 : 0.05, sc.look.stripe) +
		`<rect x="0" y="${H - 3}" width="${STRIP_GEO.W}" height="3" fill="${sc.look.ink}" fill-opacity="0.35"/>` +
		sc.content +
		(flash > 0.02 ? `<rect width="${STRIP_GEO.W}" height="${H}" fill="#ffffff" fill-opacity="${flash.toFixed(2)}"/>` : "");
	const seg = Math.max(0, Math.min(STRIP_SEGMENT.count - 1, Math.trunc(segment)));
	const { width, height } = STRIP_SEGMENT;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g transform="translate(${-seg * width} 0) scale(${STRIP_K.toFixed(5)})">${inner}</g></svg>`;
}
