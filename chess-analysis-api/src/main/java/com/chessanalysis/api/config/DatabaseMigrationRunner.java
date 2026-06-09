package com.chessanalysis.api.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class DatabaseMigrationRunner implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        // Hibernate ddl-auto: update가 처리 못하는 함수형 인덱스를 여기서 생성
        // IF NOT EXISTS 이므로 재기동 시 안전
        try {
            jdbcTemplate.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_lower ON users(LOWER(name))"
            );
            log.info("[Migration] idx_users_name_lower 인덱스 확인 완료");
        } catch (Exception e) {
            log.warn("[Migration] idx_users_name_lower 생성 실패 (무시): {}", e.getMessage());
        }
    }
}
