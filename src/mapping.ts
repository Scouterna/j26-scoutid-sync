import { readFile } from "node:fs/promises";
import type { Assignment } from "./config.ts";

/**
 * Load a CSV file and return a lookup table keyed by the first column.
 * The first row must be a header. Every subsequent row becomes a record
 * whose keys are the column names and whose values are the cell strings.
 *
 * Example CSV (kårid,bynummer,stadsdel):
 *   12345 → { kårid: "12345", bynummer: "1", stadsdel: "Södermalm" }
 */
/** Scan all expressions in assignments and return every filename used in lookup(). */
export function extractLookupFiles(assignments: Assignment[]): Set<string> {
	const files = new Set<string>();
	const pattern = /lookup\(\s*['"]([^'"]+)['"]/g;

	for (const assignment of assignments) {
		for (const match of assignment.if.matchAll(pattern)) {
			files.add(match[1]);
		}
		for (const dynGroup of assignment.dynamicGroups ?? []) {
			for (const match of dynGroup.nameExpression.matchAll(pattern)) {
				files.add(match[1]);
			}
		}
	}

	return files;
}

export async function loadMappings(
	csvPath: string,
): Promise<Map<string, Record<string, string>>> {
	const text = await readFile(csvPath, "utf-8");
	const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

	if (lines.length === 0) {
		return new Map();
	}

	const headers = lines[0].split(",").map((h) => h.trim());
	const map = new Map<string, Record<string, string>>();

	for (const line of lines.slice(1)) {
		const cells = line.split(",").map((c) => c.trim());
		const record: Record<string, string> = {};
		for (let i = 0; i < headers.length; i++) {
			record[headers[i]] = cells[i] ?? "";
		}
		const key = cells[0];
		if (key) {
			map.set(key, record);
		}
	}

	return map;
}
