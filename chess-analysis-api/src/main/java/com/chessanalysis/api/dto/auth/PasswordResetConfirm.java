package com.chessanalysis.api.dto.auth;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class PasswordResetConfirm {

    @NotBlank(message = "토큰이 필요합니다.")
    private String token;

    @NotBlank(message = "비밀번호를 입력해주세요.")
    @Size(min = 8, max = 72, message = "비밀번호는 8~72자 사이여야 합니다.")
    private String newPassword;

    // 비밀번호 복잡도: 영문·숫자·특수문자 중 2종류 이상 (KISA 가이드라인)
    @AssertTrue(message = "비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다.")
    public boolean isPasswordStrong() {
        if (newPassword == null || newPassword.length() < 8) return true;
        int types = 0;
        if (newPassword.matches(".*[a-zA-Z].*")) types++;
        if (newPassword.matches(".*[0-9].*")) types++;
        if (newPassword.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?`~].*")) types++;
        return types >= 2;
    }
}
