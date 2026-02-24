import { type } from "arktype";
import {
	type getAllParticipants,
	type getQuestions,
	normalize,
} from "./scoutnet.ts";
import type { Answer, NormalizedParticipant } from "./types.ts";
import { Section, Tab } from "./validators.ts";

type Questions = Awaited<ReturnType<typeof getQuestions>>;
type Participants = Awaited<ReturnType<typeof getAllParticipants>>;

export function normalizeParticipants(
	questions: Questions,
	participants: Participants,
) {
	const tabIdToName: Record<number, string> = {};
	const sectionIdToName: Record<number, string> = {};

	for (const tab of Object.values(normalize(questions.tabs) ?? {})) {
		const tabData = Tab(tab);
		if (tabData instanceof type.errors) {
			throw new Error(`Invalid tab: ${tabData.summary}`);
		}

		tabIdToName[tabData.id] = tabData.title;
	}

	for (const section of Object.values(normalize(questions.sections) ?? {})) {
		const sectionData = Section(section);
		if (sectionData instanceof type.errors) {
			throw new Error(`Invalid section: ${sectionData.summary}`);
		}

		sectionIdToName[sectionData.id] = sectionData.title;
	}

	const normalizedParticipants: NormalizedParticipant[] = [];

	for (const participant of Object.values(
		normalize(participants.participants) ?? {},
	)) {
		const answers: Answer[] = [];

		for (const [questionId, value] of Object.entries(
			normalize(participant.questions) ?? {},
		)) {
			const question = questions.questions?.[questionId];

			if (!question) {
				console.warn("Question not found for id:", questionId);
				continue;
			}

			const options = Object.values(question.choices ?? {});

			let normalizedValue: string | null = value;

			try {
				const parsedValue = JSON.parse(value ?? "");
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
				question.section_id != null
					? questions.sections?.[question.section_id]
					: null;

			const tab =
				question.tab_id != null ? questions.tabs?.[question.tab_id] : null;

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
			? participants.labels?.project_fee?.[participant.fee_id]
			: null;

		const attending = !participant.cancelled && Boolean(participant.confirmed);

		normalizedParticipants.push({
			memberNumber: participant.member_no ?? -1,
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
