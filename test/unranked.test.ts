import assert from "node:assert/strict";
import test from "node:test";
import { MatchStore } from "../src/core/match-store.ts";
import { t } from "../src/core/i18n.ts";
import { DEFAULT_SETTINGS, mergeSettings } from "../src/core/types.ts";
import type { AutoMmr, RenderCtx } from "../src/ui/context.ts";
import { renderRole } from "../src/ui/keys.ts";

/** A 2v2 match on the given playlist; the ranks below make Diamond II the user's doubles rank. */
function inMatch(playlist: number, arena = "Stadium_P") {
	const store = new MatchStore(() => 5_000);
	store.setGameRunning(true);
	store.setConnected(true);
	const p = (name: string, team: number) => ({ Name: name, PrimaryId: `Epic|${name}|0`, TeamNum: team, Score: 0, Goals: 0, Shots: 0, Assists: 0, Saves: 0, Touches: 0, Demos: 0 });
	store.handle({
		Event: "UpdateState",
		Data: {
			MatchGuid: "G",
			Players: [p("a", 0), p("b", 0), p("c", 1), p("d", 1)],
			Game: { Teams: [{ Name: "Blue", TeamNum: 0, Score: 0 }, { Name: "Orange", TeamNum: 1, Score: 0 }], PlaylistId: playlist, TimeSeconds: 200, bOvertime: false, Ball: { Speed: 0, TeamNum: 255 }, bReplay: false, Arena: arena, bHasTarget: false },
		},
	});
	return store;
}

const ranks = { doubles: { tier: 14, div: 2, mmr: 1247 } }; // Diamond II
const ctx = (store: MatchStore, lang: "en" | "pl" = "en", autoMmr?: Record<number, AutoMmr>): RenderCtx => ({
	store,
	settings: mergeSettings({ lang, ranks }),
	now: 5_000,
	restartHint: false,
	autoMmr,
});

test("English is the default language, and both languages can be chosen", () => {
	assert.equal(DEFAULT_SETTINGS.lang, "en");
	assert.equal(mergeSettings({}).lang, "en");
	assert.equal(mergeSettings({ lang: "pl" }).lang, "pl");
	assert.equal(mergeSettings({ lang: "en" }).lang, "en");
	assert.equal(mergeSettings({ lang: "xx" as never }).lang, "en", "an unknown value falls back to English");
	assert.equal(t("en", "unranked"), "UNRANKED");
	assert.equal(t("pl", "unranked"), "NIERANKINGOWY");
});

test("a casual match does not show a rank — it says UNRANKED, even though the same-size ranked mode has a rank", () => {
	const store = inMatch(2); // casual doubles
	const rank = renderRole("rank", ctx(store));
	assert.ok(rank.includes("UNRANKED"), "the rank key says unranked");
	assert.ok(rank.includes("DOUBLES"), "and names the mode");
	assert.ok(!rank.includes("DIAMOND"), "it must not borrow the ranked doubles rank");
	const mode = renderRole("mode", ctx(store));
	assert.ok(mode.includes("UNRANKED") && !mode.includes(">RANKED<"), "the mode key says unranked too");
});

test("a ranked match shows the rank and RANKED", () => {
	const store = inMatch(11);
	const rank = renderRole("rank", ctx(store));
	assert.ok(rank.includes("DIAMOND") && !rank.includes("UNRANKED"));
	assert.ok(renderRole("mode", ctx(store)).includes("RANKED"));
});

test("a ranked mode without a rank entered asks for one instead of pretending to be casual", () => {
	const store = inMatch(11);
	const c = ctx(store);
	c.settings = mergeSettings({});
	const rank = renderRole("rank", c);
	assert.ok(rank.includes("SET RANK") && !rank.includes("UNRANKED"));
});

test("free play and private matches are unranked as well", () => {
	for (const id of [9, 6]) assert.ok(renderRole("rank", ctx(inMatch(id))).includes("UNRANKED"), `playlist ${id}`);
	// an unknown playlist inferred from the team size is unranked, not a ranked group
	assert.ok(renderRole("rank", ctx(inMatch(63, "Outlaw_Oasis_P"))).includes("UNRANKED"));
});

test("MMR: a casual match uses the casual MMR from the log, never the value typed for the ranked mode", () => {
	const store = inMatch(2);
	const casual = renderRole("mmr", ctx(store, "en", { 2: { mmr: 1048, at: "t", delta: 9 } }));
	assert.ok(casual.includes("CASUAL MMR") && casual.includes("1048") && casual.includes("+9"));
	const none = renderRole("mmr", ctx(store));
	assert.ok(!none.includes("1247"), "the typed ranked MMR is not shown for casual play");
	assert.ok(!none.includes("CASUAL MMR"), "no value, so just a dash under a plain MMR label");
	const ranked = renderRole("mmr", ctx(inMatch(11)));
	assert.ok(ranked.includes("1247") && !ranked.includes("CASUAL"), "ranked still falls back to the typed value");
});

test("the Polish texts exist for the unranked keys", () => {
	const store = inMatch(2);
	assert.ok(renderRole("rank", ctx(store, "pl")).includes("NIERANKINGOWY"));
	assert.ok(renderRole("mode", ctx(store, "pl")).includes("NIERANKINGOWY"));
});
