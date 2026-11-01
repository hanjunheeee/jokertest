// 소셜 가입 의도 저장소 파일, 만들기 · 해시로 찾기 · 처리 표시
// 소셜 가입 서비스가 부름
const db              = require("../../models");

// 가입 의도 한 줄
exports.createSocialSignupIntent = async (data, options = {}) => {
    return await db.SocialSignupIntent.create(data, options);
};

// 의도 토큰 해시로 찾기 (옵션 그대로)
exports.findSocialSignupIntentByHash = async (intentTokenHash, options = {}) => {
    const { transaction, lock } = options;
    return await db.SocialSignupIntent.findOne({ where: { intent_token_hash: intentTokenHash }, transaction, lock });
};

// 의도 처리 시각 넣기
exports.markSocialSignupIntentConsumed = async (id, options = {}) => {
    return await db.SocialSignupIntent.update({ consumed_at: new Date() }, { where: { id }, ...options });
};
