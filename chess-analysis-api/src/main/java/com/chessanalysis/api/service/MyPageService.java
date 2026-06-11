package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.mypage.AnalysisHistoryItem;
import com.chessanalysis.api.entity.User;
import com.chessanalysis.api.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MyPageService {

    private final JdbcTemplate jdbcTemplate;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    /** 본인 분석 이력 (완료된 것만, 오래된 순 — 그래프 X축 시간순). */
    public List<AnalysisHistoryItem> getAnalysisHistory(UUID userId) {
        return jdbcTemplate.query(
                """
                SELECT a.id, a.username, a.platform, a.game_count, a.created_at,
                       (SELECT AVG(g.accuracy) FROM game_analyses g WHERE g.analysis_id = a.id)                 AS avg_accuracy,
                       (SELECT AVG(g.average_centipawn_loss) FROM game_analyses g WHERE g.analysis_id = a.id)   AS avg_acpl,
                       s.tactical_rating, s.positional_rating, s.endgame_rating, s.time_management_rating
                FROM analyses a
                LEFT JOIN style_profiles_worker s ON s.analysis_id = a.id
                WHERE a.user_id = ? AND a.status = 'COMPLETED'
                ORDER BY a.created_at ASC
                LIMIT 100
                """,
                (rs, i) -> AnalysisHistoryItem.builder()
                        .id(UUID.fromString(rs.getString("id")))
                        .username(rs.getString("username"))
                        .platform(rs.getString("platform"))
                        .gameCount(rs.getInt("game_count"))
                        .createdAt(rs.getTimestamp("created_at").toLocalDateTime())
                        .avgAccuracy(rs.getObject("avg_accuracy") == null ? null : rs.getDouble("avg_accuracy"))
                        .avgAcpl(rs.getObject("avg_acpl") == null ? null : rs.getDouble("avg_acpl"))
                        .tacticalRating(rs.getObject("tactical_rating") == null ? null : rs.getDouble("tactical_rating"))
                        .positionalRating(rs.getObject("positional_rating") == null ? null : rs.getDouble("positional_rating"))
                        .endgameRating(rs.getObject("endgame_rating") == null ? null : rs.getDouble("endgame_rating"))
                        .timeManagementRating(rs.getObject("time_management_rating") == null ? null : rs.getDouble("time_management_rating"))
                        .build(),
                userId);
    }

    /** 프로필 수정 — 이름(중복 확인)·국가. null 필드는 변경 안 함. */
    @Transactional
    public User updateProfile(UUID userId, String name, String country) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다."));

        if (name != null && !name.isBlank()) {
            String stripped = name.strip();
            if (!stripped.equalsIgnoreCase(user.getName())
                    && userRepository.existsByNameIgnoreCase(stripped)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 사용 중인 이름입니다.");
            }
            user.setName(stripped);
        }
        if (country != null) {
            user.setCountry(country.isBlank() ? null : country.strip().toUpperCase());
        }
        return userRepository.save(user);
    }

    /** 비밀번호 변경 — 현재 비밀번호 확인 필수. */
    @Transactional
    public void changePassword(UUID userId, String currentPassword, String newPassword) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "사용자를 찾을 수 없습니다."));

        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "현재 비밀번호가 올바르지 않습니다.");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }
}
