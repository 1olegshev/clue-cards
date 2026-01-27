/**
 * Retry utility with exponential backoff for Firebase operations.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Custom function to determine if error is retryable (default: only network errors) */
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Default function to determine if an error is retryable.
 * Only retries network/transient errors, not validation or permission errors.
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  
  // Network errors - retry
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('unavailable') ||
    message.includes('internal') ||
    message.includes('failed to fetch') ||
    message.includes('econnreset') ||
    message.includes('enotfound')
  ) {
    return true;
  }
  
  // Firebase-specific transient errors
  if (
    message.includes('database unavailable') ||
    message.includes('service temporarily unavailable')
  ) {
    return true;
  }
  
  // Validation/permission errors - do not retry
  if (
    message.includes('permission') ||
    message.includes('denied') ||
    message.includes('unauthorized') ||
    message.includes('invalid') ||
    message.includes('not found') ||
    message.includes('already exists') ||
    message.includes('already taken') ||
    message.includes('not room owner') ||
    message.includes('not your turn') ||
    message.includes('cannot')
  ) {
    return false;
  }
  
  // Default: don't retry unknown errors (safer)
  return false;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic and exponential backoff.
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => joinRoom(roomCode, playerId, name, avatar),
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    shouldRetry = isRetryableError,
  } = options ?? {};

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry if this is the last attempt or error is not retryable
      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }
      
      // Log retry attempt (helpful for debugging)
      console.warn(
        `[Retry] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. ` +
        `Retrying in ${delay}ms...`
      );
      
      // Wait before retrying
      await sleep(delay);
      
      // Increase delay for next attempt (exponential backoff with cap)
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError ?? new Error('Retry failed');
}

/**
 * Wrap an async function to always use retry logic.
 * Useful for creating retry-enabled versions of existing functions.
 * 
 * @example
 * ```typescript
 * const joinRoomWithRetry = withRetryWrapper(
 *   (roomCode: string, playerId: string) => joinRoom(roomCode, playerId),
 *   { maxAttempts: 3 }
 * );
 * ```
 */
export function withRetryWrapper<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: RetryOptions
): (...args: TArgs) => Promise<TResult> {
  return (...args: TArgs) => withRetry(() => fn(...args), options);
}
