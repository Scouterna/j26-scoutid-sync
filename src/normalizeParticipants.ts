import { type } from "arktype";
import type { getAllParticipants, getQuestions } from "./scoutnet.ts";
import type { Answer, NormalizedParticipant } from "./types.ts";

type QuestionsResponse = Awaited<ReturnType<typeof getQuestions>>;
type ParticipantsResponse = Awaited<ReturnType<typeof getAllParticipants>>;

const Tab = type({
	id: "number",
	title: "string",
});

const Section = type({
	id: "number",
	title: "string",
});

const Question = type({
	question: "string",
	type: "string",
	tab_id: "number | null",
	section_id: "number | null",
	"choices?": type.Record(
		"string",
		type({ option: "string | null", value: "string | number | null" }),
	),
});

const GroupRegistrationInfo = type({
	"group_id?": "number | null",
});

const Participant = type({
	member_no: "number",
	"group_registration_info?": GroupRegistrationInfo.or("unknown[]").or("null"),
	"fee_id?": "number | null",
	"cancelled?": "boolean | null",
	"confirmed?": "boolean | null",
	questions: type.Record("string", "string | string[] | null"),
});
export type Participant = typeof Participant.infer;

export function normalizeParticipants(
	questionsResponse: QuestionsResponse,
	participantsResponse: ParticipantsResponse,
) {
	const rawParticipants = Object.values(
		participantsResponse.participants ?? {},
	);
	const participants = Participant.array()(rawParticipants);
	if (participants instanceof type.errors) {
		throw new Error(`Invalid participants: ${participants.summary}`);
	}

	const tabs = type.Record("string", Tab)(questionsResponse.tabs ?? {});
	if (tabs instanceof type.errors) {
		throw new Error(`Invalid tabs: ${tabs.summary}`);
	}

	const sections = type.Record(
		"string",
		Section,
	)(questionsResponse.sections ?? {});
	if (sections instanceof type.errors) {
		throw new Error(`Invalid sections: ${sections.summary}`);
	}

	const questions = type.Record(
		"string",
		Question,
	)(questionsResponse.questions ?? {});
	if (questions instanceof type.errors) {
		throw new Error(`Invalid questions: ${questions.summary}`);
	}

	const tabIdToName: Record<number, string> = {};
	const sectionIdToName: Record<number, string> = {};

	for (const tab of Object.values(tabs)) {
		tabIdToName[tab.id] = tab.title;
	}

	for (const section of Object.values(sections)) {
		sectionIdToName[section.id] = section.title;
	}

	const normalizedParticipants: NormalizedParticipant[] = [];

	for (const participant of participants) {
		const answers: Answer[] = [];

		for (const [questionId, value] of Object.entries(participant.questions)) {
			const question = questions[questionId];

			if (!question) {
				// console.warn("Question not found for id:", questionId);
				continue;
			}

			const options = Object.values(question.choices ?? {});

			let normalizedValue: string | string[] | null = value;

			try {
				const parsedValue = JSON.parse(String(value) ?? "");
				if ("linked_id" in parsedValue && "value" in parsedValue) {
					normalizedValue = parsedValue.value;
				}
			} catch {
				// Ignore JSON parse errors
			}

			if (options) {
				const option = options.find(
					(o) => o.value?.toString() === value?.toString(),
				);

				if (option) {
					normalizedValue = option.option ?? null;
				}
			}

			const section =
				question.section_id != null ? sections[question.section_id] : null;

			const tab = question.tab_id != null ? tabs[question.tab_id] : null;

			answers.push({
				questionId: Number(questionId),
				questionName: question.question ?? "",
				sectionId: question.section_id ?? -1,
				sectionName: section?.title ?? "",
				tabId: question.tab_id ?? -1,
				tabName: tab?.title ?? "",
				value: normalizedValue ?? "",
			});
		}

		const fee = participant.fee_id
			? participantsResponse.labels?.project_fee?.[participant.fee_id]
			: null;

		const attending = !participant.cancelled && Boolean(participant.confirmed);

		normalizedParticipants.push({
			memberNumber: participant.member_no ?? -1,
			groupId: Array.isArray(participant.group_registration_info)
				? 0
				: (participant.group_registration_info?.group_id ?? 0),
			fee: {
				id: participant.fee_id ?? -1,
				name: fee ?? "",
			},
			answers,
			attending,
		});
	}

	return normalizedParticipants;
}
