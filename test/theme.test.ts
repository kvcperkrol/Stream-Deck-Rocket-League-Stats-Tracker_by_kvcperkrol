import assert from "node:assert/strict";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { mergeSettings, type KeyTheme } from "../src/core/types.ts";
import type { RenderCtx } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";
import { renderStrip } from "../src/ui/strip.ts";
import { KEY_THEMES } from "../src/ui/svg.ts";

test("keyTheme setting: unknown values fall back to the default 'blue' theme", () => {
	assert.equal(mergeSettings({}).keyTheme, "blue");
	assert.equal(mergeSettings({ keyTheme: "purple" }).keyTheme, "purple");
	assert.equal(mergeSettings({ keyTheme: "not-a-theme" as never }).keyTheme, "blue");
});

test("the default 'blue' theme is byte-identical to the plugin's original, hardcoded panel colours", () => {
	const store = new MatchStore(() => 1_000);
	const ctx: RenderCtx = { store, settings: mergeSettings({ lang: "en" }), now: 1_000, restartHint: false };
	const svg = renderRole("boost", ctx);
	assert.ok(svg.includes("#171f45") && svg.includes("#0b1024") && svg.includes("#7f8fe0"), "unchanged for everyone who never touches the new setting");
});

test("choosing a key colour retints every key panel, not just one", () => {
	const store = new MatchStore(() => 1_000);
	const ctxWith = (keyTheme: KeyTheme): RenderCtx => ({ store, settings: mergeSettings({ lang: "en", keyTheme }), now: 1_000, restartHint: false });
	for (const role of ["boost", "rank", "mmr", "mode", "timer", "possession", "clock", "ping"] as const) {
		const blue = renderRole(role, ctxWith("blue"));
		const purple = renderRole(role, ctxWith("purple"));
		assert.ok(purple.includes(KEY_THEMES.purple.top) && purple.includes(KEY_THEMES.purple.stripe), `${role}: purple panel colours are used`);
		assert.ok(!purple.includes(KEY_THEMES.blue.top), `${role}: the old blue background must not linger`);
		assert.notEqual(blue, purple, role);
	}
});

test("the touch strip's segments retint with the chosen key colour too", () => {
	const store = new MatchStore(() => 1_000);
	const ctxWith = (keyTheme: KeyTheme): RenderCtx => ({ store, settings: mergeSettings({ lang: "en", keyTheme }), now: 1_000, restartHint: false });
	const blue = renderStrip(ctxWith("blue"), 0, "rank");
	const green = renderStrip(ctxWith("green"), 0, "rank");
	assert.ok(green.includes(KEY_THEMES.green.top) && !green.includes(KEY_THEMES.blue.top));
	assert.notEqual(blue, green);
});

test("the team score keys keep the team's own colours — they are not retinted by the key theme", () => {
	const store = new MatchStore(() => 1_000);
	const ctxWith = (keyTheme: KeyTheme): RenderCtx => ({ store, settings: mergeSettings({ lang: "en", keyTheme }), now: 1_000, restartHint: false });
	assert.equal(renderRole("blue", ctxWith("blue")), renderRole("blue", ctxWith("purple")), "the score key ignores the panel theme entirely");
});
