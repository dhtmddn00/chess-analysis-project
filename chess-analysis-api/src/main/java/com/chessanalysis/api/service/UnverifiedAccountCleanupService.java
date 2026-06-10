package com.chessanalysis.api.service;

import com.chessanalysis.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * 미인증 + 인증 토큰 만료된 계정을 주기적으로 삭제한다.
 * 토큰 만료(24h) 후 추가 유예 기간을 둬서, 만료 직후 재발송 흐름과 충돌하지 않게 한다.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class UnverifiedAccountCleanupService {

    private static final long GRACE_DAYS = 7;

    private final UserRepository userRepository;

    // 매일 새벽 4시 (KST) 실행
    @Scheduled(cron = "0 0 4 * * *", zone = "Asia/Seoul")
    @Transactional
    public void cleanupUnverifiedAccounts() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(GRACE_DAYS);
        int deleted = userRepository.deleteUnverifiedExpiredBefore(cutoff);
        if (deleted > 0) {
            log.info("[Cleanup] 미인증 만료 계정 {}건 삭제", deleted);
        }
    }
}
