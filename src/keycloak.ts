import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type GroupRepresentation from "@keycloak/keycloak-admin-client/lib/defs/groupRepresentation.js";
import type UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation.js";

let client: KeycloakAdminClient;

export async function initKeycloakClient({
	baseUrl,
	realmName,
	clientId,
	clientSecret,
}: {
	baseUrl: string;
	realmName: string;
	clientId: string;
	clientSecret: string;
}) {
	// If the client is already initialized, we can skip re-initialization. This
	// allows us to call initKeycloakClient multiple times without issues.
	if (client) return;

	client = new KeycloakAdminClient({
		baseUrl,
		realmName,
	});

	await client.auth({
		grantType: "client_credentials",
		clientId,
		clientSecret,
	});
}

export async function createUser(username: string) {
	const { id } = await client.users.create({
		username,
		enabled: true,
	});
	return id;
}

export async function getAllUsers(
	perPage = 100,
): Promise<UserRepresentation[]> {
	const users: UserRepresentation[] = [];
	let first = 0;

	while (true) {
		console.log(`Fetching users ${first}–${first + perPage - 1}...`);
		const batch = await client.users.find({
			first,
			max: perPage,
		});
		users.push(...batch);
		if (batch.length < perPage) {
			break;
		}
		first += perPage;
	}

	return users;
}

export async function getAllGroups(
	parentId: string,
	perPage = 100,
): Promise<GroupRepresentation[]> {
	const groups: GroupRepresentation[] = [];
	let first = 0;

	while (true) {
		console.log(`Fetching groups ${first}–${first + perPage - 1}...`);
		const batch = await client.groups.listSubGroups({
			parentId,
			first,
			max: perPage,
		});
		groups.push(...batch);
		if (batch.length < perPage) {
			break;
		}
		first += perPage;
	}

	return groups;
}

export async function getGroupMembers(
	groupId: string,
	perPage = 100,
): Promise<UserRepresentation[]> {
	const members: UserRepresentation[] = [];
	let first = 0;

	while (true) {
		console.log(`Fetching members of group ${groupId}, offset ${first}...`);
		const batch = await client.groups.listMembers({
			id: groupId,
			first,
			max: perPage,
		});
		members.push(...batch);
		if (batch.length < perPage) {
			break;
		}
		first += perPage;
	}

	return members;
}

export async function createGroup(
	name: string,
	parentId: string,
): Promise<string> {
	const { id } = await client.groups.createChildGroup(
		{ id: parentId },
		{ name },
	);
	return id;
}

export async function removeUserFromGroup(
	userId: string,
	groupId: string,
): Promise<void> {
	await client.users.delFromGroup({
		id: userId,
		groupId,
	});
}

export async function addUserToGroup(
	userId: string,
	groupId: string,
): Promise<void> {
	await client.users.addToGroup({
		id: userId,
		groupId,
	});
}
