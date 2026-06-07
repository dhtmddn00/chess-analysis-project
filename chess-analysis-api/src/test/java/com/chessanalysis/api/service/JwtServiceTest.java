package com.chessanalysis.api.service;

import com.chessanalysis.api.config.JwtProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class JwtServiceTest {

    @Mock JwtProperties jwtProperties;

    @InjectMocks
    JwtService jwtService;

    // 32바이트 이상의 테스트용 시크릿
    private static final String VALID_SECRET = "test-secret-key-that-is-at-least-32-bytes-long!!";
    private static final long EXPIRY_7DAYS = 604800L;

    @BeforeEach
    void setUp() {
        when(jwtProperties.getSecret()).thenReturn(VALID_SECRET);
        when(jwtProperties.getExpirationSeconds()).thenReturn(EXPIRY_7DAYS);
    }

    @Nested
    @DisplayName("기동 시 시크릿 검증 (validateSecret)")
    class ValidateSecret {

        @Test
        @DisplayName("32바이트 이상 시크릿 → 정상 기동")
        void validSecret_passes() {
            assertThatCode(() -> jwtService.validateSecret()).doesNotThrowAnyException();
        }

        @Test
        @DisplayName("null 시크릿 → IllegalStateException")
        void nullSecret_throws() {
            when(jwtProperties.getSecret()).thenReturn(null);

            assertThatThrownBy(() -> jwtService.validateSecret())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("JWT_SECRET");
        }

        @Test
        @DisplayName("빈 문자열 시크릿 → IllegalStateException")
        void blankSecret_throws() {
            when(jwtProperties.getSecret()).thenReturn("   ");

            assertThatThrownBy(() -> jwtService.validateSecret())
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("31바이트 시크릿 → IllegalStateException (너무 짧음)")
        void shortSecret_throws() {
            when(jwtProperties.getSecret()).thenReturn("short-key-under-32-bytes-long!!");  // 32자 미만

            assertThatThrownBy(() -> jwtService.validateSecret())
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("32바이트");
        }
    }

    @Nested
    @DisplayName("토큰 생성 (generateToken)")
    class GenerateToken {

        @Test
        @DisplayName("userId로 토큰 생성 → 비어있지 않음")
        void generatesNonBlankToken() {
            UUID userId = UUID.randomUUID();

            String token = jwtService.generateToken(userId);

            assertThat(token).isNotBlank();
            assertThat(token.split("\\.")).hasSize(3);  // JWT = header.payload.signature
        }

        @Test
        @DisplayName("동일 userId로 생성한 두 토큰은 서로 다름 (issuedAt 차이)")
        void differentTokensForSameUser() throws InterruptedException {
            UUID userId = UUID.randomUUID();

            String token1 = jwtService.generateToken(userId);
            Thread.sleep(1000);  // issuedAt 차이를 위해 1초 대기
            String token2 = jwtService.generateToken(userId);

            assertThat(token1).isNotEqualTo(token2);
        }
    }

    @Nested
    @DisplayName("토큰 유효성 검증 (isValid)")
    class IsValid {

        @Test
        @DisplayName("정상 토큰 → true")
        void validToken_returnsTrue() {
            String token = jwtService.generateToken(UUID.randomUUID());

            assertThat(jwtService.isValid(token)).isTrue();
        }

        @Test
        @DisplayName("빈 문자열 → false")
        void emptyString_returnsFalse() {
            assertThat(jwtService.isValid("")).isFalse();
        }

        @Test
        @DisplayName("임의 문자열 → false")
        void randomString_returnsFalse() {
            assertThat(jwtService.isValid("not.a.jwt")).isFalse();
        }

        @Test
        @DisplayName("다른 시크릿으로 서명된 토큰 → false (위변조)")
        void tamperedSignature_returnsFalse() {
            // 다른 시크릿으로 별도 JwtService 인스턴스 생성
            JwtProperties otherProps = mock(JwtProperties.class);
            when(otherProps.getSecret()).thenReturn("other-secret-key-that-is-at-least-32-bytes!!!");
            when(otherProps.getExpirationSeconds()).thenReturn(EXPIRY_7DAYS);
            JwtService otherService = new JwtService(otherProps);

            String foreignToken = otherService.generateToken(UUID.randomUUID());

            assertThat(jwtService.isValid(foreignToken)).isFalse();
        }

        @Test
        @DisplayName("만료된 토큰 → false")
        void expiredToken_returnsFalse() {
            when(jwtProperties.getExpirationSeconds()).thenReturn(-1L);  // 이미 만료

            String expiredToken = jwtService.generateToken(UUID.randomUUID());

            assertThat(jwtService.isValid(expiredToken)).isFalse();
        }
    }

    @Nested
    @DisplayName("userId 추출 (extractUserId)")
    class ExtractUserId {

        @Test
        @DisplayName("토큰에서 정확한 userId 추출")
        void extractsCorrectUserId() {
            UUID userId = UUID.randomUUID();
            String token = jwtService.generateToken(userId);

            UUID extracted = jwtService.extractUserId(token);

            assertThat(extracted).isEqualTo(userId);
        }
    }
}
