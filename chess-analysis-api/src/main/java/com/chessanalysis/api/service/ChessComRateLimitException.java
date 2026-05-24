package com.chessanalysis.api.service;

/**
 * Thrown when Chess.com responds with HTTP 429 Too Many Requests.
 * Carries the retry-after delay so callers can back off appropriately.
 */
class ChessComRateLimitException extends RuntimeException {

    private final long retryAfterMs;

    ChessComRateLimitException(long retryAfterMs) {
        super("Chess.com rate limit exceeded, retry after " + retryAfterMs + "ms");
        this.retryAfterMs = retryAfterMs;
    }

    long getRetryAfterMs() {
        return retryAfterMs;
    }
}
