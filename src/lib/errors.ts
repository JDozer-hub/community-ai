export type AppErrorCode =
  | "INVALID_URL"
  | "VIDEO_NOT_FOUND"
  | "CHANNEL_NOT_FOUND"
  | "COMMENTS_DISABLED"
  | "QUOTA_EXCEEDED"
  | "NO_COMMENTS"
  | "NO_LONGFORM"
  | "YOUTUBE_ERROR"
  | "OPENAI_ERROR"
  | "MISSING_CONFIG"
  | "UNKNOWN";

export class AppError extends Error {
  code: AppErrorCode;
  status: number;
  constructor(code: AppErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function toUserMessage(err: unknown): { code: AppErrorCode; message: string } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { code: "UNKNOWN", message: err.message };
  }
  return { code: "UNKNOWN", message: "An unexpected error occurred." };
}

/** Sleep helper for retry backoff. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async fn, retrying `retries` times on failure with linear backoff.
 * `shouldRetry` lets callers avoid retrying non-transient errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    retries?: number;
    baseDelayMs?: number;
    shouldRetry?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  const { retries = 1, baseDelayMs = 700, shouldRetry = () => true } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === retries || !shouldRetry(err)) break;
      await sleep(baseDelayMs * (attempt + 1));
    }
  }
  throw lastErr;
}
