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

export function evaluateCondition(
	expression: string,
	context: {
		fee: Fee;
	},
	internalContext: {
		answers: Answer[];
	},
) {
	const functions = new Map<string, FunctionDefinition>();

	functions.set("getanswer", {
		name: "getAnswer",
		minArgs: 3,
		maxArgs: 3,
		call: (
			tabName: ExpressionData,
			sectionName: ExpressionData,
			questionName: ExpressionData,
		) => {
			const answer = internalContext.answers.find(
				(a) =>
					a.tabName === tabName.coerceString() &&
					a.sectionName === sectionName.coerceString() &&
					a.questionName === questionName.coerceString(),
			);

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
