import { readFile } from "node:fs/promises";
import { type } from "arktype";
import { parse as parseYaml } from "yaml";

export const DynamicGroup = type({
	parent: "string",
	nameExpression: "string",
});
export type DynamicGroup = typeof DynamicGroup.infer;

export const Assignment = type({
	groups: "string[]",
	if: "string",
	"dynamicGroups?": DynamicGroup.array(),
});
export type Assignment = typeof Assignment.infer;

export const Config = type({
	// keycloakUrl: "string",
	// usernamePattern: "string",
	assignments: Assignment.array(),
});
export type Config = typeof Config.infer;

export function parseConfig(yaml: string): Config {
	const json = parseYaml(yaml);
	const config = Config(json);
	if (config instanceof type.errors) {
		throw new Error(`Invalid config: ${config.summary}`);
	}

	return config;
}

export async function loadConfig(path: string): Promise<Config> {
	const yaml = await readFile(path, "utf-8");
	return parseConfig(yaml);
}
