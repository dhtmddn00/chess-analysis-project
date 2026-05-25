package com.chessanalysis.api.repository;

import com.chessanalysis.api.entity.Analysis;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AnalysisRepository extends JpaRepository<Analysis, UUID> {
    
    List<Analysis> findByUsernameAndPlatform(String username, String platform);
    
    List<Analysis> findByStatus(Analysis.AnalysisStatus status);
    
    Optional<Analysis> findByShortLink(String shortLink);

    /** shortLink 컬럼이 주어진 suffix로 끝나는 레코드를 찾는다 (short code 기반 조회). */
    Optional<Analysis> findByShortLinkEndingWith(String suffix);
    
    @Query("SELECT a FROM Analysis a WHERE a.username = :username AND a.platform = :platform AND a.status IN ('PENDING', 'IN_PROGRESS') AND a.createdAt >= :since")
    Optional<Analysis> findActiveAnalysis(@Param("username") String username, @Param("platform") String platform, @Param("since") LocalDateTime since);

    @Query("SELECT a FROM Analysis a WHERE LOWER(a.username) = LOWER(:username) AND a.platform = :platform AND a.status IN ('PENDING', 'IN_PROGRESS') ORDER BY a.createdAt DESC")
    List<Analysis> findActiveAnalysesForUser(@Param("username") String username, @Param("platform") String platform);
    
    @Query("SELECT COUNT(a) FROM Analysis a WHERE a.createdAt >= :since")
    Long countAnalysesSince(@Param("since") LocalDateTime since);
    
    @Query("SELECT COUNT(a) FROM Analysis a WHERE a.status = 'COMPLETED'")
    Long countCompletedAnalyses();
    
    @Query("SELECT COUNT(a) FROM Analysis a WHERE a.status = 'PENDING' OR a.status = 'IN_PROGRESS'")
    Long countActiveAnalyses();
}
