import type { Assignment } from "./config.ts";
import { evaluateCondition } from "./expressions.ts";
import type { NormalizedParticipant } from "./types.ts";

export function evaluateGroups(
	participants: NormalizedParticipant[],
	assignments: Assignment[],
) {
	const groups: Map<number, string[]> = new Map();

	for (const participant of participants) {
		// For participants that are not attending, we want to make sure they are
		// not in any groups. This is important since it may be that they were
		// unregistered after an earlier group assignment, and we don't want them to
		// keep their groups in that case.
		if (!participant.attending) {
			groups.set(participant.memberNumber, []);
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
			);

			const numberResult = result.number();
			const stringResult = result.coerceString();

			console.log(participant.memberNumber, numberResult, stringResult);

			const ok =
				numberResult > 0 ||
				(stringResult && stringResult !== "false" && stringResult !== "0");

			if (ok) {
				participantGroups.push(...assignment.groups);
			}
		}
	}

	return groups.entries().map(([memberNumber, groups]) => ({
		memberNumber,
		groups,
	}));
}
