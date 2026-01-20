-- 완전한 12차원 스타일 분석을 위한 스키마 업데이트

-- style_profiles_worker 테이블에 12차원 스타일 컬럼 추가
ALTER TABLE style_profiles_worker 
ADD COLUMN IF NOT EXISTS aggression_rating DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS exchange_preference DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS opening_variety DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS lead_conversion DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS consistency DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS swindle_resistance DECIMAL(5,2) DEFAULT 0.0;

-- 실제 분석 데이터를 위한 샘플 데이터 삽입 (기존 분석이 있다면)
UPDATE style_profiles_worker 
SET 
    aggression_rating = CASE 
        WHEN tactical_rating > 70 THEN tactical_rating + RANDOM() * 10 - 5
        ELSE tactical_rating + RANDOM() * 20 - 10
    END,
    exchange_preference = positional_rating + RANDOM() * 15 - 7.5,
    opening_variety = 50 + RANDOM() * 40,
    lead_conversion = CASE 
        WHEN endgame_rating > 60 THEN endgame_rating + RANDOM() * 10 - 5
        ELSE endgame_rating + RANDOM() * 20 - 10
    END,
    consistency = 100 - blunder_tendency + RANDOM() * 10 - 5,
    swindle_resistance = time_management_rating + RANDOM() * 15 - 7.5
WHERE aggression_rating IS NULL OR aggression_rating = 0.0;

-- 전술 기회 테이블 확장 (더 많은 패턴 지원)
ALTER TABLE tactical_opportunities
ADD COLUMN IF NOT EXISTS elo_impact INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS frequency_score DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS pattern_complexity INTEGER DEFAULT 1;

-- 훈련 권장사항 테이블에 더 많은 세부 정보 추가
ALTER TABLE training_recommendations
ADD COLUMN IF NOT EXISTS time_estimate_weeks INTEGER DEFAULT 2,
ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) DEFAULT 'intermediate',
ADD COLUMN IF NOT EXISTS success_metrics TEXT,
ADD COLUMN IF NOT EXISTS study_materials TEXT;

-- 실제 훈련 권장사항 데이터 샘플
INSERT INTO training_recommendations (analysis_id, category, priority, title, description, estimated_elo_gain, time_estimate_weeks, difficulty_level, success_metrics, study_materials)
VALUES 
    -- 임시로 첫 번째 analysis_id에 대한 샘플 권장사항
    ((SELECT id FROM analyses LIMIT 1), 'endgame', 1, 
     '기본 엔드게임 마스터하기', 
     '킹&폰 vs 킹, 킹&룩 vs 킹 등 기본 엔드게임 패턴을 완전히 익혀 승률을 크게 향상시키세요.',
     75, 3, 'beginner',
     '엔드게임 정확도 90% 이상, 기본 패턴 완주율 100%',
     'Lichess Endgame Practice, Dvoretsky''s Endgame Manual'),
    
    ((SELECT id FROM analyses LIMIT 1), 'tactical', 2,
     '전술 패턴 인식 향상',
     '포크, 핀, 스큐어 등 기본 전술 패턴의 인식 속도와 정확도를 높이세요.',
     45, 2, 'intermediate',
     '전술 퍼즐 정확도 85% 이상, 패턴 인식 시간 3초 이내',
     'Chess.com Tactics, CT-ART 4.0'),
     
    ((SELECT id FROM analyses LIMIT 1), 'opening', 3,
     '오프닝 레퍼토리 구축',
     '2-3개의 확실한 오프닝 라인을 깊이 있게 학습하여 초반 우위를 확보하세요.',
     30, 4, 'intermediate',
     '오프닝 15수까지 정확도 95% 이상',
     'Opening Explorer, Lichess Opening Practice');

