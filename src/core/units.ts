import type { Units } from "./types";

/**
 * The game's Stats API reports speeds in km/h already — verified on a live capture: the car's top speed reads 82.8 with
 * `bSupersonic` set, which is 2300 uu/s × 0.036. (The published documentation says "Unreal Units/second"; it is wrong.)
 */
export function convertSpeed(kmh: number, units: Units): { value: number; unit: string } {
	const v = Math.max(0, Number.isFinite(kmh) ? kmh : 0);
	switch (units) {
		case "mph":
			return { value: Math.round(v * 0.621371), unit: "mph" };
		case "uu":
			return { value: Math.round(v / 0.036), unit: "uu/s" };
		default:
			return { value: Math.round(v), unit: "km/h" };
	}
}

/** m:ss for the game clock. */
export function formatClock(totalSeconds: number): string {
	const s = Math.max(0, Math.floor(totalSeconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
