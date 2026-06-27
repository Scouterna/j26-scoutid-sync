import pLimit from "p-limit";
import { withCache } from "../cache.ts";
import { env } from "../env.ts";
import {
	getAllGroups,
	getAllUsers,
	getGroupMembers,
	initKeycloakClient,
} from "../keycloak.ts";

const {
	CACHE_MODE,
	KEYCLOAK_BASE_URL,
	KEYCLOAK_REALM_NAME,
	KEYCLOAK_CLIENT_ID,
	KEYCLOAK_CLIENT_SECRET,
	KEYCLOAK_PARENT_GROUP_ID,
	READ_CONCURRENCY,
} = env;

export async function getKeycloakState() {
	if (CACHE_MODE !== "read") {
		await initKeycloakClient({
			baseUrl: KEYCLOAK_BASE_URL,
			realmName: KEYCLOAK_REALM_NAME,
			clientId: KEYCLOAK_CLIENT_ID,
			clientSecret: KEYCLOAK_CLIENT_SECRET,
		});
	}

	const cachedGetAllUsers = withCache(getAllUsers);
	const cachedGetAllGroups = withCache(getAllGroups);
	const cachedGetGroupMembers = withCache(getGroupMembers);

	const limit = pLimit(READ_CONCURRENCY ?? 10);

	let start = performance.now();
	const topLevelGroups = await cachedGetAllGroups(KEYCLOAK_PARENT_GROUP_ID);
	console.log(
		`Fetched ${topLevelGroups.length} Keycloak groups in ${(performance.now() - start).toFixed(2)}ms`,
	);

	// Fetch sub-groups of every top-level group in parallel.
	start = performance.now();
	const subGroupsByParentId = new Map<
		string,
		Awaited<ReturnType<typeof getAllGroups>>
	>();
	await Promise.all(
		topLevelGroups.map((group) =>
			limit(async () => {
				if (!group.id) {
					throw new Error(`Group is missing id: ${JSON.stringify(group)}`);
				}
				const subGroups = await cachedGetAllGroups(group.id);
				if (subGroups.length > 0) {
					subGroupsByParentId.set(group.id, subGroups);
				}
			}),
		),
	);
	const allSubGroups = Array.from(subGroupsByParentId.values()).flat();
	console.log(
		`Fetched ${allSubGroups.length} Keycloak sub-groups in ${(performance.now() - start).toFixed(2)}ms`,
	);

	const allGroups = [...topLevelGroups, ...allSubGroups];

	/**
	 * Map of user ID to array of group IDs they are a member of.
	 */
	const groupMemberships = new Map<string, string[]>();

	start = performance.now();
	await Promise.all(
		allGroups.map((group) =>
			limit(async () => {
				if (!group.id) {
					throw new Error(`Group is missing id: ${JSON.stringify(group)}`);
				}

				const members = await cachedGetGroupMembers(group.id);

				for (const member of members) {
					if (!member.id) {
						throw new Error(`User is missing id: ${JSON.stringify(member)}`);
					}

					const userGroups = groupMemberships.get(member.id) ?? [];
					userGroups.push(group.id);
					groupMemberships.set(member.id, userGroups);
				}
			}),
		),
	);

	console.log(
		`Fetched Keycloak members of ${allGroups.length} groups in ${(performance.now() - start).toFixed(2)}ms`,
	);

	// Build groupNameToId: top-level groups by plain name, sub-groups by "parent/child".
	const groupNameToId = new Map<string, string>();
	for (const group of topLevelGroups) {
		if (!group.id || !group.name) {
			throw new Error(`Group is missing id or name: ${JSON.stringify(group)}`);
		}
		groupNameToId.set(group.name, group.id);
	}
	for (const [parentId, subGroups] of subGroupsByParentId) {
		const parent = topLevelGroups.find((g) => g.id === parentId);
		if (!parent?.name) {
			throw new Error(`Parent group ${parentId} not found in top-level groups`);
		}
		for (const subGroup of subGroups) {
			if (!subGroup.id || !subGroup.name) {
				throw new Error(
					`Sub-group is missing id or name: ${JSON.stringify(subGroup)}`,
				);
			}
			groupNameToId.set(`${parent.name}/${subGroup.name}`, subGroup.id);
		}
	}

	start = performance.now();
	const users = await cachedGetAllUsers();
	console.log(
		`Fetched ${users.length} Keycloak users in ${(performance.now() - start).toFixed(2)}ms`,
	);

	return {
		users,
		groupMemberships,
		groupNameToId,
	};
}
