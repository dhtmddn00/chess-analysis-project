package com.chessanalysis.api.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import com.fasterxml.jackson.annotation.JsonIgnore;

@Entity
@Table(name = "game_analysis_results")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GameAnalysisResult {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "game_id", nullable = false)
    @JsonIgnore
    private Game game;
    
    @Column(name = "average_centipawn_loss")
    private Double averageCentipawnLoss;
    
    @Column(name = "accuracy_percentage")
    private Double accuracyPercentage;
    
    @Column(name = "blunders_count")
    private Integer blundersCount;
    
    @Column(name = "mistakes_count")
    private Integer mistakesCount;
    
    @Column(name = "inaccuracies_count")
    private Integer inaccuraciesCount;
    
    @Column(name = "best_moves_count")
    private Integer bestMovesCount;
    
    @Column(name = "excellent_moves_count")
    private Integer excellentMovesCount;
    
    @Column(name = "good_moves_count")
    private Integer goodMovesCount;
    
    @Column(name = "opening_accuracy")
    private Double openingAccuracy;
    
    @Column(name = "middlegame_accuracy")
    private Double middlegameAccuracy;
    
    @Column(name = "endgame_accuracy")
    private Double endgameAccuracy;
    
    @Column(name = "time_usage_efficiency")
    private Double timeUsageEfficiency;
    
    @Column(name = "move_analysis_json", columnDefinition = "JSONB")
    private String moveAnalysisJson;
}