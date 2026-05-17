package com.chessanalysis.api.service;

import com.chessanalysis.api.dto.AnalysisRequestDto;
import com.chessanalysis.api.queue.AnalysisQueueService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AnalysisRateLimitServiceTest {

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private AnalysisQueueService queueService;

    @Mock
    private ValueOperations<String, String> valueOps;

    @InjectMocks
    private AnalysisRateLimitService service;

    private AnalysisRequestDto request;

    @BeforeEach
    void setUp() {
        lenient().when(redisTemplate.opsForValue()).thenReturn(valueOps);
        ReflectionTestUtils.setField(service, "whitelistUsernamesCsv", "");
        ReflectionTestUtils.setField(service, "whitelistIpsCsv", "");
        service.initWhitelists();

        request = new AnalysisRequestDto();
        request.setUsername("testuser");
        request.setPlatform("chess.com");
        request.setGameCount(20);
        request.setPriority("fast");
    }

    @Test
    void enforceLimits_throwsWhenQueueFull() {
        when(queueService.getQueueSize()).thenReturn(30L);

        assertThatThrownBy(() -> service.enforceLimits(request, "1.2.3.4"))
            .isInstanceOf(AnalysisRateLimitException.class)
            .hasMessageContaining("대기열");
    }

    @Test
    void enforceLimits_throwsWhenUserDailyLimitReached() {
        when(queueService.getQueueSize()).thenReturn(0L);
        // Return count at limit for username key
        when(valueOps.get(contains("username"))).thenReturn("3");
        when(valueOps.get(contains("ip"))).thenReturn("0");
        when(valueOps.get(contains("global"))).thenReturn("0");

        assertThatThrownBy(() -> service.enforceLimits(request, "1.2.3.4"))
            .isInstanceOf(AnalysisRateLimitException.class);
    }

    @Test
    void enforceLimits_throwsWhenIpLimitReached() {
        when(queueService.getQueueSize()).thenReturn(0L);
        when(valueOps.get(contains("username"))).thenReturn("0");
        when(valueOps.get(contains("ip"))).thenReturn("10");
        when(valueOps.get(contains("global"))).thenReturn("0");

        assertThatThrownBy(() -> service.enforceLimits(request, "1.2.3.4"))
            .isInstanceOf(AnalysisRateLimitException.class);
    }

    @Test
    void enforceLimits_passesWhenUnderLimits() {
        when(queueService.getQueueSize()).thenReturn(0L);
        when(valueOps.get(anyString())).thenReturn("0");
        when(redisTemplate.execute(any(RedisScript.class), anyList(), any())).thenReturn(1L);

        assertThatCode(() -> service.enforceLimits(request, "1.2.3.4"))
            .doesNotThrowAnyException();
    }

    @Test
    void enforceLimits_whitelistedUserBypassesAllLimits() {
        ReflectionTestUtils.setField(service, "whitelistUsernamesCsv", "testuser");
        service.initWhitelists();

        when(queueService.getQueueSize()).thenReturn(29L);

        assertThatCode(() -> service.enforceLimits(request, "1.2.3.4"))
            .doesNotThrowAnyException();
        // No Redis counter reads should happen for whitelisted users
        verify(valueOps, never()).get(anyString());
    }

    @Test
    void enforceLimits_precisePriorityHasLowerLimit() {
        request.setPriority("precise");
        when(queueService.getQueueSize()).thenReturn(0L);
        // precise limit is 1, so count=1 means exceeded
        when(valueOps.get(contains("username"))).thenReturn("1");
        when(valueOps.get(contains("ip"))).thenReturn("0");
        when(valueOps.get(contains("global"))).thenReturn("0");

        assertThatThrownBy(() -> service.enforceLimits(request, "1.2.3.4"))
            .isInstanceOf(AnalysisRateLimitException.class);
    }
}
