package com.chessanalysis.api.service;

import com.chessanalysis.api.entity.Analysis;
import com.chessanalysis.api.queue.AnalysisQueueService;
import com.chessanalysis.api.repository.AnalysisRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link AnalysisService#cancelAnalysis(UUID, String)}.
 *
 * <p>The method's contract:
 * <ul>
 *   <li>When Redis has a cancel token hash, the supplied token must match — otherwise {@link SecurityException} is thrown.</li>
 *   <li>When no token is stored (legacy analyses), any caller may cancel.</li>
 *   <li>PENDING/IN_PROGRESS → set to FAILED, return {@code true}.</li>
 *   <li>COMPLETED/FAILED → no-op, return {@code false}.</li>
 *   <li>Non-existent analysis → return {@code false}.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class AnalysisServiceCancelTest {

    @Mock private AnalysisRepository analysisRepository;
    @Mock private AnalysisQueueService queueService;
    @Mock private ShortLinkService shortLinkService;
    @Mock private AnalysisRateLimitService rateLimitService;
    @Mock private DataSource dataSource;
    @Mock private org.springframework.data.redis.core.RedisTemplate<String, Object> redisTemplate;
    @Mock private StringRedisTemplate stringRedisTemplate;
    @Mock private ObjectMapper objectMapper;
    @Mock private ValueOperations<String, String> stringValueOps;

    @InjectMocks
    private AnalysisService service;

    private static final UUID ANALYSIS_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final String RAW_TOKEN = "secret-token-abc";
    private static final String TOKEN_HASH = sha256(RAW_TOKEN);

    @BeforeEach
    void setUp() {
        lenient().when(stringRedisTemplate.opsForValue()).thenReturn(stringValueOps);
    }

    // ── Happy path ───────────────────────────────────────────────────────────

    @Test
    void cancel_pendingAnalysis_withValidToken_returnsTrue() {
        // Hash stored in Redis
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(TOKEN_HASH);

        Analysis analysis = pendingAnalysis();
        when(analysisRepository.findById(ANALYSIS_ID)).thenReturn(Optional.of(analysis));

        boolean result = service.cancelAnalysis(ANALYSIS_ID, RAW_TOKEN);

        assertThat(result).isTrue();
        assertThat(analysis.getStatus()).isEqualTo(Analysis.AnalysisStatus.FAILED);
        verify(analysisRepository).save(analysis);
    }

    @Test
    void cancel_inProgressAnalysis_withValidToken_returnsTrue() {
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(TOKEN_HASH);

        Analysis analysis = inProgressAnalysis();
        when(analysisRepository.findById(ANALYSIS_ID)).thenReturn(Optional.of(analysis));

        boolean result = service.cancelAnalysis(ANALYSIS_ID, RAW_TOKEN);

        assertThat(result).isTrue();
        assertThat(analysis.getStatus()).isEqualTo(Analysis.AnalysisStatus.FAILED);
        verify(analysisRepository).save(analysis);
    }

    @Test
    void cancel_noTokenStored_legacyAnalysis_noTokenRequired() {
        // Legacy: no hash in Redis — any caller may cancel
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(null);

        Analysis analysis = pendingAnalysis();
        when(analysisRepository.findById(ANALYSIS_ID)).thenReturn(Optional.of(analysis));

        assertThatCode(() -> service.cancelAnalysis(ANALYSIS_ID, null))
                .doesNotThrowAnyException();
        assertThat(analysis.getStatus()).isEqualTo(Analysis.AnalysisStatus.FAILED);
    }

    // ── Security enforcement ─────────────────────────────────────────────────

    @Test
    void cancel_wrongToken_throwsSecurityException() {
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(TOKEN_HASH);

        assertThatThrownBy(() -> service.cancelAnalysis(ANALYSIS_ID, "wrong-token"))
                .isInstanceOf(SecurityException.class);

        verify(analysisRepository, never()).findById(any());
        verify(analysisRepository, never()).save(any());
    }

    @Test
    void cancel_nullTokenWhenHashExists_throwsSecurityException() {
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(TOKEN_HASH);

        assertThatThrownBy(() -> service.cancelAnalysis(ANALYSIS_ID, null))
                .isInstanceOf(SecurityException.class);

        verify(analysisRepository, never()).save(any());
    }

    // ── Idempotency ──────────────────────────────────────────────────────────

    @Test
    void cancel_completedAnalysis_returnsFalse() {
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(TOKEN_HASH);

        Analysis analysis = completedAnalysis();
        when(analysisRepository.findById(ANALYSIS_ID)).thenReturn(Optional.of(analysis));

        boolean result = service.cancelAnalysis(ANALYSIS_ID, RAW_TOKEN);

        assertThat(result).isFalse();
        // Status must not be changed
        assertThat(analysis.getStatus()).isEqualTo(Analysis.AnalysisStatus.COMPLETED);
        verify(analysisRepository, never()).save(any());
    }

    @Test
    void cancel_alreadyFailedAnalysis_returnsFalse() {
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(null);

        Analysis analysis = failedAnalysis();
        when(analysisRepository.findById(ANALYSIS_ID)).thenReturn(Optional.of(analysis));

        boolean result = service.cancelAnalysis(ANALYSIS_ID, null);

        assertThat(result).isFalse();
        verify(analysisRepository, never()).save(any());
    }

    @Test
    void cancel_nonExistentAnalysis_returnsFalse() {
        when(stringValueOps.get("cancel:token:" + ANALYSIS_ID)).thenReturn(null);
        when(analysisRepository.findById(ANALYSIS_ID)).thenReturn(Optional.empty());

        boolean result = service.cancelAnalysis(ANALYSIS_ID, null);

        assertThat(result).isFalse();
        verify(analysisRepository, never()).save(any());
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private static Analysis pendingAnalysis() {
        Analysis a = new Analysis();
        a.setId(ANALYSIS_ID);
        a.setStatus(Analysis.AnalysisStatus.PENDING);
        return a;
    }

    private static Analysis inProgressAnalysis() {
        Analysis a = new Analysis();
        a.setId(ANALYSIS_ID);
        a.setStatus(Analysis.AnalysisStatus.IN_PROGRESS);
        return a;
    }

    private static Analysis completedAnalysis() {
        Analysis a = new Analysis();
        a.setId(ANALYSIS_ID);
        a.setStatus(Analysis.AnalysisStatus.COMPLETED);
        return a;
    }

    private static Analysis failedAnalysis() {
        Analysis a = new Analysis();
        a.setId(ANALYSIS_ID);
        a.setStatus(Analysis.AnalysisStatus.FAILED);
        return a;
    }

    private static String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
