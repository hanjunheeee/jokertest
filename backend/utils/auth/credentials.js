// 인증 도구 파일, 비밀번호 해시·비교 + 로그인 토큰(JWT) 만들기
// 가입·소셜 가입·로그인·비번 바꾸기·비번 재설정·세션 발급·refresh 서비스가 부름
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// 비번 해시 (bcrypt 비용 10, 원문은 안 남김)
exports.hashPassword = async (plainPassword) => {
    return await bcrypt.hash(plainPassword, 10);
};

// 입력 비번이 저장 해시와 맞는지
exports.comparePassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

// access 토큰 서명 (유효 시간은 부르는 쪽이 정함, 안 주면 하루)
exports.generateToken = (payload, options = {}) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: options.expiresIn ?? "1d",
    });
};
