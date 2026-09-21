import { execFile } from "node:child_process";

export const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/** Round-trip time from ping.exe's output in any Windows language ("time=33ms", "time<1ms", "czas=33ms"). */
export function parsePingMs(output: string): number | undefined {
	const m = /[=<]\s*(\d+)\s*ms/i.exec(output);
	return m ? Math.max(1, Number(m[1])) : undefined;
}

/** Runs one ping and returns whatever it printed (ping exits non-zero on a lost packet; that is not an error here). */
function runPing(ip: string): Promise<string> {
	return new Promise((resolve) => {
		execFile("ping", ["-n", "1", "-w", "1500", ip], { windowsHide: true, timeout: 4000, encoding: "utf8" }, (_err, stdout, stderr) => resolve(`${stdout ?? ""}${stderr ?? ""}`));
	});
}

export interface PingState {
	/** The game server being measured, if a match is running. */
	target?: string;
	/** The latest result in ms; null = the packet was lost; undefined = nothing measured yet / no match. */
	ms?: number | null;
	/** Recent results, oldest first (null = lost). */
	history: (number | null)[];
}

/**
 * Live ping to the game server the running match is played on. Rocket League does not report ping anywhere (not in the Stats
 * API), but it logs the server it joins, and these servers answer ICMP — so the plugin measures the round trip itself, about
 * every two seconds. It is the network latency to the server, close to but not identical to the number the game shows.
 */
export class PingMonitor {
	private target?: string;
	private ms?: number | null;
	private history: (number | null)[] = [];
	private timer?: NodeJS.Timeout;
	private busy = false;

	constructor(
		private readonly run: (ip: string) => Promise<string> = runPing,
		private readonly active: () => boolean = () => true,
		private readonly intervalMs = 2000,
		private readonly maxSamples = 40,
	) {}

	get state(): PingState {
		return { target: this.target, ms: this.ms, history: [...this.history] };
	}

	/** Points the monitor at a server (a new match) or at nothing (the match ended). Only plain IPv4 addresses are accepted. */
	setTarget(ip: string | undefined): void {
		const next = ip && IPV4.test(ip) ? ip : undefined;
		if (next === this.target) return;
		this.target = next;
		this.ms = undefined;
		this.history = [];
	}

	start(): void {
		if (this.timer) return;
		this.timer = setInterval(() => void this.sample(), this.intervalMs);
	}

	stop(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = undefined;
	}

	/** One measurement; public for tests. */
	async sample(): Promise<void> {
		const ip = this.target;
		if (!ip || this.busy || !this.active()) return;
		this.busy = true;
		try {
			const ms = parsePingMs(await this.run(ip));
			if (this.target !== ip) return; // the match ended while the packet was on its way
			this.ms = ms ?? null;
			this.history = [...this.history, this.ms].slice(-this.maxSamples);
		} finally {
			this.busy = false;
		}
	}
}
