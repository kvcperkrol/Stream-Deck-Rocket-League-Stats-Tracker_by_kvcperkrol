import type { RankEntry, RankGroup } from "./types";

export interface TierInfo {
	id: number;
	/** Full English name, e.g. "Diamond II". */
	name: string;
	/** Family name that fits on a 72px key, e.g. "DIAMOND". */
	family: string;
	/** Roman numeral shown inside the badge ("" for tiers without one). */
	roman: string;
	/** Bright + dark tint used by the emblem. */
	color: string;
	dark: string;
	/** 0 = unranked, 1 = bronze … 7 = grand champion, 8 = SSL — used for badge ornaments. */
	rank: number;
}

const FAMILIES: { name: string; short: string; color: string; dark: string }[] = [
	{ name: "Bronze", short: "BRONZE", color: "#d98a4a", dark: "#6b3a14" },
	{ name: "Silver", short: "SILVER", color: "#d5dbe6", dark: "#69748a" },
	{ name: "Gold", short: "GOLD", color: "#ffc531", dark: "#8a5a00" },
	{ name: "Platinum", short: "PLATINUM", color: "#5de0ee", dark: "#0c6a7a" },
	{ name: "Diamond", short: "DIAMOND", color: "#4c93ff", dark: "#12358f" },
	{ name: "Champion", short: "CHAMPION", color: "#b565ff", dark: "#4a1a8c" },
	{ name: "Grand Champion", short: "GRAND CH.", color: "#ff4b55", dark: "#7a0f1f" },
];

const ROMAN = ["I", "II", "III"];

export const TIERS: TierInfo[] = (() => {
	const list: TierInfo[] = [{ id: 0, name: "Unranked", family: "UNRANKED", roman: "", color: "#7b869f", dark: "#2c344a", rank: 0 }];
	FAMILIES.forEach((f, fi) => {
		ROMAN.forEach((r, ri) => {
			list.push({ id: 1 + fi * 3 + ri, name: `${f.name} ${r}`, family: f.short, roman: r, color: f.color, dark: f.dark, rank: fi + 1 });
		});
	});
	list.push({ id: 22, name: "Supersonic Legend", family: "SSL", roman: "", color: "#ffffff", dark: "#7c8cff", rank: 8 });
	return list;
})();

export function tierInfo(id: number | undefined): TierInfo {
	const t = TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.trunc(id ?? 0)))];
	return t ?? TIERS[0]!;
}

export const RANK_GROUPS: { id: RankGroup; en: string; pl: string }[] = [
	{ id: "duel", en: "Duel 1v1", pl: "Duel 1v1" },
	{ id: "doubles", en: "Doubles 2v2", pl: "Doubles 2v2" },
	{ id: "solo", en: "Solo Standard 3v3", pl: "Solo Standard 3v3" },
	{ id: "standard", en: "Standard 3v3", pl: "Standard 3v3" },
	{ id: "hoops", en: "Hoops", pl: "Hoops" },
	{ id: "rumble", en: "Rumble", pl: "Rumble" },
	{ id: "dropshot", en: "Dropshot", pl: "Dropshot" },
	{ id: "snowday", en: "Snow Day", pl: "Snow Day" },
];

export const EMPTY_RANK: RankEntry = { tier: 0, div: 1, mmr: null };

export function rankFor(ranks: Partial<Record<RankGroup, RankEntry>>, group: RankGroup | undefined): RankEntry {
	if (!group) return EMPTY_RANK;
	return ranks[group] ?? EMPTY_RANK;
}
