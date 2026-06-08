package com.chessanalysis.api.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Separate config for PasswordEncoder to break the circular dependency:
 * SecurityConfig → JwtAuthFilter → AuthService → PasswordEncoder → SecurityConfig
 *
 * By moving PasswordEncoder here, Spring can instantiate it independently.
 */
@Configuration
public class PasswordEncoderConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
