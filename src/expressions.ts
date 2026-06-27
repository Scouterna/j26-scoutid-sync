import { data, Evaluator, Lexer, Parser } from "@actions/expressions";
import { Array as ArrayData } from "@actions/expressions/data/array";
import type { ExpressionData } from "@actions/expressions/data/expressiondata";
import { Null } from "@actions/expressions/data/null";
import { StringData } from "@actions/expressions/data/string";
import type { FunctionDefinition } from "@actions/expressions/funcs/info";
import type { Answer, Fee } from "./types.ts";

export function evaluateExpression(
	expression: string,
	context: Record<string, unknown>,
	functions: Map<string, FunctionDefinition>,
) {
	const lexer = new Lexer(expression);
	const lr = lexer.lex();

	const parser = new Parser(
		lr.tokens,
		Object.keys(context),
		Array.from(functions.values()),
	);
	const expr = parser.parse();

	// This is the best way I've found to turn the data into a data dictionary.
	const contextDict = JSON.parse(JSON.stringify(context), data.reviver);

	const evaluator = new Evaluator(expr, contextDict, functions);
	return evaluator.evaluate();
}

export function buildAnswerIndex(answers: Answer[]): Map<string, Answer> {
	const index = new Map<string, Answer>();
	for (const answer of answers) {
		index.set(
			`${answer.tabName}\0${answer.sectionName}\0${answer.questionName}`,
			answer,
		);
	}
	return index;
}

export function evaluateCondition(
	expression: string,
	context: {
		fee: Fee;
	},
	internalContext: {
		answerIndex: Map<string, Answer>;
	},
	mappings?: Map<string, Map<string, Record<string, string>>>,
) {
	const functions = new Map<string, FunctionDefinition>();

	functions.set("lookup", {
		name: "lookup",
		minArgs: 3,
		maxArgs: 3,
		call: (
			filename: ExpressionData,
			column: ExpressionData,
			key: ExpressionData,
		) => {
			const file = filename.coerceString();
			const col = column.coerceString();
			const k = key.coerceString();
			if (!file || !col || !k) return new Null();
			const table = mappings?.get(file);
			if (!table) return new Null();
			const row = table.get(k);
			if (!row) {
				console.warn(`lookup: no mapping found for key "${k}" in "${file}"`);
				return new Null();
			}
			const value = row[col];
			return value ? new StringData(value) : new Null();
		},
	});

	functions.set("getanswer", {
		name: "getAnswer",
		minArgs: 3,
		maxArgs: 3,
		call: (
			tabName: ExpressionData,
			sectionName: ExpressionData,
			questionName: ExpressionData,
		) => {
			const key = `${tabName.coerceString()}\0${sectionName.coerceString()}\0${questionName.coerceString()}`;
			const answer = internalContext.answerIndex.get(key);

			if (answer) {
				if (Array.isArray(answer.value)) {
					return new ArrayData(...answer.value.map((v) => new StringData(v)));
				} else {
					return new StringData(answer.value);
				}
			} else {
				return new Null();
			}
		},
	});

	return evaluateExpression(expression, context, functions);
}
