import type { TierInfo } from "../core/ranks";
import { COLORS, esc, text } from "./svg";

/** Original rank badge — tier colour, ornaments grow with the rank; not the game's own artwork. */
export function emblem(tier: TierInfo, cx: number, cy: number, scale = 1, glyphText?: string): string {
	const id = `eg${tier.id}`;
	const wing = (dir: 1 | -1, spread: number) =>
		`<path d="M${dir * 15},-7 L${dir * (15 + spread)},${-14 - spread * 0.3} L${dir * (14 + spread * 0.8)},2 L${dir * 15},5 Z" fill="${tier.color}" fill-opacity="0.92"/>`;
	const wings = tier.rank >= 1 ? wing(1, 6 + tier.rank) + wing(-1, 6 + tier.rank) : "";
	const glow = tier.rank >= 7 ? `<circle cx="0" cy="0" r="25" fill="none" stroke="${tier.color}" stroke-width="1.6" stroke-opacity="0.55"/>` : "";

	let glyph: string;
	if (tier.rank === 8) {
		const pts = Array.from({ length: 10 }, (_, i) => {
			const r = i % 2 === 0 ? 10 : 4.4;
			const a = -Math.PI / 2 + (i * Math.PI) / 5;
			return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
		}).join(" ");
		glyph = `<polygon points="${pts}" fill="#ffffff"/>`;
	} else if (tier.rank === 0) {
		glyph = text(glyphText ?? "?", { x: 0, y: 6, size: 17, fill: tier.color });
	} else {
		glyph = text(tier.roman, { x: 0, y: 5.5, size: tier.roman.length > 2 ? 12 : 15, fill: tier.color, skew: -6 });
	}

	return (
		`<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tier.color}"/><stop offset="1" stop-color="${tier.dark}"/></linearGradient></defs>` +
		`<g transform="translate(${cx} ${cy}) scale(${scale})">${glow}${wings}` +
		`<path d="M0,-21 L18,-11 L18,9 L0,21 L-18,9 L-18,-11 Z" fill="url(#${id})" stroke="#ffffff" stroke-opacity="0.4" stroke-width="1"/>` +
		`<path d="M0,-15 L12.5,-8 L12.5,6.5 L0,15 L-12.5,6.5 L-12.5,-8 Z" fill="${COLORS.bg1}" stroke="${tier.color}" stroke-width="1.6"/>` +
		`${glyph}</g>`
	);
}

/** A rank icon supplied by the user, drawn where the emblem would be. */
export function iconBadge(dataUri: string, cx: number, cy: number, size = 48): string {
	return `<image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${dataUri}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** Small dot row: `n` blue dots, a separator, `n` orange dots — shows the team size of the current mode. */
export function teamDots(n: number, cx: number, y: number, left: string = COLORS.blue1, right: string = COLORS.orange1): string {
	const count = Math.max(1, Math.min(4, n));
	const gap = 9;
	const sepGap = 9;
	const total = count * 2 * gap + sepGap;
	let x = cx - total / 2 + gap / 2;
	let out = "";
	for (let i = 0; i < count; i++, x += gap) out += `<circle cx="${x}" cy="${y}" r="3" fill="${left}"/>`;
	x += sepGap;
	for (let i = 0; i < count; i++, x += gap) out += `<circle cx="${x}" cy="${y}" r="3" fill="${right}"/>`;
	return out;
}

export { esc };
