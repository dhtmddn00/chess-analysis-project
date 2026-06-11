package com.chessanalysis.api.dto.mypage;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

/** 마이페이지 분석 이력 1건 — 시간별 변화 그래프의 데이터 포인트. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AnalysisHistoryItem {
    private UUID id;
    private String username;
    private String platform;
    private Integer gameCount;
    private LocalDateTime createdAt;
    private Double avgAccuracy;
    private Double avgAcpl;
    private Double tacticalRating;
    private Double positionalRating;
    private Double endgameRating;
    private Double timeManagementRating;
}
