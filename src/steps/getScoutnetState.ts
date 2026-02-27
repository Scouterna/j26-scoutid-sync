import { withCache } from "../cache.ts";
import { env } from "../env.ts";
import { normalizeParticipants } from "../normalizeParticipants.ts";
import {
	getAllParticipants,
	getQuestions,
	initScoutnetClient,
} from "../scoutnet.ts";

const {
	CACHE_MODE,
	SCOUTNET_PROJECT_ID,
	SCOUTNET_FORM_ID,
	SCOUTNET_MEMBERS_API_KEY,
	SCOUTNET_QUESTIONS_API_KEY,
} = env;

export async function getScoutnetState() {
	if (CACHE_MODE !== "read") {
		await initScoutnetClient({
			projectId: SCOUTNET_PROJECT_ID,
			membersApiKey: SCOUTNET_MEMBERS_API_KEY,
			questionsApiKey: SCOUTNET_QUESTIONS_API_KEY,
		});
	}

	const cachedGetQuestions = withCache(getQuestions);
	const cachedGetAllParticipants = withCache(getAllParticipants);

	let start = performance.now();
	const questionsResponse = await cachedGetQuestions(SCOUTNET_FORM_ID);
	console.log(
		`Fetched questions from Scoutnet in ${(performance.now() - start).toFixed(2)}ms`,
	);

	start = performance.now();
	const participantsResponse = await cachedGetAllParticipants();
	console.log(
		`Fetched participants from Scoutnet in ${(performance.now() - start).toFixed(2)}ms`,
	);

	start = performance.now();
	const participants = normalizeParticipants(
		questionsResponse,
		participantsResponse,
	);
	console.log(
		`Normalized ${participants.length} participants in ${(performance.now() - start).toFixed(2)}ms`,
	);

	return {
		participants,
	};
}
