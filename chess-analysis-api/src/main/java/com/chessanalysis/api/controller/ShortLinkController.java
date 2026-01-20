package com.chessanalysis.api.controller;

import com.chessanalysis.api.service.AnalysisService;
import com.chessanalysis.api.service.ShortLinkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/s")
@RequiredArgsConstructor
@Slf4j
public class ShortLinkController {
    
    private final AnalysisService analysisService;
    private final ShortLinkService shortLinkService;
    
    @GetMapping("/{shortCode}")
    public ResponseEntity<Object> redirectToAnalysis(@PathVariable String shortCode) {
        try {
            String fullShortLink = shortLinkService.extractShortCode("http://localhost:8080/api/v1/s/" + shortCode);
            if (fullShortLink == null) {
                return ResponseEntity.notFound().build();
            }
            
            return analysisService.getAnalysisByShortLink("http://localhost:8080/api/v1/s/" + shortCode)
                    .map(analysis -> {
                        // Return analysis data for API access or redirect for web access
                        return ResponseEntity.ok().body((Object) analysis);
                    })
                    .orElse(ResponseEntity.notFound().build());
                    
        } catch (Exception e) {
            log.error("Failed to resolve short link {}: {}", shortCode, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}