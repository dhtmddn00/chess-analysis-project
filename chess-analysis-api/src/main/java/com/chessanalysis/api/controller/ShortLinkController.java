package com.chessanalysis.api.controller;

import com.chessanalysis.api.service.AnalysisService;
import com.chessanalysis.api.service.ShortLinkService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/s")
@RequiredArgsConstructor
@Slf4j
public class ShortLinkController {

    @Value("${chess-analysis.shortlink.base-url:http://localhost:8080/api/v1/s}")
    private String shortLinkBaseUrl;

    private final AnalysisService analysisService;
    private final ShortLinkService shortLinkService;

    @GetMapping("/{shortCode}")
    public ResponseEntity<Object> redirectToAnalysis(@PathVariable String shortCode) {
        try {
            // 하드코딩된 localhost URL 대신 환경변수 기반 base URL을 사용해야
            // 운영 환경에서 올바른 링크로 resolve된다.
            String fullShortLink = shortLinkBaseUrl + "/" + shortCode;
            String extracted = shortLinkService.extractShortCode(fullShortLink);
            if (extracted == null) {
                return ResponseEntity.notFound().build();
            }

            return analysisService.getAnalysisByShortLink(fullShortLink)
                    .map(analysis -> ResponseEntity.ok().body((Object) analysis))
                    .orElse(ResponseEntity.notFound().build());

        } catch (Exception e) {
            log.error("Failed to resolve short link {}: {}", shortCode, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}