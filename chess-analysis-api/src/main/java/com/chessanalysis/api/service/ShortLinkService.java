package com.chessanalysis.api.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ShortLinkService {
    
    @Value("${chess-analysis.shortlink.base-url:http://localhost:8080/api/v1/s}")
    private String baseUrl;
    
    private static final String CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int SHORT_LINK_LENGTH = 8;
    private final SecureRandom random = new SecureRandom();
    
    public String generateShortLink(UUID analysisId) {
        String shortCode = generateShortCode();
        String shortLink = baseUrl + "/" + shortCode;
        
        log.info("Generated short link for analysis {}: {}", analysisId, shortLink);
        return shortLink;
    }
    
    private String generateShortCode() {
        StringBuilder sb = new StringBuilder(SHORT_LINK_LENGTH);
        for (int i = 0; i < SHORT_LINK_LENGTH; i++) {
            sb.append(CHARACTERS.charAt(random.nextInt(CHARACTERS.length())));
        }
        return sb.toString();
    }
    
    public String extractShortCode(String shortLink) {
        if (shortLink == null || !shortLink.startsWith(baseUrl)) {
            return null;
        }
        
        int lastSlashIndex = shortLink.lastIndexOf('/');
        if (lastSlashIndex == -1 || lastSlashIndex == shortLink.length() - 1) {
            return null;
        }
        
        return shortLink.substring(lastSlashIndex + 1);
    }
}