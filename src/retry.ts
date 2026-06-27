const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function hasResponseStatus(
	err: unknown,
): err is { response: { status: number } } {
	return (
		typeof err === "object" &&
		err !== null &&
		"response" in err &&
		typeof (err as { response: unknown }).response === "object" &&
		(err as { response: unknown }).response !== null &&
		"status" in (err as { response: Record<string, unknown> }).response &&
		typeof (err as { response: { status: unknown } }).response.status ===
			"number"
	);
}

export function isTransientError(err: unknown): boolean {
	if (hasResponseStatus(err)) {
		return TRANSIENT_HTTP_STATUSES.has(err.response.status);
	}
	if (err instanceof Error) {
		if (err.name === "AbortError" || err.name === "TimeoutError") return true;
		const code = (err as NodeJS.ErrnoException).code;
		return code === "ECONNRESET" || code === "ETIMEDOUT";
	}
	return false;
}

export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
	fn: () => Promise<T>,
	{
		retries,
		label,
		shouldRetry = isTransientError,
		onBeforeRetry,
	}: {
		retries: number;
		label: string;
		shouldRetry?: (err: unknown) => boolean;
		onBeforeRetry?: (err: unknown) => void;
	},
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= retries || !shouldRetry(err)) {
				throw err;
			}
			onBeforeRetry?.(err);
			const delay =
				Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 1000;
			console.warn(
				`[retry] ${label}: attempt ${attempt + 1}/${retries} failed, retrying in ${delay.toFixed(0)}ms`,
			);
			await sleep(delay);
		}
	}
}
