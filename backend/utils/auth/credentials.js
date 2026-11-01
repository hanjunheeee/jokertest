// 인증 도구 파일, 비밀번호 해시·비교 + 로그인 토큰(JWT) 만들기
// 가입·로그인·비번 바꾸기·세션 발급 서비스가 부름
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.hashPassword = async (plainPassword) => {
    return await bcrypt.hash(plainPassword, 10);
};

exports.comparePassword = async (plainPassword, hashedPassword) => {
    return await bcrypt.compare(plainPassword, hashedPassword);
}

exports.generateToken = (payload, options = {}) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: options.expiresIn ?? "1d",
    });
};
