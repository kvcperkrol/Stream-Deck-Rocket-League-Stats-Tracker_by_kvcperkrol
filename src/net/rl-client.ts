import WebSocket from "ws";
import type { RLMessage } from "../core/types";
import { decodeFrame } from "./decode";

export interface RLClientOptions {
	port: () => number;
	onMessage: (msg: RLMessage) => void;
	onStatus: (connected: boolean) => void;
	log?: (line: string) => void;
	retryMs?: number;
}

/** Keeps a WebSocket open to the game's Stats API (127.0.0.1:WebPort) and reconnects until stopped. */
export class RLClient {
	private ws?: WebSocket;
	private timer?: NodeJS.Timeout;
	private stopped = true;
	private connected = false;

	constructor(private readonly opts: RLClientOptions) {}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.connect();
	}

	stop(): void {
		this.stopped = true;
		if (this.timer) clearTimeout(this.timer);
		this.timer = undefined;
		this.ws?.removeAllListeners();
		try {
			this.ws?.terminate();
		} catch {
			/* already closed */
		}
		this.ws = undefined;
		this.setConnected(false);
	}

	get isConnected(): boolean {
		return this.connected;
	}

	private setConnected(value: boolean): void {
		if (this.connected === value) return;
		this.connected = value;
		this.opts.onStatus(value);
	}

	private connect(): void {
		if (this.stopped) return;
		const port = this.opts.port();
		const ws = new WebSocket(`ws://127.0.0.1:${port}`, { handshakeTimeout: 3000 });
		this.ws = ws;

		ws.on("open", () => {
			this.opts.log?.(`connected to Stats API on :${port}`);
			this.setConnected(true);
		});
		ws.on("message", (raw) => this.parse(raw as Buffer));
		ws.on("error", () => {
			/* 'close' follows; nothing to add — the game simply is not listening yet */
		});
		ws.on("close", () => {
			if (this.ws === ws) this.ws = undefined;
			this.setConnected(false);
			this.schedule();
		});
	}

	private schedule(): void {
		if (this.stopped || this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.connect();
		}, this.opts.retryMs ?? 2000);
	}

	private parse(frame: Buffer): void {
		const msg = decodeFrame(frame);
		if (msg) this.opts.onMessage(msg);
		else this.opts.log?.(`unreadable frame: ${frame.toString("latin1").slice(0, 120)}`);
	}
}
