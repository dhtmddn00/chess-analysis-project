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
        } else {
            throw new IllegalArgumentException("Unsupported platform: " + platform);
        }
    }
    
    private PlayerSummaryResponse fetchChessComSummary(String username) {
        PlayerSummaryResponse response = new PlayerSummaryResponse();
        
        try {
            // Parallel fetching: player profile + stats + recent games
            CompletableFuture<JsonNode> profileFuture = CompletableFuture.supplyAsync(() ->
                fetchWithTimeout("https://api.chess.com/pub/player/" + username, 3000));
            
            CompletableFuture<JsonNode> statsFuture = CompletableFuture.supplyAsync(() ->
                fetchWithTimeout("https://api.chess.com/pub/player/" + username + "/stats", 3000));
            
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
            logger.error("Failed to fetch Chess.com summary for {}: {}", username, e.getMessage());
            throw new RuntimeException("Failed to fetch player summary", e);
        }
        
        return response;
    }
    
    private JsonNode fetchWithTimeout(String url, int timeoutMs) {
        try {
            RestTemplate customRestTemplate = createRestTemplate(timeoutMs);
            String response = customRestTemplate.getForObject(url, String.class);
            return objectMapper.readTree(response);
        } catch (ResourceAccessException e) {
            logger.warn("Timeout fetching {}: {}", url, e.getMessage());
            throw new RuntimeException("API timeout: " + url, e);
        } catch (Exception e) {
            logger.error("Error fetching {}: {}", url, e.getMessage());
            throw new RuntimeException("API error: " + url, e);
        }
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
            JsonNode archives = fetchWithTimeout("https://api.chess.com/pub/player/" + username + "/games/archives", 3000);
            
            if (archives.has("archives") && archives.get("archives").isArray()) {
                List<String> archiveUrls = new ArrayList<>();
                for (JsonNode archive : archives.get("archives")) {
                    archiveUrls.add(archive.asText());
                }
                
                // Start from most recent archives
                Collections.reverse(archiveUrls);
                
                for (String archiveUrl : archiveUrls.subList(0, Math.min(2, archiveUrls.size()))) {
                    JsonNode monthGames = fetchWithTimeout(archiveUrl, 5000);
                    
                    if (monthGames.has("games")) {
                        List<JsonNode> monthGamesList = new ArrayList<>();
                        monthGames.get("games").forEach(monthGamesList::add);
                        
                        // Reverse to get most recent first
                        Collections.reverse(monthGamesList);
                        
                        for (JsonNode game : monthGamesList) {
                            if (games.size() >= count) break;
                            
                            PlayerSummaryResponse.RecentGame recentGame = parseChessComGame(game, username);
                            if (recentGame != null) {
                                games.add(recentGame);
                            }
                        }
                        
                        if (games.size() >= count) break;
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
        
        // Calculate aggregate record
        player.recordAll = new PlayerSummaryResponse.RecordAll();
        int totalWin = 0, totalDraw = 0, totalLoss = 0;
        
        for (String timeControl : Arrays.asList("chess_blitz", "chess_rapid", "chess_bullet")) {
            JsonNode tc = stats.path(timeControl);
            if (tc.has("record")) {
                totalWin += tc.path("record").path("win").asInt(0);
                totalDraw += tc.path("record").path("draw").asInt(0);
                totalLoss += tc.path("record").path("loss").asInt(0);
            }
        }
        
        player.recordAll.win = totalWin;
        player.recordAll.draw = totalDraw;
        player.recordAll.loss = totalLoss;
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
            
            // Extract ECO and termination
            recentGame.eco = game.path("eco").asText("---");
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
            ecoNames.put(openingKey, getOpeningName(game.eco));
            
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
    
    private String getOpeningName(String eco) {
        // Simple ECO to name mapping - in production you'd have a full database
        Map<String, String> ecoNames = Map.of(
            "B30", "Sicilian Defense",
            "B22", "Sicilian Alapin", 
            "D30", "Queen's Gambit Declined",
            "C50", "Italian Game",
            "E20", "Nimzo-Indian Defense"
        );
        return ecoNames.getOrDefault(eco, "Unknown Opening");
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
