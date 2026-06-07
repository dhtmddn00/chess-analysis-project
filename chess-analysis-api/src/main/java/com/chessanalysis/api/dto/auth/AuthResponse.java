package com.chessanalysis.api.dto.auth;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class AuthResponse {
    private UUID id;
    private String email;
    private String name;
    private String chessComUsername;
    private String lichessUsername;
    private String subscriptionTier;
    private LocalDateTime createdAt;
}
