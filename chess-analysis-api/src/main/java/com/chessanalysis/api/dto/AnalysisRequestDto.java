package com.chessanalysis.api.dto;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class AnalysisRequestDto {
    
    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 25, message = "Username must be between 3 and 25 characters")
    private String username;
    
    @NotBlank(message = "Platform is required")
    @Pattern(regexp = "chess\\.com|lichess", message = "Platform must be chess.com or lichess")
    private String platform = "chess.com";
    
    @NotNull(message = "Game count is required")
    @Min(value = 5, message = "Minimum 5 games required")
    @Max(value = 50, message = "Maximum 50 games allowed")
    private Integer gameCount = 20;
    
    @Pattern(regexp = "all|rapid|blitz|bullet", message = "Time control must be all, rapid, blitz, or bullet")
    private String timeControl = "all";
    
    @Pattern(regexp = "fast|precise", message = "Priority must be fast or precise")
    private String priority = "fast";
}