import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const STATS_SECTION = "TAGame.MatchStatsExporter_TA";
export const DEFAULT_PORT = 49123;
export const DEFAULT_WEB_PORT = 49124;

export interface IniWanted {
	/** UpdateState packets per second to enable when the game has the feature switched off. */
	packetRate: number;
}

export interface PatchedText {
	text: string;
	changed: boolean;
	packetRate: number;
	port: number;
	webPort: number;
}

/**
 * Makes sure `[TAGame.MatchStatsExporter_TA]` enables the Stats API. Existing user choices win: a rate that is
 * already above zero and a non-zero port are left alone. Comments, other sections and the line ending style
 * are preserved.
 */
export function patchIniText(source: string, wanted: IniWanted): PatchedText {
	const eol = source.includes("\r\n") || !source.includes("\n") ? "\r\n" : "\n";
	const lines = source.length ? source.split(/\r?\n/) : [];

	let start = lines.findIndex((l) => l.trim().toLowerCase() === `[${STATS_SECTION}]`.toLowerCase());
	if (start === -1) {
		if (lines.length && lines[lines.length - 1]!.trim() !== "") lines.push("");
		lines.push(`[${STATS_SECTION}]`);
		start = lines.length - 1;
	}
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^\s*\[.+\]\s*$/.test(lines[i]!)) {
			end = i;
			break;
		}
	}

	let changed = false;
	const read = (key: string): { index: number; value: number | undefined } => {
		const re = new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`, "i");
		for (let i = start + 1; i < end; i++) {
			const m = re.exec(lines[i]!);
			if (m) {
				const n = Number(m[1]);
				return { index: i, value: Number.isFinite(n) ? n : undefined };
			}
		}
		return { index: -1, value: undefined };
	};
	const write = (key: string, value: number): void => {
		const { index } = read(key);
		const line = `${key}=${value}`;
		if (index >= 0) {
			if (lines[index]!.trim() !== line) {
				lines[index] = line;
				changed = true;
			}
		} else {
			lines.splice(end, 0, line);
			end++;
			changed = true;
		}
	};

	const port = read("Port").value;
	const webPort = read("WebPort").value;
	const rate = read("PacketSendRate").value;

	const finalRate = rate !== undefined && rate > 0 ? rate : wanted.packetRate;
	const finalWeb = webPort !== undefined && webPort > 0 ? webPort : DEFAULT_WEB_PORT;
	const finalPort = port !== undefined ? port : DEFAULT_PORT;

	if (rate === undefined || rate <= 0) write("PacketSendRate", finalRate);
	if (webPort === undefined || webPort <= 0) write("WebPort", finalWeb);
	if (port === undefined) write("Port", finalPort);

	return { text: lines.join(eol), changed, packetRate: finalRate, port: finalPort, webPort: finalWeb };
}

function decode(buf: Buffer): { text: string; encoding: "utf8" | "utf8bom" | "utf16le" } {
	if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: buf.subarray(2).toString("utf16le"), encoding: "utf16le" };
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: buf.subarray(3).toString("utf8"), encoding: "utf8bom" };
	return { text: buf.toString("utf8"), encoding: "utf8" };
}

function encode(text: string, encoding: "utf8" | "utf8bom" | "utf16le"): Buffer {
	if (encoding === "utf16le") return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]);
	if (encoding === "utf8bom") return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, "utf8")]);
	return Buffer.from(text, "utf8");
}

export type IniState = "ok" | "changed" | "not-found" | "error";

export interface IniResult {
	state: IniState;
	installDir?: string;
	files: string[];
	webPort: number;
	packetRate: number;
	message?: string;
}

/** Patches TAStatsAPI.ini (when present) and DefaultStatsAPI.ini under `<install>\TAGame\Config`. */
export function patchStatsIni(installDir: string, wanted: IniWanted): IniResult {
	const cfg = path.join(installDir, "TAGame", "Config");
	const candidates = ["TAStatsAPI.ini", "DefaultStatsAPI.ini"].map((f) => path.join(cfg, f)).filter((f) => fs.existsSync(f));
	const result: IniResult = { state: "ok", installDir, files: [], webPort: DEFAULT_WEB_PORT, packetRate: wanted.packetRate };

	if (candidates.length === 0) {
		if (!fs.existsSync(cfg)) return { ...result, state: "not-found", message: `No TAGame\\Config folder in ${installDir}` };
		// Neither file exists: create the user-level one the game reads first.
		const file = path.join(cfg, "TAStatsAPI.ini");
		try {
			const patched = patchIniText("", wanted);
			fs.writeFileSync(file, patched.text + "\r\n", "utf8");
			return { ...result, state: "changed", files: [file], webPort: patched.webPort, packetRate: patched.packetRate };
		} catch (e) {
			return { ...result, state: "error", message: String((e as Error).message ?? e) };
		}
	}

	try {
		for (const file of candidates) {
			const raw = fs.readFileSync(file);
			const { text, encoding } = decode(raw);
			const patched = patchIniText(text, wanted);
			result.webPort = patched.webPort;
			result.packetRate = patched.packetRate;
			result.files.push(file);
			if (!patched.changed) continue;
			const backup = `${file}.rlhud.bak`;
			if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
			fs.writeFileSync(file, encode(patched.text, encoding));
			result.state = "changed";
		}
		return result;
	} catch (e) {
		return { ...result, state: "error", message: String((e as Error).message ?? e) };
	}
}

// ---- install detection -------------------------------------------------------------------------------

function isInstall(dir: string | undefined): dir is string {
	return !!dir && fs.existsSync(path.join(dir, "TAGame", "Config"));
}

function epicInstalls(): string[] {
	const out: string[] = [];
	const root = path.join(process.env.PROGRAMDATA ?? "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
	try {
		for (const f of fs.readdirSync(root)) {
			if (!f.endsWith(".item")) continue;
			try {
				const item = JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
				if (/rocket\s*league/i.test(String(item.DisplayName ?? "")) && item.InstallLocation) out.push(path.normalize(item.InstallLocation));
			} catch {
				/* unreadable manifest — skip */
			}
		}
	} catch {
		/* Epic not installed */
	}
	return out;
}

function steamInstalls(): string[] {
	const roots = new Set<string>();
	try {
		const raw = execFileSync("reg", ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"], { encoding: "utf8", windowsHide: true });
		const m = /SteamPath\s+REG_SZ\s+(.+)/i.exec(raw);
		if (m) roots.add(path.normalize(m[1]!.trim()));
	} catch {
		/* no Steam */
	}
	roots.add("C:\\Program Files (x86)\\Steam");

	const out: string[] = [];
	for (const root of roots) {
		out.push(path.join(root, "steamapps", "common", "rocketleague"));
		try {
			const vdf = fs.readFileSync(path.join(root, "steamapps", "libraryfolders.vdf"), "utf8");
			for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
				out.push(path.join(m[1]!.replace(/\\\\/g, "\\"), "steamapps", "common", "rocketleague"));
			}
		} catch {
			/* no library file */
		}
	}
	return out;
}

/**
 * Every Rocket League installation we can find, most reliable source first.
 * RLHUD_ONLY_MANUAL_INSTALL=1 restricts this to the manually configured folder (used by the end-to-end test so it never
 * touches a real installation).
 */
export function findInstallDirs(manual?: string): string[] {
	if (process.env.RLHUD_ONLY_MANUAL_INSTALL === "1") return isInstall(manual) ? [path.normalize(manual)] : [];
	const guesses = [
		manual,
		...epicInstalls(),
		...steamInstalls(),
		"C:\\Program Files\\Epic Games\\rocketleague",
		"C:\\Program Files (x86)\\Epic Games\\rocketleague",
		"D:\\Program Files\\Epic Games\\rocketleague",
	];
	return [...new Set(guesses.filter(isInstall).map((d) => path.normalize(d)))];
}
