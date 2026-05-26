package com.chessanalysis.api.controller;

import com.chessanalysis.api.service.AnalysisService;
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

    @GetMapping("/{shortCode}")
    public ResponseEntity<Object> redirectToAnalysis(@PathVariable String shortCode) {
        try {
            // shortCode suffix 기반으로 조회하여 base URL 불일치 문제를 방지한다.
            // (구버전 레코드는 localhost base URL로 저장되어 있을 수 있음)
            return analysisService.getAnalysisByShortCode(shortCode)
                    .map(analysis -> ResponseEntity.ok().body((Object) analysis))
                    .orElse(ResponseEntity.notFound().build());

        } catch (Exception e) {
            log.error("Failed to resolve short link {}: {}", shortCode, e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}