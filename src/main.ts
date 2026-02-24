import { CACHE_MODE, withCache } from "./cache.ts";
import { loadConfig } from "./config.ts";
import { evaluateGroups } from "./groups.ts";
import {
	addUserToGroup,
	createUser,
	getAllGroups,
	getAllUsers,
	initKeycloakClient,
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
} = process.env;

if (!KEYCLOAK_CLIENT_ID) {
	throw new Error("KEYCLOAK_CLIENT_ID is not defined");
}
if (!KEYCLOAK_CLIENT_SECRET) {
	throw new Error("KEYCLOAK_CLIENT_SECRET is not defined");
}
if (!KEYCLOAK_PARENT_GROUP_ID) {
	throw new Error("KEYCLOAK_PARENT_GROUP_ID is not defined");
}
if (!SCOUTNET_PROJECT_ID) {
	throw new Error("SCOUTNET_PROJECT_ID is not defined");
}
if (!SCOUTNET_FORM_ID) {
	throw new Error("SCOUTNET_FORM_ID is not defined");
}
if (!SCOUTNET_MEMBERS_API_KEY) {
	throw new Error("SCOUTNET_MEMBERS_API_KEY is not defined");
}
if (!SCOUTNET_QUESTIONS_API_KEY) {
	throw new Error("SCOUTNET_QUESTIONS_API_KEY is not defined");
}
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

const questions = await cachedGetQuestions(
	Number.parseInt(SCOUTNET_FORM_ID, 10),
);
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

for (const group of groupAssignments) {
	const username = `scoutnet|${group.memberNumber}`;
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

	const groupIds = group.groups.map((groupName) => {
		const groupId = groupNameToId.get(groupName);
		if (!groupId) {
			throw new Error(`Group "${groupName}" not found in Keycloak`);
		}
		return groupId;
	});

	for (const groupId of groupIds) {
		await addUserToGroup(userId, groupId);
	}
}

console.log(allGroups);
