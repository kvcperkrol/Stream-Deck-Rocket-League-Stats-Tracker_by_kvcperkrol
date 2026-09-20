import fs from "node:fs";
import path from "node:path";
import type { RLMessage } from "../core/types";

/**
 * A small, local, anonymised log of what the Stats API sends, so a problem seen in a real match can be analysed afterwards
 * instead of guessed at. Nothing leaves the computer.
 *
 *  - Other players are replaced by P2, P3 … (names and ids); only the local player keeps their real name and id.
 *  - UpdateState is thinned to one packet every half second; every other event is kept.
 *  - The file is capped (two files of at most `maxBytes`), oldest data is dropped.
 */
export class MatchRecorder {
	private readonly names = new Map<string, string>();
	private lastUpdateAt = 0;
	private bytes = 0;
	private counter = 1;

	constructor(
		private readonly file: string,
		private local: { name: string; id: string } | undefined,
		private readonly now: () => number = Date.now,
		private readonly maxBytes = 3_000_000,
	) {
		try {
			this.bytes = fs.statSync(file).size;
		} catch {
			this.bytes = 0;
		}
	}

	setLocal(local: { name: string; id: string } | undefined): void {
		this.local = local;
	}

	private alias(value: string): string {
		if (this.local && (value === this.local.name || value.toLowerCase() === this.local.id.toLowerCase())) return value;
		let a = this.names.get(value);
		if (!a) {
			a = `P${++this.counter}`;
			this.names.set(value, a);
		}
		return a;
	}

	/** Copies `v`, replacing every player name / id it contains. */
	private scrub(v: unknown, key = ""): unknown {
		if (typeof v === "string") return /(^|[a-z])Name$|^PrimaryId$|^Name$|^PlayerName$/.test(key) ? this.alias(v) : v;
		if (Array.isArray(v)) return v.map((x) => this.scrub(x, key));
		if (v && typeof v === "object") {
			const out: Record<string, unknown> = {};
			for (const [k, val] of Object.entries(v)) out[k] = k === "Loadout" ? "…" : this.scrub(val, k);
			return out;
		}
		return v;
	}

	record(msg: RLMessage): void {
		const t = this.now();
		if (msg.Event === "UpdateState") {
			if (t - this.lastUpdateAt < 500) return;
			this.lastUpdateAt = t;
		}
		const line = JSON.stringify({ t, Event: msg.Event, Data: this.scrub(msg.Data) }) + "\n";
		try {
			fs.mkdirSync(path.dirname(this.file), { recursive: true });
			if (this.bytes + line.length > this.maxBytes) {
				fs.rmSync(`${this.file}.1`, { force: true });
				if (fs.existsSync(this.file)) fs.renameSync(this.file, `${this.file}.1`);
				this.bytes = 0;
			}
			fs.appendFileSync(this.file, line);
			this.bytes += line.length;
		} catch {
			/* diagnostics must never disturb the deck */
		}
	}
}
