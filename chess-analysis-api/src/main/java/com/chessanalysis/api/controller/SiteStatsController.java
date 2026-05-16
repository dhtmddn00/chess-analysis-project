package com.chessanalysis.api.controller;

import com.chessanalysis.api.service.SiteVisitService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/site")
@RequiredArgsConstructor
public class SiteStatsController {
    private final SiteVisitService siteVisitService;

    @PostMapping("/visit")
    public ResponseEntity<Map<String, Object>> recordVisit(
        @RequestHeader(value = "X-Visitor-Id", required = false) String visitorId,
        @RequestHeader(value = "User-Agent", required = false) String userAgent,
        HttpServletRequest request
    ) {
        return ResponseEntity.ok(siteVisitService.recordVisit(
            visitorId,
            resolveClientIp(request),
            userAgent
        ));
    }

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(siteVisitService.getStats());
    }

    private String resolveClientIp(HttpServletRequest request) {
        // TODO: X-Forwarded-For 헤더는 클라이언트가 임의로 위조할 수 있다.
        // 신뢰할 수 있는 프록시 IP 목록을 환경변수로 관리하고,
        // request.getRemoteAddr()이 그 목록에 속할 때만 헤더를 신뢰해야 한다.
        // 현재는 방문자 중복 제거 로직이 스푸핑에 취약하다.
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }

        return request.getRemoteAddr();
    }
}
