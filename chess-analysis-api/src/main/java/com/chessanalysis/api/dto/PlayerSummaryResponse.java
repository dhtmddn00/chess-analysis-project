package com.chessanalysis.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;
import java.util.Map;

public class PlayerSummaryResponse {
    
    public static class TimeControlStats {
        public int rating;
        public int games;
        public int win;
        public int draw;
        public int loss;
        public double winrate;
    }

    public static class Player {
        public String username;
        public String country;
        public String avatar;
        public Map<String, Integer> ratings;
        @JsonProperty("record_all")
        public RecordAll recordAll;
        @JsonProperty("time_controls")
        public Map<String, TimeControlStats> timeControls;
    }
    
    public static class RecordAll {
        public int games;
        public int win;
        public int draw;
        public int loss;
        public double winrate;
    }
    
    public static class Opening {
        public String eco;
        public String name;
        public int count;
        public double winrate;
    }
    
    public static class Openings {
        @JsonProperty("white_top")
        public List<Opening> whiteTop;
        @JsonProperty("black_top")
        public List<Opening> blackTop;
    }
    
    public static class RecentGame {
        @JsonProperty("ended_at")
        public Instant endedAt;
        public String result;
        public String opponent;
        @JsonProperty("opp_rating")
        public Integer oppRating;
        @JsonProperty("time_control")
        public String timeControl;
        public String color;
        public String eco;
        @JsonProperty("opening_name")
        public String openingName;
        public String termination;
        @JsonProperty("game_id")
        public String gameId;
    }
    
    public static class CohortHint {
        public String band;
        public String note;
    }
    
    public Player player;
    public Openings openings;
    @JsonProperty("recent10")
    public List<RecentGame> recent10;
    @JsonProperty("cohort_hint")
    public CohortHint cohortHint;
    @JsonProperty("cache_status")
    public String cacheStatus; // "fresh", "cached", "partial"
}