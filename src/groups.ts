import type { Assignment } from "./config.ts";
import { evaluateCondition } from "./expressions.ts";
import type { NormalizedParticipant } from "./types.ts";

export function evaluateGroups(
	participants: NormalizedParticipant[],
	assignments: Assignment[],
	mappings?: Map<string, Map<string, Record<string, string>>>,
) {
	const groups: Map<number, string[]> = new Map();

	for (const participant of participants) {
		if (!participant.attending) {
			continue;
		}

		// Make sure we set a group array for every participant, even if it's
		// empty so that we can remove participants from groups later if needed.
		const participantGroups = groups.get(participant.memberNumber) ?? [];
		groups.set(participant.memberNumber, participantGroups);

		for (const assignment of assignments) {
			const result = evaluateCondition(
				assignment.if,
				{ fee: participant.fee },
				{ answers: participant.answers },
				mappings,
			);

			const numberResult = result.number();
			const stringResult = result.coerceString();

			const ok =
				numberResult > 0 ||
				(stringResult && stringResult !== "false" && stringResult !== "0");

			if (ok) {
				participantGroups.push(...assignment.groups);

				for (const dynGroup of assignment.dynamicGroups ?? []) {
					const nameResult = evaluateCondition(
						dynGroup.nameExpression,
						{ fee: participant.fee },
						{ answers: participant.answers },
						mappings,
					);
					const name = nameResult.coerceString();
					if (name && name !== "false" && name !== "0") {
						participantGroups.push(`${dynGroup.parent}/${name}`);
					}
				}
			}
		}
	}

	return groups
		.entries()
		.map(([memberNumber, groups]) => ({
			memberNumber,
			groups,
		}))
		.toArray();
}