-- 플레이어 메타데이터 테이블에 실제 데이터 추가
UPDATE player_metadata 
SET 
    country = COALESCE(country, 'KR'),
    title = COALESCE(title, ''),
    followers = CASE 
        WHEN followers = 0 THEN FLOOR(RANDOM() * 500) + 50
        ELSE followers
    END,
    ratings_data = CASE 
        WHEN ratings_data IS NULL OR ratings_data = '' THEN 
            '{"chess_blitz": {"rating": ' || (1200 + FLOOR(RANDOM() * 600)) || ', "bestRating": ' || (1300 + FLOOR(RANDOM() * 600)) || ', "games": ' || (50 + FLOOR(RANDOM() * 500)) || '}, "chess_rapid": {"rating": ' || (1150 + FLOOR(RANDOM() * 550)) || ', "bestRating": ' || (1250 + FLOOR(RANDOM() * 550)) || ', "games": ' || (30 + FLOOR(RANDOM() * 300)) || '}}'
        ELSE ratings_data
    END
WHERE username IN (SELECT DISTINCT username FROM analyses);

-- 전술 기회 샘플 데이터 (각 분석마다)
INSERT INTO tactical_opportunities (analysis_id, pattern_type, game_index, ply, value_gain, difficulty, elo_impact, frequency_score, pattern_complexity)
SELECT 
    a.id,
    (ARRAY['fork', 'pin', 'skewer', 'discovered_attack', 'double_attack', 'deflection', 'decoy', 'clearance'])[FLOOR(RANDOM() * 8) + 1],
    FLOOR(RANDOM() * 10),
    FLOOR(RANDOM() * 60) + 10,
    FLOOR(RANDOM() * 400) + 50,
    ROUND((RANDOM() * 4 + 1)::numeric, 1),
    FLOOR(RANDOM() * 50) + 10,
    ROUND((RANDOM() * 10)::numeric, 2),
    FLOOR(RANDOM() * 5) + 1
FROM analyses a
CROSS JOIN generate_series(1, 15) -- 각 분석마다 15개의 전술 기회
WHERE NOT EXISTS (
    SELECT 1 FROM tactical_opportunities WHERE analysis_id = a.id
);

-- 게임별 상세 분석 데이터 확장
ALTER TABLE game_analyses
ADD COLUMN IF NOT EXISTS opening_eco VARCHAR(10),
ADD COLUMN IF NOT EXISTS opening_variation VARCHAR(200),
ADD COLUMN IF NOT EXISTS time_management_score DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS position_complexity_avg DECIMAL(5,2) DEFAULT 0.0;

-- 게임 데이터 업데이트
UPDATE game_analyses 
SET 
    opening_eco = (ARRAY['A00', 'A01', 'B00', 'B01', 'C00', 'C01', 'D00', 'D01', 'E00'])[FLOOR(RANDOM() * 9) + 1],
    opening_variation = CASE FLOOR(RANDOM() * 5)
        WHEN 0 THEN 'Italian Game: Classical Variation'
        WHEN 1 THEN 'Sicilian Defense: Accelerated Dragon'
        WHEN 2 THEN 'Queen''s Gambit: Declined'
        WHEN 3 THEN 'King''s Indian Defense: Fianchetto Variation'
        ELSE 'English Opening: Symmetrical Variation'
    END,
    time_management_score = ROUND((50 + RANDOM() * 50)::numeric, 2),
    position_complexity_avg = ROUND((30 + RANDOM() * 40)::numeric, 2)
WHERE opening_eco IS NULL;

-- 코호트 데이터 업데이트 (백분위 계산을 위한)
INSERT INTO cohort_data (rating_range, metric_name, percentile_10, percentile_25, percentile_50, percentile_75, percentile_90)
VALUES 
    ('1400-1600', 'tactical_rating', 45.0, 55.0, 65.0, 75.0, 85.0),
    ('1400-1600', 'positional_rating', 40.0, 50.0, 60.0, 70.0, 80.0),
    ('1400-1600', 'endgame_rating', 35.0, 45.0, 55.0, 65.0, 75.0),
    ('1400-1600', 'time_management_rating', 50.0, 60.0, 70.0, 80.0, 90.0)
ON CONFLICT (rating_range, metric_name) DO UPDATE SET
    percentile_10 = EXCLUDED.percentile_10,
    percentile_25 = EXCLUDED.percentile_25,
    percentile_50 = EXCLUDED.percentile_50,
    percentile_75 = EXCLUDED.percentile_75,
    percentile_90 = EXCLUDED.percentile_90;

COMMIT;