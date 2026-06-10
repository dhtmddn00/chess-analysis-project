package com.chessanalysis.api.repository;

import com.chessanalysis.api.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
    boolean existsByEmail(String email);
    Optional<User> findByVerificationToken(String token);
    Optional<User> findByPasswordResetToken(String token);
    boolean existsByNameIgnoreCase(String name);

    // 미인증 + 만료된 계정 일괄 삭제 (정리 스케줄러용)
    @Modifying
    @Query("DELETE FROM User u WHERE u.emailVerified = false AND u.verificationTokenExpiresAt < :cutoff")
    int deleteUnverifiedExpiredBefore(LocalDateTime cutoff);
}
