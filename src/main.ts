import pLimit from "p-limit";
import { loadConfig } from "./config.ts";
import { env } from "./env.ts";
import { evaluateGroups } from "./groups.ts";
import { addUserToGroup, createUser, removeUserFromGroup } from "./keycloak.ts";
import { getKeycloakState } from "./steps/getKeycloakState.ts";
import { getScoutnetState } from "./steps/getScoutnetState.ts";

const { CACHE_MODE } = env;

const config = await loadConfig("config.yml");

let start = performance.now();

const keycloakState = await getKeycloakState();
const scoutnetState = await getScoutnetState();

const groupAssignments = await evaluateGroups(
	scoutnetState.participants,
	config.assignments,
);

console.log(`Data loading took ${(performance.now() - start).toFixed(2)}ms`);

let createdUsers = 0;
let addedToGroups = 0;
let removedFromGroups = 0;

const writeLimit = pLimit(5);

const total = groupAssignments.length;
let processed = 0;
console.log(`Syncing ${total} participants...`);

start = performance.now();
await Promise.all(
	groupAssignments.map((assignment) =>
		writeLimit(async () => {
			const username = `scoutnet|${assignment.memberNumber}`;
			const user = keycloakState.users.find((u) => u.username === username);
			let userId = user?.id;

			if (!user) {
				createdUsers++;
				if (CACHE_MODE === "read") {
					console.warn(
						`SKIP: User ${username} would be created in Keycloak if not in read cache mode.`,
					);
					processed++;
					return;
				}
				userId = await createUser(username);
			}

			if (!userId) {
				// Just here for type safety
				throw new Error(`User ID for ${username} is undefined after creation`);
			}

			const currentGroupIds = keycloakState.groupMemberships.get(userId) ?? [];

			const targetGroupIds = assignment.groups.map((groupName) => {
				const groupId = keycloakState.groupNameToId.get(groupName);
				if (!groupId) {
					throw new Error(`Group "${groupName}" not found in Keycloak`);
				}
				return groupId;
			});

			const groupsToLeave = currentGroupIds.filter(
				(groupId) => !targetGroupIds.includes(groupId),
			);
			const groupsToJoin = targetGroupIds.filter(
				(groupId) => !currentGroupIds.includes(groupId),
			);

			removedFromGroups += groupsToLeave.length;
			addedToGroups += groupsToJoin.length;

			for (const groupId of groupsToLeave) {
				if (CACHE_MODE === "read") {
					console.warn(
						`SKIP: User ${username} would be removed from group ID ${groupId} if not in read cache mode.`,
					);
					continue;
				}
				await removeUserFromGroup(userId, groupId);
			}

			for (const groupId of groupsToJoin) {
				if (CACHE_MODE === "read") {
					console.warn(
						`SKIP: User ${username} would be added to group ID ${groupId} if not in read cache mode.`,
					);
					continue;
				}
				await addUserToGroup(userId, groupId);
			}

			processed++;
			if (processed % 100 === 0) {
				console.log(`Synced ${processed}/${total} participants...`);
			}
		}),
	),
);

const usersWithGroups = keycloakState.users.filter((user) =>
	keycloakState.groupMemberships.has(user.id ?? ""),
);
const assignmentUsernames = new Set(
	groupAssignments.map((a) => `scoutnet|${a.memberNumber}`),
);
const usersWithoutAssignments = usersWithGroups.filter(
	(u) => !assignmentUsernames.has(u.username ?? ""),
);

await Promise.all(
	usersWithoutAssignments.map((user) =>
		writeLimit(async () => {
			const userId = user.id;
			if (!userId) {
				throw new Error(`User ID for ${user.username} is undefined`);
			}

			const groupIds = keycloakState.groupMemberships.get(userId) ?? [];

			for (const groupId of groupIds) {
				if (CACHE_MODE === "read") {
					console.warn(
						`SKIP: User ${user.username} would be removed from group ID ${groupId} if not in read cache mode.`,
					);
					continue;
				}
				await removeUserFromGroup(userId, groupId);
			}
		}),
	),
);

console.log(
	`Group synchronization took ${(performance.now() - start).toFixed(2)}ms`,
);

console.log(`Users created: ${createdUsers}`);
console.log(`Added to groups: ${addedToGroups}`);
console.log(`Removed from groups: ${removedFromGroups}`);
console.log(
	`Removed from groups due to no assignment: ${usersWithoutAssignments.length}`,
);
