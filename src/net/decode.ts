import type { RLMessage } from "../core/types";

/**
 * What the real game sends differs from its documentation in two ways (found by recording a live game):
 *
 *  1. `Data` is a JSON *string* (`{"Event":"GoalScored","Data":"{\"GoalSpeed\":57.4,…}"}`), not an object.
 *  2. Text is not always valid UTF-8: localised team names ("Pomarańczowi") arrive in the Windows ANSI code page
 *     (windows-1250), while other strings may be UTF-8.
 *
 * So a frame is read byte-for-byte (latin1), both JSON layers are parsed, and every string is then re-decoded on its own:
 * UTF-8 when it is valid UTF-8, windows-1250 otherwise.
 */

const cp1250 = (() => {
	try {
		return new TextDecoder("windows-1250");
	} catch {
		return undefined; // Node built without full ICU: fall back to latin1
	}
})();
const utf8 = new TextDecoder("utf-8", { fatal: true });

export function fixString(s: string): string {
	let high = false;
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c > 0xff) return s; // already real Unicode (came from a \uXXXX escape) — leave alone
		if (c > 0x7f) high = true;
	}
	if (!high) return s;
	const bytes = Buffer.from(s, "latin1");
	try {
		return utf8.decode(bytes);
	} catch {
		return cp1250 ? cp1250.decode(bytes) : s;
	}
}

function fixDeep(v: unknown): unknown {
	if (typeof v === "string") return fixString(v);
	if (Array.isArray(v)) return v.map(fixDeep);
	if (v && typeof v === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(v)) out[k] = fixDeep(val);
		return out;
	}
	return v;
}

/** Turns one raw WebSocket frame into a message with an object `Data`, or `undefined` when it is not one. */
export function decodeFrame(frame: Buffer | string): RLMessage | undefined {
	try {
		const text = typeof frame === "string" ? frame : frame.toString("latin1");
		const outer = JSON.parse(text) as { Event?: unknown; Data?: unknown };
		if (!outer || typeof outer.Event !== "string") return undefined;
		let data: unknown = outer.Data;
		if (typeof data === "string") data = data.trim() === "" ? {} : JSON.parse(data);
		return { Event: fixString(outer.Event), Data: fixDeep(data ?? {}) };
	} catch {
		return undefined;
	}
}
