package com.chessanalysis.api.controller;

import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.service.SignupRateLimitService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * 간단한 커뮤니티(게시판) + 글로벌 채팅(폴링 기반).
 * 읽기는 공개, 쓰기는 로그인 필수. content는 프론트(React)가 escape하므로 저장은 원문.
 */
@RestController
@RequiredArgsConstructor
public class CommunityController {

    private final JdbcTemplate jdbcTemplate;
    private final SignupRateLimitService rateLimitService;

    // ── 게시판 ──────────────────────────────────────────────────────────────

    @GetMapping("/community/posts")
    public ResponseEntity<List<Map<String, Object>>> listPosts(
            @RequestParam(defaultValue = "30") int limit) {
        int capped = Math.min(Math.max(limit, 1), 50);
        return ResponseEntity.ok(jdbcTemplate.queryForList(
                """
                SELECT id, author_name, title, LEFT(content, 200) AS preview, created_at
                FROM community_posts ORDER BY id DESC LIMIT ?
                """, capped));
    }

    @GetMapping("/community/posts/{id}")
    public ResponseEntity<Map<String, Object>> getPost(@PathVariable long id) {
        var rows = jdbcTemplate.queryForList(
                "SELECT id, author_name, title, content, created_at FROM community_posts WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다.");
        }
        return ResponseEntity.ok(rows.get(0));
    }

    @PostMapping("/community/posts")
    public ResponseEntity<Map<String, Object>> createPost(@RequestBody Map<String, String> body) {
        User user = requireUser();
        String title = strip(body.get("title"), 120);
        String content = strip(body.get("content"), 5000);
        if (title.isBlank() || content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "제목과 내용을 입력해주세요.");
        }
        rateLimitService.checkPostLimit(user.getId().toString());

        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO community_posts (user_id, author_name, title, content) VALUES (?, ?, ?, ?) RETURNING id",
                Long.class, user.getId(), user.getName(), title, content);
        return ResponseEntity.status(201).body(Map.of("id", id));
    }

    // ── 글로벌 채팅 (폴링) ────────────────────────────────────────────────────

    @GetMapping("/chat/messages")
    public ResponseEntity<List<Map<String, Object>>> chatMessages(
            @RequestParam(defaultValue = "0") long afterId) {
        // afterId=0이면 최근 50개, 아니면 그 이후 메시지만 (폴링 증분)
        List<Map<String, Object>> rows = (afterId <= 0)
                ? jdbcTemplate.queryForList(
                        "SELECT * FROM (SELECT id, author_name, content, created_at FROM chat_messages ORDER BY id DESC LIMIT 50) t ORDER BY id ASC")
                : jdbcTemplate.queryForList(
                        "SELECT id, author_name, content, created_at FROM chat_messages WHERE id > ? ORDER BY id ASC LIMIT 100",
                        afterId);
        return ResponseEntity.ok(rows);
    }

    @PostMapping("/chat/messages")
    public ResponseEntity<Map<String, Object>> sendMessage(@RequestBody Map<String, String> body) {
        User user = requireUser();
        String content = strip(body.get("content"), 500);
        if (content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "메시지를 입력해주세요.");
        }
        rateLimitService.checkChatLimit(user.getId().toString());

        Long id = jdbcTemplate.queryForObject(
                "INSERT INTO chat_messages (user_id, author_name, content) VALUES (?, ?, ?) RETURNING id",
                Long.class, user.getId(), user.getName(), content);
        return ResponseEntity.status(201).body(Map.of("id", id));
    }

    // ── 내부 유틸 ────────────────────────────────────────────────────────────

    private User requireUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }

    private String strip(String s, int maxLen) {
        if (s == null) return "";
        String stripped = s.strip();
        return stripped.length() > maxLen ? stripped.substring(0, maxLen) : stripped;
    }
}
