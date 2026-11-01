// 소셜 가입 의도 저장소 파일, 만들기 · 토큰 해시로 찾기 · 처리 표시
// user/index.js가 묶어 내보냄, 소셜 로그인(처음 온 계정)·소셜 가입 서비스가 씀
const db              = require("../../models");

// 가입 의도 한 줄 (토큰은 해시만)
exports.createSocialSignupIntent = async (data, options = {}) => {
    return await db.SocialSignupIntent.create(data, options);
};

// 의도 토큰 해시로 찾기 (잠금은 부르는 쪽이 정함)
exports.findIntentByHash = async (intentTokenHash, options = {}) => {
    const { transaction, lock } = options;
    return await db.SocialSignupIntent.findOne({ where: { intent_token_hash: intentTokenHash }, transaction, lock });
};

// 의도 처리 시각 넣기 (같은 토큰으로 두 번 가입 막기)
exports.markIntentConsumed = async (id, options = {}) => {
    return await db.SocialSignupIntent.update({ consumed_at: new Date() }, { where: { id }, ...options });
};
