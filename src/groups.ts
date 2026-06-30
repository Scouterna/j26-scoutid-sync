import type { Assignment } from "./config.ts";
import { buildAnswerIndex, evaluateCondition } from "./expressions.ts";
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

		const answerIndex = buildAnswerIndex(participant.answers);

		for (const assignment of assignments) {
			const result = evaluateCondition(
				assignment.if,
				{ fee: participant.fee, group_id: participant.groupId },
				{ answerIndex },
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
						{ fee: participant.fee, group_id: participant.groupId },
						{ answerIndex },
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

/**
 * The set of Keycloak group IDs this config is allowed to manage. Used to
 * scope adds/removals so that a run with one config never touches group
 * memberships that belong to a different config (e.g. when the same
 * Keycloak realm is synced from two configs on alternating schedules).
 */
export function getManagedGroupIds(
	assignments: Assignment[],
	groupNameToId: Map<string, string>,
): Set<string> {
	const managedGroupIds = new Set<string>();

	for (const assignment of assignments) {
		for (const groupName of assignment.groups) {
			const groupId = groupNameToId.get(groupName);
			if (groupId) {
				managedGroupIds.add(groupId);
			}
		}

		for (const dynGroup of assignment.dynamicGroups ?? []) {
			const prefix = `${dynGroup.parent}/`;
			for (const [name, id] of groupNameToId) {
				if (name === dynGroup.parent || name.startsWith(prefix)) {
					managedGroupIds.add(id);
				}
			}
		}
	}

	return managedGroupIds;
}
