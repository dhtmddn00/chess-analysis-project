package com.chessanalysis.api.queue;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ProgressUpdateDto {
    
    private UUID analysisId;
    private Integer progress;
    private String currentStep;
    private Long timestamp;
}