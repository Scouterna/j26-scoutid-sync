import {
	createAuthorizationHeader,
	createClient,
	type ScoutnetClient,
} from "@scouterna/scoutnet";

let client: ScoutnetClient;
let projectId: string;
let membersApiKey: string;
let questionsApiKey: string;

export async function initScoutnetClient(options: {
	projectId: string | number;
	membersApiKey: string;
	questionsApiKey: string;
}) {
	// If the client is already initialized, we can skip re-initialization. This
	// allows us to call initScoutnetClient multiple times without issues.
	if (client) return;

	client = createClient({});

	projectId = String(options.projectId);
	membersApiKey = options.membersApiKey;
	questionsApiKey = options.questionsApiKey;
}

export function normalize<TVal>(
	val: TVal | unknown[] | null | undefined,
): TVal | null {
	if (!val || Array.isArray(val)) {
		return null;
	}

	return val;
}

export async function getAllParticipants() {
	const response = await client.GET("/project/get/participants", {
		headers: {
			Authorization: createAuthorizationHeader({
				resourceId: projectId,
				key: membersApiKey,
			}),
		},
	});

	if ("error" in response) {
		throw new Error(
			`Error fetching participants: ${response.response.status} ${response.response.statusText}`,
		);
	}

	return normalize(response.data) ?? {};
}

export type QuestionInfo = {
	id: number;
	text: string;
	type: string;
	choices?: Map<number, string>;
};

export async function getQuestions(formId: number) {
	const response = await client.GET("/project/get/questions", {
		headers: {
			Authorization: createAuthorizationHeader({
				resourceId: projectId,
				key: questionsApiKey,
			}),
		},
		params: {
			query: {
				form_id: formId,
			},
		},
	});

	if ("error" in response) {
		throw new Error(
			`Error fetching questions: ${response.response.status} ${response.response.statusText}`,
		);
	}

	return response.data;
}
