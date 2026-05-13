package com.chessanalysis.api.service;

import lombok.Getter;

import java.util.Map;

@Getter
public class AnalysisRateLimitException extends RuntimeException {
    private final Map<String, Object> details;

    public AnalysisRateLimitException(String message, Map<String, Object> details) {
        super(message);
        this.details = details;
    }
}
