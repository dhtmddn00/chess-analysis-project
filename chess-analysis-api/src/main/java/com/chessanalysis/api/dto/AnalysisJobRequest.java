package com.chessanalysis.api.dto;

public class AnalysisJobRequest {
    public String platform;
    public String username;
    public int n = 10; // number of games to analyze
    public String priority = "fast"; // "fast" or "precise"
    public String timeControl; // optional filter: "blitz", "rapid", "bullet"
}