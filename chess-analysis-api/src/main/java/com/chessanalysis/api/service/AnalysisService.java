package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.dto.AnalysisResponseDto;
import com.chessanalysis.api.entity.Analysis;
import com.chessanalysis.api.queue.AnalysisJobDto;
import com.chessanalysis.api.queue.AnalysisQueueService;
import com.chessanalysis.api.repository.AnalysisRepository;
import com.chessanalysis.api.repository.UserRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.transaction.annotation.Transactional;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import javax.sql.DataSource;

@Service
@RequiredArgsConstructor
@Slf4j
public class AnalysisService {

    private final AnalysisRepository analysisRepository;
    private final AnalysisQueueService queueService;
    private final ShortLinkService shortLinkService;
    private final AnalysisRateLimitService rateLimitService;
    private final UserRepository userRepository;
    private final DataSource dataSource;
    private final RedisTemplate<String, Object> redisTemplate;
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    // 관리자 이메일 화이트리스트 — 환경변수(ADMIN_EMAILS)로만 설정.
    // DB role 컬럼보다 안전: DB 침해로도 권한 상승 불가 (인프라 레벨 시크릿).
    @Value("${admin.emails:}")
    private String adminEmailsCsv;
    private Set<String> adminEmailSet = Set.of();

    @PostConstruct
    void initAdminEmails() {
        if (adminEmailsCsv == null || adminEmailsCsv.isBlank()) {
            adminEmailSet = Set.of();
            return;
        }
        adminEmailSet = Arrays.stream(adminEmailsCsv.split(","))
                .map(s -> s.toLowerCase(Locale.ROOT).strip())
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
        log.info("Admin whitelist initialized: {} email(s)", adminEmailSet.size());
    }

    /** userId로 관리자 여부 판정. 서버 사이드 전용 — 클라이언트 입력 경로 없음. */
    private boolean isAdminUser(UUID userId) {
        if (userId == null || adminEmailSet.isEmpty()) return false;
        return userRepository.findById(userId)
                .map(u -> adminEmailSet.contains(u.getEmail().toLowerCase(Locale.ROOT).strip()))
                .orElse(false);
    }

    private static final Duration ANALYSIS_CREATE_LOCK_TTL = Duration.ofSeconds(30);
    private static final Duration PENDING_STALE_AFTER = Duration.ofMinutes(45);
    private static final Duration IN_PROGRESS_STALE_AFTER = Duration.ofMinutes(30);
    private static final Duration CANCEL_TOKEN_TTL = Duration.ofHours(24);
    private static final String CANCEL_TOKEN_KEY_PREFIX = "cancel:token:";
    private static final Duration RESULT_CACHE_TTL = Duration.ofHours(24);
    private static final String RESULT_CACHE_KEY_PREFIX = "result:cache:";
    private static final int FAST_MAX_GAMES = 50;
    private static final int BALANCED_MAX_GAMES = 30;
    private static final int PRECISE_MAX_GAMES = 20;
    
    public AnalysisResponseDto createAnalysis(AnalysisRequestDto request, String clientIp) {
        return createAnalysis(request, clientIp, null);
    }

    public AnalysisResponseDto createAnalysis(AnalysisRequestDto request, String clientIp, UUID userId) {
        String normalizedUsername = request.getUsername() == null ? "" : request.getUsername().trim();
        String normalizedPlatform = request.getPlatform() == null ? "chess.com" : request.getPlatform().trim();
        String normalizedPriority = normalizePriority(request.getPriority());
        int normalizedGameCount = clampGameCount(request.getGameCount(), normalizedPriority);
        request.setPriority(normalizedPriority);
        request.setGameCount(normalizedGameCount);
        String lockKey = activeCreationLockKey(normalizedPlatform, normalizedUsername);

        // 관리자 판정 (서버 사이드) — 관리자는 분석 생성 rate limit 면제
        boolean isAdmin = isAdminUser(userId);
        if (!isAdmin) {
            rateLimitService.enforceLimits(request, clientIp);
        } else {
            log.info("Admin user {} — bypassing analysis rate limit", userId);
        }

        Boolean lockAcquired = redisTemplate.opsForValue().setIfAbsent(lockKey, "1", ANALYSIS_CREATE_LOCK_TTL);
        if (!Boolean.TRUE.equals(lockAcquired)) {
            Optional<Analysis> activeWhileLocked = findReusableActiveAnalysis(normalizedUsername, normalizedPlatform);
            if (activeWhileLocked.isPresent()) {
                return AnalysisResponseDto.fromEntity(activeWhileLocked.get());
            }
            throw new IllegalStateException("같은 사용자 분석 요청을 처리 중입니다. 잠시 후 다시 시도해주세요.");
        }

        Optional<Analysis> activeAnalysis = findReusableActiveAnalysis(normalizedUsername, normalizedPlatform);
        if (activeAnalysis.isPresent()) {
            Analysis existing = activeAnalysis.get();
            log.info("Returning existing active analysis {} for user: {}", existing.getId(), normalizedUsername);
            return AnalysisResponseDto.fromEntity(existing);
        }
        
        // Create new analysis
        Analysis analysis = Analysis.builder()
                .username(normalizedUsername)
                .platform(normalizedPlatform)
                .gameCount(normalizedGameCount)
                .status(Analysis.AnalysisStatus.PENDING)
                .progress(0)
                .currentStep("Queued for " + normalizedPriority + " analysis")
                .userId(userId)   // null for guests
                .build();
                
        analysis = analysisRepository.saveAndFlush(analysis);
        log.info("Created analysis with ID: {} for user: {}", analysis.getId(), normalizedUsername);
        
        // Generate short link
        String shortLink = shortLinkService.generateShortLink(analysis.getId());
        analysis.setShortLink(shortLink);
        analysis = analysisRepository.saveAndFlush(analysis);
        
        // Enqueue for processing
        AnalysisJobDto job = AnalysisJobDto.create(
                analysis.getId(),
                normalizedUsername,
                normalizedPlatform,
                normalizedGameCount,
                request.getTimeControl(),
                normalizedPriority,
                request.getLocale(),
                userId,
                isAdmin
        );
        
        try {
            queueService.enqueueAnalysisJob(job);
        } catch (Exception e) {
            analysis.setStatus(Analysis.AnalysisStatus.FAILED);
            analysis.setCurrentStep("Failed to enqueue analysis job");
            analysis.setErrorMessage("분석 작업을 대기열에 넣지 못했습니다. 잠시 후 다시 시도해주세요.");
            analysisRepository.saveAndFlush(analysis);
            throw e;
        }

        // 취소 토큰 생성 및 Redis 저장 (hash만 저장, raw token은 응답에만 포함)
        String cancelToken = generateCancelToken();
        stringRedisTemplate.opsForValue().set(
                CANCEL_TOKEN_KEY_PREFIX + analysis.getId(), hashToken(cancelToken), CANCEL_TOKEN_TTL);

        AnalysisResponseDto dto = AnalysisResponseDto.fromEntity(analysis);
        dto.setCancelToken(cancelToken);
        return dto;
    }

