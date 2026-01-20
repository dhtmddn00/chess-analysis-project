package com.chessanalysis.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;

public class AnalysisJobResponse {
    @JsonProperty("jobId")
    public String jobId;
    public String status; // "queued", "running", "done", "failed"
    @JsonProperty("etaSec")
    public Integer etaSec;
}

// Separate class for status responses
class AnalysisJobStatus {
    public String status;
    public double progress; // 0.0 to 1.0
    public Map<String, Object> partials;
    public Map<String, Object> summary; // when done
    public Map<String, Object> profile; // when done  
    public Map<String, Object> plan; // when done
    @JsonProperty("analysisVersion")
    public String analysisVersion;
    public String error; // if failed
    @JsonProperty("etaRemainingSec")
    public Integer etaRemainingSec;
}