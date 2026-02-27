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
	KEYCLOAK_CLIENT_ID,
	KEYCLOAK_CLIENT_SECRET,
	KEYCLOAK_PARENT_GROUP_ID,
} = env;

export async function getKeycloakState() {
	if (CACHE_MODE !== "read") {
		await initKeycloakClient({
			baseUrl: "https://admin.dev.id.scouterna.se",
			realmName: "jamboree26",
			clientId: KEYCLOAK_CLIENT_ID,
			clientSecret: KEYCLOAK_CLIENT_SECRET,
		});
	}

	const cachedGetAllUsers = withCache(getAllUsers);
	const cachedGetAllGroups = withCache(getAllGroups);
	const cachedGetGroupMembers = withCache(getGroupMembers);

	let start = performance.now();
	const groups = await cachedGetAllGroups(KEYCLOAK_PARENT_GROUP_ID);
	console.log(
		`Fetched ${groups.length} Keycloak groups in ${(performance.now() - start).toFixed(2)}ms`,
	);

	/**
	 * Map of user ID to array of group IDs they are a member of.
	 */
	const groupMemberships = new Map<string, string[]>();

	start = performance.now();
	for (const group of groups) {
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
	}

	console.log(
		`Fetched Keycloak members of ${groups.length} groups in ${(performance.now() - start).toFixed(2)}ms`,
	);

	const groupNameToId = new Map<string, string>();
	for (const group of groups) {
		if (!group.id || !group.name) {
			throw new Error(`Group is missing id or name: ${JSON.stringify(group)}`);
		}
		groupNameToId.set(group.name, group.id);
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
