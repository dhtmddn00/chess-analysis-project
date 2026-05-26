package com.chessanalysis.api.dto;

import com.chessanalysis.api.entity.Analysis;
import lombok.Data;
import lombok.Builder;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
public class AnalysisResponseDto {
    
    private UUID id;
    private String username;
    private String platform;
    private Integer gameCount;
    private Analysis.AnalysisStatus status;
    private Integer progress;
    private String currentStep;
    private String errorMessage;
    private String reportUrl;
    private String shortLink;
    /** 분석 생성 시에만 반환되는 취소 토큰. 상태 폴링 응답에서는 null. */
    private String cancelToken;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    public static AnalysisResponseDto fromEntity(Analysis analysis) {
        return AnalysisResponseDto.builder()
                .id(analysis.getId())
                .username(analysis.getUsername())
                .platform(analysis.getPlatform())
                .gameCount(analysis.getGameCount())
                .status(analysis.getStatus())
                .progress(analysis.getProgress())
                .currentStep(analysis.getCurrentStep())
                .errorMessage(analysis.getErrorMessage())
                .reportUrl(analysis.getReportUrl())
                .shortLink(analysis.getShortLink())
                .createdAt(analysis.getCreatedAt())
                .updatedAt(analysis.getUpdatedAt())
                .build();
    }
}