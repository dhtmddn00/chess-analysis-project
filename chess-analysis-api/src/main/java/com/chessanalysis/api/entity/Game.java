package com.chessanalysis.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import com.fasterxml.jackson.annotation.JsonIgnore;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "games")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Game {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(name = "game_id", unique = true, nullable = false)
    private String gameId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "analysis_id", nullable = false)
    @JsonIgnore
    private Analysis analysis;
    
    @Column(name = "white_player", nullable = false)
    private String whitePlayer;
    
    @Column(name = "black_player", nullable = false)
    private String blackPlayer;
    
    @Column(name = "result")
    private String result;
    
    @Column(name = "time_control")
    private String timeControl;
    
    @Column(name = "pgn", columnDefinition = "TEXT")
    private String pgn;
    
    @Column(name = "played_at")
    private LocalDateTime playedAt;
    
    @Column(name = "player_color")
    private String playerColor;
    
    @Column(name = "player_rating")
    private Integer playerRating;
    
    @Column(name = "opponent_rating")
    private Integer opponentRating;
    
    @Enumerated(EnumType.STRING)
    @Column(name = "analysis_status")
    private GameAnalysisStatus analysisStatus = GameAnalysisStatus.PENDING;
    
    @OneToOne(mappedBy = "game", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private GameAnalysisResult analysisResult;
    
    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    
    public enum GameAnalysisStatus {
        PENDING,
        IN_PROGRESS,
        COMPLETED,
        FAILED
    }
}