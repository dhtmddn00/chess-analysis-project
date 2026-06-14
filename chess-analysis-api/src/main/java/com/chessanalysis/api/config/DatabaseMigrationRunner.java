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
        exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name_lower ON users(LOWER(name))",
                "idx_users_name_lower");
        exec("CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token)",
                "idx_users_password_reset_token");

        // 커뮤니티·채팅 테이블 — JPA 엔티티 없이 JdbcTemplate로만 접근하므로 여기서 생성
        exec("""
                CREATE TABLE IF NOT EXISTS community_posts (
                    id BIGSERIAL PRIMARY KEY,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    author_name VARCHAR(30) NOT NULL,
                    title VARCHAR(120) NOT NULL,
                    content TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )""", "community_posts");
        exec("CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC)",
                "idx_community_posts_created");
        exec("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id BIGSERIAL PRIMARY KEY,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    author_name VARCHAR(30) NOT NULL,
                    content VARCHAR(500) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )""", "chat_messages");
        exec("CREATE INDEX IF NOT EXISTS idx_chat_messages_id ON chat_messages(id DESC)",
                "idx_chat_messages_id");
        exec("""
                CREATE TABLE IF NOT EXISTS community_comments (
                    id BIGSERIAL PRIMARY KEY,
                    post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
                    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
                    author_name VARCHAR(30) NOT NULL,
                    content VARCHAR(1000) NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )""", "community_comments");
        exec("CREATE INDEX IF NOT EXISTS idx_community_comments_post ON community_comments(post_id, id)",
                "idx_community_comments_post");

        // 게시판 카테고리·공지·조회수
        exec("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS category VARCHAR(20) NOT NULL DEFAULT 'free'",
                "community_posts.category");
        exec("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE",
                "community_posts.is_pinned");
        exec("ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0",
                "community_posts.view_count");
        exec("CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts(category, is_pinned DESC, id DESC)",
                "idx_community_posts_category");

        // 조회수 IP 중복 방지
        exec("""
                CREATE TABLE IF NOT EXISTS community_post_views (
                    post_id BIGINT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
                    ip_address VARCHAR(45) NOT NULL,
                    PRIMARY KEY (post_id, ip_address)
                )""", "community_post_views");
    }

    private void exec(String sql, String name) {
        try {
            jdbcTemplate.execute(sql);
            log.info("[Migration] {} 확인 완료", name);
        } catch (Exception e) {
            log.warn("[Migration] {} 생성 실패 (무시): {}", name, e.getMessage());
        }
    }
}
