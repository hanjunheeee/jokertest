// 소셜 로그인 토큰 파일, 불투명 토큰 만들기 · 해시
// state·가입 의도·임시 비번에 씀, DB엔 해시만
const crypto = require("crypto");

// 추측 못 하는 무작위 토큰
const generateOpaqueToken = () => crypto.randomBytes(32).toString("base64url");

// DB에 넣을 sha256 해시
const hashValue = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

module.exports = {
    generateOpaqueToken,
    hashValue,
};
