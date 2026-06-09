package com.chessanalysis.api.dto.auth;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class SignupRequest {

    @NotBlank(message = "이메일을 입력해주세요.")
    @Email(message = "유효한 이메일 형식이 아닙니다.")
    @Size(max = 255, message = "이메일이 너무 깁니다.")
    private String email;

    @NotBlank(message = "비밀번호를 입력해주세요.")
    @Size(min = 8, max = 72, message = "비밀번호는 8~72자 사이여야 합니다.")
    private String password;

    // 이름: 한글·영문·숫자·공백·점·밑줄·하이픈만 허용 (XSS 방어)
    @NotBlank(message = "이름을 입력해주세요.")
    @Size(min = 2, max = 30, message = "이름은 2~30자 사이여야 합니다.")
    @Pattern(
        regexp = "^[가-힣a-zA-Z0-9][가-힣a-zA-Z0-9\\s._-]*$",
        message = "이름에 사용할 수 없는 특수문자가 포함되어 있습니다."
    )
    private String name;

    @AssertTrue(message = "이용약관에 동의해주세요.")
    private Boolean termsAgreed;

    @AssertTrue(message = "개인정보처리방침에 동의해주세요.")
    private Boolean privacyAgreed;

    // 비밀번호 복잡도: 영문·숫자·특수문자 중 2종류 이상 (KISA 가이드라인)
    @AssertTrue(message = "비밀번호는 영문, 숫자, 특수문자 중 2가지 이상을 포함해야 합니다.")
    public boolean isPasswordStrong() {
        if (password == null || password.length() < 8) return true; // @Size가 처리
        int types = 0;
        if (password.matches(".*[a-zA-Z].*")) types++;
        if (password.matches(".*[0-9].*")) types++;
        if (password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{};':\"\\\\|,.<>/?`~].*")) types++;
        return types >= 2;
    }
}
