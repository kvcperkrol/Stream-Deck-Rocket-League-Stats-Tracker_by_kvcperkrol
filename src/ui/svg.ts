/**
 * Tiny SVG toolkit. The Stream Deck app renders key images with a conservative SVG engine, so everything
 * here sticks to gradients, paths, transforms and plain text — no filters, masks or CSS.
 */

export const FONT = "Bahnschrift, 'Segoe UI Semibold', 'Arial Narrow', Arial, sans-serif";

export const COLORS = {
	bg1: "#0b1024",
	bg2: "#171f45",
	line: "#2a3566",
	text: "#ffffff",
	dim: "#8c97c2",
	blue1: "#2f7dff",
	blue2: "#0a38a8",
	orange1: "#ff9a26",
	orange2: "#e04a00",
	red: "#ff3b5c",
	green: "#2bd576",
	gold: "#ffc531",
	ink: "#0b1024",
} as const;

export function esc(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
}

/** Wraps content in an SVG document; `viewBox` lets the banner render one 72px slice of a 216px scene. */
export function doc(inner: string, viewBox = "0 0 72 72"): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="${viewBox}">${inner}</svg>`;
}

export function linear(id: string, c1: string, c2: string, vertical = true): string {
	const dir = vertical ? 'x1="0" y1="0" x2="0" y2="1"' : 'x1="0" y1="0" x2="1" y2="1"';
	return `<defs><linearGradient id="${id}" ${dir}><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
}

/** Text width estimate for the (condensed, bold) UI font. Deliberately pessimistic so text never overflows a key. */
export function estimateWidth(text: string, size: number): number {
	return text.length * size * 0.6;
}

export function fitSize(text: string, maxWidth: number, size: number, minSize = 6): number {
	const w = estimateWidth(text, size);
	return w <= maxWidth ? size : Math.max(minSize, (size * maxWidth) / w);
}

export interface TextOpts {
	x?: number;
	y: number;
	size: number;
	fill?: string;
	anchor?: "start" | "middle" | "end";
	weight?: number | string;
	/** Horizontal skew in degrees; negative leans right, like the game's italic HUD lettering. */
	skew?: number;
	opacity?: number;
	/** Shrink the text so it fits into this many pixels. */
	maxWidth?: number;
}

export function text(content: string, o: TextOpts): string {
	const x = o.x ?? 36;
	const size = o.maxWidth ? fitSize(content, o.maxWidth, o.size) : o.size;
	const attrs = `font-family="${FONT}" font-size="${size.toFixed(1)}" font-weight="${o.weight ?? 700}" fill="${o.fill ?? COLORS.text}" text-anchor="${o.anchor ?? "middle"}"${
		o.opacity !== undefined ? ` fill-opacity="${o.opacity}"` : ""
	}`;
	if (o.skew) return `<g transform="translate(${x} ${o.y}) skewX(${o.skew})"><text x="0" y="0" ${attrs}>${esc(content)}</text></g>`;
	return `<text x="${x}" y="${o.y}" ${attrs}>${esc(content)}</text>`;
}

/** Slanted parallelogram stripes, the game's signature background texture. */
export function stripes(width: number, height: number, offset: number, opacity = 0.09, color = "#ffffff", period = 36, thick = 14): string {
	let out = "";
	const lean = height * 0.5;
	for (let x = -period * 2 + (offset % period); x < width + period; x += period) {
		out += `<polygon points="${x},${height} ${x + lean},0 ${x + lean + thick},0 ${x + thick},${height}" fill="${color}" fill-opacity="${opacity}"/>`;
	}
	return out;
}

export function svgDataUri(svg: string): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