    /** 암호학적으로 안전한 랜덤 취소 토큰(48 hex chars)을 생성한다. */
    private String generateCancelToken() {
        byte[] bytes = new byte[24];
        new SecureRandom().nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /** SHA-256 해시를 hex string으로 반환한다. */
    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    private Optional<Analysis> findReusableActiveAnalysis(String username, String platform) {
        LocalDateTime now = LocalDateTime.now();
        List<Analysis> activeAnalyses = analysisRepository.findActiveAnalysesForUser(username, platform);
        for (Analysis active : activeAnalyses) {
            if (isStaleAnalysis(active, now)) {
                markAnalysisAsStale(active);
                continue;
            }

            return Optional.of(active);
        }
        return Optional.empty();
    }

    private boolean isStaleAnalysis(Analysis analysis, LocalDateTime now) {
        LocalDateTime referenceTime = analysis.getUpdatedAt() != null ? analysis.getUpdatedAt() : analysis.getCreatedAt();
        if (referenceTime == null) {
            return false;
        }

        boolean stalePending = analysis.getStatus() == Analysis.AnalysisStatus.PENDING
                && referenceTime.isBefore(now.minus(PENDING_STALE_AFTER));
        boolean staleInProgress = analysis.getStatus() == Analysis.AnalysisStatus.IN_PROGRESS
                && referenceTime.isBefore(now.minus(IN_PROGRESS_STALE_AFTER));
        return stalePending || staleInProgress;
    }

    private void markAnalysisAsStale(Analysis analysis) {
        analysis.setStatus(Analysis.AnalysisStatus.FAILED);
        analysis.setCurrentStep("Previous analysis timed out");
        analysis.setErrorMessage("분석 작업이 비정상적으로 오래 멈춰 자동 종료되었습니다. 새 분석을 다시 시작해주세요.");
        analysisRepository.saveAndFlush(analysis);
        log.warn("Marked stale analysis {} as FAILED", analysis.getId());
    }

    private String activeCreationLockKey(String platform, String username) {
        String normalizedPlatform = platform == null ? "unknown" : platform.toLowerCase(Locale.ROOT).trim();
        String normalizedUsername = username == null ? "unknown" : username.toLowerCase(Locale.ROOT).trim();
        return "analysis:create-lock:" + normalizedPlatform.replaceAll("[^a-z0-9._:-]", "_")
                + ":" + normalizedUsername.replaceAll("[^a-z0-9._:-]", "_");
    }

    private String normalizePriority(String priority) {
        if (priority == null || priority.isBlank()) {
            return "fast";
        }
        String normalized = priority.toLowerCase(Locale.ROOT).trim();
        if (!Set.of("fast", "balanced", "precise").contains(normalized)) {
            return "fast";
        }
        return normalized;
    }

    /** en=true이면 영어 텍스트, 아니면 한국어 텍스트를 반환한다. */
    private String tr(boolean en, String ko, String enText) {
        return en ? enText : ko;
    }

    private int clampGameCount(Integer requestedGameCount, String priority) {
        int requested = requestedGameCount == null ? 10 : requestedGameCount;
        int maxForPriority = switch (priority) {
            case "precise" -> PRECISE_MAX_GAMES;
            case "balanced" -> BALANCED_MAX_GAMES;
            default -> FAST_MAX_GAMES;
        };
        return Math.max(5, Math.min(requested, maxForPriority));
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

    /**
     * short code(URL 마지막 경로 세그먼트)로 분석 결과를 조회한다.
     * DB에 저장된 shortLink URL의 base URL 부분(환경에 따라 다를 수 있음)에
     * 무관하게 code suffix로 검색하므로, 구버전 로컬호스트 링크도 올바르게 resolve된다.
     */
    @Transactional(readOnly = true)
    public Optional<AnalysisResponseDto> getAnalysisByShortCode(String shortCode) {
        return analysisRepository.findByShortLinkEndingWith("/" + shortCode)
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
    
    @Transactional
    public Map<String, Object> getAnalysisStatus(UUID analysisId) {
        // First get basic analysis from database
        Optional<Analysis> analysisOpt = analysisRepository.findById(analysisId);
        if (analysisOpt.isEmpty()) {
            throw new RuntimeException("Analysis not found");
        }
        
        Analysis analysis = analysisOpt.get();
        if (isStaleAnalysis(analysis, LocalDateTime.now())) {
            markAnalysisAsStale(analysis);
        }
        
        // Create base status map
        Map<String, Object> status = new HashMap<>();
        status.put("id", analysis.getId());
        status.put("status", analysis.getStatus().name().toLowerCase());
        status.put("progress", analysis.getProgress() != null ? analysis.getProgress() : 0);
        status.put("currentStep", analysis.getCurrentStep() != null ? analysis.getCurrentStep() : "");
        status.put("errorMessage", analysis.getErrorMessage() != null ? analysis.getErrorMessage() : "");

        if (analysis.getStatus() == Analysis.AnalysisStatus.PENDING) {
            Long queuePosition = queueService.getQueuePosition(analysisId);
            Long queueSize = queueService.getQueueSize();
            status.put("queuePosition", queuePosition);
            status.put("queueSize", queueSize);
            if (queuePosition != null) {
                status.put("currentStep", "대기열 " + queuePosition + "번째입니다. 현재 대기 작업: " + queueSize + "개");
            } else if (queueSize != null && queueSize > 0) {
                status.put("currentStep", "작업자 배정을 기다리고 있습니다. 현재 대기 작업: " + queueSize + "개");
            }
        }
        
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
                if (progressData.containsKey("errorMessage")) {
                    status.put("errorMessage", progressData.get("errorMessage"));
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

    /**
     * 사용자가 요청한 분석을 취소한다.
     * PENDING 또는 IN_PROGRESS 상태일 때만 취소 가능하며, FAILED로 전환한다.
     * 이미 완료/실패된 분석에 대해 호출하면 아무 동작도 하지 않는다.
     */
    @Transactional
    public boolean cancelAnalysis(UUID analysisId, String cancelToken) {
        // 취소 토큰 검증: Redis에 hash가 있으면 반드시 일치해야 한다.
        // 구버전 분석(토큰 없음)은 하위 호환을 위해 통과시킨다.
        String storedHash = stringRedisTemplate.opsForValue().get(CANCEL_TOKEN_KEY_PREFIX + analysisId);
        if (storedHash != null) {
            if (cancelToken == null || !storedHash.equals(hashToken(cancelToken))) {
                throw new SecurityException("유효하지 않은 취소 토큰입니다.");
            }
        }

        Optional<Analysis> opt = analysisRepository.findById(analysisId);
        if (opt.isEmpty()) {
            return false;
        }
        Analysis analysis = opt.get();
        if (analysis.getStatus() == Analysis.AnalysisStatus.PENDING
                || analysis.getStatus() == Analysis.AnalysisStatus.IN_PROGRESS) {
            analysis.setStatus(Analysis.AnalysisStatus.FAILED);
            analysis.setCurrentStep("사용자가 취소했습니다");
            analysis.setErrorMessage("사용자가 취소했습니다");
            analysisRepository.save(analysis);
            log.info("Analysis {} cancelled by user", analysisId);
            return true;
        }
        // 이미 완료·실패된 경우 — 멱등성 보장
        return false;
    }
    
    @Transactional(readOnly = true)
    public Map<String, Object> getAnalysisResult(UUID analysisId) {
        return getAnalysisResult(analysisId, "ko");
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getAnalysisResult(UUID analysisId, String locale) {
        boolean en = "en".equalsIgnoreCase(locale);
        // ── Redis cache: completed analyses never change, serve from cache ──────
        String cacheKey = RESULT_CACHE_KEY_PREFIX + analysisId + (en ? ":en" : ":ko");
        String cached = stringRedisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> cachedResult = objectMapper.readValue(cached, Map.class);
                log.debug("Cache hit for analysis result {}", analysisId);
                return cachedResult;
            } catch (Exception e) {
                log.warn("Failed to deserialize cached result for {}, falling through to DB", analysisId);
            }
        }

        Map<String, Object> result = new HashMap<>();

        var connection = DataSourceUtils.getConnection(dataSource);
        try {
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

                Map<String, Object> openingStats = getOpeningStats(connection, analysisId, analysisResult.getString("username"), en);
                result.put("openingStats", openingStats);
                
                // Get enhanced style profile with all data
                var styleStmt = connection.prepareStatement(
                    "SELECT playing_style, strengths, weaknesses, tactical_rating, " +
                    "positional_rating, endgame_rating, time_management_rating, " +
                    "blunder_tendency, risk_tolerance, piece_activity_preference, " +
                    "aggression_rating, exchange_preference, opening_variety, " +
                    "lead_conversion, consistency, swindle_resistance, " +
                    "summary_data, metadata, tactical_stats, coach_narrative " +
                    "FROM style_profiles_worker WHERE analysis_id = ?");
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
                    profile.put("summaryData", summaryDataJson != null ? summaryDataJson : "{}");
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

                    // AI coaching narrative — null when not yet generated
                    String coachNarrativeJson = styleResult.getString("coach_narrative");
                    if (coachNarrativeJson != null && !coachNarrativeJson.isBlank()) {
                        profile.put("coachNarrative", coachNarrativeJson);
                    }

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
                    profile.put("summaryData", "{}");
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

                Map<String, Object> comparativeInsights = buildComparativeInsights(
                    connection,
                    analysisId,
                    analysisResult.getString("username"),
                    result,
                    profile,
                    en
                );
                result.put("comparativeInsights", comparativeInsights);
                result.put("decisiveMoments", getDecisiveMoments(connection, analysisId));
                result.put("advancedInsights", buildAdvancedInsights(
                    connection,
                    analysisId,
                    analysisResult.getString("username"),
                    result,
                    profile,
                    openingStats,
                    en
                ));
                result.put("opponentExploitPlan", buildOpponentExploitPlan(
                    connection,
                    analysisId,
                    analysisResult.getString("username"),
                    result,
                    profile,
                    openingStats,
                    en
                ));

                // Get tactical opportunities summary from style_profiles_worker.tactical_stats
                var tacticalSummary = new java.util.ArrayList<Map<String, Object>>();
                int totalTacticalCount = 0;
                
                Map<String, Object> tacticalStats = parseJsonMap(tacticalStatsJson);
                int foundTactics = getInt(tacticalStats.get("found_tactics"), 0);
                int missedTactics = getInt(tacticalStats.get("missed_tactics"), 0);
                totalTacticalCount = getInt(tacticalStats.get("total_tactical_opportunities"), foundTactics + missedTactics);
                double tacticalAccuracy = getDouble(tacticalStats.get("tactical_accuracy"), 0.0);
                String sampleConfidence = String.valueOf(tacticalStats.getOrDefault("sample_confidence", "none"));

                Map<String, Object> patternsFound = asMap(tacticalStats.get("patterns_found"));
                Map<String, Object> patternsMissed = asMap(tacticalStats.get("patterns_missed"));
                Set<String> patternNames = new TreeSet<>();
                patternNames.addAll(patternsFound.keySet());
                patternNames.addAll(patternsMissed.keySet());

                for (String patternName : patternNames) {
                    int found = getInt(patternsFound.get(patternName), 0);
                    int missed = getInt(patternsMissed.get(patternName), 0);
                    int totalPattern = found + missed;
                    Map<String, Object> pattern = new HashMap<>();
                    pattern.put("pattern", patternName);
                    pattern.put("found", found);
                    pattern.put("missed", missed);
                    pattern.put("accuracy", totalPattern > 0 ? String.format("%.1f%%", (found * 100.0) / totalPattern) : "표본 부족");
                    pattern.put("averageValue", getEstimatedValue(patternName));
                    pattern.put("averageDifficulty", getEstimatedDifficulty(patternName));
                    pattern.put("description", getTacticalPatternDescription(patternName));
                    tacticalSummary.add(pattern);
                }

                tacticalSummary.sort((a, b) -> {
                    int totalA = getInt(a.get("found"), 0) + getInt(a.get("missed"), 0);
                    int totalB = getInt(b.get("found"), 0) + getInt(b.get("missed"), 0);
                    return Integer.compare(totalB, totalA);
                });

                boolean tacticalSampleAvailable = totalTacticalCount > 0;
                Map<String, Object> overallStats = new HashMap<>();
                overallStats.put("totalOpportunities", totalTacticalCount);
                overallStats.put("foundTactics", foundTactics);
                overallStats.put("missedTactics", missedTactics);
                overallStats.put("tacticalAccuracy", tacticalSampleAvailable ? String.format("%.1f%%", tacticalAccuracy * 100) : "표본 부족");
                overallStats.put("sampleAvailable", tacticalSampleAvailable);
                overallStats.put("confidence", sampleConfidence);
                overallStats.put("message", tacticalSampleAvailable
                    ? ("heuristic".equals(sampleConfidence) ? "빠른 분석 모드의 강제수/중요수 기반 추정치입니다." : "엔진 분석에서 감지한 전술 표본 기준입니다.")
                    : "이번 표본에서는 전술 기회가 충분히 잡히지 않아 정확도를 단정하지 않습니다.");
                result.put("tacticalOverview", overallStats);
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
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }

        // ── Cache write: only cache completed analyses ────────────────────────
        Object statusObj = result.get("status");
        if ("COMPLETED".equals(statusObj)) {
            try {
                String json = objectMapper.writeValueAsString(result);
                stringRedisTemplate.opsForValue().set(cacheKey, json, RESULT_CACHE_TTL);
                log.debug("Cached result for completed analysis {}", analysisId);
            } catch (Exception e) {
                log.warn("Failed to cache result for {}: {}", analysisId, e.getMessage());
            }
        }

        return result;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getAnalysisGames(UUID analysisId) {
        List<Map<String, Object>> games = new ArrayList<>();
        
        var connection = DataSourceUtils.getConnection(dataSource);
        try {
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
        } finally {
            DataSourceUtils.releaseConnection(connection, dataSource);
        }

        return games;
    }

    private List<Map<String, Object>> getDecisiveMoments(java.sql.Connection connection, UUID analysisId) throws Exception {
        List<Map<String, Object>> moments = new ArrayList<>();
        String winLossExpr = columnExists(connection, "move_analyses", "win_probability_loss")
            ? "COALESCE(m.win_probability_loss, 0)"
            : "0.0";
        var stmt = connection.prepareStatement(
            "SELECT m.game_index, m.move_number, m.move_notation, m.best_move, " +
            "m.classification, m.centipawn_loss, " + winLossExpr + " AS win_probability_loss, " +
            "m.evaluation_before, m.evaluation_after, " +
            "g.white_player, g.black_player, g.opening, g.result " +
            "FROM move_analyses m " +
            "LEFT JOIN games_worker g ON g.analysis_id = m.analysis_id AND g.game_index = m.game_index " +
            "WHERE m.analysis_id = ? AND (m.centipawn_loss >= 50 OR " + winLossExpr + " >= 3.0) " +
            "ORDER BY " + winLossExpr + " DESC, m.centipawn_loss DESC, m.game_index ASC, m.move_number ASC LIMIT 6"
        );
        stmt.setObject(1, analysisId);
        var rs = stmt.executeQuery();

        while (rs.next()) {
            int ply = rs.getInt("move_number");
            int moveNumber = (ply / 2) + 1;
            boolean whiteMove = ply % 2 == 0;
            int loss = rs.getInt("centipawn_loss");
            double winProbabilityLoss = Math.round(rs.getDouble("win_probability_loss") * 10.0) / 10.0;
            String classification = classificationFromLoss(loss, rs.getString("classification"));

            Map<String, Object> moment = new LinkedHashMap<>();
            moment.put("gameIndex", rs.getInt("game_index"));
            moment.put("moveNumber", moveNumber);
            moment.put("ply", ply);
            moment.put("side", whiteMove ? "white" : "black");
            moment.put("sideLabel", whiteMove ? "백" : "흑");
            moment.put("move", rs.getString("move_notation"));
            moment.put("bestMove", rs.getString("best_move"));
            moment.put("classification", classification);
            moment.put("classificationLabel", classificationLabel(classification));
            moment.put("centipawnLoss", loss);
            moment.put("winProbabilityLoss", winProbabilityLoss);
            moment.put("impactLabel", impactLabel(loss));
            moment.put("opening", normalizeOpeningName(rs.getString("opening"), null, false));
            moment.put("gameResult", rs.getString("result"));
            moment.put("explanation", decisiveMomentExplanation(
                moveNumber,
                whiteMove ? "백" : "흑",
                rs.getString("move_notation"),
                rs.getString("best_move"),
                classification,
                loss,
                winProbabilityLoss
            ));
            moments.add(moment);
        }

        return moments;
    }

    private String decisiveMomentExplanation(
        int moveNumber,
        String sideLabel,
        String move,
        String bestMove,
        String classification,
        int centipawnLoss,
        double winProbabilityLoss
    ) {
        StringBuilder explanation = new StringBuilder();
        explanation.append(moveNumber).append("수 ").append(sideLabel)
            .append("의 ").append(move == null ? "해당 수" : move)
            .append("에서 평가가 크게 흔들렸습니다. ");
        if (bestMove != null && !bestMove.isBlank()) {
            explanation.append("엔진은 ").append(bestMove).append(" 쪽을 더 선호했습니다. ");
        }
        explanation.append("손실 규모는 약 ").append(centipawnLoss).append("cp로, ")
            .append(classificationLabel(classification)).append("에 해당합니다.");
        if (winProbabilityLoss >= 1.0) {
            explanation.append(" 승률 관점 손실은 약 ").append(winProbabilityLoss).append("%p로 추정됩니다.");
        }
        return explanation.toString();
    }

    private String normalizeClassification(String classification) {
        if (classification == null || classification.isBlank()) {
            return "inaccuracy";
        }
        return classification.toLowerCase(Locale.ROOT).trim();
    }

    private String classificationFromLoss(int centipawnLoss, String storedClassification) {
        if (centipawnLoss >= 300) {
            return "blunder";
        }
        if (centipawnLoss >= 100) {
            return "mistake";
        }
        if (centipawnLoss >= 50) {
            return "inaccuracy";
        }
        return normalizeClassification(storedClassification);
    }

    private String classificationLabel(String classification) {
        return switch (normalizeClassification(classification)) {
            case "blunder" -> "블런더";
            case "mistake" -> "실수";
            case "inaccuracy" -> "부정확";
            case "best" -> "최선수";
            default -> "개선 후보";
        };
    }

    private String impactLabel(int centipawnLoss) {
        if (centipawnLoss >= 300) {
            return "승부를 크게 흔든 수";
        }
        if (centipawnLoss >= 150) {
            return "주도권을 넘긴 수";
        }
        if (centipawnLoss >= 80) {
            return "흐름이 꺾인 수";
        }
        return "개선하면 좋은 수";
    }

    private Map<String, Object> buildComparativeInsights(
        java.sql.Connection connection,
        UUID analysisId,
        String username,
        Map<String, Object> result,
        Map<String, Object> profile,
        boolean en
    ) {
        Map<String, Object> insights = new LinkedHashMap<>();
        try {
            Map<String, Object> opponentProfile = buildOpponentProfile(connection, analysisId, username, en);
            int rating = getInt(opponentProfile.get("averagePlayerRating"), 0);
            int profileRating = extractProfileAverageRating(profile);
            if (rating <= 0 && profileRating > 0) {
                rating = profileRating;
                opponentProfile.put("averagePlayerRating", profileRating);
            }

            int totalGames = getInt(result.get("totalGames"), 0);
            String ratingBand = rating > 0 ? getRatingBand(rating, en) : tr(en, "레이팅 데이터 부족", "Not enough rating data");
            Map<String, Object> sampleReliability = buildSampleReliability(totalGames, en);
            Map<String, Object> performancePercentiles = buildPerformancePercentiles(result, profile, rating, en);
            Map<String, Object> gmMatch = findGrandmasterMatch(profile, en);

            insights.put("ratingBand", ratingBand);
            insights.put("sampleReliability", sampleReliability);
            insights.put("performancePercentiles", performancePercentiles);
            insights.put("gmMatch", gmMatch);
            insights.put("opponentProfile", opponentProfile);
            insights.put("narrative", buildComparativeNarrative(
                username,
                totalGames,
                sampleReliability,
                performancePercentiles,
                gmMatch,
                opponentProfile,
                en
            ));
            insights.put("disclaimer", tr(en,
                "동일 레이팅대 비교는 현재 저장된 게임과 경험적 기준을 섞은 추정치입니다. 분석 게임 수가 늘수록 안정됩니다.",
                "This rating-band comparison blends your stored games with empirical baselines. It becomes more stable as more games are analyzed."));
        } catch (Exception e) {
            log.warn("Failed to build comparative insights for {}: {}", analysisId, e.getMessage());
            insights.put("ratingBand", tr(en, "비교 데이터 준비 중", "Comparison data not ready yet"));
            insights.put("sampleReliability", buildSampleReliability(getInt(result.get("totalGames"), 0), en));
            insights.put("performancePercentiles", Map.of());
            insights.put("gmMatch", Map.of("name", tr(en, "분석 준비 중", "Analysis in progress"), "similarity", 0, "reason", tr(en, "스타일 데이터가 충분하지 않습니다.", "Not enough style data yet.")));
            insights.put("opponentProfile", Map.of("headline", tr(en, "상대 분석 데이터가 충분하지 않습니다.", "Not enough opponent data yet.")));
            insights.put("narrative", tr(en, "비교 인사이트를 만들기 위한 데이터가 아직 충분하지 않습니다.", "There isn't enough data yet to build comparison insights."));
        }
        return insights;
    }

    private Map<String, Object> buildPerformancePercentiles(
        Map<String, Object> result,
        Map<String, Object> profile,
        int rating,
        boolean en
    ) {
        Map<String, Object> percentiles = new LinkedHashMap<>();
        double accuracy = getDouble(result.get("averageAccuracy"), 0.0);
        double acpl = getDouble(result.get("averageCentipawnLoss"), 0.0);
        double tactical = getDouble(profile.get("tacticalRating"), 0.0);
        double consistency = getDouble(profile.get("consistency"), 0.0);
        double leadConversion = getDouble(profile.get("leadConversion"), 0.0);

        percentiles.put("accuracy", estimatedPercentile(
            tr(en, "평균 정확도", "Average Accuracy"),
            accuracy,
            expectedAccuracy(rating),
            7.5,
            true,
            "%",
            en
        ));
        percentiles.put("centipawnLoss", estimatedPercentile(
            tr(en, "평균 CPL", "Average CPL"),
            acpl,
            expectedCentipawnLoss(rating),
            22.0,
            false,
            "",
            en
        ));
        percentiles.put("tactical", stylePercentile(tr(en, "전술 감각", "Tactical Sense"), tactical, en));
        percentiles.put("consistency", stylePercentile(tr(en, "일관성", "Consistency"), consistency, en));
        percentiles.put("leadConversion", stylePercentile(tr(en, "우세 변환력", "Lead Conversion"), leadConversion, en));
        return percentiles;
    }

    private Map<String, Object> buildLearningInsights(
        java.sql.Connection connection,
        UUID analysisId,
        String username,
        Map<String, Object> result,
        Map<String, Object> profile,
        Map<String, Object> openingStats,
        boolean en
    ) {
        Map<String, Object> insights = new LinkedHashMap<>();
        List<Map<String, Object>> cards = new ArrayList<>();

        Map<String, Object> weakestOpening = findWeakestOpening(openingStats);
        if (!weakestOpening.isEmpty()) {
            cards.add(Map.of(
                "title", tr(en, "오프닝 보강 후보", "Opening to Reinforce"),
                "value", weakestOpening.getOrDefault("name", tr(en, "오프닝 미분류", "Unclassified Opening")),
                "description", String.format(
                    tr(en, "점수율 %.1f%%, 평균 CPL %.1f입니다. 자주 나오는데 성과가 낮은 라인부터 복기하면 효율이 좋습니다.",
                        "Score rate %.1f%%, average CPL %.1f. Reviewing frequently-played lines with low results first gives the best return."),
                    getDouble(weakestOpening.get("scoreRate"), 0.0),
                    getDouble(weakestOpening.get("averageCpl"), 0.0)
                )
            ));
        }

        Map<String, Object> criticalMove = buildCriticalMoveInsight(connection, analysisId, username, en);
        if (!criticalMove.isEmpty()) {
            cards.add(criticalMove);
        }

        Map<String, Object> timePressure = buildTimePressureInsight(connection, analysisId, username, en);
        if (!timePressure.isEmpty()) {
            cards.add(timePressure);
        }

        Map<String, Object> tilt = buildTiltInsight(connection, analysisId, username, en);
        if (!tilt.isEmpty()) {
            cards.add(tilt);
        }

        double consistency = getDouble(profile.get("consistency"), 0.0);
        if (consistency < 45) {
            cards.add(Map.of(
                "title", tr(en, "일관성 개선", "Improve Consistency"),
                "value", Math.round(consistency) + tr(en, "점", " pts"),
                "description", tr(en,
                    "게임별 흔들림이 커 보입니다. 큰 실수 직전 포지션과 패배 직후 다음 판을 먼저 복기하세요.",
                    "Your results swing a lot from game to game. Start by reviewing the position right before big mistakes and the game right after a loss.")
            ));
        }

        double avgCpl = getDouble(result.get("averageCentipawnLoss"), 0.0);
        if (avgCpl >= 80) {
            cards.add(Map.of(
                "title", tr(en, "큰 손실 줄이기", "Reduce Big Losses"),
                "value", Math.round(avgCpl * 10.0) / 10.0 + " CPL",
                "description", tr(en,
                    "평균 손실이 높은 편입니다. 매 수마다 체크, 캡처, 직접 위협을 한 번씩 확인하는 루틴이 효과적입니다.",
                    "Your average loss per move is on the high side. Make a habit of checking for checks, captures, and direct threats on every move.")
            ));
        }

        if (cards.isEmpty()) {
            cards.add(Map.of(
                "title", tr(en, "결정적 순간 복기", "Review Decisive Moments"),
                "value", tr(en, "최근 게임", "Recent games"),
                "description", tr(en,
                    "승부를 흔든 수를 2~3개만 골라 왜 그 수를 뒀는지 복기하면 다음 게임 개선폭이 큽니다.",
                    "Pick 2-3 moves that swung the result and review why you played them — this gives the biggest improvement for your next games.")
            ));
        }

        insights.put("cards", cards.stream().limit(3).toList());
        insights.put("headline", buildLearningHeadline(cards, getInt(result.get("totalGames"), 0), en));
        insights.put("note", tr(en,
            "체스닷컴은 대체로 비슷한 레이팅의 상대를 매칭하므로, 상대 유형보다 내 반복 패턴과 오프닝 구멍을 우선 보여줍니다.",
            "Chess.com generally matches you with similarly-rated opponents, so we prioritize your own recurring patterns and opening holes over opponent type."));
        return insights;
    }

    private Map<String, Object> buildAdvancedInsights(
        java.sql.Connection connection,
        UUID analysisId,
        String username,
        Map<String, Object> result,
        Map<String, Object> profile,
        Map<String, Object> openingStats,
        boolean en
    ) {
        Map<String, Object> insights = new LinkedHashMap<>();
        Map<String, Object> criticalMoveStats = buildCriticalMoveStats(connection, analysisId, username, en);
        Map<String, Object> complexity = buildComplexityInsight(connection, analysisId, username, en);
        Map<String, Object> timePatterns = buildTimePatterns(connection, analysisId, username, en);
        List<Map<String, Object>> openingHoles = buildOpeningHoles(openingStats, en);

        insights.put("criticalMoveStats", criticalMoveStats);
        insights.put("complexityPreference", complexity);
        insights.put("timePatterns", timePatterns);
        insights.put("openingHoles", openingHoles);
        return insights;
    }

    private Map<String, Object> buildOpponentExploitPlan(
        java.sql.Connection connection,
        UUID analysisId,
        String username,
        Map<String, Object> result,
        Map<String, Object> profile,
        Map<String, Object> openingStats,
        boolean en
    ) {
        List<Map<String, Object>> weaknesses = new ArrayList<>();
        List<Map<String, Object>> recommendations = new ArrayList<>();
        List<Map<String, Object>> openingHoles = buildOpeningHoles(openingStats, en);
        Map<String, Object> criticalMoveStats = buildCriticalMoveStats(connection, analysisId, username, en);
        Map<String, Object> timePressure = buildTimePressureInsight(connection, analysisId, username, en);
        Map<String, Object> complexity = buildComplexityInsight(connection, analysisId, username, en);

        double consistency = getDouble(profile.get("consistency"), 50.0);
        double leadConversion = getDouble(profile.get("leadConversion"), 50.0);
        double endgame = getDouble(profile.get("endgameRating"), 50.0);
        double blunderTendency = getDouble(profile.get("blunderTendency"), 50.0);
        double criticalAccuracy = getDouble(criticalMoveStats.get("accuracy"), 0.0);

        if (consistency < 45.0 || blunderTendency > 55.0) {
            weaknesses.add(insightCard(
                tr(en, "기복과 큰 실수", "Inconsistency & Big Mistakes"),
                Math.round(consistency) + tr(en, "점", " pts"),
                tr(en, "일관성이 낮고 큰 손실 수가 나오는 편입니다. 단번에 끝내려 하기보다 계속 문제를 내는 포지션이 유리합니다.",
                    "Consistency is low and big losing moves show up often. Instead of going for a quick finish, keep posing problems.")
            ));
            recommendations.add(insightCard(
                tr(en, "복잡한 선택지 유지", "Keep Complex Choices Alive"),
                tr(en, "효율 높음", "High value"),
                tr(en, "퀸을 너무 빨리 교환하지 말고, 체크/캡처/위협이 동시에 있는 국면을 유지하세요. 실수 유도 기대값이 커집니다.",
                    "Avoid trading queens too early, and keep positions with simultaneous checks, captures, and threats — this raises the chance of inducing a mistake.")
            ));
        }

        if (criticalAccuracy > 0 && criticalAccuracy < 65.0) {
            weaknesses.add(insightCard(
                tr(en, "중요수 대응", "Critical Move Handling"),
                criticalAccuracy + "%",
                tr(en, "only-move 또는 최선수 격차가 큰 표본에서 안정성이 낮습니다.",
                    "Reliability is low in only-move positions or samples with a large gap to the best move.")
            ));
            recommendations.add(insightCard(
                tr(en, "강제수 후보 만들기", "Create Forcing Candidates"),
                tr(en, "전술 압박", "Tactical pressure"),
                tr(en, "직접 메이트 위협, 핀, 디스커버드 어택처럼 답이 하나로 좁혀지는 문제를 계속 던지는 쪽이 좋습니다.",
                    "Keep posing problems with a single correct answer — direct mate threats, pins, discovered attacks, and similar forcing moves.")
            ));
        }

        if (!timePressure.isEmpty() && String.valueOf(timePressure.getOrDefault("title", "")).contains(tr(en, "약점", "Weakness"))) {
            weaknesses.add(timePressure);
            recommendations.add(insightCard(
                tr(en, "시간 압박 유도", "Induce Time Pressure"),
                tr(en, "후반 승부", "Late-game edge"),
                tr(en, "초반에는 안전하게 빠르게 두고, 중반 이후 계산이 필요한 선택지를 남겨 상대 시간이 10초 이하로 내려가게 만드는 전략이 유리합니다.",
                    "Play safely and quickly in the opening, then leave choices that require calculation in the middlegame so your opponent's clock drops below 10 seconds.")
            ));
        }

        if (leadConversion < 45.0) {
            weaknesses.add(insightCard(
                tr(en, "우세 유지", "Maintaining an Edge"),
                Math.round(leadConversion) + tr(en, "점", " pts"),
                tr(en, "유리한 포지션을 깔끔하게 마무리하는 지표가 낮습니다.",
                    "The metric for cleanly converting winning positions is low.")
            ));
            recommendations.add(insightCard(
                tr(en, "방어 자원 남기기", "Keep Defensive Resources"),
                tr(en, "역전 기대", "Comeback chance"),
                tr(en, "불리해져도 즉시 포기하지 말고 체크 가능성, 영구 체크, 폰 레이스를 남기면 상대가 우세를 놓칠 확률이 있습니다.",
                    "Even when worse, don't give up immediately — keep checking chances, perpetual checks, or pawn races alive, since your opponent may let the advantage slip.")
            ));
        }

        if (endgame < 45.0) {
            weaknesses.add(insightCard(
                tr(en, "엔드게임", "Endgame"),
                Math.round(endgame) + tr(en, "점", " pts"),
                tr(en, "엔드게임 지표가 낮아 단순한 전환 뒤에도 흔들릴 수 있습니다.",
                    "The endgame metric is low, so they may falter even after a simple transition.")
            ));
            recommendations.add(insightCard(
                tr(en, "엔드게임 전환", "Steer Into Endgames"),
                tr(en, "장기전", "Long game"),
                tr(en, "물질이 같거나 약간 유리하다면 엔드게임으로 끌고 가세요. 특히 룩 엔드게임과 폰 엔드게임에서 실수 기대값이 커집니다.",
                    "If material is equal or slightly favorable, steer the game into an endgame — especially rook and pawn endgames, where the chance of a mistake rises.")
            ));
        }

        if (!openingHoles.isEmpty()) {
            Map<String, Object> hole = openingHoles.get(0);
            weaknesses.add(insightCard(
                tr(en, "오프닝 hole", "Opening Hole"),
                String.valueOf(hole.getOrDefault("name", tr(en, "약한 라인", "Weak line"))),
                String.format(
                    tr(en, "%s에서 점수율 %.1f%%, 평균 CPL %.1f입니다.", "As %s, score rate %.1f%% and average CPL %.1f."),
                    hole.getOrDefault("sideLabel", tr(en, "해당 색", "this color")),
                    getDouble(hole.get("scoreRate"), 0.0),
                    getDouble(hole.get("averageCpl"), 0.0)
                )
            ));
            recommendations.add(insightCard(
                tr(en, "라인 유도", "Steer Into This Line"),
                String.valueOf(hole.getOrDefault("sideLabel", tr(en, "오프닝", "Opening"))),
                tr(en, "상대가 이 구조로 들어오면 초반부터 익숙한 계획을 강요하세요. 첫 흔들림 시점 전후의 전술을 준비하면 효율이 좋습니다.",
                    "If your opponent enters this structure, push a familiar plan from the start. Preparing tactics around their first wobble point is highly effective.")
            ));
        }

        if (!complexity.isEmpty() && String.valueOf(complexity.getOrDefault("label", "")).contains(tr(en, "복잡", "Complex"))) {
            recommendations.add(insightCard(
                tr(en, "복잡도 조절", "Adjust Complexity"),
                String.valueOf(complexity.getOrDefault("value", tr(en, "관찰", "Observe"))),
                String.valueOf(complexity.getOrDefault("description", tr(en, "상대가 복잡한 포지션에서 흔들리는지 확인하며 운영하세요.",
                    "Play to see whether your opponent falters in complex positions.")))
            ));
        }

        if (recommendations.isEmpty()) {
            recommendations.add(insightCard(
                tr(en, "기본 공략", "Basic Strategy"),
                tr(en, "실수 억제", "Limit mistakes"),
                tr(en, "특정 약점 표본이 부족합니다. 무리한 공격보다 블런더를 줄이고, 상대가 먼저 구조적 약점을 만들 때까지 기다리는 쪽이 안정적입니다.",
                    "There isn't a clear weakness sample yet. Rather than forcing an attack, reduce your own blunders and wait for your opponent to create a structural weakness first.")
            ));
        }

        Map<String, Object> plan = new LinkedHashMap<>();
        plan.put("headline", tr(en,
            username + "님을 상대로는 반복 약점을 강요하는 운영이 가장 유리합니다.",
            "Against " + username + ", the best approach is to repeatedly press their recurring weaknesses."));
        plan.put("weaknesses", weaknesses.stream().limit(5).toList());
        plan.put("recommendations", recommendations.stream().limit(5).toList());
        plan.put("confidence", confidenceLabel(getInt(result.get("totalGames"), 0), en));
        plan.put("disclaimer", tr(en,
            "이 공략은 최근 분석 표본 기반의 통계적 추천입니다. 실제 한 판에서는 오프닝 선택과 시간 상황에 따라 달라질 수 있습니다.",
            "This game plan is a statistical recommendation based on your recent analysis sample. Actual results may vary depending on opening choices and time situations."));
        return plan;
    }

    private Map<String, Object> insightCard(String title, String value, String description) {
        Map<String, Object> card = new LinkedHashMap<>();
        card.put("title", title);
        card.put("value", value);
        card.put("description", description);
        return card;
    }

    private Map<String, Object> buildCriticalMoveStats(java.sql.Connection connection, UUID analysisId, String username, boolean en) {
        if (!columnExists(connection, "move_analyses", "critical_move_gap") ||
            !columnExists(connection, "move_analyses", "played_rank")) {
            return Map.of("sample", 0, "accuracy", 0.0, "message", tr(en, "중요수 표본은 새 분석부터 집계됩니다.", "Critical-move samples are only tracked starting from new analyses."));
        }
        try {
            var stmt = connection.prepareStatement(
                "SELECT COUNT(*) AS sample, " +
                "SUM(CASE WHEN (m.played_rank = 1 OR m.centipawn_loss < 80) THEN 1 ELSE 0 END) AS solved, " +
                "AVG(m.critical_move_gap) AS average_gap, " +
                "AVG(m.win_probability_loss) AS average_win_loss " +
                "FROM move_analyses m " +
                "JOIN games_worker g ON g.analysis_id = m.analysis_id AND g.game_index = m.game_index " +
                "WHERE m.analysis_id = ? AND (m.is_only_move = TRUE OR m.critical_move_gap >= 80) " +
                "AND ((LOWER(g.white_player) = LOWER(?) AND MOD(m.move_number, 2) = 0) " +
                "  OR (LOWER(g.black_player) = LOWER(?) AND MOD(m.move_number, 2) = 1))"
            );
            stmt.setObject(1, analysisId);
            stmt.setString(2, username);
            stmt.setString(3, username);
            var rs = stmt.executeQuery();
            if (!rs.next()) {
                return Map.of("sample", 0, "accuracy", 0.0);
            }
            int sample = rs.getInt("sample");
            int solved = rs.getInt("solved");
            double accuracy = sample > 0 ? Math.round((solved * 1000.0) / sample) / 10.0 : 0.0;
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("sample", sample);
            stats.put("solved", solved);
            stats.put("accuracy", accuracy);
            stats.put("averageGap", Math.round(rs.getDouble("average_gap") * 10.0) / 10.0);
            stats.put("averageWinProbabilityLoss", Math.round(rs.getDouble("average_win_loss") * 10.0) / 10.0);
            stats.put("label", sample < 3 ? tr(en, "표본 부족", "Insufficient sample") : (accuracy >= 70 ? tr(en, "강함", "Strong") : tr(en, "보강 필요", "Needs work")));
            return stats;
        } catch (Exception e) {
            log.warn("Failed to build critical move stats for {}: {}", analysisId, e.getMessage());
            return Map.of("sample", 0, "accuracy", 0.0);
        }
    }

    private Map<String, Object> buildComplexityInsight(java.sql.Connection connection, UUID analysisId, String username, boolean en) {
        if (!columnExists(connection, "move_analyses", "legal_move_count")) {
            return Map.of();
        }
        try {
            var stmt = connection.prepareStatement(
                "SELECT AVG(m.legal_move_count) AS average_legal_moves, " +
                "AVG(CASE WHEN m.legal_move_count >= 30 THEN m.centipawn_loss END) AS complex_cpl, " +
                "AVG(CASE WHEN m.legal_move_count < 30 THEN m.centipawn_loss END) AS simple_cpl, " +
                "COUNT(CASE WHEN m.legal_move_count >= 30 THEN 1 END) AS complex_sample " +
                "FROM move_analyses m " +
                "JOIN games_worker g ON g.analysis_id = m.analysis_id AND g.game_index = m.game_index " +
                "WHERE m.analysis_id = ? AND m.legal_move_count IS NOT NULL " +
                "AND ((LOWER(g.white_player) = LOWER(?) AND MOD(m.move_number, 2) = 0) " +
                "  OR (LOWER(g.black_player) = LOWER(?) AND MOD(m.move_number, 2) = 1))"
            );
            stmt.setObject(1, analysisId);
            stmt.setString(2, username);
            stmt.setString(3, username);
            var rs = stmt.executeQuery();
            if (!rs.next()) {
                return Map.of();
            }

            double complexCpl = getDouble(rs.getObject("complex_cpl"), 0.0);
            double simpleCpl = getDouble(rs.getObject("simple_cpl"), 0.0);
            int complexSample = rs.getInt("complex_sample");
            double delta = complexCpl - simpleCpl;
            Map<String, Object> insight = new LinkedHashMap<>();
            insight.put("averageLegalMoves", Math.round(rs.getDouble("average_legal_moves") * 10.0) / 10.0);
            insight.put("complexSample", complexSample);
            insight.put("complexCpl", Math.round(complexCpl * 10.0) / 10.0);
            insight.put("simpleCpl", Math.round(simpleCpl * 10.0) / 10.0);
            insight.put("label", delta > 15 ? tr(en, "복잡한 포지션 취약", "Weaker in Complex Positions") : (delta < -10 ? tr(en, "복잡한 포지션 강점", "Stronger in Complex Positions") : tr(en, "복잡도 영향 보통", "Moderate Complexity Impact")));
            insight.put("value", delta > 0 ? "+" + Math.round(delta * 10.0) / 10.0 + " CPL" : Math.round(delta * 10.0) / 10.0 + " CPL");
            insight.put("description", delta > 15
                ? tr(en, "선택지가 많은 포지션에서 평균 손실이 커집니다.", "Your average loss increases in positions with many candidate moves.")
                : tr(en, "복잡한 포지션과 단순한 포지션의 손실 차이가 크지 않습니다.", "The loss difference between complex and simple positions isn't large."));
            return insight;
        } catch (Exception e) {
            log.warn("Failed to build complexity insight for {}: {}", analysisId, e.getMessage());
            return Map.of();
        }
    }

    private Map<String, Object> buildTimePatterns(java.sql.Connection connection, UUID analysisId, String username, boolean en) {
        try {
            var stmt = connection.prepareStatement(
                "SELECT g.date_played, g.white_player, g.black_player, g.result, COALESCE(ga.average_centipawn_loss, 0) AS cpl " +
                "FROM games_worker g " +
                "LEFT JOIN game_analyses ga ON ga.analysis_id = g.analysis_id AND ga.game_index = g.game_index " +
                "WHERE g.analysis_id = ? ORDER BY g.game_index"
            );
            stmt.setObject(1, analysisId);
            var rs = stmt.executeQuery();
            Map<String, StatBucket> buckets = new LinkedHashMap<>();
            buckets.put("morning", new StatBucket(tr(en, "아침", "Morning")));
            buckets.put("afternoon", new StatBucket(tr(en, "오후", "Afternoon")));
            buckets.put("evening", new StatBucket(tr(en, "저녁", "Evening")));
            buckets.put("night", new StatBucket(tr(en, "밤/새벽", "Night/Early Morning")));

            while (rs.next()) {
                String whitePlayer = rs.getString("white_player");
                String blackPlayer = rs.getString("black_player");
                boolean isWhite = whitePlayer != null && whitePlayer.equalsIgnoreCase(username);
                boolean isBlack = blackPlayer != null && blackPlayer.equalsIgnoreCase(username);
                if (!isWhite && !isBlack) continue;

                LocalDateTime playedAt = parsePlayedAt(rs.getString("date_played"));
                if (playedAt == null) continue;
                String bucketKey = timeBucket(playedAt.getHour());
                buckets.get(bucketKey).record(scoreForPlayer(rs.getString("result"), isWhite), rs.getDouble("cpl"));
            }

            List<Map<String, Object>> rows = buckets.values().stream()
                .filter(bucket -> bucket.games > 0)
                .map(StatBucket::toMap)
                .toList();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("buckets", rows);
            result.put("best", rows.stream().max(Comparator.comparingDouble(row -> getDouble(row.get("scoreRate"), 0.0))).orElse(Map.of()));
            result.put("worst", rows.stream().min(Comparator.comparingDouble(row -> getDouble(row.get("scoreRate"), 100.0))).orElse(Map.of()));
            result.put("message", rows.size() < 2
                ? tr(en, "시간대 표본이 아직 부족합니다.", "Not enough samples by time of day yet.")
                : tr(en, "시간대별 승률과 CPL 차이를 바탕으로 컨디션 패턴을 추정합니다.", "We estimate condition patterns based on win-rate and CPL differences by time of day."));
            return result;
        } catch (Exception e) {
            log.warn("Failed to build time patterns for {}: {}", analysisId, e.getMessage());
            return Map.of("message", tr(en, "시간대 패턴을 계산할 수 없습니다.", "Could not calculate time-of-day patterns."));
        }
    }

    private LocalDateTime parsePlayedAt(String value) {
        if (value == null || value.isBlank() || value.equalsIgnoreCase("Unknown")) {
            return null;
        }
        try {
            if (value.length() == 10) {
                return LocalDateTime.parse(value + "T12:00:00");
            }
            return LocalDateTime.parse(value);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String timeBucket(int hour) {
        if (hour >= 6 && hour < 12) return "morning";
        if (hour >= 12 && hour < 18) return "afternoon";
        if (hour >= 18 && hour < 24) return "evening";
        return "night";
    }

    private List<Map<String, Object>> buildOpeningHoles(Map<String, Object> openingStats, boolean en) {
        List<Map<String, Object>> holes = new ArrayList<>();
        collectOpeningHoles(holes, tr(en, "백", "White"), openingStats.getOrDefault("whiteAll", openingStats.get("white")), en);
        collectOpeningHoles(holes, tr(en, "흑", "Black"), openingStats.getOrDefault("blackAll", openingStats.get("black")), en);
        return holes.stream()
            .sorted((a, b) -> {
                int scoreCompare = Double.compare(getDouble(a.get("scoreRate"), 100.0), getDouble(b.get("scoreRate"), 100.0));
                if (scoreCompare != 0) return scoreCompare;
                return Double.compare(getDouble(b.get("averageCpl"), 0.0), getDouble(a.get("averageCpl"), 0.0));
            })
            .limit(4)
            .toList();
    }

    private void collectOpeningHoles(List<Map<String, Object>> holes, String sideLabel, Object rowsObject, boolean en) {
        for (Map<String, Object> row : openingRows(rowsObject)) {
            double scoreRate = getDouble(row.get("scoreRate"), 50.0);
            double cpl = getDouble(row.get("averageCpl"), 0.0);
            double firstIssue = getDouble(row.get("firstIssueMove"), 99.0);
            int count = getInt(row.get("count"), 0);
            if (count <= 0) continue;
            if (scoreRate <= 45.0 || cpl >= 75.0 || firstIssue <= 14.0) {
                Map<String, Object> hole = new LinkedHashMap<>(row);
                hole.put("sideLabel", sideLabel);
                hole.put("reason", firstIssue <= 14.0 ? tr(en, "초반 흔들림", "Early wobble") : (scoreRate <= 45.0 ? tr(en, "낮은 점수율", "Low score rate") : tr(en, "높은 CPL", "High CPL")));
                holes.add(hole);
            }
        }
    }

    private String buildPlayerStory(
        String username,
        Map<String, Object> result,
        Map<String, Object> profile,
        Map<String, Object> criticalMoveStats,
        Map<String, Object> timePatterns,
        List<Map<String, Object>> openingHoles,
        boolean en
    ) {
        String style = String.valueOf(profile.getOrDefault("playingStyle", tr(en, "균형형 플레이어", "Balanced Player")));
        double cpl = getDouble(result.get("averageCentipawnLoss"), 0.0);
        double accuracy = getDouble(result.get("averageAccuracy"), 0.0);
        String criticalLabel = String.valueOf(criticalMoveStats.getOrDefault("label", tr(en, "표본 부족", "Insufficient sample")));
        String holeText = openingHoles.isEmpty()
            ? tr(en, "뚜렷한 오프닝 hole은 아직 표본이 부족합니다", "There isn't enough sample yet to identify a clear opening hole")
            : tr(en,
                "가장 먼저 볼 오프닝 hole은 " + openingHoles.get(0).getOrDefault("name", "해당 라인") + "입니다",
                "The first opening hole to look at is " + openingHoles.get(0).getOrDefault("name", "this line"));
        return String.format(
            tr(en,
                "%s님의 최근 표본은 %s 성향입니다. 평균 정확도 %.1f%%, 평균 CPL %.1f로 큰 방향은 잡혀 있으며, 결정적 수 대응은 %s입니다. %s. 다음 개선은 결정적 순간 복기와 반복 오프닝 구조 보강이 효율적입니다.",
                "%s's recent sample shows a %s tendency. With an average accuracy of %.1f%% and average CPL of %.1f, the overall direction is solid, and critical-move handling is %s. %s. The most effective next steps are reviewing decisive moments and reinforcing recurring opening structures."),
            username,
            style,
            accuracy,
            cpl,
            criticalLabel,
            holeText
        );
    }

    private List<Map<String, Object>> buildStyleAxes(Map<String, Object> profile, boolean en) {
        double aggression = getDouble(profile.get("aggressionRating"), 50.0);
        double tactical = getDouble(profile.get("tacticalRating"), 50.0);
        double risk = getDouble(profile.get("riskTolerance"), 50.0);
        double positional = getDouble(profile.get("positionalRating"), 50.0);
        double consistency = getDouble(profile.get("consistency"), 50.0);
        double opening = getDouble(profile.get("openingVariety"), 50.0);
        double endgame = getDouble(profile.get("endgameRating"), 50.0);
        double conversion = getDouble(profile.get("leadConversion"), 50.0);
        double time = getDouble(profile.get("timeManagementRating"), 50.0);

        return List.of(
            axis(tr(en, "주도권 축", "Initiative Axis"), (aggression + tactical + risk) / 3.0, tr(en, "전술, 공격성, 리스크 감수 성향을 합친 축", "Combines tactical sense, aggression, and risk tolerance"), en),
            axis(tr(en, "견고함 축", "Solidity Axis"), (positional + consistency + (100.0 - risk)) / 3.0, tr(en, "포지션 이해와 안정성을 합친 축", "Combines positional understanding and stability"), en),
            axis(tr(en, "준비도 축", "Preparation Axis"), opening, tr(en, "오프닝 다양성과 준비 폭을 보는 축", "Reflects opening variety and breadth of preparation"), en),
            axis(tr(en, "마무리 축", "Finishing Axis"), (endgame + conversion + time) / 3.0, tr(en, "엔드게임, 우세 변환, 시간 관리를 합친 축", "Combines endgame technique, lead conversion, and time management"), en)
        );
    }

    private Map<String, Object> axis(String label, double value, String description, boolean en) {
        Map<String, Object> axis = new LinkedHashMap<>();
        axis.put("label", label);
        axis.put("value", Math.round(value * 10.0) / 10.0);
        axis.put("description", description);
        axis.put("band", value >= 70 ? tr(en, "강점", "Strength") : (value <= 40 ? tr(en, "보강", "Needs Work") : tr(en, "보통", "Average")));
        return axis;
    }

    private List<Map<String, Object>> buildConfidenceBands(Map<String, Object> result, Map<String, Object> profile, boolean en) {
        int games = getInt(result.get("totalGames"), 0);
        int margin = games >= 30 ? 5 : (games >= 15 ? 9 : 15);
        return List.of(
            confidenceBand(tr(en, "정확도", "Accuracy"), getDouble(result.get("averageAccuracy"), 0.0), margin, tr(en, "분석 게임 수 " + games + "판 기준", "Based on " + games + " analyzed games")),
            confidenceBand(tr(en, "전술 감각", "Tactical Sense"), getDouble(profile.get("tacticalRating"), 0.0), margin + 3, tr(en, "전술 표본 수에 민감", "Sensitive to the number of tactical samples")),
            confidenceBand(tr(en, "엔드게임", "Endgame"), getDouble(profile.get("endgameRating"), 0.0), margin + 8, tr(en, "엔드게임 도달 표본에 민감", "Sensitive to the number of endgame samples reached")),
            confidenceBand(tr(en, "일관성", "Consistency"), getDouble(profile.get("consistency"), 0.0), margin + 4, tr(en, "게임별 CPL 분산 기반", "Based on game-to-game CPL variance"))
        );
    }

    private Map<String, Object> confidenceBand(String label, double value, int margin, String basis) {
        Map<String, Object> band = new LinkedHashMap<>();
        band.put("label", label);
        band.put("value", Math.round(value * 10.0) / 10.0);
        band.put("margin", margin);
        band.put("range", Math.max(0, Math.round(value - margin)) + " - " + Math.min(100, Math.round(value + margin)));
        band.put("basis", basis);
        return band;
    }

    private String confidenceLabel(int totalGames, boolean en) {
        if (totalGames >= 30) return tr(en, "높음", "High");
        if (totalGames >= 15) return tr(en, "보통", "Moderate");
        return tr(en, "낮음", "Low");
    }

    private Map<String, Object> buildCriticalMoveInsight(java.sql.Connection connection, UUID analysisId, String username, boolean en) {
        try {
            var stmt = connection.prepareStatement(
                "SELECT COUNT(*) AS total, " +
                "SUM(CASE WHEN m.centipawn_loss < 80 THEN 1 ELSE 0 END) AS solved, " +
                "AVG(m.centipawn_loss) AS average_cpl " +
                "FROM move_analyses m " +
                "JOIN games_worker g ON g.analysis_id = m.analysis_id AND g.game_index = m.game_index " +
                "WHERE m.analysis_id = ? AND m.best_move IS NOT NULL AND m.best_move <> '' " +
                "AND ((LOWER(g.white_player) = LOWER(?) AND MOD(m.move_number, 2) = 0) " +
                "  OR (LOWER(g.black_player) = LOWER(?) AND MOD(m.move_number, 2) = 1))"
            );
            stmt.setObject(1, analysisId);
            stmt.setString(2, username);
            stmt.setString(3, username);
            var rs = stmt.executeQuery();
            if (!rs.next()) {
                return Map.of();
            }

            int total = rs.getInt("total");
            if (total < 3) {
                return Map.of();
            }

            int solved = rs.getInt("solved");
            double accuracy = Math.round((solved * 1000.0) / total) / 10.0;
            double averageCpl = Math.round(rs.getDouble("average_cpl") * 10.0) / 10.0;
            String title = accuracy >= 70.0 ? tr(en, "중요수 대응", "Critical Move Handling") : tr(en, "중요수 보강", "Critical Move Improvement");
            String description = accuracy >= 70.0
                ? String.format(tr(en, "엔진이 최선수를 확인한 중요 표본 %d개 중 %d개를 안정적으로 처리했습니다. 평균 손실은 %.1fcp입니다.",
                    "Out of %d critical samples where the engine confirmed a best move, you handled %d reliably. Average loss is %.1fcp."), total, solved, averageCpl)
                : String.format(tr(en, "엔진이 최선수를 확인한 중요 표본 %d개 중 %d개만 안정권이었습니다. 큰 전술/강제수 후보에서 한 번 더 멈추는 루틴이 좋습니다.",
                    "Out of %d critical samples where the engine confirmed a best move, only %d were handled reliably. Try pausing once more on big tactical or forcing candidates."), total, solved);

            return Map.of(
                "title", title,
                "value", solved + "/" + total,
                "description", description
            );
        } catch (Exception e) {
            log.warn("Failed to build critical move insight for {}: {}", analysisId, e.getMessage());
            return Map.of();
        }
    }

    private Map<String, Object> buildTimePressureInsight(java.sql.Connection connection, UUID analysisId, String username, boolean en) {
        if (!columnExists(connection, "move_analyses", "time_left")) {
            return Map.of();
        }
        try {
            var stmt = connection.prepareStatement(
                "SELECT " +
                "SUM(CASE WHEN m.time_left <= 10 THEN 1 ELSE 0 END) AS pressure_moves, " +
                "SUM(CASE WHEN m.time_left <= 10 AND m.centipawn_loss >= 100 THEN 1 ELSE 0 END) AS pressure_errors, " +
                "AVG(CASE WHEN m.time_left <= 10 THEN m.centipawn_loss END) AS pressure_cpl, " +
                "AVG(CASE WHEN m.time_left > 30 THEN m.centipawn_loss END) AS calm_cpl " +
                "FROM move_analyses m " +
                "JOIN games_worker g ON g.analysis_id = m.analysis_id AND g.game_index = m.game_index " +
                "WHERE m.analysis_id = ? AND m.time_left IS NOT NULL " +
                "AND ((LOWER(g.white_player) = LOWER(?) AND MOD(m.move_number, 2) = 0) " +
                "  OR (LOWER(g.black_player) = LOWER(?) AND MOD(m.move_number, 2) = 1))"
            );
            stmt.setObject(1, analysisId);
            stmt.setString(2, username);
            stmt.setString(3, username);
            var rs = stmt.executeQuery();
            if (!rs.next()) {
                return Map.of();
            }

            int pressureMoves = getInt(rs.getObject("pressure_moves"), 0);
            if (pressureMoves < 2) {
                return Map.of();
            }

            int pressureErrors = getInt(rs.getObject("pressure_errors"), 0);
            double pressureCpl = getDouble(rs.getObject("pressure_cpl"), 0.0);
            double calmCpl = getDouble(rs.getObject("calm_cpl"), 0.0);
            double delta = pressureCpl - calmCpl;

            if (calmCpl <= 0) {
                return Map.of(
                    "title", tr(en, "시간 압박 표본", "Time Pressure Sample"),
                    "value", pressureMoves + tr(en, "수", " moves"),
                    "description", String.format(tr(en, "10초 이하에서 둔 수가 %d개 잡혔고, 그중 큰 실수는 %d개였습니다. 더 많은 게임이 쌓이면 평소 구간과 비교합니다.",
                        "%d moves were played with 10 seconds or less, and %d of them were big mistakes. We'll compare against your normal pace as more games are added."), pressureMoves, pressureErrors)
                );
            }
            if (delta > 15.0) {
                return Map.of(
                    "title", tr(en, "시간 압박 약점", "Time Pressure Weakness"),
                    "value", "+" + Math.round(delta * 10.0) / 10.0 + " CPL",
                    "description", String.format(tr(en, "10초 이하 구간에서 평균 손실이 평소보다 커집니다. 시간 압박 큰 실수는 %d개였습니다.",
                        "Your average loss increases when you have 10 seconds or less. %d big mistakes happened under time pressure."), pressureErrors)
                );
            }
            if (delta < -5.0) {
                return Map.of(
                    "title", tr(en, "시간 압박 대응", "Time Pressure Handling"),
                    "value", tr(en, "강함", "Strong"),
                    "description", String.format(tr(en, "10초 이하 구간 평균 CPL이 평소보다 낮았습니다. 빠른 직관으로 처리한 표본이 %d수 잡혔습니다.",
                        "Your average CPL with 10 seconds or less was lower than usual. %d moves were handled well with quick intuition."), pressureMoves)
                );
            }
            return Map.of(
                "title", tr(en, "시간 압박", "Time Pressure"),
                "value", tr(en, "안정적", "Stable"),
                "description", String.format(tr(en, "10초 이하 구간과 평소 구간의 CPL 차이가 크지 않습니다. 시간 압박 큰 실수는 %d개였습니다.",
                    "The CPL difference between low-time and normal situations isn't large. %d big mistakes happened under time pressure."), pressureErrors)
            );
        } catch (Exception e) {
            log.warn("Failed to build time pressure insight for {}: {}", analysisId, e.getMessage());
            return Map.of();
        }
    }

    private Map<String, Object> findWeakestOpening(Map<String, Object> openingStats) {
        List<Map<String, Object>> allRows = new ArrayList<>();
        allRows.addAll(openingRows(openingStats.get("white")));
        allRows.addAll(openingRows(openingStats.get("black")));
        return allRows.stream()
            .filter(row -> getInt(row.get("count"), 0) > 0)
            .sorted((a, b) -> {
                int scoreCompare = Double.compare(getDouble(a.get("scoreRate"), 100.0), getDouble(b.get("scoreRate"), 100.0));
                if (scoreCompare != 0) return scoreCompare;
                return Double.compare(getDouble(b.get("averageCpl"), 0.0), getDouble(a.get("averageCpl"), 0.0));
            })
            .findFirst()
            .orElse(Map.of());
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> openingRows(Object value) {
        if (value instanceof List<?> list) {
            return list.stream()
                .filter(Map.class::isInstance)
                .map(row -> (Map<String, Object>) row)
                .toList();
        }
        return List.of();
    }

    private String buildLearningHeadline(List<Map<String, Object>> cards, int totalGames, boolean en) {
        String firstTitle = String.valueOf(cards.get(0).getOrDefault("title", tr(en, "결정적 순간 복기", "Review Decisive Moments")));
        if (en) {
            String sample = totalGames < 15 ? "Since the sample is small" : "Based on recurring patterns";
            return sample + ", the most efficient starting point right now is '" + firstTitle + "'.";
        }
        String sample = totalGames < 15 ? "표본이 작으니" : "반복 패턴 기준으로";
        return sample + " 지금은 '" + firstTitle + "'부터 보는 것이 가장 효율적입니다.";
    }

    private Map<String, Object> buildTiltInsight(java.sql.Connection connection, UUID analysisId, String username, boolean en) {
        try {
            var stmt = connection.prepareStatement(
                "SELECT g.white_player, g.black_player, g.result, COALESCE(ga.average_centipawn_loss, 0) AS average_centipawn_loss " +
                "FROM games_worker g " +
                "LEFT JOIN game_analyses ga ON ga.analysis_id = g.analysis_id AND ga.game_index = g.game_index " +
                "WHERE g.analysis_id = ? ORDER BY g.game_index"
            );
            stmt.setObject(1, analysisId);
            var rs = stmt.executeQuery();

            List<Double> afterLossCpls = new ArrayList<>();
            List<Double> afterNonLossCpls = new ArrayList<>();
            Boolean previousLoss = null;

            while (rs.next()) {
                String whitePlayer = rs.getString("white_player");
                String blackPlayer = rs.getString("black_player");
                boolean isWhite = whitePlayer != null && whitePlayer.equalsIgnoreCase(username);
                boolean isBlack = blackPlayer != null && blackPlayer.equalsIgnoreCase(username);
                if (!isWhite && !isBlack) {
                    continue;
                }

                double cpl = rs.getDouble("average_centipawn_loss");
                if (previousLoss != null && cpl > 0) {
                    if (previousLoss) {
                        afterLossCpls.add(cpl);
                    } else {
                        afterNonLossCpls.add(cpl);
                    }
                }
                previousLoss = scoreForPlayer(rs.getString("result"), isWhite) == 0.0;
            }

            if (afterLossCpls.isEmpty() || afterNonLossCpls.isEmpty()) {
                return Map.of();
            }

            double afterLossAvg = afterLossCpls.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            double baselineAvg = afterNonLossCpls.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
            double delta = afterLossAvg - baselineAvg;
            if (Math.abs(delta) < 10) {
                return Map.of(
                    "title", tr(en, "패배 후 회복", "Post-Loss Recovery"),
                    "value", tr(en, "안정적", "Stable"),
                    "description", tr(en, "패배 직후 다음 판의 CPL 변화가 크지 않습니다. 감정적으로 크게 흔들리지는 않는 편입니다.",
                        "Your CPL doesn't change much in the game right after a loss. You don't seem to be heavily affected emotionally.")
                );
            }
            if (delta > 0) {
                return Map.of(
                    "title", tr(en, "틸트 경고", "Tilt Warning"),
                    "value", "+" + Math.round(delta * 10.0) / 10.0 + " CPL",
                    "description", tr(en, "패배 직후 다음 판에서 손실이 커지는 패턴이 보입니다. 연패 구간에서는 3분 쉬고 다음 판을 시작해보세요.",
                        "Your losses tend to grow in the game right after a loss. During losing streaks, try taking a 3-minute break before starting the next game.")
                );
            }
            return Map.of(
                "title", tr(en, "반등 패턴", "Bounce-Back Pattern"),
                "value", Math.round(Math.abs(delta) * 10.0) / 10.0 + tr(en, " CPL 개선", " CPL improvement"),
                "description", tr(en, "패배 직후 다음 판에서 오히려 더 신중해지는 패턴이 보입니다. 이 루틴을 유지해도 좋습니다.",
                    "You tend to play more carefully in the game right after a loss. It's worth keeping this routine.")
            );
        } catch (Exception e) {
            log.warn("Failed to build tilt insight for {}: {}", analysisId, e.getMessage());
            return Map.of();
        }
    }

    private Map<String, Object> estimatedPercentile(
        String label,
        double value,
        double mean,
        double standardDeviation,
        boolean higherIsBetter,
        String unit,
        boolean en
    ) {
        double safeStd = Math.max(1.0, standardDeviation);
        double z = (value - mean) / safeStd;
        if (!higherIsBetter) {
            z = -z;
        }
        int betterThan = clampPercent((int) Math.round(100.0 / (1.0 + Math.exp(-1.35 * z))));
        int topPercent = Math.max(1, 100 - betterThan);

        Map<String, Object> metric = new LinkedHashMap<>();
        metric.put("label", label);
        metric.put("value", Math.round(value * 10.0) / 10.0);
        metric.put("unit", unit);
        metric.put("betterThanPercent", betterThan);
        metric.put("topPercent", topPercent);
        metric.put("topPercentLabel", percentileLabel(betterThan, en));
        metric.put("basis", tr(en,
            "동일 레이팅대 예상 평균 " + Math.round(mean * 10.0) / 10.0 + unit + " 기준",
            "Based on the expected average of " + Math.round(mean * 10.0) / 10.0 + unit + " for this rating band"));
        return metric;
    }

    private Map<String, Object> stylePercentile(String label, double score, boolean en) {
        int betterThan = clampPercent((int) Math.round(score));
        int topPercent = Math.max(1, 100 - betterThan);
        Map<String, Object> metric = new LinkedHashMap<>();
        metric.put("label", label);
        metric.put("value", Math.round(score * 10.0) / 10.0);
        metric.put("unit", tr(en, "점", " pts"));
        metric.put("betterThanPercent", betterThan);
        metric.put("topPercent", topPercent);
        metric.put("topPercentLabel", percentileLabel(betterThan, en));
        metric.put("basis", tr(en, "0-100 스타일 점수를 백분위처럼 해석한 임시 지표", "A provisional metric that interprets the 0-100 style score as a percentile"));
        return metric;
    }

    private String percentileLabel(int betterThanPercent, boolean en) {
        int safeBetterThan = Math.max(0, Math.min(99, betterThanPercent));
        if (safeBetterThan >= 50) {
            return tr(en, "상위 " + Math.max(1, 100 - safeBetterThan) + "% 추정", "Estimated top " + Math.max(1, 100 - safeBetterThan) + "%");
        }
        if (safeBetterThan <= 0) {
            return tr(en, "하위 1% 미만 추정", "Estimated bottom <1%");
        }
        return tr(en, "하위 " + safeBetterThan + "% 추정", "Estimated bottom " + safeBetterThan + "%");
    }

    private Map<String, Object> buildSampleReliability(int totalGames, boolean en) {
        Map<String, Object> reliability = new LinkedHashMap<>();
        if (totalGames >= 30) {
            reliability.put("label", tr(en, "높음", "High"));
            reliability.put("message", tr(en, "30판 이상이라 스타일과 실수 패턴을 꽤 안정적으로 볼 수 있습니다.",
                "With 30+ games, your style and mistake patterns can be read fairly reliably."));
        } else if (totalGames >= 15) {
            reliability.put("label", tr(en, "보통", "Moderate"));
            reliability.put("message", tr(en, "대략적인 성향은 읽을 수 있지만, 30판 이상이면 비교 지표가 더 안정됩니다.",
                "General tendencies can be read, but the comparison metrics become more stable past 30 games."));
        } else {
            reliability.put("label", tr(en, "낮음", "Low"));
            reliability.put("message", tr(en, "표본이 작아 최근 컨디션의 영향이 큽니다. 재미로 보되 큰 방향만 참고하세요.",
                "The sample is small, so recent form has a large effect. Treat this as a rough indication only."));
        }
        reliability.put("games", totalGames);
        return reliability;
    }

    private Map<String, Object> buildOpponentProfile(
        java.sql.Connection connection,
        UUID analysisId,
        String username,
        boolean en
    ) throws Exception {
        OpponentBucket stronger = new OpponentBucket(tr(en, "강한 상대", "Stronger Opponents"));
        OpponentBucket similar = new OpponentBucket(tr(en, "비슷한 상대", "Similar-Rated Opponents"));
        OpponentBucket weaker = new OpponentBucket(tr(en, "낮은 상대", "Lower-Rated Opponents"));
        int playerRatingTotal = 0;
        int opponentRatingTotal = 0;
        int gamesWithRating = 0;

        var stmt = connection.prepareStatement(
            "SELECT white_player, black_player, result, pgn FROM games_worker WHERE analysis_id = ?");
        stmt.setObject(1, analysisId);
        var rs = stmt.executeQuery();

        while (rs.next()) {
            String whitePlayer = rs.getString("white_player");
            String blackPlayer = rs.getString("black_player");
            boolean isWhite = whitePlayer != null && whitePlayer.equalsIgnoreCase(username);
            boolean isBlack = blackPlayer != null && blackPlayer.equalsIgnoreCase(username);
            if (!isWhite && !isBlack) {
                continue;
            }

            String pgn = rs.getString("pgn");
            int playerRating = parsePgnRating(pgn, isWhite ? "WhiteElo" : "BlackElo");
            int opponentRating = parsePgnRating(pgn, isWhite ? "BlackElo" : "WhiteElo");
            if (playerRating <= 0 || opponentRating <= 0) {
                continue;
            }

            double score = scoreForPlayer(rs.getString("result"), isWhite);
            int diff = opponentRating - playerRating;
            if (diff >= 100) {
                stronger.record(score);
            } else if (diff <= -100) {
                weaker.record(score);
            } else {
                similar.record(score);
            }

            playerRatingTotal += playerRating;
            opponentRatingTotal += opponentRating;
            gamesWithRating++;
        }

        Map<String, Object> buckets = new LinkedHashMap<>();
        buckets.put("stronger", stronger.toMap());
        buckets.put("similar", similar.toMap());
        buckets.put("weaker", weaker.toMap());

        Map<String, Object> profile = new LinkedHashMap<>();
        int averagePlayerRating = gamesWithRating > 0 ? Math.round((float) playerRatingTotal / gamesWithRating) : 0;
        int averageOpponentRating = gamesWithRating > 0 ? Math.round((float) opponentRatingTotal / gamesWithRating) : 0;
        profile.put("averagePlayerRating", averagePlayerRating);
        profile.put("averageOpponentRating", averageOpponentRating);
        profile.put("gamesWithRating", gamesWithRating);
        profile.put("buckets", buckets);
        profile.put("headline", opponentHeadline(stronger, similar, weaker, gamesWithRating, en));
        return profile;
    }

    private Map<String, Object> findGrandmasterMatch(Map<String, Object> profile, boolean en) {
        Map<String, Double> player = new LinkedHashMap<>();
        player.put("tactical", getDouble(profile.get("tacticalRating"), 0.0));
        player.put("positional", getDouble(profile.get("positionalRating"), 0.0));
        player.put("endgame", getDouble(profile.get("endgameRating"), 0.0));
        player.put("time", getDouble(profile.get("timeManagementRating"), 0.0));
        player.put("aggression", getDouble(profile.get("aggressionRating"), 0.0));
        player.put("risk", getDouble(profile.get("riskTolerance"), 0.0));
        player.put("consistency", getDouble(profile.get("consistency"), 0.0));
        player.put("opening", getDouble(profile.get("openingVariety"), 0.0));
        player.put("conversion", getDouble(profile.get("leadConversion"), 0.0));

        GrandmasterArchetype best = null;
        double bestSimilarity = -1.0;
        for (GrandmasterArchetype archetype : grandmasterArchetypes()) {
            double similarity = cosineSimilarity(player, archetype.vector);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                best = archetype;
            }
        }

        Map<String, Object> match = new LinkedHashMap<>();
        if (best == null || bestSimilarity <= 0.0) {
            match.put("name", tr(en, "분석 준비 중", "Analysis in progress"));
            match.put("similarity", 0);
            match.put("styleLabel", tr(en, "데이터 부족", "Insufficient data"));
            match.put("reason", tr(en, "스타일 데이터가 충분하지 않습니다.", "Not enough style data yet."));
            return match;
        }

        match.put("name", best.name);
        match.put("similarity", clampPercent((int) Math.round(bestSimilarity * 100.0)));
        match.put("styleLabel", tr(en, best.styleLabel, best.styleLabelEn));
        match.put("reason", topStyleReason(player, best, en));
        return match;
    }

    private String buildComparativeNarrative(
        String username,
        int totalGames,
        Map<String, Object> reliability,
        Map<String, Object> percentiles,
        Map<String, Object> gmMatch,
        Map<String, Object> opponentProfile,
        boolean en
    ) {
        Map<String, Object> accuracy = asMap(percentiles.get("accuracy"));
        Map<String, Object> cpl = asMap(percentiles.get("centipawnLoss"));
        String accuracyRank = String.valueOf(accuracy.getOrDefault("topPercentLabel", tr(en, "비교 준비 중", "Comparison in progress")));
        String cplRank = String.valueOf(cpl.getOrDefault("topPercentLabel", tr(en, "비교 준비 중", "Comparison in progress")));
        String gmName = String.valueOf(gmMatch.getOrDefault("name", tr(en, "분석 준비 중", "Analysis in progress")));
        String reliabilityLabel = String.valueOf(reliability.getOrDefault("label", tr(en, "낮음", "Low")));

        return String.format(
            tr(en,
                "%s님의 최근 %d판은 표본 신뢰도 %s입니다. 정확도는 %s, CPL 관점은 %s로 추정되며, 스타일 결은 %s 쪽에 가깝습니다.",
                "%s's recent %d games have a sample reliability of %s. Accuracy is estimated at %s, CPL-wise at %s, and the playing style leans toward %s."),
            username,
            totalGames,
            reliabilityLabel,
            accuracyRank,
            cplRank,
            gmName
        );
    }

    private double expectedAccuracy(int rating) {
        if (rating <= 0) return 72.0;
        if (rating < 1000) return 62.0;
        if (rating < 1200) return 68.0;
        if (rating < 1400) return 73.0;
        if (rating < 1600) return 78.0;
        if (rating < 1800) return 82.0;
        if (rating < 2000) return 86.0;
        return 90.0;
    }

    private double expectedCentipawnLoss(int rating) {
        if (rating <= 0) return 80.0;
        if (rating < 1000) return 125.0;
        if (rating < 1200) return 105.0;
        if (rating < 1400) return 88.0;
        if (rating < 1600) return 70.0;
        if (rating < 1800) return 58.0;
        if (rating < 2000) return 47.0;
        return 36.0;
    }

    private String getRatingBand(int rating, boolean en) {
        if (rating < 1000) return tr(en, "1000 이하", "Under 1000");
        if (rating < 1200) return "1000-1200";
        if (rating < 1400) return "1200-1400";
        if (rating < 1600) return "1400-1600";
        if (rating < 1800) return "1600-1800";
        if (rating < 2000) return "1800-2000";
        if (rating < 2200) return "2000-2200";
        return tr(en, "2200 이상", "2200+");
    }

    private int parsePgnRating(String pgn, String tagName) {
        String value = extractPgnTag(pgn, tagName);
        if (value == null || value.isBlank() || value.equals("?")) {
            return 0;
        }
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private double scoreForPlayer(String result, boolean isWhite) {
        if ("1/2-1/2".equals(result)) {
            return 0.5;
        }
        if ("1-0".equals(result)) {
            return isWhite ? 1.0 : 0.0;
        }
        if ("0-1".equals(result)) {
            return isWhite ? 0.0 : 1.0;
        }
        return 0.5;
    }

    private String opponentHeadline(OpponentBucket stronger, OpponentBucket similar, OpponentBucket weaker, int gamesWithRating, boolean en) {
        if (gamesWithRating == 0) {
            return tr(en, "PGN에 상대 레이팅이 없어 상대 유형별 성과를 계산하지 못했습니다.",
                "Opponent ratings weren't found in the PGN, so performance by opponent type couldn't be calculated.");
        }
        OpponentBucket best = stronger;
        if (similar.scoreRate() > best.scoreRate()) {
            best = similar;
        }
        if (weaker.scoreRate() > best.scoreRate()) {
            best = weaker;
        }
        return String.format(tr(en, "%s 상대로 점수율 %.1f%%가 가장 좋았습니다.", "Your best results came against %s, with a %.1f%% score rate."), best.label, best.scoreRate());
    }

    private int extractProfileAverageRating(Map<String, Object> profile) {
        try {
            Object summaryData = profile.get("summaryData");
            if (!(summaryData instanceof String json) || json.isBlank()) {
                return 0;
            }
            Map<String, Object> parsed = objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
            return (int) Math.round(getDouble(parsed.get("average_rating"), 0.0));
        } catch (Exception e) {
            return 0;
        }
    }

    private double cosineSimilarity(Map<String, Double> player, Map<String, Double> target) {
        double dot = 0.0;
        double playerNorm = 0.0;
        double targetNorm = 0.0;
        for (String key : target.keySet()) {
            double playerValue = player.getOrDefault(key, 0.0);
            double targetValue = target.getOrDefault(key, 0.0);
            dot += playerValue * targetValue;
            playerNorm += playerValue * playerValue;
            targetNorm += targetValue * targetValue;
        }
        if (playerNorm == 0.0 || targetNorm == 0.0) {
            return 0.0;
        }
        return dot / (Math.sqrt(playerNorm) * Math.sqrt(targetNorm));
    }

    private String topStyleReason(Map<String, Double> player, GrandmasterArchetype archetype, boolean en) {
        String topDimensions = player.entrySet().stream()
            .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
            .limit(2)
            .map(entry -> styleDimensionLabel(entry.getKey(), en))
            .reduce((a, b) -> a + ", " + b)
            .orElse(tr(en, "주요 지표", "key metrics"));
        return tr(en,
            topDimensions + " 지표가 두드러져 " + archetype.styleLabel + "인 " + archetype.name + "와 비슷한 결을 보입니다.",
            "Your " + topDimensions + " stand out, giving you a style similar to " + archetype.name + ", a " + archetype.styleLabelEn + ".");
    }

    private String styleDimensionLabel(String key, boolean en) {
        return switch (key) {
            case "tactical" -> tr(en, "전술", "tactical sense");
            case "positional" -> tr(en, "포지셔널", "positional understanding");
            case "endgame" -> tr(en, "엔드게임", "endgame technique");
            case "time" -> tr(en, "시간 관리", "time management");
            case "aggression" -> tr(en, "공격성", "aggression");
            case "risk" -> tr(en, "리스크 감수", "risk tolerance");
            case "consistency" -> tr(en, "일관성", "consistency");
            case "opening" -> tr(en, "오프닝 다양성", "opening variety");
            case "conversion" -> tr(en, "우세 변환", "lead conversion");
            default -> key;
        };
    }

    private List<GrandmasterArchetype> grandmasterArchetypes() {
        return List.of(
            new GrandmasterArchetype("Magnus Carlsen", "압박형 올라운더", "pressure-based all-rounder", Map.of(
                "tactical", 82.0, "positional", 96.0, "endgame", 95.0, "time", 84.0,
                "aggression", 70.0, "risk", 58.0, "consistency", 96.0, "opening", 70.0, "conversion", 97.0
            )),
            new GrandmasterArchetype("Hikaru Nakamura", "전술적 스피드 플레이어", "tactical speed player", Map.of(
                "tactical", 94.0, "positional", 78.0, "endgame", 84.0, "time", 98.0,
                "aggression", 88.0, "risk", 82.0, "consistency", 86.0, "opening", 76.0, "conversion", 86.0
            )),
            new GrandmasterArchetype("Mikhail Tal", "복잡도 창출형 공격수", "complexity-creating attacker", Map.of(
                "tactical", 98.0, "positional", 70.0, "endgame", 72.0, "time", 78.0,
                "aggression", 98.0, "risk", 96.0, "consistency", 70.0, "opening", 74.0, "conversion", 80.0
            )),
            new GrandmasterArchetype("Anatoly Karpov", "포지셔널 압박형", "positional pressure player", Map.of(
                "tactical", 75.0, "positional", 98.0, "endgame", 90.0, "time", 78.0,
                "aggression", 58.0, "risk", 42.0, "consistency", 94.0, "opening", 72.0, "conversion", 90.0
            )),
            new GrandmasterArchetype("Judit Polgar", "직선적인 전술 공격수", "direct tactical attacker", Map.of(
                "tactical", 96.0, "positional", 80.0, "endgame", 82.0, "time", 80.0,
                "aggression", 94.0, "risk", 86.0, "consistency", 84.0, "opening", 80.0, "conversion", 85.0
            )),
            new GrandmasterArchetype("Fabiano Caruana", "준비형 계산 플레이어", "preparation-driven calculator", Map.of(
                "tactical", 88.0, "positional", 91.0, "endgame", 86.0, "time", 76.0,
                "aggression", 74.0, "risk", 62.0, "consistency", 90.0, "opening", 94.0, "conversion", 88.0
            ))
        );
    }

    private int clampPercent(int value) {
        return Math.max(0, Math.min(99, value));
    }

    private double getDouble(Object value, double fallback) {
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Double.parseDouble(text);
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    private int getInt(Object value, int fallback) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Integer.parseInt(text);
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    private Map<String, Object> parseJsonMap(String json) {
        if (json == null || json.isBlank() || "{}".equals(json.trim())) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (Exception e) {
            log.warn("Failed to parse JSON map: {}", e.getMessage());
            return Map.of();
        }
    }

    private boolean columnExists(java.sql.Connection connection, String tableName, String columnName) {
        try {
            var stmt = connection.prepareStatement(
                "SELECT 1 FROM information_schema.columns " +
                "WHERE table_schema = 'public' AND table_name = ? AND column_name = ? LIMIT 1"
            );
            stmt.setString(1, tableName);
            stmt.setString(2, columnName);
            return stmt.executeQuery().next();
        } catch (Exception e) {
            log.warn("Failed to inspect column {}.{}: {}", tableName, columnName, e.getMessage());
            return false;
        }
    }

    private Map<String, Object> getOpeningStats(java.sql.Connection connection, UUID analysisId, String username, boolean en) throws Exception {
        Map<String, OpeningCounter> whiteOpenings = new HashMap<>();
        Map<String, OpeningCounter> blackOpenings = new HashMap<>();
        int whiteGames = 0;
        int blackGames = 0;

        var stmt = connection.prepareStatement(
            "SELECT g.game_index, g.white_player, g.black_player, g.result, g.opening, g.pgn, " +
            "COALESCE(ga.average_centipawn_loss, 0) AS average_centipawn_loss, " +
            "(SELECT MIN(m.move_number) FROM move_analyses m " +
            " WHERE m.analysis_id = g.analysis_id AND m.game_index = g.game_index AND m.centipawn_loss >= 100 " +
            " AND ((LOWER(g.white_player) = LOWER(?) AND MOD(m.move_number, 2) = 0) " +
            "   OR (LOWER(g.black_player) = LOWER(?) AND MOD(m.move_number, 2) = 1))) AS first_issue_move " +
            "FROM games_worker g " +
            "LEFT JOIN game_analyses ga ON ga.analysis_id = g.analysis_id AND ga.game_index = g.game_index " +
            "WHERE g.analysis_id = ? ORDER BY g.game_index");
        stmt.setString(1, username);
        stmt.setString(2, username);
        stmt.setObject(3, analysisId);
        var rs = stmt.executeQuery();

        while (rs.next()) {
            String whitePlayer = rs.getString("white_player");
            String blackPlayer = rs.getString("black_player");
            String opening = normalizeOpeningName(rs.getString("opening"), rs.getString("pgn"), en);

            if (whitePlayer != null && whitePlayer.equalsIgnoreCase(username)) {
                whiteGames++;
                incrementOpening(
                    whiteOpenings,
                    opening,
                    scoreForPlayer(rs.getString("result"), true),
                    rs.getDouble("average_centipawn_loss"),
                    rs.getInt("first_issue_move")
                );
            } else if (blackPlayer != null && blackPlayer.equalsIgnoreCase(username)) {
                blackGames++;
                incrementOpening(
                    blackOpenings,
                    opening,
                    scoreForPlayer(rs.getString("result"), false),
                    rs.getDouble("average_centipawn_loss"),
                    rs.getInt("first_issue_move")
                );
            }
        }

        Map<String, Object> openingStats = new HashMap<>();
        openingStats.put("whiteTotal", whiteGames);
        openingStats.put("blackTotal", blackGames);
        openingStats.put("white", toOpeningRows(whiteOpenings, whiteGames, 2));
        openingStats.put("black", toOpeningRows(blackOpenings, blackGames, 2));
        openingStats.put("whiteAll", toOpeningRows(whiteOpenings, whiteGames, 12));
        openingStats.put("blackAll", toOpeningRows(blackOpenings, blackGames, 12));
        return openingStats;
    }

    private void incrementOpening(
        Map<String, OpeningCounter> openings,
        String opening,
        double score,
        double averageCpl,
        int firstIssueMove
    ) {
        OpeningCounter counter = openings.computeIfAbsent(opening, key -> new OpeningCounter(key));
        counter.count++;
        counter.score += score;
        if (averageCpl > 0) {
            counter.cplSum += averageCpl;
            counter.cplSamples++;
        }
        if (firstIssueMove > 0) {
            counter.firstIssueMoveSum += (firstIssueMove / 2) + 1;
            counter.firstIssueSamples++;
        }
    }

    private List<Map<String, Object>> toOpeningRows(Map<String, OpeningCounter> openings, int totalGames, int limit) {
        return openings.values().stream()
            .sorted((a, b) -> {
                int countCompare = Integer.compare(b.count, a.count);
                return countCompare != 0 ? countCompare : a.name.compareToIgnoreCase(b.name);
            })
            .limit(limit)
            .map(counter -> {
                Map<String, Object> row = new HashMap<>();
                row.put("name", counter.name);
                row.put("count", counter.count);
                row.put("percentage", totalGames > 0 ? Math.round((counter.count * 10000.0) / totalGames) / 100.0 : 0.0);
                row.put("scoreRate", counter.count > 0 ? Math.round((counter.score * 1000.0) / counter.count) / 10.0 : 0.0);
                row.put("averageCpl", counter.cplSamples > 0 ? Math.round((counter.cplSum * 10.0) / counter.cplSamples) / 10.0 : 0.0);
                row.put("firstIssueMove", counter.firstIssueSamples > 0 ? Math.round((counter.firstIssueMoveSum * 10.0) / counter.firstIssueSamples) / 10.0 : null);
                return row;
            })
            .toList();
    }

    private String normalizeOpeningName(String opening, String pgn, boolean en) {
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
            return tr(en, "오프닝 미분류", "Unclassified Opening");
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
        private double score;
        private double cplSum;
        private int cplSamples;
        private double firstIssueMoveSum;
        private int firstIssueSamples;

        private OpeningCounter(String name) {
            this.name = name;
        }
    }

    private static class OpponentBucket {
        private final String label;
        private int games;
        private double score;

        private OpponentBucket(String label) {
            this.label = label;
        }

        private void record(double gameScore) {
            this.games++;
            this.score += gameScore;
        }

        private double scoreRate() {
            return games > 0 ? (score / games) * 100.0 : 0.0;
        }

        private Map<String, Object> toMap() {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("label", label);
            map.put("games", games);
            map.put("scoreRate", Math.round(scoreRate() * 10.0) / 10.0);
            return map;
        }
    }

    private static class StatBucket {
        private final String label;
        private int games;
        private double score;
        private double cpl;
        private int cplSamples;

        private StatBucket(String label) {
            this.label = label;
        }

        private void record(double gameScore, double gameCpl) {
            this.games++;
            this.score += gameScore;
            if (gameCpl > 0) {
                this.cpl += gameCpl;
                this.cplSamples++;
            }
        }

        private Map<String, Object> toMap() {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", label);
            row.put("games", games);
            row.put("scoreRate", games > 0 ? Math.round((score * 1000.0) / games) / 10.0 : 0.0);
            row.put("averageCpl", cplSamples > 0 ? Math.round((cpl * 10.0) / cplSamples) / 10.0 : 0.0);
            return row;
        }
    }

    private static class GrandmasterArchetype {
        private final String name;
        private final String styleLabel;
        private final String styleLabelEn;
        private final Map<String, Double> vector;

        private GrandmasterArchetype(String name, String styleLabel, String styleLabelEn, Map<String, Double> vector) {
            this.name = name;
            this.styleLabel = styleLabel;
            this.styleLabelEn = styleLabelEn;
            this.vector = vector;
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
