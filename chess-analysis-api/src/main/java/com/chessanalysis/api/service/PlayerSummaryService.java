package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.PlayerSummaryResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.HttpClientErrorException;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class PlayerSummaryService {
    
    private static final Logger logger = LoggerFactory.getLogger(PlayerSummaryService.class);
    private static final String CACHE_PREFIX = "summary:";
    private static final Duration CACHE_TTL = Duration.ofMinutes(15);

    /** Chess.com 429 재시도 설정 */
    private static final int   CHESS_COM_MAX_RETRIES       = 2;
    private static final long  CHESS_COM_RETRY_DEFAULT_MS  = 5_000L;  // Retry-After 없을 때 기본 5초
    private static final long  CHESS_COM_RETRY_MAX_MS      = 30_000L; // 최대 30초 대기

    /** 최근 게임 조회 시 확인할 최대 아카이브 월 수 (안전 상한) */
    private static final int   CHESS_COM_MAX_ARCHIVE_MONTHS = 12;
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;

    @Autowired
    private ObjectMapper objectMapper;
    
    private final RestTemplate restTemplate = createRestTemplate(5000);
    
    public PlayerSummaryResponse getPlayerSummary(String platform, String username) {
        String cacheKey = CACHE_PREFIX + platform + ":" + username.toLowerCase();
        
        // Try cache first
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            try {
                PlayerSummaryResponse response = objectMapper.readValue(cached, PlayerSummaryResponse.class);
                response.cacheStatus = "cached";
                logger.info("Serving cached summary for {}/{}", platform, username);
                return response;
            } catch (Exception e) {
                logger.warn("Failed to deserialize cached summary: {}", e.getMessage());
            }
        }
        
        // Fetch fresh data
        PlayerSummaryResponse response = fetchFreshSummary(platform, username);
        
        // Cache the result
        try {
            response.cacheStatus = "fresh";
            String json = objectMapper.writeValueAsString(response);
            redisTemplate.opsForValue().set(cacheKey, json, CACHE_TTL.getSeconds(), TimeUnit.SECONDS);
            logger.info("Cached summary for {}/{} for {} minutes", platform, username, CACHE_TTL.toMinutes());
        } catch (Exception e) {
            logger.warn("Failed to cache summary: {}", e.getMessage());
        }
        return response;
    }
    
    private PlayerSummaryResponse fetchFreshSummary(String platform, String username) {
        logger.info("Fetching fresh summary for {}/{}", platform, username);

        String normalizedPlatform = platform == null ? "chesscom" : platform.toLowerCase(Locale.ROOT).trim();
        if ("chess.com".equals(normalizedPlatform)) {
            normalizedPlatform = "chesscom";
        }

        if ("chesscom".equals(normalizedPlatform)) {
            return fetchChessComSummary(username);
        } else if ("lichess".equals(normalizedPlatform)) {
            return fetchLichessSummary(username);
        } else {
            throw new IllegalArgumentException("Unsupported platform: " + platform);
        }
    }

    // ── Lichess ─────────────────────────────────────────────────────────────

    private PlayerSummaryResponse fetchLichessSummary(String username) {
        PlayerSummaryResponse response = new PlayerSummaryResponse();
        try {
            // Lichess user profile (no auth required for public data)
            JsonNode profile = fetchOnce("https://lichess.org/api/user/" + username, 5000);

            PlayerSummaryResponse.Player player = new PlayerSummaryResponse.Player();
            player.username = profile.path("username").asText(username);

            // Ratings
            Map<String, Integer> ratings = new java.util.LinkedHashMap<>();
            JsonNode perfs = profile.path("perfs");
            extractLichessRating(perfs, "rapid",  ratings);
            extractLichessRating(perfs, "blitz",  ratings);
            extractLichessRating(perfs, "bullet", ratings);
            player.ratings = ratings;

            // Record
            JsonNode count = profile.path("count");
            PlayerSummaryResponse.RecordAll record = new PlayerSummaryResponse.RecordAll();
            record.games = count.path("all").asInt(0);
            record.win   = count.path("win").asInt(0);
            record.loss  = count.path("loss").asInt(0);
            record.draw  = count.path("draw").asInt(0);
            record.winrate = record.games > 0 ? (double) record.win / record.games : 0.0;
            player.recordAll = record;

            // Time-control stats
            Map<String, PlayerSummaryResponse.TimeControlStats> timeControls = new java.util.LinkedHashMap<>();
            for (String tc : new String[]{"rapid", "blitz", "bullet"}) {
                JsonNode perf = perfs.path(tc);
                if (!perf.isMissingNode() && perf.path("games").asInt(0) > 0) {
                    PlayerSummaryResponse.TimeControlStats tcs = new PlayerSummaryResponse.TimeControlStats();
                    tcs.rating = perf.path("rating").asInt(0);
                    tcs.games  = perf.path("games").asInt(0);
                    // Lichess doesn't expose win/draw/loss per time-control in basic profile
                    timeControls.put(tc, tcs);
                }
            }
            player.timeControls = timeControls;

            // Country/title
            JsonNode profileNode = profile.path("profile");
            String country = profileNode.path("country").asText(null);
            if (country == null || country.isBlank()) {
                country = profile.path("profile").path("flag").asText(null);
            }
            player.country = country;

            String title = profile.path("title").asText(null);
            if (title == null || title.isBlank()) title = null;

            response.player = player;

            // Fetch last 10 games (NDJSON format via Lichess games export)
            List<PlayerSummaryResponse.RecentGame> recentGames = fetchLichessRecentGames(username, 10);
            response.recent10 = recentGames;
            response.openings = extractOpeningsFromGames(recentGames);
            response.cohortHint = buildCohortHint(player.ratings);

            logger.info("Successfully built Lichess summary for {}", username);

        } catch (Exception e) {
            Throwable cause = e;
            while (cause != null) {
                if (cause instanceof PlayerNotFoundException pnfe) throw pnfe;
                cause = cause.getCause();
            }
            logger.error("Failed to fetch Lichess summary for {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to fetch player summary", e);
        }
        return response;
    }

    private void extractLichessRating(JsonNode perfs, String tc, Map<String, Integer> ratings) {
        JsonNode perf = perfs.path(tc);
        if (!perf.isMissingNode()) {
            int rating = perf.path("rating").asInt(0);
            if (rating > 0) ratings.put(tc, rating);
        }
    }

    private List<PlayerSummaryResponse.RecentGame> fetchLichessRecentGames(String username, int max) {
        List<PlayerSummaryResponse.RecentGame> games = new ArrayList<>();
        try {
            // Lichess games export returns NDJSON (one JSON object per line)
            String url = "https://lichess.org/api/games/user/" + username
                    + "?max=" + max + "&pgnInJson=false&clocks=false&evals=false&opening=true";
            RestTemplate customRestTemplate = createRestTemplate(8000);
            customRestTemplate.getMessageConverters().add(0,
                    new org.springframework.http.converter.StringHttpMessageConverter(StandardCharsets.UTF_8));
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.set("Accept", "application/x-ndjson");
            org.springframework.http.HttpEntity<String> entity = new org.springframework.http.HttpEntity<>(headers);
            org.springframework.http.ResponseEntity<String> response =
                    customRestTemplate.exchange(url, org.springframework.http.HttpMethod.GET, entity, String.class);

            String body = response.getBody();
            if (body == null || body.isBlank()) return games;

            for (String line : body.split("\n")) {
                line = line.trim();
                if (line.isBlank()) continue;
                try {
                    JsonNode game = objectMapper.readTree(line);
                    PlayerSummaryResponse.RecentGame rg = new PlayerSummaryResponse.RecentGame();
                    String whiteUser = game.path("players").path("white").path("user").path("name").asText("");
                    String blackUser = game.path("players").path("black").path("user").path("name").asText("");
                    boolean isWhite  = whiteUser.equalsIgnoreCase(username);
                    rg.color    = isWhite ? "white" : "black";
                    rg.opponent = isWhite ? blackUser : whiteUser;
                    rg.oppRating = isWhite
                            ? game.path("players").path("black").path("rating").asInt(0)
                            : game.path("players").path("white").path("rating").asInt(0);

                    String winner = game.path("winner").asText("");
                    if (winner.isBlank()) {
                        rg.result = "draw";
                    } else {
                        rg.result = winner.equals(rg.color) ? "win" : "loss";
                    }

                    rg.gameId = game.path("id").asText("");
                    rg.timeControl = game.path("clock").path("initial").asInt(0)
                            + "+" + game.path("clock").path("increment").asInt(0);
                    rg.openingName = game.path("opening").path("name").asText(null);
                    rg.eco         = game.path("opening").path("eco").asText(null);

                    long lastMoveAt = game.path("lastMoveAt").asLong(0);
                    if (lastMoveAt > 0) rg.endedAt = java.time.Instant.ofEpochMilli(lastMoveAt);

                    games.add(rg);
                } catch (Exception ex) {
                    logger.debug("Skipping malformed Lichess game line: {}", ex.getMessage());
                }
            }
        } catch (Exception e) {
            logger.warn("Failed to fetch Lichess recent games for {}: {}", username, e.getMessage());
        }
        return games;
    }
    
    private PlayerSummaryResponse fetchChessComSummary(String username) {
        PlayerSummaryResponse response = new PlayerSummaryResponse();
        
        try {
            // Parallel fetching: player profile + stats + recent games
            CompletableFuture<JsonNode> profileFuture = CompletableFuture.supplyAsync(() ->
                fetchWithRetry("https://api.chess.com/pub/player/" + username, 3000));

            CompletableFuture<JsonNode> statsFuture = CompletableFuture.supplyAsync(() ->
                fetchWithRetry("https://api.chess.com/pub/player/" + username + "/stats", 3000));
            
            CompletableFuture<List<PlayerSummaryResponse.RecentGame>> gamesFuture = 
                CompletableFuture.supplyAsync(() -> fetchRecentChessComGames(username, 10));
            
            // Wait for all with timeout
            CompletableFuture.allOf(profileFuture, statsFuture, gamesFuture)
                .get(8, TimeUnit.SECONDS);
            
            // Build response
            JsonNode profile = profileFuture.get();
            JsonNode stats = statsFuture.get();
            List<PlayerSummaryResponse.RecentGame> recentGames = gamesFuture.get();
            
            response.player = buildPlayerInfo(profile, stats);
            response.recent10 = recentGames;
            response.openings = extractOpeningsFromGames(recentGames);
            response.cohortHint = buildCohortHint(response.player.ratings);
            
            logger.info("Successfully built Chess.com summary for {}", username);
            
        } catch (Exception e) {
            Throwable cause = e;
            while (cause != null) {
                if (cause instanceof PlayerNotFoundException pnfe) {
                    throw pnfe;
                }
                cause = cause.getCause();
            }
            logger.error("Failed to fetch Chess.com summary for {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to fetch player summary", e);
        }
        
        return response;
    }
    
    /**
     * Chess.com API를 최대 CHESS_COM_MAX_RETRIES 회 재시도한다.
     * 429 응답 시 Retry-After 헤더를 읽어 대기 후 재시도하며,
     * 헤더가 없으면 CHESS_COM_RETRY_DEFAULT_MS 만큼 대기한다.
     */
    private JsonNode fetchWithRetry(String url, int timeoutMs) {
        for (int attempt = 0; attempt <= CHESS_COM_MAX_RETRIES; attempt++) {
            try {
                return fetchOnce(url, timeoutMs);
            } catch (ChessComRateLimitException e) {
                if (attempt == CHESS_COM_MAX_RETRIES) {
                    logger.warn("Chess.com rate limit hit after {} retries for {}", CHESS_COM_MAX_RETRIES, url);
                    throw new RuntimeException("Chess.com API rate limit: 잠시 후 다시 시도해주세요", e);
                }
                long waitMs = Math.min(e.getRetryAfterMs(), CHESS_COM_RETRY_MAX_MS);
                logger.info("Chess.com 429 — {}ms 대기 후 재시도 {}/{}: {}",
                        waitMs, attempt + 1, CHESS_COM_MAX_RETRIES, url);
                try {
                    Thread.sleep(waitMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Rate-limit 대기 중 인터럽트", ie);
                }
            }
        }
        throw new RuntimeException("unreachable");
    }

    /** 단일 HTTP 요청. 429는 ChessComRateLimitException, 404는 PlayerNotFoundException으로 변환한다. */
    private JsonNode fetchOnce(String url, int timeoutMs) {
        try {
            RestTemplate customRestTemplate = createRestTemplate(timeoutMs);
            String response = customRestTemplate.getForObject(url, String.class);
            return objectMapper.readTree(response);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().value() == 404) {
                throw new PlayerNotFoundException("플레이어를 찾을 수 없습니다");
            }
            if (e.getStatusCode().value() == 429) {
                long retryAfterMs = parseRetryAfterMs(e);
                throw new ChessComRateLimitException(retryAfterMs);
            }
            logger.error("HTTP error fetching {}: {}", url, e.getMessage());
            throw new RuntimeException("API error: " + url, e);
        } catch (ResourceAccessException e) {
            logger.warn("Timeout fetching {}: {}", url, e.getMessage());
            throw new RuntimeException("API timeout: " + url, e);
        } catch (Exception e) {
            logger.error("Error fetching {}: {}", url, e.getMessage());
            throw new RuntimeException("API error: " + url, e);
        }
    }

    /** Retry-After 헤더(초)를 밀리초로 파싱. 없거나 잘못된 형식이면 기본값 반환. */
    private long parseRetryAfterMs(HttpClientErrorException e) {
        try {
            if (e.getResponseHeaders() != null) {
                String retryAfter = e.getResponseHeaders().getFirst("Retry-After");
                if (retryAfter != null && !retryAfter.isBlank()) {
                    return Long.parseLong(retryAfter.trim()) * 1_000L;
                }
            }
        } catch (NumberFormatException ignored) {
            logger.debug("Retry-After 헤더 파싱 실패: {}", e.getMessage());
        }
        return CHESS_COM_RETRY_DEFAULT_MS;
    }

    private static RestTemplate createRestTemplate(int timeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        RestTemplate restTemplate = new RestTemplate(requestFactory);
        // Chess.com API 이용 가이드라인에 따라 User-Agent를 명시해야 한다.
        // 헤더가 없으면 Chess.com 측에서 요청을 차단하거나 스로틀링할 수 있다.
        restTemplate.setInterceptors(List.of((request, body, execution) -> {
            request.getHeaders().set("User-Agent", "chess-analysis-project/1.0 (https://github.com/VectorSophie/chess-analysis-project)");
            return execution.execute(request, body);
        }));
        return restTemplate;
    }
    
    private List<PlayerSummaryResponse.RecentGame> fetchRecentChessComGames(String username, int count) {
        List<PlayerSummaryResponse.RecentGame> games = new ArrayList<>();
        
        try {
            // Get archives list
            JsonNode archives = fetchWithRetry("https://api.chess.com/pub/player/" + username + "/games/archives", 3000);

            if (archives.has("archives") && archives.get("archives").isArray()) {
                List<String> archiveUrls = new ArrayList<>();
                for (JsonNode archive : archives.get("archives")) {
                    archiveUrls.add(archive.asText());
                }

                // 최신 월부터 탐색
                Collections.reverse(archiveUrls);

                // 안전 상한(12개월)을 적용하되, count 달성 시 조기 종료
                int archivesChecked = 0;
                for (String archiveUrl : archiveUrls) {
                    if (games.size() >= count) break;
                    if (archivesChecked >= CHESS_COM_MAX_ARCHIVE_MONTHS) {
                        logger.debug("{}개월 탐색 후 {}게임 수집 완료 (목표 {})", archivesChecked, games.size(), count);
                        break;
                    }
                    archivesChecked++;

                    JsonNode monthGames = fetchWithRetry(archiveUrl, 5000);

                    if (monthGames.has("games")) {
                        List<JsonNode> monthGamesList = new ArrayList<>();
                        monthGames.get("games").forEach(monthGamesList::add);

                        // 최신 게임이 앞으로 오도록 역순
                        Collections.reverse(monthGamesList);

                        for (JsonNode game : monthGamesList) {
                            if (games.size() >= count) break;
                            PlayerSummaryResponse.RecentGame recentGame = parseChessComGame(game, username);
                            if (recentGame != null) {
                                games.add(recentGame);
                            }
                        }
                    }
                }
            }
            
        } catch (Exception e) {
            logger.warn("Failed to fetch recent Chess.com games for {}: {}", username, e.getMessage());
        }
        
        return games;
    }
    
    private PlayerSummaryResponse.Player buildPlayerInfo(JsonNode profile, JsonNode stats) {
        PlayerSummaryResponse.Player player = new PlayerSummaryResponse.Player();
        
        player.username = profile.path("username").asText();
        player.country = profile.path("country").asText().replaceAll("https://api.chess.com/pub/country/", "");
        player.avatar = profile.path("avatar").asText();
        
        // Extract ratings from stats
        player.ratings = new HashMap<>();
        JsonNode blitz = stats.path("chess_blitz");
        if (blitz.has("last")) {
            player.ratings.put("blitz", blitz.path("last").path("rating").asInt());
        }
        JsonNode rapid = stats.path("chess_rapid");
        if (rapid.has("last")) {
            player.ratings.put("rapid", rapid.path("last").path("rating").asInt());
        }
        JsonNode bullet = stats.path("chess_bullet");
        if (bullet.has("last")) {
            player.ratings.put("bullet", bullet.path("last").path("rating").asInt());
        }
        
        // Per-time-control stats + aggregate record
        player.timeControls = new HashMap<>();
        player.recordAll = new PlayerSummaryResponse.RecordAll();
        int totalWin = 0, totalDraw = 0, totalLoss = 0;

        Map<String, String> tcMapping = Map.of(
            "chess_blitz",  "blitz",
            "chess_rapid",  "rapid",
            "chess_bullet", "bullet"
        );

        for (Map.Entry<String, String> entry : tcMapping.entrySet()) {
            JsonNode tc = stats.path(entry.getKey());
            if (tc.has("record")) {
                int w = tc.path("record").path("win").asInt(0);
                int d = tc.path("record").path("draw").asInt(0);
                int l = tc.path("record").path("loss").asInt(0);
                totalWin  += w;
                totalDraw += d;
                totalLoss += l;

                PlayerSummaryResponse.TimeControlStats tcStats = new PlayerSummaryResponse.TimeControlStats();
                tcStats.win  = w;
                tcStats.draw = d;
                tcStats.loss = l;
                tcStats.games   = w + d + l;
                tcStats.winrate = tcStats.games > 0 ? (double) w / tcStats.games : 0.0;
                if (tc.has("last")) {
                    tcStats.rating = tc.path("last").path("rating").asInt(0);
                }
                if (tcStats.games > 0) {
                    player.timeControls.put(entry.getValue(), tcStats);
                }
            }
        }

        player.recordAll.win   = totalWin;
        player.recordAll.draw  = totalDraw;
        player.recordAll.loss  = totalLoss;
        player.recordAll.games = totalWin + totalDraw + totalLoss;
        player.recordAll.winrate = player.recordAll.games > 0 ?
            (double) totalWin / player.recordAll.games : 0.0;

        return player;
    }
    
    private PlayerSummaryResponse.RecentGame parseChessComGame(JsonNode game, String username) {
        try {
            PlayerSummaryResponse.RecentGame recentGame = new PlayerSummaryResponse.RecentGame();
            
            recentGame.endedAt = Instant.ofEpochSecond(game.path("end_time").asLong());
            recentGame.timeControl = game.path("time_control").asText();
            recentGame.gameId = game.path("url").asText();
            
            // Determine player color and result
            JsonNode white = game.path("white");
            JsonNode black = game.path("black");
            
            boolean isWhite = white.path("username").asText().equalsIgnoreCase(username);
            recentGame.color = isWhite ? "white" : "black";
            
            if (isWhite) {
                recentGame.opponent = black.path("username").asText();
                recentGame.oppRating = black.path("rating").asInt();
                recentGame.result = white.path("result").asText().equals("win") ? "W" : 
                    (black.path("result").asText().equals("win") ? "L" : "D");
            } else {
                recentGame.opponent = white.path("username").asText();
                recentGame.oppRating = white.path("rating").asInt();
                recentGame.result = black.path("result").asText().equals("win") ? "W" : 
                    (white.path("result").asText().equals("win") ? "L" : "D");
            }
            
            // Extract ECO code and opening name from PGN
            String pgn = game.path("pgn").asText("");
            recentGame.eco = extractPgnTag(pgn, "ECO").orElse("---");
            recentGame.openingName = extractPgnTag(pgn, "Opening").orElse(null);
            recentGame.termination = game.path("termination").asText();
            
            return recentGame;
            
        } catch (Exception e) {
            logger.warn("Failed to parse Chess.com game: {}", e.getMessage());
            return null;
        }
    }
    
    private PlayerSummaryResponse.Openings extractOpeningsFromGames(List<PlayerSummaryResponse.RecentGame> games) {
        PlayerSummaryResponse.Openings openings = new PlayerSummaryResponse.Openings();
        
        Map<String, List<String>> whiteResults = new HashMap<>();
        Map<String, List<String>> blackResults = new HashMap<>();
        Map<String, String> ecoNames = new HashMap<>();
        
        for (PlayerSummaryResponse.RecentGame game : games) {
            if (game.eco == null || game.eco.equals("---")) continue;

            String openingKey = game.eco;
            String displayName = (game.openingName != null && !game.openingName.isBlank())
                ? game.openingName
                : ecoCodeToFamily(game.eco);
            ecoNames.put(openingKey, displayName);
            
            if ("white".equals(game.color)) {
                whiteResults.computeIfAbsent(openingKey, k -> new ArrayList<>()).add(game.result);
            } else {
                blackResults.computeIfAbsent(openingKey, k -> new ArrayList<>()).add(game.result);
            }
        }
        
        openings.whiteTop = whiteResults.entrySet().stream()
            .map(entry -> createOpeningStats(entry.getKey(), ecoNames.get(entry.getKey()), entry.getValue()))
            .sorted((a, b) -> Integer.compare(b.count, a.count))
            .limit(3)
            .collect(Collectors.toList());
            
        openings.blackTop = blackResults.entrySet().stream()
            .map(entry -> createOpeningStats(entry.getKey(), ecoNames.get(entry.getKey()), entry.getValue()))
            .sorted((a, b) -> Integer.compare(b.count, a.count))
            .limit(3)
            .collect(Collectors.toList());
        
        return openings;
    }
    
    private PlayerSummaryResponse.Opening createOpeningStats(String eco, String name, List<String> results) {
        PlayerSummaryResponse.Opening opening = new PlayerSummaryResponse.Opening();
        opening.eco = eco;
        opening.name = name;
        opening.count = results.size();
        
        long wins = results.stream().mapToLong(r -> "W".equals(r) ? 1 : 0).sum();
        opening.winrate = results.size() > 0 ? (double) wins / results.size() : 0.0;
        
        return opening;
    }
    
    /**
     * Extract a PGN header tag value, e.g. extractPgnTag(pgn, "ECO") → Optional("C33")
     */
    private java.util.Optional<String> extractPgnTag(String pgn, String tag) {
        if (pgn == null || pgn.isBlank()) return java.util.Optional.empty();
        java.util.regex.Pattern p = java.util.regex.Pattern.compile(
            "\\[" + tag + "\\s+\"([^\"]+)\"\\]");
        java.util.regex.Matcher m = p.matcher(pgn);
        return m.find() ? java.util.Optional.of(m.group(1)) : java.util.Optional.empty();
    }

    /**
     * Fallback: derive a readable opening family from the ECO letter (A–E).
     */
    private String ecoCodeToFamily(String eco) {
        if (eco == null || eco.length() < 1) return "Unknown Opening";
        return switch (eco.charAt(0)) {
            case 'A' -> "Flank / Other Opening";
            case 'B' -> "Semi-Open Game";
            case 'C' -> "Open Game";
            case 'D' -> "Closed / Semi-Closed Game";
            case 'E' -> "Indian Defense";
            default  -> "Unknown Opening";
        };
    }
    
    private PlayerSummaryResponse.CohortHint buildCohortHint(Map<String, Integer> ratings) {
        PlayerSummaryResponse.CohortHint hint = new PlayerSummaryResponse.CohortHint();
        
        int maxRating = ratings.values().stream().mapToInt(Integer::intValue).max().orElse(1500);
        
        if (maxRating >= 2900) {
            hint.band = "super_elite_2900plus";
            hint.note = "슈퍼 엘리트 버킷 기준 적용 (Elite v2.0)";
        } else if (maxRating >= 2600) {
            hint.band = "grandmaster_2600plus";
            hint.note = "그랜드마스터 버킷 기준 적용";
        } else if (maxRating >= 2200) {
            hint.band = "master_2200plus"; 
            hint.note = "마스터급 버킷 기준 적용";
        } else {
            hint.band = "regular_under2200";
            hint.note = "일반 플레이어 기준 적용";
        }
        
        return hint;
    }
}
