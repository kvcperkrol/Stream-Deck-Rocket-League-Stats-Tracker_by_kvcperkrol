import type { Banner, BannerKind } from "../core/match-store";
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
	if (estimateWidth(out, size) > maxWidth) out = out.slice(0, Math.max(1, Math.floor(maxWidth / (size * 0.6)) - 1)) + "…";
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
function scene(ctx: RenderCtx, banner: Banner | undefined): Scene {
	const { settings, store, now } = ctx;
	const lang = settings.lang;
	const s = store.state;
	const speed = (uu: number) => {
		const v = convertSpeed(uu, settings.units);
		return `${v.value} ${v.unit}`;
	};
	const cx = W / 2;

	// ---- transient event ---------------------------------------------------------------------------
	if (banner) {
		const l = look(banner, s);
		const age = now - banner.born;
		const pop = 1 + 0.22 * Math.max(0, 1 - age / 260);
		const centre = (inner: string) => `<g transform="translate(${cx} 36) scale(${pop.toFixed(3)}) translate(${-cx} -36)">${inner}</g>`;
		// Headline rule: a title either fits inside the middle key, or is long enough to span all three.
		// Anything in between would put half a glyph into a physical gap, so it is shrunk to the middle key.
		const MID_MAX = 58;
		const headlineSize = (str: string, base: number) => {
			const w = estimateWidth(str, base);
			if (w <= MID_MAX) return base;
			if (w <= 108) return fitSize(str, MID_MAX, base);
			return fitSize(str, W - 26, base);
		};
		const big = (str: string, y: number, base: number) => text(str, { x: cx, y, size: headlineSize(str, base), fill: l.ink, skew: -9 });
		const mid = (str: string, y: number, size: number, opacity = 1) => text(str, { x: cx, y, size, fill: l.ink, skew: -6, maxWidth: W - 12, opacity });
		/** A player name inside one key (see fitLine). */
		const nameIn = (str: string, x: number, y: number, size: number, opacity = 1) => fitLine(str, { x, y, size, fill: l.ink, opacity });
		const arrowRight = (x: number, y: number) => `<polygon points="${x},${y - 4.5} ${x + 8},${y} ${x},${y + 4.5}" fill="${l.ink}" fill-opacity="0.85"/>`;

		switch (banner.kind) {
			case "goal": {
				// One fact per key so nothing has to cross the physical gaps between keys:
				// [ball speed] [GOAL! + scorer] [assist or team]
				const sp = convertSpeed(banner.speedKmh ?? 0, settings.units);
				const left = keyX(0);
				const right = keyX(2);
				const teamName = t(lang, banner.team === 1 ? "orange" : "blue");
				return {
					look: l,
					animated: true,
					content: centre(
						text(sp.unit.toUpperCase(), { x: left, y: 15, size: 9.5, fill: l.ink, opacity: 0.8 }) +
							text(sp.value > 0 ? String(sp.value) : "—", { x: left, y: 46, size: 31, fill: l.ink, skew: -9, maxWidth: 56 }) +
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
						nameIn(banner.who ?? "?", keyX(0), 42, 15) +
							big(t(lang, "demo"), 42, 26) +
							nameIn(banner.other ?? "?", keyX(2), 42, 15, 0.85) +
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
					content: `<polygon points="${keyX(0) - 9},26 ${keyX(0) + 9},36 ${keyX(0) - 9},46" fill="${l.ink}" fill-opacity="${blink}"/>` + big(t(lang, "replay"), 47, 30),
				};
			}
			case "countdown": {
				const left = Math.max(1, Math.min(3, Math.ceil((3000 - age) / 1000)));
				return { look: l, animated: true, content: big(String(left), 52, 50) + text(t(lang, "kickoff"), { x: keyX(0), y: 42, size: 9, fill: l.ink, opacity: 0.75, maxWidth: 56 }) };
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
		text(title, { x: cx, y: 38, size: 26, fill: tint, skew: -9, maxWidth: W - 30 }) + fitLine(sub, { x: cx, y: 58, size: 13, fill: COLORS.dim, skew: 0 });

	if (!s.gameRunning) return { look: IDLE, animated: false, content: idleText(t(lang, "offlineTitle"), t(lang, "offlineSub")) };
	if (ctx.restartHint) {
		// [Stats API enabled] [RESTART GAME] [spinner] — one fact per key, the spinner shows the plugin is waiting.
		const spin = (Math.floor(now / 125) * 30) % 360;
		const arc = `<g transform="translate(${keyX(2)} 36) rotate(${spin})"><path d="M0,-15 A15,15 0 1 1 -15,0" fill="none" stroke="${COLORS.gold}" stroke-width="4" stroke-linecap="round"/><polygon points="-22,-3 -8,-3 -15,8" fill="${COLORS.gold}"/></g>`;
		return {
			look: IDLE,
			animated: true,
			content:
				fitLine(t(lang, "restartA"), { x: keyX(0), y: 33, size: 11, fill: COLORS.dim, skew: 0 }) +
				fitLine(t(lang, "restartB"), { x: keyX(0), y: 48, size: 11, fill: COLORS.dim, skew: 0 }) +
				text(t(lang, "restartTitle"), { x: cx, y: 33, size: 17, fill: COLORS.gold, skew: -9, maxWidth: 56 }) +
				text(t(lang, "restartWord"), { x: cx, y: 56, size: 24, fill: COLORS.gold, skew: -9, maxWidth: 56 }) +
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
		const x = keyX(i);
		out += text(labels[i]!, { x, y: 15, size: 9, fill: COLORS.dim, maxWidth: 56 });
		out += text(String(values[i]), { x, y: 52, size: 34, fill: "#ffffff", skew: -9 });
	}
	return { look: IDLE, animated: false, content: out };
}

function stat(lang: "pl" | "en", k: "goals" | "assists" | "saves"): string {
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
