import pLimit from "p-limit";
import { loadConfig } from "./config.ts";
import { env } from "./env.ts";
import { evaluateGroups } from "./groups.ts";
import {
	addUserToGroup,
	createGroup,
	createUser,
	removeUserFromGroup,
} from "./keycloak.ts";
import { extractLookupFiles, loadMappings } from "./mapping.ts";
import { getKeycloakState } from "./steps/getKeycloakState.ts";
import { getScoutnetState } from "./steps/getScoutnetState.ts";

const { CACHE_MODE } = env;

const config = await loadConfig("config.yml");

let start = performance.now();

const keycloakState = await getKeycloakState();
const scoutnetState = await getScoutnetState();

const lookupFiles = extractLookupFiles(config.assignments);
const mappings = new Map<string, Map<string, Record<string, string>>>();
for (const file of lookupFiles) {
	mappings.set(file, await loadMappings(file));
}

const groupAssignments = evaluateGroups(
	scoutnetState.participants,
	config.assignments,
	mappings,
);

console.log(`Data loading took ${(performance.now() - start).toFixed(2)}ms`);

// Collect every dynamic sub-group path ("parent/child") referenced across all
// assignments and create any that don't yet exist in Keycloak.
const dynamicGroupPaths = new Set<string>();
for (const assignment of groupAssignments) {
	for (const groupName of assignment.groups) {
		if (groupName.includes("/")) {
			dynamicGroupPaths.add(groupName);
		}
	}
}
for (const groupPath of dynamicGroupPaths) {
	if (!keycloakState.groupNameToId.has(groupPath)) {
		const slashIdx = groupPath.indexOf("/");
		const parentName = groupPath.slice(0, slashIdx);
		const childName = groupPath.slice(slashIdx + 1);
		const parentId = keycloakState.groupNameToId.get(parentName);
		if (!parentId) {
			throw new Error(`Parent group "${parentName}" not found in Keycloak`);
		}
		if (CACHE_MODE === "read") {
			console.warn(
				`SKIP: Group "${childName}" under "${parentName}" would be created if not in read cache mode.`,
			);
		} else {
			const newGroupId = await createGroup(childName, parentId);
			keycloakState.groupNameToId.set(groupPath, newGroupId);
		}
	}
}

const usersByUsername = new Map(
	keycloakState.users.map((u) => [u.username, u]),
);

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
			const user = usersByUsername.get(username);
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
