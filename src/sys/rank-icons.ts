import fs from "node:fs";
import path from "node:path";
import { TIERS } from "../core/ranks";

/** Icons larger than this are ignored (they are embedded into every rank key image). */
const MAX_BYTES = 200 * 1024;
/** How long a lookup (found or not) is trusted before the folder is looked at again, so dropping in a file needs no restart. */
const TTL_MS = 5_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * File names accepted for a tier, in order of preference: `diamond-2.png`, `grand-champion-3.png`, `supersonic-legend.png`,
 * `unranked.png`, or simply the tier number (`14.png`).
 */
export function iconFileNames(tierId: number): string[] {
	const tier = TIERS[tierId];
	if (!tier) return [];
	const names: string[] = [];
	const slug = tier.name
		.toLowerCase()
		.replace(/\s+(iii|ii|i)$/, (_m, r: string) => `-${r.length}`)
		.replace(/\s+/g, "-");
	names.push(`${slug}.png`);
	if (tier.rank === 8) names.push("ssl.png");
	names.push(`${tierId}.png`);
	return names;
}

/**
 * Optional rank icons the user put into a folder. The plugin does not ship the game's rank artwork (it belongs to Psyonix);
 * anything found here is used instead of the built-in emblem, on that computer only.
 */
export class RankIcons {
	private readonly cache = new Map<number, { at: number; uri?: string }>();

	constructor(
		readonly dir: string,
		private readonly now: () => number = Date.now,
	) {}

	/** Creates the folder so the user can find it. Failure is harmless. */
	ensureDir(): void {
		try {
			fs.mkdirSync(this.dir, { recursive: true });
		} catch {
			/* not writable: the built-in emblems are used */
		}
	}

	/** A `data:` URI for the tier's icon, or undefined when there is none (or it is not a small, valid PNG). */
	get(tierId: number): string | undefined {
		const hit = this.cache.get(tierId);
		const t = this.now();
		if (hit && t - hit.at < TTL_MS) return hit.uri;
		const uri = this.read(tierId);
		this.cache.set(tierId, { at: t, uri });
		return uri;
	}

	/** How many of the 23 tiers currently have an icon. */
	count(): number {
		let n = 0;
		for (const t of TIERS) if (this.get(t.id)) n++;
		return n;
	}

	private read(tierId: number): string | undefined {
		for (const name of iconFileNames(tierId)) {
			try {
				const file = path.join(this.dir, name);
				const st = fs.statSync(file);
				if (!st.isFile() || st.size > MAX_BYTES || st.size < PNG_MAGIC.length) continue;
				const buf = fs.readFileSync(file);
				if (!buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) continue;
				return `data:image/png;base64,${buf.toString("base64")}`;
			} catch {
				/* missing or unreadable: try the next name */
			}
		}
		return undefined;
	}
}
