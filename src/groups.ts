import type { Assignment } from "./config.ts";
import { evaluateCondition } from "./expressions.ts";
import type { NormalizedParticipant } from "./types.ts";

export function evaluateGroups(
	participants: NormalizedParticipant[],
	assignments: Assignment[],
) {
	const groups: Map<number, string[]> = new Map();

	for (const participant of participants) {
		for (const assignment of assignments) {
			const result = evaluateCondition(
				assignment.if,
				{
					fee: participant.fee,
				},
				{
					answers: participant.answers,
				},
			);

			const numberResult = result.number();
			const stringResult = result.coerceString();

			const ok =
				numberResult > 0 ||
				(stringResult && stringResult !== "false" && stringResult !== "0");

			if (ok) {
				const existingGroups = groups.get(participant.memberNumber) ?? [];
				groups.set(participant.memberNumber, [
					...existingGroups,
					...assignment.groups,
				]);
			}
		}
	}

	return groups.entries().map(([memberNumber, groups]) => ({
		memberNumber,
		groups,
	}));
}
