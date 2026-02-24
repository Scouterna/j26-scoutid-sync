import { CACHE_MODE, withCache } from "./cache.ts";
import { loadConfig } from "./config.ts";
import { env } from "./env.ts";
import { evaluateGroups } from "./groups.ts";
import {
	addUserToGroup,
	createUser,
	getAllGroups,
	getAllUsers,
	initKeycloakClient,
	removeUserFromGroup,
} from "./keycloak.ts";
import { normalizeParticipants } from "./normalizeParticipants.ts";
import {
	getAllParticipants,
	getQuestions,
	initScoutnetClient,
} from "./scoutnet.ts";

const {
	KEYCLOAK_CLIENT_ID,
	KEYCLOAK_CLIENT_SECRET,
	KEYCLOAK_PARENT_GROUP_ID,
	SCOUTNET_PROJECT_ID,
	SCOUTNET_FORM_ID,
	SCOUTNET_MEMBERS_API_KEY,
	SCOUTNET_QUESTIONS_API_KEY,
} = env;

console.log("boot");
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

const allUsers = await cachedGetAllUsers();
const allGroups = await cachedGetAllGroups(KEYCLOAK_PARENT_GROUP_ID);

const config = await loadConfig("config.yml");

await initScoutnetClient({
	projectId: SCOUTNET_PROJECT_ID,
	membersApiKey: SCOUTNET_MEMBERS_API_KEY,
	questionsApiKey: SCOUTNET_QUESTIONS_API_KEY,
});
console.log("scoutnet");
const cachedGetQuestions = withCache(getQuestions);
const cachedGetAllParticipants = withCache(getAllParticipants);

const questions = await cachedGetQuestions(SCOUTNET_FORM_ID);
const participants = await cachedGetAllParticipants();

const normalizedParticipants = await normalizeParticipants(
	questions,
	participants,
);

const groupAssignments = evaluateGroups(
	normalizedParticipants,
	config.assignments,
);
console.log("douit");
// TODO: Remove groups that are no longer assigned

// TODO: Create map from group name to ID. Later if a group is not found, throw an
// error so that we don't miss something.

const groupNameToId = new Map<string, string>();
for (const group of allGroups) {
	if (!group.name || !group.id) {
		console.warn("Group without name or ID:", group);
		continue;
	}
	groupNameToId.set(group.name, group.id);
}

for (const assignment of groupAssignments) {
	const username = `scoutnet|${assignment.memberNumber}`;
	const user = allUsers.find((u) => u.username === username);
	let userId = user?.id;

	if (!user) {
		if (CACHE_MODE === "read") {
			console.warn(
				`User ${username} not found in Keycloak. Skipping creation in read cache mode.`,
			);
			continue;
		}
		userId = await createUser(username);
	}

	if (!userId) {
		// Just here for type safety
		throw new Error(`User ID for ${username} is undefined`);
	}

	console.log(assignment);

	const groupIds = assignment.groups.map((groupName) => {
		const groupId = groupNameToId.get(groupName);
		if (!groupId) {
			throw new Error(`Group "${groupName}" not found in Keycloak`);
		}
		return groupId;
	});

	const groupIdsToLeave = groupNameToId
		.values()
		.filter((groupId) => !groupIds.includes(groupId));

	for (const groupId of groupIdsToLeave) {
		await removeUserFromGroup(userId, groupId);
	}

	for (const groupId of groupIds) {
		await addUserToGroup(userId, groupId);
	}
}
