package com.chessanalysis.api.controller;

import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.service.AuthService;
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
 * 글/댓글은 작성자 또는 관리자가 삭제 가능, 채팅은 관리자만 삭제 가능.
 */
@RestController
@RequiredArgsConstructor
public class CommunityController {

    private final JdbcTemplate jdbcTemplate;
    private final SignupRateLimitService rateLimitService;
    private final AuthService authService;

    // ── 게시판 ──────────────────────────────────────────────────────────────

    @GetMapping("/community/posts")
    public ResponseEntity<List<Map<String, Object>>> listPosts(
            @RequestParam(defaultValue = "30") int limit) {
        int capped = Math.min(Math.max(limit, 1), 50);
        return ResponseEntity.ok(jdbcTemplate.queryForList(
                """
                SELECT id, user_id, author_name, title, LEFT(content, 200) AS preview, created_at
                FROM community_posts ORDER BY id DESC LIMIT ?
                """, capped));
    }

    @GetMapping("/community/posts/{id}")
    public ResponseEntity<Map<String, Object>> getPost(@PathVariable long id) {
        var rows = jdbcTemplate.queryForList(
                "SELECT id, user_id, author_name, title, content, created_at FROM community_posts WHERE id = ?", id);
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

    @DeleteMapping("/community/posts/{id}")
    public ResponseEntity<Void> deletePost(@PathVariable long id) {
        User user = requireUser();
        var rows = jdbcTemplate.queryForList("SELECT user_id FROM community_posts WHERE id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다.");
        }
        requireOwnerOrAdmin(user, (java.util.UUID) rows.get(0).get("user_id"));

        jdbcTemplate.update("DELETE FROM community_posts WHERE id = ?", id);
        return ResponseEntity.noContent().build();
    }

    // ── 댓글 ────────────────────────────────────────────────────────────────

    @GetMapping("/community/posts/{id}/comments")
    public ResponseEntity<List<Map<String, Object>>> listComments(@PathVariable long id) {
        return ResponseEntity.ok(jdbcTemplate.queryForList(
                "SELECT id, post_id, user_id, author_name, content, created_at FROM community_comments WHERE post_id = ? ORDER BY id ASC",
                id));
    }

    @PostMapping("/community/posts/{id}/comments")
    public ResponseEntity<Map<String, Object>> createComment(@PathVariable long id, @RequestBody Map<String, String> body) {
        User user = requireUser();
        String content = strip(body.get("content"), 1000);
        if (content.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "댓글을 입력해주세요.");
        }
        if (jdbcTemplate.queryForList("SELECT id FROM community_posts WHERE id = ?", id).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "게시글을 찾을 수 없습니다.");
        }
        rateLimitService.checkChatLimit(user.getId().toString());

        Long commentId = jdbcTemplate.queryForObject(
                "INSERT INTO community_comments (post_id, user_id, author_name, content) VALUES (?, ?, ?, ?) RETURNING id",
                Long.class, id, user.getId(), user.getName(), content);
        return ResponseEntity.status(201).body(Map.of("id", commentId));
    }

    @DeleteMapping("/community/posts/{postId}/comments/{commentId}")
    public ResponseEntity<Void> deleteComment(@PathVariable long postId, @PathVariable long commentId) {
        User user = requireUser();
        var rows = jdbcTemplate.queryForList(
                "SELECT user_id FROM community_comments WHERE id = ? AND post_id = ?", commentId, postId);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다.");
        }
        requireOwnerOrAdmin(user, (java.util.UUID) rows.get(0).get("user_id"));

        jdbcTemplate.update("DELETE FROM community_comments WHERE id = ?", commentId);
        return ResponseEntity.noContent().build();
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

    @DeleteMapping("/chat/messages/{id}")
    public ResponseEntity<Void> deleteMessage(@PathVariable long id) {
        User user = requireUser();
        if (!authService.isAdmin(user)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "삭제 권한이 없습니다.");
        }
        jdbcTemplate.update("DELETE FROM chat_messages WHERE id = ?", id);
        return ResponseEntity.noContent().build();
    }

    // ── 내부 유틸 ────────────────────────────────────────────────────────────

    private User requireUser() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof User user) {
            return user;
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
    }

    private void requireOwnerOrAdmin(User user, java.util.UUID ownerId) {
        if (user.getId().equals(ownerId) || authService.isAdmin(user)) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, "삭제 권한이 없습니다.");
    }

    private String strip(String s, int maxLen) {
        if (s == null) return "";
        String stripped = s.strip();
        return stripped.length() > maxLen ? stripped.substring(0, maxLen) : stripped;
    }
}
