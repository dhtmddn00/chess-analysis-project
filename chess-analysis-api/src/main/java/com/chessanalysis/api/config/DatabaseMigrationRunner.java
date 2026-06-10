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
        execIndex("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_lower ON users(LOWER(name))",
                "idx_users_name_lower");
        execIndex("CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)",
                "idx_users_password_reset_token");
    }

    private void execIndex(String sql, String name) {
        try {
            jdbcTemplate.execute(sql);
            log.info("[Migration] {} 인덱스 확인 완료", name);
        } catch (Exception e) {
            log.warn("[Migration] {} 생성 실패 (무시): {}", name, e.getMessage());
        }
    }
}
