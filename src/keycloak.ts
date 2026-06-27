import KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type GroupRepresentation from "@keycloak/keycloak-admin-client/lib/defs/groupRepresentation.js";
import type UserRepresentation from "@keycloak/keycloak-admin-client/lib/defs/userRepresentation.js";
import pLimit from "p-limit";
import { env } from "./env.ts";
import { hasResponseStatus, isTransientError, withRetry } from "./retry.ts";

let client: KeycloakAdminClient;
let savedCredentials: { clientId: string; clientSecret: string } | null = null;

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;
let refreshPromise: Promise<string> | null = null;

const REFRESH_SKEW_MS = 30_000;
const FALLBACK_TTL_MS = 60_000;

function decodeJwtExp(token: string): number | null {
	try {
		const payload = token.split(".")[1];
		if (!payload) return null;
		const decoded = JSON.parse(
			Buffer.from(payload, "base64url").toString("utf-8"),
		);
		if (typeof decoded.exp === "number") return decoded.exp * 1000;
		return null;
	} catch {
		return null;
	}
}

async function doRefreshToken(): Promise<string> {
	if (!savedCredentials) throw new Error("Keycloak client not initialized");
	await client.auth({
		grantType: "client_credentials",
		clientId: savedCredentials.clientId,
		clientSecret: savedCredentials.clientSecret,
	});
	const token = client.accessToken;
	if (!token) throw new Error("No access token after auth");
	const expiresAt = decodeJwtExp(token) ?? Date.now() + FALLBACK_TTL_MS;
	cachedToken = { value: token, expiresAt };
	return token;
}

export function invalidateToken(): void {
	cachedToken = null;
}

async function getAccessToken(): Promise<string | undefined> {
	if (cachedToken && Date.now() < cachedToken.expiresAt - REFRESH_SKEW_MS) {
		return cachedToken.value;
	}
	if (!refreshPromise) {
		refreshPromise = doRefreshToken().finally(() => {
			refreshPromise = null;
		});
	}
	return refreshPromise;
}

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

	savedCredentials = { clientId, clientSecret };

	await client.auth({
		grantType: "client_credentials",
		clientId,
		clientSecret,
	});
	const token = client.accessToken;
	if (!token) throw new Error("No access token after initial auth");
	const expiresAt = decodeJwtExp(token) ?? Date.now() + FALLBACK_TTL_MS;
	cachedToken = { value: token, expiresAt };

	client.registerTokenProvider({ getAccessToken });
}

const maxRetries = env.MAX_RETRIES ?? 5;

const keycloakShouldRetry = (err: unknown) =>
	isTransientError(err) ||
	(hasResponseStatus(err) && err.response.status === 401);

const onBefore401Retry = (err: unknown) => {
	if (hasResponseStatus(err) && err.response.status === 401) {
		invalidateToken();
	}
};

export async function createUser(username: string) {
	const { id } = await withRetry(
		() => client.users.create({ username, enabled: true }),
		{
			retries: maxRetries,
			label: `createUser(${username})`,
			shouldRetry: keycloakShouldRetry,
			onBeforeRetry: onBefore401Retry,
		},
	);
	return id;
}

export async function getAllUsers(
	perPage = 100,
): Promise<UserRepresentation[]> {
	const total = await withRetry(() => client.users.count(), {
		retries: maxRetries,
		label: "getAllUsers/count",
		shouldRetry: keycloakShouldRetry,
		onBeforeRetry: onBefore401Retry,
	});
	console.log(`Fetching ${total} users in parallel...`);

	const offsets = Array.from(
		{ length: Math.ceil(total / perPage) },
		(_, i) => i * perPage,
	);

	const pageLimit = pLimit(env.READ_CONCURRENCY ?? 10);
	const pages = await Promise.all(
		offsets.map((first) =>
			pageLimit(() =>
				withRetry(() => client.users.find({ first, max: perPage }), {
					retries: maxRetries,
					label: `getAllUsers(offset=${first})`,
					shouldRetry: keycloakShouldRetry,
					onBeforeRetry: onBefore401Retry,
				}),
			),
		),
	);

	return pages.flat();
}

export async function getAllGroups(
	parentId: string,
	perPage = 100,
): Promise<GroupRepresentation[]> {
	const groups: GroupRepresentation[] = [];
	let first = 0;

	while (true) {
		console.log(`Fetching groups ${first}–${first + perPage - 1}...`);
		const batch = await withRetry(
			() =>
				client.groups.listSubGroups({
					parentId,
					first,
					max: perPage,
				}),
			{
				retries: maxRetries,
				label: `getAllGroups(parent=${parentId}, offset=${first})`,
				shouldRetry: keycloakShouldRetry,
				onBeforeRetry: onBefore401Retry,
			},
		);
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
		const batch = await withRetry(
			() =>
				client.groups.listMembers({
					id: groupId,
					first,
					max: perPage,
				}),
			{
				retries: maxRetries,
				label: `getGroupMembers(group=${groupId}, offset=${first})`,
				shouldRetry: keycloakShouldRetry,
				onBeforeRetry: onBefore401Retry,
			},
		);
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
	const { id } = await withRetry(
		() => client.groups.createChildGroup({ id: parentId }, { name }),
		{
			retries: maxRetries,
			label: `createGroup(${name})`,
			shouldRetry: keycloakShouldRetry,
			onBeforeRetry: onBefore401Retry,
		},
	);
	return id;
}

export async function removeUserFromGroup(
	userId: string,
	groupId: string,
): Promise<void> {
	await withRetry(() => client.users.delFromGroup({ id: userId, groupId }), {
		retries: maxRetries,
		label: `removeUserFromGroup(user=${userId}, group=${groupId})`,
		shouldRetry: keycloakShouldRetry,
		onBeforeRetry: onBefore401Retry,
	});
}

export async function addUserToGroup(
	userId: string,
	groupId: string,
): Promise<void> {
	await withRetry(() => client.users.addToGroup({ id: userId, groupId }), {
		retries: maxRetries,
		label: `addUserToGroup(user=${userId}, group=${groupId})`,
		shouldRetry: keycloakShouldRetry,
		onBeforeRetry: onBefore401Retry,
	});
}
