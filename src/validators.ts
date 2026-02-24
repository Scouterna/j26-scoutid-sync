import { type } from "arktype";

export const Tab = type({
	id: "number",
	title: "string",
});
export type Tab = typeof Tab.infer;

export const Section = type({
	id: "number",
	title: "string",
});
export type Section = typeof Section.infer;

export const Question = type({
	question: "string",
	tab_id: "number",
	section_id: "number",
	type: "string",
	"choices?": type.Record("string", {
		value: "number",
		option: "string",
	}),
});
export type Question = typeof Question.infer;
