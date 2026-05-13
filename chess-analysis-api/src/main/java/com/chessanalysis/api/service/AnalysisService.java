package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.dto.AnalysisResponseDto;
import com.chessanalysis.api.entity.Analysis;
import com.chessanalysis.api.queue.AnalysisJobDto;
import com.chessanalysis.api.queue.AnalysisQueueService;
import com.chessanalysis.api.repository.AnalysisRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;
import javax.sql.DataSource;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalysisService {
    
    private final AnalysisRepository analysisRepository;
    private final AnalysisQueueService queueService;
    private final ShortLinkService shortLinkService;
    private final AnalysisRateLimitService rateLimitService;
    private final DataSource dataSource;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;
    
    @Transactional
    public AnalysisResponseDto createAnalysis(AnalysisRequestDto request, String clientIp) {
        // Check for existing active analysis (within last 5 minutes - reduced window)
        Optional<Analysis> activeAnalysis = analysisRepository.findActiveAnalysis(
                request.getUsername(), request.getPlatform(), 
                LocalDateTime.now().minusMinutes(5));
                
        if (activeAnalysis.isPresent()) {
            // Return the existing analysis instead of throwing an error
            Analysis existing = activeAnalysis.get();
            log.info("Returning existing active analysis {} for user: {}", existing.getId(), request.getUsername());
            return AnalysisResponseDto.fromEntity(existing);
        }

        rateLimitService.enforceLimits(request, clientIp);
        
        // Create new analysis
        Analysis analysis = Analysis.builder()
                .username(request.getUsername())
                .platform(request.getPlatform())
                .gameCount(request.getGameCount())
                .status(Analysis.AnalysisStatus.PENDING)
                .progress(0)
                .currentStep("Queued for processing")
                .build();
                
        analysis = analysisRepository.save(analysis);
        log.info("Created analysis with ID: {} for user: {}", analysis.getId(), request.getUsername());
        
        // Generate short link
        String shortLink = shortLinkService.generateShortLink(analysis.getId());
        analysis.setShortLink(shortLink);
        analysis = analysisRepository.save(analysis);
        
        // Enqueue for processing
        AnalysisJobDto job = AnalysisJobDto.create(
                analysis.getId(),
                request.getUsername(),
                request.getPlatform(),
                request.getGameCount(),
                request.getTimeControl(),
                request.getPriority()
        );
        
        queueService.enqueueAnalysisJob(job);
        
        return AnalysisResponseDto.fromEntity(analysis);
    }
    
    @Transactional(readOnly = true)
    public Optional<AnalysisResponseDto> getAnalysis(UUID analysisId) {
        return analysisRepository.findById(analysisId)
                .map(AnalysisResponseDto::fromEntity);
    }
    
    @Transactional(readOnly = true)
    public Optional<AnalysisResponseDto> getAnalysisByShortLink(String shortLink) {
        return analysisRepository.findByShortLink(shortLink)
                .map(AnalysisResponseDto::fromEntity);
    }
    
    @Transactional(readOnly = true)
    public List<AnalysisResponseDto> getUserAnalyses(String username, String platform) {
        return analysisRepository.findByUsernameAndPlatform(username, platform)
                .stream()
                .map(AnalysisResponseDto::fromEntity)
                .toList();
    }
    
    @Transactional
    public void updateAnalysisStatus(UUID analysisId, Analysis.AnalysisStatus status, 
                                   Integer progress, String currentStep, String errorMessage) {
        analysisRepository.findById(analysisId).ifPresent(analysis -> {
            analysis.setStatus(status);
            if (progress != null) analysis.setProgress(progress);
            if (currentStep != null) analysis.setCurrentStep(currentStep);
            if (errorMessage != null) analysis.setErrorMessage(errorMessage);
            
            analysisRepository.save(analysis);
            log.info("Updated analysis {} status to {} with progress {}%", 
                    analysisId, status, progress);
        });
    }
    
    @Transactional
    public void completeAnalysis(UUID analysisId, String reportUrl) {
        analysisRepository.findById(analysisId).ifPresent(analysis -> {
            analysis.setStatus(Analysis.AnalysisStatus.COMPLETED);
            analysis.setProgress(100);
            analysis.setCurrentStep("Analysis completed");
            analysis.setReportUrl(reportUrl);
            
            analysisRepository.save(analysis);
            log.info("Completed analysis {} with report URL: {}", analysisId, reportUrl);
        });
    }
    
    @Transactional(readOnly = true)
    public Long getTotalAnalyses() {
        return analysisRepository.count();
    }
    
    @Transactional(readOnly = true)
    public Long getCompletedAnalyses() {
        return analysisRepository.countCompletedAnalyses();
    }
    
    @Transactional(readOnly = true)
    public Long getActiveAnalyses() {
        return analysisRepository.countActiveAnalyses();
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getAnalysisStatus(UUID analysisId) {
        // First get basic analysis from database
        Optional<Analysis> analysisOpt = analysisRepository.findById(analysisId);
        if (analysisOpt.isEmpty()) {
            throw new RuntimeException("Analysis not found");
        }
        
        Analysis analysis = analysisOpt.get();
        
        // Create base status map
        Map<String, Object> status = new HashMap<>();
        status.put("id", analysis.getId());
        status.put("status", analysis.getStatus().name().toLowerCase());
        status.put("progress", analysis.getProgress() != null ? analysis.getProgress() : 0);
        status.put("currentStep", analysis.getCurrentStep() != null ? analysis.getCurrentStep() : "");
        status.put("errorMessage", analysis.getErrorMessage() != null ? analysis.getErrorMessage() : "");
        
        // Try to get real-time progress from Redis
        try {
            String redisKey = "analysis:progress:" + analysisId.toString();
            Object redisData = redisTemplate.opsForValue().get(redisKey);
            
            if (redisData != null) {
                // Parse Redis data
                Map<String, Object> progressData;
                if (redisData instanceof String) {
                    progressData = objectMapper.readValue((String) redisData, new TypeReference<Map<String, Object>>() {});
                } else {
                    progressData = (Map<String, Object>) redisData;
                }
                
                // Update status with Redis data (more current)
                if (progressData.containsKey("progress")) {
                    status.put("progress", progressData.get("progress"));
                }
                if (progressData.containsKey("currentStep")) {
                    status.put("currentStep", progressData.get("currentStep"));
                }
                if (progressData.containsKey("partials")) {
                    status.put("partials", progressData.get("partials"));
                }
                
                log.debug("Retrieved real-time progress for analysis {}: {}%", 
                         analysisId, progressData.get("progress"));
            }
        } catch (Exception e) {
            log.warn("Failed to get real-time progress for analysis {}: {}", analysisId, e.getMessage());
            // Fall back to database values (already set above)
        }
        
        return status;
    }
    
    @Transactional(readOnly = true)
    public Long getQueueSize() {
        return queueService.getQueueSize();
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getAnalysisResult(UUID analysisId) {
        Map<String, Object> result = new HashMap<>();
        
        try (var connection = dataSource.getConnection()) {
            // Get analysis summary
            var analysisStmt = connection.prepareStatement(
                "SELECT username, platform, game_count, status FROM analyses WHERE id = ?");
            analysisStmt.setObject(1, analysisId);
            var analysisResult = analysisStmt.executeQuery();
            
            if (analysisResult.next()) {
                result.put("analysisId", analysisId.toString());
                result.put("username", analysisResult.getString("username"));
                result.put("platform", analysisResult.getString("platform"));
                result.put("gameCount", analysisResult.getInt("game_count"));
                result.put("status", analysisResult.getString("status"));
                
                // Get game analyses summary
                var gameStatsStmt = connection.prepareStatement(
                    "SELECT COUNT(*) as total_games, " +
                    "AVG(accuracy) as avg_accuracy, " +
                    "SUM(blunders) as total_blunders, " +
                    "SUM(mistakes) as total_mistakes, " +
                    "SUM(inaccuracies) as total_inaccuracies, " +
                    "AVG(average_centipawn_loss) as avg_centipawn_loss " +
                    "FROM game_analyses WHERE analysis_id = ?");
                gameStatsStmt.setObject(1, analysisId);
                var statsResult = gameStatsStmt.executeQuery();
                
                if (statsResult.next()) {
                    double avgAccuracy = Math.round(statsResult.getDouble("avg_accuracy") * 100) / 100.0;
                    double avgCentipawnLoss = Math.round(statsResult.getDouble("avg_centipawn_loss") * 100) / 100.0;
                    int totalBlunders = statsResult.getInt("total_blunders");
                    int totalMistakes = statsResult.getInt("total_mistakes");
                    int totalInaccuracies = statsResult.getInt("total_inaccuracies");
                    int totalGames = statsResult.getInt("total_games");
                    
                    result.put("totalGames", totalGames);
                    result.put("averageAccuracy", avgAccuracy);
                    result.put("totalBlunders", totalBlunders);
                    result.put("totalMistakes", totalMistakes);
                    result.put("totalInaccuracies", totalInaccuracies);
                    result.put("averageCentipawnLoss", avgCentipawnLoss);
                    
                    // 상세한 설명 추가
                    Map<String, Object> explanations = new HashMap<>();
                    
                    // 정확도 설명
                    String accuracyExplanation;
                    if (avgAccuracy >= 90) {
                        accuracyExplanation = "매우 우수한 정확도입니다! 대부분의 수에서 최선의 선택을 하고 있습니다. 이 수준의 정확도는 상급자 레벨에 해당합니다.";
                    } else if (avgAccuracy >= 80) {
                        accuracyExplanation = "좋은 정확도를 보이고 있습니다. 전체적으로 안정적인 플레이를 하고 있으며, 몇 가지 개선점만 보완하면 더욱 향상될 수 있습니다.";
                    } else if (avgAccuracy >= 70) {
                        accuracyExplanation = "평균적인 정확도입니다. 기본적인 체스 실력은 갖추고 있지만, 계산력과 포지셔널 이해도를 향상시키면 더 나은 결과를 얻을 수 있습니다.";
                    } else {
                        accuracyExplanation = "정확도 향상이 필요합니다. 각 수를 두기 전에 더 신중하게 생각하고, 상대방의 위협을 더 주의깊게 살펴보세요. 기본적인 전술 훈련이 도움이 될 것입니다.";
                    }
                    explanations.put("accuracyExplanation", accuracyExplanation);
                    
                    // ACPL 설명
                    String acplExplanation;
                    if (avgCentipawnLoss <= 30) {
                        acplExplanation = "매우 낮은 센티폰 손실로, 거의 완벽에 가까운 플레이를 보이고 있습니다. 각 수에서 최적의 선택을 하고 있습니다.";
                    } else if (avgCentipawnLoss <= 50) {
                        acplExplanation = "양호한 센티폰 손실 수치입니다. 대부분의 수에서 합리적인 판단을 하고 있으며, 큰 실수는 드물게 발생합니다.";
                    } else if (avgCentipawnLoss <= 80) {
                        acplExplanation = "평균적인 센티폰 손실입니다. 일부 수에서 더 나은 선택이 가능했을 것입니다. 계산력과 평가 능력 향상이 필요합니다.";
                    } else {
                        acplExplanation = "센티폰 손실이 높습니다. 각 수의 결과를 더 깊이 계산하고, 포지션 평가 능력을 기르는 것이 중요합니다. 전술 훈련과 엔드게임 학습을 권장합니다.";
                    }
                    explanations.put("acplExplanation", acplExplanation);
                    
                    // 실수 분석
                    double avgBlundersPerGame = (double) totalBlunders / totalGames;
                    double avgMistakesPerGame = (double) totalMistakes / totalGames;
                    String errorAnalysis;
                    if (avgBlundersPerGame <= 0.5 && avgMistakesPerGame <= 1.0) {
                        errorAnalysis = "실수 관리가 우수합니다. 치명적인 실수는 거의 없고, 작은 부정확성도 잘 통제하고 있습니다.";
                    } else if (avgBlundersPerGame <= 1.0 && avgMistakesPerGame <= 2.0) {
                        errorAnalysis = "실수 빈도가 적당한 수준입니다. 가끔씩 발생하는 실수들을 줄이기 위해 더 신중한 계산이 필요합니다.";
                    } else {
                        errorAnalysis = "실수가 자주 발생하고 있습니다. 시간을 충분히 사용하여 각 수를 검토하고, 상대방의 위협을 놓치지 않도록 주의하세요.";
                    }
                    explanations.put("errorAnalysis", errorAnalysis);
                    
                    result.put("explanations", explanations);
                }

                result.put("openingStats", getOpeningStats(connection, analysisId, analysisResult.getString("username")));
                
                // Get enhanced style profile with all data
                var styleStmt = connection.prepareStatement(
                    "SELECT playing_style, strengths, weaknesses, tactical_rating, " +
                    "positional_rating, endgame_rating, time_management_rating, " +
                    "blunder_tendency, risk_tolerance, piece_activity_preference, " +
                    "aggression_rating, exchange_preference, opening_variety, " +
                    "lead_conversion, consistency, swindle_resistance, " +
                    "summary_data, metadata, tactical_stats FROM style_profiles_worker WHERE analysis_id = ?");
                styleStmt.setObject(1, analysisId);
                var styleResult = styleStmt.executeQuery();
                
                Map<String, Object> profile = new HashMap<>();
                String tacticalStatsJson = null;  // Initialize outside the if block
                if (styleResult.next()) {
                    profile.put("playingStyle", styleResult.getString("playing_style"));
                    profile.put("tacticalRating", Math.round(styleResult.getDouble("tactical_rating") * 100) / 100.0);
                    profile.put("positionalRating", Math.round(styleResult.getDouble("positional_rating") * 100) / 100.0);
                    profile.put("endgameRating", Math.round(styleResult.getDouble("endgame_rating") * 100) / 100.0);
                    profile.put("timeManagementRating", Math.round(styleResult.getDouble("time_management_rating") * 100) / 100.0);
                    profile.put("blunderTendency", Math.round(styleResult.getDouble("blunder_tendency") * 100) / 100.0);
                    profile.put("riskTolerance", Math.round(styleResult.getDouble("risk_tolerance") * 100) / 100.0);
                    profile.put("pieceActivityPreference", Math.round(styleResult.getDouble("piece_activity_preference") * 100) / 100.0);
                    
                    // Additional 12-dimensional analysis fields
                    profile.put("aggressionRating", Math.round(styleResult.getDouble("aggression_rating") * 100) / 100.0);
                    profile.put("exchangePreference", Math.round(styleResult.getDouble("exchange_preference") * 100) / 100.0);
                    profile.put("openingVariety", Math.round(styleResult.getDouble("opening_variety") * 100) / 100.0);
                    profile.put("leadConversion", Math.round(styleResult.getDouble("lead_conversion") * 100) / 100.0);
                    profile.put("consistency", Math.round(styleResult.getDouble("consistency") * 100) / 100.0);
                    profile.put("swindleResistance", Math.round(styleResult.getDouble("swindle_resistance") * 100) / 100.0);
                    
                    // Parse JSON fields
                    String strengthsJson = styleResult.getString("strengths");
                    String weaknessesJson = styleResult.getString("weaknesses");
                    String summaryDataJson = styleResult.getString("summary_data");
                    String metadataJson = styleResult.getString("metadata");
                    tacticalStatsJson = styleResult.getString("tactical_stats");
                    
                    // Add JSON data (simplified - in production would use proper JSON parsing)
                    profile.put("strengths", strengthsJson != null ? strengthsJson : "[]");
                    profile.put("weaknesses", weaknessesJson != null ? weaknessesJson : "[]");
                    profile.put("metadata", metadataJson != null ? metadataJson : "{}");
                    profile.put("tacticalStats", tacticalStatsJson != null ? tacticalStatsJson : "{}");
                    
                    // 스타일 차원별 상세 설명 추가
                    Map<String, Object> dimensionExplanations = new HashMap<>();
                    
                    double tacticalRating = styleResult.getDouble("tactical_rating");
                    double positionalRating = styleResult.getDouble("positional_rating");
                    double endgameRating = styleResult.getDouble("endgame_rating");
                    double timeManagementRating = styleResult.getDouble("time_management_rating");
                    double aggressionRating = styleResult.getDouble("aggression_rating");
                    double consistency = styleResult.getDouble("consistency");
                    double riskTolerance = styleResult.getDouble("risk_tolerance");
                    double exchangePreference = styleResult.getDouble("exchange_preference");
                    double openingVariety = styleResult.getDouble("opening_variety");
                    double leadConversion = styleResult.getDouble("lead_conversion");
                    
                    // 전술적 감각 설명
                    String tacticalExplanation = getTacticalExplanation(tacticalRating);
                    dimensionExplanations.put("tacticalExplanation", tacticalExplanation);
                    
                    // 포지셔널 이해 설명
                    String positionalExplanation = getPositionalExplanation(positionalRating);
                    dimensionExplanations.put("positionalExplanation", positionalExplanation);
                    
                    // 엔드게임 기술 설명
                    String endgameExplanation = getEndgameExplanation(endgameRating);
                    dimensionExplanations.put("endgameExplanation", endgameExplanation);
                    
                    // 시간 관리 설명
                    String timeManagementExplanation = getTimeManagementExplanation(timeManagementRating);
                    dimensionExplanations.put("timeManagementExplanation", timeManagementExplanation);
                    
                    // 공격성 설명
                    String aggressionExplanation = getAggressionExplanation(aggressionRating);
                    dimensionExplanations.put("aggressionExplanation", aggressionExplanation);
                    
                    // 일관성 설명
                    String consistencyExplanation = getConsistencyExplanation(consistency);
                    dimensionExplanations.put("consistencyExplanation", consistencyExplanation);
                    
                    // 전체적인 플레이 스타일 해석
                    String overallStyleAnalysis = getOverallStyleAnalysis(
                        styleResult.getString("playing_style"),
                        tacticalRating, positionalRating, aggressionRating, endgameRating,
                        riskTolerance, consistency, exchangePreference, openingVariety,
                        leadConversion
                    );
                    dimensionExplanations.put("overallStyleAnalysis", overallStyleAnalysis);
                    
                    profile.put("dimensionExplanations", dimensionExplanations);
                    result.put("styleProfile", profile);
                } else {
                    // Provide default style profile when analysis data is missing
                    profile.put("playingStyle", "분석 준비 중");
                    profile.put("tacticalRating", 0.0);
                    profile.put("positionalRating", 0.0);
                    profile.put("endgameRating", 0.0);
                    profile.put("timeManagementRating", 0.0);
                    profile.put("blunderTendency", 0.0);
                    profile.put("riskTolerance", 0.0);
                    profile.put("pieceActivityPreference", 0.0);
                    profile.put("aggressionRating", 0.0);
                    profile.put("exchangePreference", 0.0);
                    profile.put("openingVariety", 0.0);
                    profile.put("leadConversion", 0.0);
                    profile.put("consistency", 0.0);
                    profile.put("swindleResistance", 0.0);
                    profile.put("strengths", "[\"상세 분석 준비 중\"]");
                    profile.put("weaknesses", "[\"분석 완료 후 제공\"]");
                    profile.put("metadata", "{}");
                    profile.put("tacticalStats", "{\"message\": \"분석 진행 중\"}");
                    result.put("styleProfile", profile);
                }
                
                // Get player metadata
                var metadataStmt = connection.prepareStatement(
                    "SELECT country, title, followers, ratings_data FROM player_metadata " +
                    "WHERE username = ? AND platform = ?");
                metadataStmt.setString(1, analysisResult.getString("username"));
                metadataStmt.setString(2, analysisResult.getString("platform"));
                var metadataResult = metadataStmt.executeQuery();
                
                if (metadataResult.next()) {
                    Map<String, Object> playerMeta = new HashMap<>();
                    playerMeta.put("country", metadataResult.getString("country"));
                    playerMeta.put("title", metadataResult.getString("title"));
                    playerMeta.put("followers", metadataResult.getInt("followers"));
                    playerMeta.put("ratingsData", metadataResult.getString("ratings_data"));
                    result.put("playerMetadata", playerMeta);
                }
                
                // Get tactical opportunities summary from style_profiles_worker.tactical_stats
                var tacticalSummary = new java.util.ArrayList<Map<String, Object>>();
                int totalTacticalCount = 0;
                
                // Extract tactical data from JSON field we already have (updated for found/missed structure)
                if (tacticalStatsJson != null && !tacticalStatsJson.isEmpty() && !tacticalStatsJson.equals("{}")) {
                    try {
                        // Parse new tactical stats structure
                        int foundTactics = 0;
                        int missedTactics = 0;
                        double tacticalAccuracy = 0.0;
                        
                        if (tacticalStatsJson.contains("\"total_tactical_opportunities\":")) {
                            String totalStr = tacticalStatsJson.split("\"total_tactical_opportunities\":\\s*")[1].split("[,}]")[0];
                            totalTacticalCount = Integer.parseInt(totalStr.trim());
                        }
                        
                        if (tacticalStatsJson.contains("\"found_tactics\":")) {
                            String foundStr = tacticalStatsJson.split("\"found_tactics\":\\s*")[1].split("[,}]")[0];
                            foundTactics = Integer.parseInt(foundStr.trim());
                        }
                        
                        if (tacticalStatsJson.contains("\"missed_tactics\":")) {
                            String missedStr = tacticalStatsJson.split("\"missed_tactics\":\\s*")[1].split("[,}]")[0];
                            missedTactics = Integer.parseInt(missedStr.trim());
                        }
                        
                        if (tacticalStatsJson.contains("\"tactical_accuracy\":")) {
                            String accuracyStr = tacticalStatsJson.split("\"tactical_accuracy\":\\s*")[1].split("[,}]")[0];
                            tacticalAccuracy = Double.parseDouble(accuracyStr.trim());
                        }
                        
                        // Extract patterns_found data (tactics successfully found)
                        if (tacticalStatsJson.contains("\"patterns_found\":")) {
                            String patternsSection = tacticalStatsJson.split("\"patterns_found\":\\s*\\{")[1].split("\\}")[0];
                            String[] patterns = patternsSection.split(",");
                            
                            for (String patternData : patterns) {
                                String[] parts = patternData.split(":");
                                if (parts.length == 2) {
                                    String patternName = parts[0].trim().replaceAll("\"", "");
                                    int count = Integer.parseInt(parts[1].trim());
                                    
                                    Map<String, Object> pattern = new HashMap<>();
                                    pattern.put("pattern", patternName);
                                    pattern.put("found", count);
                                    pattern.put("missed", 0); // Will be updated below if missed data exists
                                    pattern.put("accuracy", count > 0 ? "100%" : "0%");
                                    pattern.put("averageValue", getEstimatedValue(patternName));
                                    pattern.put("averageDifficulty", getEstimatedDifficulty(patternName));
                                    pattern.put("description", getTacticalPatternDescription(patternName));
                                    tacticalSummary.add(pattern);
                                }
                            }
                        }
                        
                        // Extract patterns_missed data (tactics that were available but missed)
                        if (tacticalStatsJson.contains("\"patterns_missed\":")) {
                            String missedSection = tacticalStatsJson.split("\"patterns_missed\":\\s*\\{")[1].split("\\}")[0];
                            String[] patterns = missedSection.split(",");
                            
                            for (String patternData : patterns) {
                                String[] parts = patternData.split(":");
                                if (parts.length == 2) {
                                    String patternName = parts[0].trim().replaceAll("\"", "");
                                    int missedCount = Integer.parseInt(parts[1].trim());
                                    
                                    // Find existing pattern or create new one
                                    boolean foundExisting = false;
                                    for (Map<String, Object> existing : tacticalSummary) {
                                        if (existing.get("pattern").equals(patternName)) {
                                            existing.put("missed", missedCount);
                                            int found = (Integer) existing.get("found");
                                            double accuracy = found > 0 ? (double)found / (found + missedCount) : 0.0;
                                            existing.put("accuracy", String.format("%.1f%%", accuracy * 100));
                                            foundExisting = true;
                                            break;
                                        }
                                    }
                                    
                                    if (!foundExisting) {
                                        Map<String, Object> pattern = new HashMap<>();
                                        pattern.put("pattern", patternName);
                                        pattern.put("found", 0);
                                        pattern.put("missed", missedCount);
                                        pattern.put("accuracy", "0%");
                                        pattern.put("averageValue", getEstimatedValue(patternName));
                                        pattern.put("averageDifficulty", getEstimatedDifficulty(patternName));
                                        pattern.put("description", getTacticalPatternDescription(patternName));
                                        tacticalSummary.add(pattern);
                                    }
                                }
                            }
                        }
                        
                        // Add overall tactical statistics
                        Map<String, Object> overallStats = new HashMap<>();
                        overallStats.put("totalOpportunities", totalTacticalCount);
                        overallStats.put("foundTactics", foundTactics);
                        overallStats.put("missedTactics", missedTactics);
                        overallStats.put("tacticalAccuracy", String.format("%.1f%%", tacticalAccuracy * 100));
                        result.put("tacticalOverview", overallStats);
                        
                        // Sort by total activity (found + missed) descending
                        tacticalSummary.sort((a, b) -> {
                            int totalA = (Integer)a.get("found") + (Integer)a.get("missed");
                            int totalB = (Integer)b.get("found") + (Integer)b.get("missed");
                            return Integer.compare(totalB, totalA);
                        });
                        
                    } catch (Exception e) {
                        System.err.println("Error parsing tactical stats JSON: " + e.getMessage());
                    }
                }
                
                // Provide default tactical data if empty
                if (tacticalSummary.isEmpty()) {
                    Map<String, Object> defaultPattern = new HashMap<>();
                    defaultPattern.put("pattern", "분석 중");
                    defaultPattern.put("found", 0);
                    defaultPattern.put("missed", 0);
                    defaultPattern.put("accuracy", "0%");
                    defaultPattern.put("averageValue", 0);
                    defaultPattern.put("averageDifficulty", 0.0);
                    defaultPattern.put("description", "게임 분석을 통해 전술 기회를 찾고 있습니다.");
                    tacticalSummary.add(defaultPattern);
                    
                    // Also add default overview if not present
                    if (!result.containsKey("tacticalOverview")) {
                        Map<String, Object> defaultOverview = new HashMap<>();
                        defaultOverview.put("totalOpportunities", 0);
                        defaultOverview.put("foundTactics", 0);
                        defaultOverview.put("missedTactics", 0);
                        defaultOverview.put("tacticalAccuracy", "0%");
                        result.put("tacticalOverview", defaultOverview);
                    }
                }
                result.put("tacticalOpportunities", tacticalSummary);
                
                // 전술 기회 종합 분석 추가
                String tacticalAnalysis = getTacticalAnalysis(totalTacticalCount, result.get("totalGames") != null ? (Integer) result.get("totalGames") : 1);
                result.put("tacticalAnalysis", tacticalAnalysis);
                
                // Get training recommendations
                var trainingStmt = connection.prepareStatement(
                    "SELECT category, priority, title, description, estimated_elo_gain " +
                    "FROM training_recommendations WHERE analysis_id = ? ORDER BY priority ASC LIMIT 5");
                trainingStmt.setObject(1, analysisId);
                var trainingResult = trainingStmt.executeQuery();
                
                var recommendations = new java.util.ArrayList<Map<String, Object>>();
                while (trainingResult.next()) {
                    Map<String, Object> rec = new HashMap<>();
                    rec.put("category", trainingResult.getString("category"));
                    rec.put("priority", trainingResult.getInt("priority"));
                    rec.put("title", trainingResult.getString("title"));
                    rec.put("description", trainingResult.getString("description"));
                    rec.put("eloGain", trainingResult.getInt("estimated_elo_gain"));
                    recommendations.add(rec);
                }
                // Provide default training recommendations if empty
                if (recommendations.isEmpty()) {
                    Map<String, Object> defaultRec = new HashMap<>();
                    defaultRec.put("category", "general");
                    defaultRec.put("priority", 1);
                    defaultRec.put("title", "개인 맞춤 분석 준비 중");
                    defaultRec.put("description", "상세한 분석이 완료되면 개인별 훈련 계획을 제공해 드립니다.");
                    defaultRec.put("eloGain", 0);
                    recommendations.add(defaultRec);
                }
                result.put("trainingRecommendations", recommendations);
            }
        } catch (Exception e) {
            log.error("Failed to get analysis result for {}: {}", analysisId, e.getMessage());
            throw new RuntimeException("Failed to get analysis result", e);
        }
        
        return result;
    }
    
    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAnalysisGames(UUID analysisId) {
        List<Map<String, Object>> games = new ArrayList<>();
        
        try (var connection = dataSource.getConnection()) {
            // Get games with their analysis
            var stmt = connection.prepareStatement(
                "SELECT g.game_index, g.white_player, g.black_player, g.result, " +
                "g.opening, ga.accuracy, ga.blunders, ga.mistakes, ga.inaccuracies " +
                "FROM games_worker g " +
                "LEFT JOIN game_analyses ga ON g.analysis_id = ga.analysis_id AND g.game_index = ga.game_index " +
                "WHERE g.analysis_id = ? ORDER BY g.game_index");
            stmt.setObject(1, analysisId);
            var result = stmt.executeQuery();
            
            while (result.next()) {
                Map<String, Object> game = new HashMap<>();
                game.put("gameIndex", result.getInt("game_index"));
                game.put("whitePlayer", result.getString("white_player"));
                game.put("blackPlayer", result.getString("black_player"));
                game.put("result", result.getString("result"));
                game.put("opening", result.getString("opening"));
                game.put("accuracy", Math.round(result.getDouble("accuracy") * 100) / 100.0);
                game.put("blunders", result.getInt("blunders"));
                game.put("mistakes", result.getInt("mistakes"));
                game.put("inaccuracies", result.getInt("inaccuracies"));
                games.add(game);
            }
        } catch (Exception e) {
            log.error("Failed to get games for analysis {}: {}", analysisId, e.getMessage());
            throw new RuntimeException("Failed to get games", e);
        }
        
        return games;
    }

    private Map<String, Object> getOpeningStats(java.sql.Connection connection, UUID analysisId, String username) throws Exception {
        Map<String, OpeningCounter> whiteOpenings = new HashMap<>();
        Map<String, OpeningCounter> blackOpenings = new HashMap<>();
        int whiteGames = 0;
        int blackGames = 0;

        var stmt = connection.prepareStatement(
            "SELECT white_player, black_player, opening, pgn FROM games_worker WHERE analysis_id = ?");
        stmt.setObject(1, analysisId);
        var rs = stmt.executeQuery();

        while (rs.next()) {
            String whitePlayer = rs.getString("white_player");
            String blackPlayer = rs.getString("black_player");
            String opening = normalizeOpeningName(rs.getString("opening"), rs.getString("pgn"));

            if (whitePlayer != null && whitePlayer.equalsIgnoreCase(username)) {
                whiteGames++;
                incrementOpening(whiteOpenings, opening);
            } else if (blackPlayer != null && blackPlayer.equalsIgnoreCase(username)) {
                blackGames++;
                incrementOpening(blackOpenings, opening);
            }
        }

        Map<String, Object> openingStats = new HashMap<>();
        openingStats.put("whiteTotal", whiteGames);
        openingStats.put("blackTotal", blackGames);
        openingStats.put("white", toOpeningRows(whiteOpenings, whiteGames));
        openingStats.put("black", toOpeningRows(blackOpenings, blackGames));
        return openingStats;
    }

    private void incrementOpening(Map<String, OpeningCounter> openings, String opening) {
        OpeningCounter counter = openings.computeIfAbsent(opening, key -> new OpeningCounter(key));
        counter.count++;
    }

    private List<Map<String, Object>> toOpeningRows(Map<String, OpeningCounter> openings, int totalGames) {
        return openings.values().stream()
            .sorted((a, b) -> {
                int countCompare = Integer.compare(b.count, a.count);
                return countCompare != 0 ? countCompare : a.name.compareToIgnoreCase(b.name);
            })
            .limit(2)
            .map(counter -> {
                Map<String, Object> row = new HashMap<>();
                row.put("name", counter.name);
                row.put("count", counter.count);
                row.put("percentage", totalGames > 0 ? Math.round((counter.count * 10000.0) / totalGames) / 100.0 : 0.0);
                return row;
            })
            .toList();
    }

    private String normalizeOpeningName(String opening, String pgn) {
        String resolved = opening;
        if (resolved == null || resolved.isBlank() || resolved.equalsIgnoreCase("Unknown")) {
            resolved = extractPgnTag(pgn, "Opening");
        }
        if (resolved == null || resolved.isBlank() || resolved.equalsIgnoreCase("Unknown")) {
            resolved = openingNameFromEcoUrl(extractPgnTag(pgn, "ECOUrl"));
        }
        if (resolved == null || resolved.isBlank() || resolved.equalsIgnoreCase("Unknown")) {
            resolved = extractPgnTag(pgn, "ECO");
        }
        if (resolved == null || resolved.isBlank()) {
            return "오프닝 미분류";
        }
        int variationStart = resolved.indexOf("...");
        if (variationStart > 0) {
            resolved = resolved.substring(0, variationStart);
        }
        resolved = resolved.replace('-', ' ').replaceAll("\\s+", " ").trim();
        return resolved.length() > 70 ? resolved.substring(0, 67) + "..." : resolved;
    }

    private String extractPgnTag(String pgn, String tagName) {
        if (pgn == null || pgn.isBlank()) {
            return null;
        }
        String marker = "[" + tagName + " \"";
        int start = pgn.indexOf(marker);
        if (start < 0) {
            return null;
        }
        int valueStart = start + marker.length();
        int valueEnd = pgn.indexOf("\"]", valueStart);
        if (valueEnd < 0) {
            return null;
        }
        return pgn.substring(valueStart, valueEnd);
    }

    private String openingNameFromEcoUrl(String ecoUrl) {
        if (ecoUrl == null || ecoUrl.isBlank()) {
            return null;
        }
        String slug = ecoUrl.substring(ecoUrl.lastIndexOf('/') + 1);
        String decoded = URLDecoder.decode(slug, StandardCharsets.UTF_8);
        int variationStart = decoded.indexOf("...");
        if (variationStart > 0) {
            decoded = decoded.substring(0, variationStart);
        }
        return decoded.replace('-', ' ');
    }

    private static class OpeningCounter {
        private final String name;
        private int count;

        private OpeningCounter(String name) {
            this.name = name;
        }
    }
    
    // 전술적 감각 설명 생성
    private String getTacticalExplanation(double tacticalRating) {
        if (tacticalRating >= 80) {
            return "매우 우수한 전술적 감각을 보유하고 있습니다. 복잡한 전술 패턴을 빠르게 인식하고 활용하는 능력이 뛰어납니다. 포크, 핀, 스큐어 등의 전술적 모티프를 정확하게 찾아내며, 상대방의 전술적 위협도 잘 방어합니다.";
        } else if (tacticalRating >= 60) {
            return "좋은 전술적 감각을 가지고 있습니다. 기본적인 전술 패턴들을 잘 이해하고 있으며, 대부분의 전술적 기회를 놓치지 않습니다. 복잡한 조합 공격에 대한 이해도를 더 높이면 한층 더 발전할 수 있습니다.";
        } else if (tacticalRating >= 40) {
            return "평균적인 전술적 감각입니다. 간단한 전술 패턴은 찾을 수 있지만, 복잡한 조합이나 깊은 계산이 필요한 전술은 놓치는 경우가 있습니다. 전술 퍼즐 풀이와 실전 연습을 통해 개선할 수 있습니다.";
        } else {
            return "전술적 감각 향상이 필요합니다. 기본적인 전술 패턴부터 체계적으로 학습하는 것을 권장합니다. 매일 전술 퍼즐을 풀고, 자신의 게임에서 놓친 전술적 기회들을 복기해보세요.";
        }
    }
    
    // 포지셔널 이해 설명 생성
    private String getPositionalExplanation(double positionalRating) {
        if (positionalRating >= 80) {
            return "뛰어난 포지셔널 이해도를 보입니다. 피스의 조화, 폰 구조, 킹의 안전성 등을 종합적으로 고려하여 장기적인 플랜을 세우는 능력이 우수합니다. 포지셔널 희생과 교환의 타이밍을 잘 파악합니다.";
        } else if (positionalRating >= 60) {
            return "양호한 포지셔널 감각을 가지고 있습니다. 기본적인 포지셔널 원리들을 이해하고 있으며, 피스 배치와 폰 구조의 중요성을 알고 있습니다. 더 깊은 포지셔널 개념들을 학습하면 실력이 한층 향상될 것입니다.";
        } else if (positionalRating >= 40) {
            return "포지셔널 이해도가 평균적입니다. 간단한 포지셔널 개념은 알고 있지만, 복잡한 포지션에서의 평가와 플랜 수립에 어려움을 겪습니다. 클래식 게임 분석과 포지셔널 교재 학습을 권장합니다.";
        } else {
            return "포지셔널 개념에 대한 학습이 필요합니다. 피스 활용도, 폰 구조의 장단점, 킹의 안전성 등 기본적인 포지셔널 요소들부터 체계적으로 학습해보세요. 마스터들의 게임을 분석하는 것도 큰 도움이 됩니다.";
        }
    }
    
    // 엔드게임 기술 설명 생성
    private String getEndgameExplanation(double endgameRating) {
        if (endgameRating >= 80) {
            return "탁월한 엔드게임 기술을 보유하고 있습니다. 기본적인 체크메이트 패턴부터 복잡한 폰 엔드게임까지 정확하게 플레이할 수 있습니다. 엔드게임에서의 킹 활용과 폰 진형 관리가 뛰어납니다.";
        } else if (endgameRating >= 60) {
            return "좋은 엔드게임 기술을 가지고 있습니다. 기본적인 엔드게임 원리들을 잘 이해하고 있으며, 대부분의 간단한 엔드게임을 정확하게 처리할 수 있습니다. 고급 엔드게임 테크닉을 더 학습하면 도움이 될 것입니다.";
        } else if (endgameRating >= 40) {
            return "평균적인 엔드게임 실력입니다. 기본적인 체크메이트는 할 수 있지만, 복잡한 엔드게임에서는 부정확한 플레이를 보입니다. 엔드게임 기본서를 통해 체계적인 학습을 권장합니다.";
        } else {
            return "엔드게임 기술 향상이 시급합니다. 기본적인 체크메이트 패턴(퀸+킹, 룩+킹, 비숍+나이트+킹)부터 확실히 익혀야 합니다. 엔드게임에서 우세한 포지션을 승리로 이끌지 못하는 경우가 많습니다.";
        }
    }
    
    // 시간 관리 설명 생성
    private String getTimeManagementExplanation(double timeManagementRating) {
        if (timeManagementRating >= 80) {
            return "우수한 시간 관리 능력을 보입니다. 포지션의 복잡성에 따라 시간을 적절히 배분하며, 중요한 순간에는 충분한 시간을 투자하고 자명한 수에는 빠르게 플레이합니다.";
        } else if (timeManagementRating >= 60) {
            return "양호한 시간 관리를 하고 있습니다. 대체로 시간을 잘 배분하지만, 가끔 복잡한 포지션에서 너무 많은 시간을 소모하거나 중요한 순간에 시간이 부족한 경우가 있습니다.";
        } else if (timeManagementRating >= 40) {
            return "시간 관리에 개선이 필요합니다. 시간 압박 상황에서 실수가 증가하거나, 초반에 너무 많은 시간을 소모하여 후반에 어려움을 겪는 경우가 있습니다.";
        } else {
            return "시간 관리 기술이 크게 부족합니다. 시간 배분 전략을 세우고, 각 단계별로 사용할 시간을 미리 계획하는 연습이 필요합니다. 시간 압박에서도 냉정함을 유지하는 훈련을 권장합니다.";
        }
    }
    
    // 공격성 설명 생성
    private String getAggressionExplanation(double aggressionRating) {
        if (aggressionRating >= 80) {
            return "매우 공격적인 스타일을 보입니다. 이니셔티브를 잡기 위해 적극적으로 플레이하며, 상대방에게 지속적인 압박을 가합니다. 복잡한 포지션을 만들어 상대방의 실수를 유도하는 능력이 뛰어납니다.";
        } else if (aggressionRating >= 60) {
            return "공격적인 성향을 가지고 있습니다. 기회가 되면 공격을 시도하며, 이니셔티브를 중요시합니다. 때로는 더 안전한 플레이와의 균형을 맞추는 것도 고려해볼 만합니다.";
        } else if (aggressionRating >= 40) {
            return "균형잡힌 공격성을 보입니다. 상황에 따라 공격적으로 플레이하거나 수비적으로 플레이할 수 있습니다. 이러한 유연성은 좋은 특성이지만, 때로는 더 적극적인 플레이가 필요할 수 있습니다.";
        } else {
            return "다소 수동적인 플레이 스타일을 보입니다. 안전한 플레이를 선호하지만, 때로는 더 적극적인 이니셔티브가 필요한 상황을 놓칠 수 있습니다. 계산된 리스크를 감수하는 연습이 도움이 될 것입니다.";
        }
    }
    
    // 일관성 설명 생성
    private String getConsistencyExplanation(double consistency) {
        if (consistency >= 80) {
            return "매우 일관된 플레이를 보입니다. 실수를 잘 하지 않으며, 자신의 실력을 안정적으로 발휘합니다. 감정 조절과 집중력 유지 능력이 우수합니다.";
        } else if (consistency >= 60) {
            return "대체로 일관성 있는 플레이를 하지만, 가끔 컨디션이나 상황에 따라 기복이 있습니다. 집중력을 유지하는 훈련이 도움이 될 것입니다.";
        } else if (consistency >= 40) {
            return "플레이의 기복이 있는 편입니다. 좋을 때와 나쁠 때의 차이가 크며, 안정적인 실력 발휘에 어려움이 있습니다. 멘탈 관리와 루틴 개발이 필요합니다.";
        } else {
            return "플레이의 일관성이 매우 부족합니다. 실수가 자주 발생하며, 집중력 유지에 큰 어려움이 있습니다. 체계적인 훈련과 멘탈 관리를 통해 개선해야 합니다.";
        }
    }
    
    // 전체적인 스타일 분석
    private String getOverallStyleAnalysis(String playingStyle, double tacticalRating, 
                                         double positionalRating, double aggressionRating, double endgameRating,
                                         double riskTolerance, double consistency, double exchangePreference,
                                         double openingVariety, double leadConversion) {
        Map<String, Double> dimensions = new LinkedHashMap<>();
        dimensions.put("전술 의존도", tacticalRating);
        dimensions.put("포지셔널 지향", positionalRating);
        dimensions.put("공격성", aggressionRating);
        dimensions.put("엔드게임", endgameRating);
        dimensions.put("리스크 감수", riskTolerance);
        dimensions.put("일관성", consistency);
        dimensions.put("교환 선호", exchangePreference);
        dimensions.put("오프닝 다양성", openingVariety);
        dimensions.put("우세 변환", leadConversion);

        var topDimensions = dimensions.entrySet().stream()
            .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
            .limit(3)
            .toList();
        var lowDimensions = dimensions.entrySet().stream()
            .sorted(Map.Entry.comparingByValue())
            .limit(2)
            .toList();

        String topSummary = topDimensions.stream()
            .map(entry -> entry.getKey() + " " + Math.round(entry.getValue()))
            .reduce((a, b) -> a + ", " + b)
            .orElse("주요 지표 부족");
        String lowSummary = lowDimensions.stream()
            .map(entry -> entry.getKey() + " " + Math.round(entry.getValue()))
            .reduce((a, b) -> a + ", " + b)
            .orElse("보완 지표 부족");

        StringBuilder analysis = new StringBuilder();
        analysis.append("주요 플레이 스타일은 '").append(playingStyle).append("'입니다. ");
        analysis.append("이 요약은 상위 지표(").append(topSummary).append(")와 보완 지표(")
            .append(lowSummary).append(")를 함께 비교해 산출했습니다. ");

        if (tacticalRating >= positionalRating + 10) {
            analysis.append("전술 지표가 포지셔널 지표보다 뚜렷하게 높아, 계산과 직접적인 기회 포착에 강점이 있는 편입니다. ");
        } else if (positionalRating >= tacticalRating + 10) {
            analysis.append("포지셔널 지표가 전술 지표보다 높아, 장기 계획과 안정적인 구조 운영 쪽 성향이 더 강합니다. ");
        } else {
            analysis.append("전술과 포지셔널 지표가 비슷해, 한쪽에 과하게 치우치지 않는 균형형에 가깝습니다. ");
        }

        if (aggressionRating >= 70 && riskTolerance >= 60) {
            analysis.append("공격성과 리스크 감수가 함께 높아 복잡한 국면을 피하지 않는 스타일입니다. ");
        } else if (aggressionRating < 45 && riskTolerance < 45) {
            analysis.append("공격성과 리스크 감수가 낮아 안정적인 선택을 우선하는 경향이 있습니다. ");
        }

        if (consistency < 45) {
            analysis.append("다만 일관성 지표가 낮아 좋은 구간과 흔들리는 구간의 차이를 줄이는 것이 우선 과제입니다.");
        } else if (leadConversion >= 70) {
            analysis.append("우세 변환 지표가 좋아 유리한 포지션을 결과로 연결하는 힘이 장점입니다.");
        } else if (endgameRating < 50) {
            analysis.append("엔드게임 지표가 낮아 후반 기술을 보강하면 전체 성과가 더 안정될 가능성이 큽니다.");
        } else {
            analysis.append("현재 강점을 유지하면서 낮은 지표부터 하나씩 보완하면 가장 효율적으로 성장할 수 있습니다.");
        }

        return analysis.toString();
    }
    
    // 전술 패턴별 설명 생성
    private String getTacticalPatternDescription(String patternType) {
        switch (patternType.toLowerCase()) {
            case "fork":
                return "포크: 한 피스로 동시에 두 개 이상의 상대방 피스를 공격하는 전술입니다. 특히 나이트 포크는 가장 흔하고 효과적인 전술 중 하나입니다.";
            case "pin":
                return "핀: 상대방 피스를 움직일 수 없게 고정시키는 전술입니다. 핀에 걸린 피스를 움직이면 더 가치 있는 피스가 위험해집니다.";
            case "skewer":
                return "스큐어: 가치가 높은 피스를 공격하여 그 뒤에 있는 가치가 낮은 피스를 노리는 전술입니다. 핀의 반대 개념입니다.";
            case "discovered_attack":
                return "발견된 공격: 한 피스가 이동함으로써 뒤에 있던 다른 피스의 공격이 드러나는 전술입니다. 매우 강력한 공격 방법입니다.";
            case "double_attack":
                return "이중 공격: 한 번의 수로 두 곳을 동시에 공격하는 전술입니다. 상대방은 둘 다 방어하기 어려워집니다.";
            case "back_rank_mate":
                return "백랭크 메이트: 상대방 킹이 자신의 폰들에 의해 갇혀있을 때 백랭크에서 체크메이트를 하는 전술입니다.";
            case "deflection":
                return "편향: 중요한 방어 임무를 맡고 있는 상대방 피스를 다른 곳으로 유인하여 방어를 무너뜨리는 전술입니다.";
            case "decoy":
                return "미끼: 상대방 피스를 불리한 위치로 유인하는 전술입니다. 종종 희생을 통해 더 큰 이득을 얻습니다.";
            case "clearance":
                return "클리어런스: 자신의 다른 피스가 더 효과적으로 활동할 수 있도록 길을 열어주는 전술입니다.";
            case "interference":
                return "간섭: 상대방 피스들 사이의 연결을 차단하여 조화를 방해하는 전술입니다.";
            case "capture":
                return "캡처: 상대방 기물을 잡는 기회입니다. 기물의 가치를 정확히 계산하여 유리한 교환을 하세요.";
            case "check":
                return "체크: 상대방 킹을 공격하여 강제로 응수하게 만드는 전술입니다. 이니셔티브를 잡는 중요한 방법입니다.";
            case "attack_undefended":
                return "무방비 공격: 상대방이 방어하지 않는 기물을 공격하는 기회입니다. 상대방의 실수를 이용한 전술입니다.";
            default:
                return "이 전술 패턴은 체스에서 중요한 전술적 모티프 중 하나입니다. 정확한 계산과 타이밍이 중요합니다.";
        }
    }
    
    // 전술 기회 종합 분석
    private String getTacticalAnalysis(int totalTacticalCount, int totalGames) {
        double tacticalPerGame = (double) totalTacticalCount / totalGames;
        StringBuilder analysis = new StringBuilder();
        
        if (tacticalPerGame >= 2.0) {
            analysis.append("게임당 평균 ").append(String.format("%.1f", tacticalPerGame))
                    .append("개의 전술 기회를 발견했습니다. 이는 매우 우수한 수준으로, 전술적 기회를 잘 인식하고 있음을 보여줍니다. ");
            analysis.append("지속적으로 이러한 기회들을 놓치지 않도록 주의깊게 계산하세요.");
        } else if (tacticalPerGame >= 1.0) {
            analysis.append("게임당 평균 ").append(String.format("%.1f", tacticalPerGame))
                    .append("개의 전술 기회가 있었습니다. 기본적인 전술 패턴들을 인식하고 있지만, ");
            analysis.append("더 많은 전술적 기회를 찾기 위해 각 수마다 전술적 가능성을 체크하는 습관을 기르세요.");
        } else if (tacticalPerGame >= 0.5) {
            analysis.append("게임당 평균 ").append(String.format("%.1f", tacticalPerGame))
                    .append("개의 전술 기회를 발견했습니다. 전술적 감각을 더 기를 필요가 있습니다. ");
            analysis.append("매일 전술 퍼즐을 풀고, 기본적인 전술 패턴(포크, 핀, 스큐어)을 완전히 숙지하세요.");
        } else {
            analysis.append("발견된 전술 기회가 매우 적습니다. 전술적 훈련이 시급히 필요합니다. ");
            analysis.append("기본적인 전술 패턴부터 체계적으로 학습하고, 매 수마다 '체크, 캡쳐, 공격'을 확인하는 습관을 기르세요.");
        }
        
        return analysis.toString();
    }
    
    // 전술 패턴별 예상 가치 반환
    private int getEstimatedValue(String patternName) {
        switch (patternName.toLowerCase()) {
            case "capture":
                return 250;
            case "check":
                return 50;
            case "attack_undefended":
                return 150;
            case "fork":
                return 400;
            case "pin":
                return 200;
            case "skewer":
                return 300;
            case "discovered_attack":
                return 350;
            case "double_attack":
                return 300;
            case "back_rank_mate":
                return 900;
            case "deflection":
                return 250;
            case "decoy":
                return 200;
            default:
                return 100;
        }
    }
    
    // 전술 패턴별 예상 난이도 반환
    private double getEstimatedDifficulty(String patternName) {
        switch (patternName.toLowerCase()) {
            case "capture":
                return 1.0;
            case "check":
                return 1.0;
            case "attack_undefended":
                return 2.0;
            case "fork":
                return 2.5;
            case "pin":
                return 2.0;
            case "skewer":
                return 3.0;
            case "discovered_attack":
                return 3.5;
            case "double_attack":
                return 2.5;
            case "back_rank_mate":
                return 4.0;
            case "deflection":
                return 3.5;
            case "decoy":
                return 3.0;
            default:
                return 2.0;
        }
    }
}
