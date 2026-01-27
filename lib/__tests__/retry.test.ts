import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, isRetryableError, withRetryWrapper } from '../retry';

// ============================================================================
// isRetryableError
// ============================================================================

describe('isRetryableError', () => {
  describe('retryable network errors', () => {
    it('returns true for network error', () => {
      expect(isRetryableError(new Error('Network error'))).toBe(true);
    });

    it('returns true for timeout error', () => {
      expect(isRetryableError(new Error('Request timeout'))).toBe(true);
    });

    it('returns true for connection error', () => {
      expect(isRetryableError(new Error('Connection refused'))).toBe(true);
    });

    it('returns true for unavailable error', () => {
      expect(isRetryableError(new Error('Service unavailable'))).toBe(true);
    });

    it('returns true for internal error', () => {
      expect(isRetryableError(new Error('Internal server error'))).toBe(true);
    });

    it('returns true for failed to fetch', () => {
      expect(isRetryableError(new Error('Failed to fetch'))).toBe(true);
    });

    it('returns true for ECONNRESET', () => {
      expect(isRetryableError(new Error('ECONNRESET'))).toBe(true);
    });

    it('returns true for ENOTFOUND', () => {
      expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
    });

    it('returns true for database unavailable', () => {
      expect(isRetryableError(new Error('Database unavailable'))).toBe(true);
    });
  });

  describe('non-retryable validation/permission errors', () => {
    it('returns false for permission denied', () => {
      expect(isRetryableError(new Error('Permission denied'))).toBe(false);
    });

    it('returns false for unauthorized', () => {
      expect(isRetryableError(new Error('Unauthorized access'))).toBe(false);
    });

    it('returns false for invalid input', () => {
      expect(isRetryableError(new Error('Invalid clue word'))).toBe(false);
    });

    it('returns false for not found', () => {
      expect(isRetryableError(new Error('Room not found'))).toBe(false);
    });

    it('returns false for already exists', () => {
      expect(isRetryableError(new Error('Name already exists'))).toBe(false);
    });

    it('returns false for already taken', () => {
      expect(isRetryableError(new Error('Name already taken'))).toBe(false);
    });

    it('returns false for not room owner', () => {
      expect(isRetryableError(new Error('Not room owner'))).toBe(false);
    });

    it('returns false for not your turn', () => {
      expect(isRetryableError(new Error('Not your turn'))).toBe(false);
    });

    it('returns false for cannot perform action', () => {
      expect(isRetryableError(new Error('Cannot vote now'))).toBe(false);
    });
  });

  describe('unknown errors', () => {
    it('returns false for unknown error (safer default)', () => {
      expect(isRetryableError(new Error('Some random error'))).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase error messages', () => {
      expect(isRetryableError(new Error('NETWORK ERROR'))).toBe(true);
    });

    it('handles mixed case error messages', () => {
      expect(isRetryableError(new Error('Permission Denied'))).toBe(false);
    });
  });
});

// ============================================================================
// withRetry
// ============================================================================

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('successful execution', () => {
    it('returns result on first successful attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns result after retry', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(fn, { initialDelayMs: 100 });
      
      // Fast-forward past the delay
      await vi.advanceTimersByTimeAsync(100);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('retry behavior', () => {
    it('retries on retryable error', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(fn, { initialDelayMs: 100 });
      
      // Fast-forward past delays
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200); // exponential backoff
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry on non-retryable error', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Permission denied'));
      
      await expect(withRetry(fn)).rejects.toThrow('Permission denied');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws after max attempts exceeded', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const promise = withRetry(fn, { maxAttempts: 3, initialDelayMs: 100 });
      
      // Ensure the promise is being tracked before advancing timers
      const expectPromise = expect(promise).rejects.toThrow('Network error');
      
      // Fast-forward past all delays
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(200);
      
      await expectPromise;
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('options', () => {
    it('respects maxAttempts option', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Network error'));
      
      const promise = withRetry(fn, { maxAttempts: 2, initialDelayMs: 10 });
      
      // Ensure the promise is being tracked before advancing timers
      const expectPromise = expect(promise).rejects.toThrow('Network error');
      
      await vi.advanceTimersByTimeAsync(10);
      
      await expectPromise;
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('uses custom shouldRetry function', async () => {
      const customShouldRetry = vi.fn().mockReturnValue(true);
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Custom error'))
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(fn, { 
        shouldRetry: customShouldRetry,
        initialDelayMs: 10 
      });
      
      await vi.advanceTimersByTimeAsync(10);
      
      const result = await promise;
      
      expect(result).toBe('success');
      expect(customShouldRetry).toHaveBeenCalled();
    });

    it('respects maxDelayMs cap', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');
      
      const promise = withRetry(fn, { 
        maxAttempts: 4,
        initialDelayMs: 1000,
        maxDelayMs: 2000,
        backoffMultiplier: 10 
      });
      
      // First retry: 1000ms
      await vi.advanceTimersByTimeAsync(1000);
      // Second retry: would be 10000ms but capped at 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      // Third retry: still capped at 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('error conversion', () => {
    it('converts non-Error throws to Error', async () => {
      const fn = vi.fn().mockRejectedValue('string error');
      
      await expect(withRetry(fn)).rejects.toThrow('string error');
    });
  });
});

// ============================================================================
// withRetryWrapper
// ============================================================================

describe('withRetryWrapper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a wrapped function that retries', async () => {
    const originalFn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');
    
    const wrappedFn = withRetryWrapper(originalFn, { initialDelayMs: 10 });
    
    const promise = wrappedFn('arg1', 'arg2');
    
    await vi.advanceTimersByTimeAsync(10);
    
    const result = await promise;
    
    expect(result).toBe('success');
    expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    expect(originalFn).toHaveBeenCalledTimes(2);
  });

  it('preserves function arguments', async () => {
    const originalFn = vi.fn().mockResolvedValue('result');
    
    const wrappedFn = withRetryWrapper(originalFn);
    await wrappedFn(1, 'two', { three: 3 });
    
    expect(originalFn).toHaveBeenCalledWith(1, 'two', { three: 3 });
  });
});
