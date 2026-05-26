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
import java.util.regex.Pattern;

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

    /**
     * AnalysisController의 resolveClientIp와 동일한 우선순위로 클라이언트 IP를 결정한다.
     *
     * <p>우선순위:
     * <ol>
     *   <li>{@code Fly-Client-IP} — Fly.io 엣지 헤더, 클라이언트 위조 불가.</li>
     *   <li>{@code X-Real-IP} — 신뢰된 내부 프록시가 설정한 헤더.</li>
     *   <li>{@code getRemoteAddr()} — 직접 연결 (로컬 개발).</li>
     * </ol>
     *
     * <p>방문자 중복 제거는 정확성이 중요하지 않으므로 rate-limit보다 허용 범위가 넓으나,
     * X-Forwarded-For는 클라이언트가 임의 값을 주입할 수 있으므로 사용하지 않는다.
     */
    private static final Pattern IP_PATTERN = Pattern.compile(
        "^(([0-9]{1,3}\\.){3}[0-9]{1,3}|[0-9a-fA-F:]{2,39})$"
    );

    private String resolveClientIp(HttpServletRequest request) {
        String flyIp = request.getHeader("Fly-Client-IP");
        if (isValidIp(flyIp)) return flyIp.trim();

        String realIp = request.getHeader("X-Real-IP");
        if (isValidIp(realIp)) return realIp.trim();

        return request.getRemoteAddr();
    }

    private boolean isValidIp(String ip) {
        return ip != null && !ip.isBlank() && IP_PATTERN.matcher(ip.trim()).matches();
    }
}
