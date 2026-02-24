export type Answer = {
	questionId: number;
	questionName: string;
	sectionId: number;
	sectionName: string;
	tabId: number;
	tabName: string;
	value: string;
};

export type Fee = {
	id: number;
	name: string;
};

export type NormalizedParticipant = {
	memberNumber: number;
	fee: Fee;
	answers: Answer[];
};
