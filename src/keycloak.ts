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

export async function addUserToGroup(
	userId: string,
	groupId: string,
): Promise<void> {
	await client.users.addToGroup({
		id: userId,
		groupId,
	});
}
