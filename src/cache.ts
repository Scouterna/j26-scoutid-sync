import { mkdir, readFile, writeFile } from "node:fs/promises";
import { env } from "./env.ts";

const { CACHE_MODE } = env;

// biome-ignore lint/suspicious/noExplicitAny: It's generic
export function withCache<T extends (...args: any[]) => Promise<any>>(
	fn: T,
): T {
	return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
		const cacheKey = JSON.stringify(args);
		const cacheFile = `cache/${fn.name}-${Buffer.from(cacheKey).toString("base64")}.json`;

		if (CACHE_MODE === "read") {
			try {
				const data = await readFile(cacheFile, "utf-8");
				return JSON.parse(data) as ReturnType<T>;
			} catch {
				// Cache miss, proceed to call the function
				console.warn(
					`Cache file ${cacheFile} not found. Falling back to function.`,
				);
			}
		}

		const result = await fn(...args);

		if (CACHE_MODE === "write") {
			await mkdir("cache", { recursive: true });
			await writeFile(cacheFile, JSON.stringify(result, null, 2));
		}

		return result;
	}) as T;
}
