package com.chessanalysis.api.util;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 클라이언트 실제 IP 추출 유틸.
 *
 * <p>X-Forwarded-For는 클라이언트가 임의 값을 주입할 수 있어 사용하지 않는다.
 * Fly.io 환경에서는 인프라가 설정하는 {@code Fly-Client-IP} 헤더가 신뢰 가능하며,
 * 그 외 환경(로컬 등)에서는 {@code getRemoteAddr()}로 폴백한다.
 */
public final class ClientIpResolver {

    private ClientIpResolver() {}

    public static String resolve(HttpServletRequest request) {
        String flyClientIp = request.getHeader("Fly-Client-IP");
        if (flyClientIp != null && !flyClientIp.isBlank()) {
            return flyClientIp.strip();
        }
        return request.getRemoteAddr();
    }
}
