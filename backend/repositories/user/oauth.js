// 외부 계정 저장소 파일, 외부 계정 찾기·만들기 · OAuth state 만들기·찾기·쓴 표시
// 소셜 로그인 서비스가 부름
const db              = require("../../models");
const { toConflictError } = require('./transaction');

// 제공자·식별자로 외부 계정
exports.findExternalIdentity = async ({ provider, subject }, options = {}) => {
    const { transaction, lock } = options;
    return await db.ExternalIdentity.findOne({ where: { provider, subject }, transaction, lock });
};

// 외부 계정 연결 한 줄, 유일 충돌은 409
exports.createExternalIdentity = async (data, options = {}) => {
    try {
        return await db.ExternalIdentity.create(data, options);
    } catch (error) {
        throw toConflictError(error);
    }
};

// state 한 줄
exports.createOAuthState = async (data, options = {}) => {
    return await db.OAuthState.create(data, options);
};

// state 해시로 찾기 (옵션 그대로)
exports.findOAuthStateByHash = async (stateHash, options = {}) => {
    const { transaction, lock } = options;
    return await db.OAuthState.findOne({ where: { state_hash: stateHash }, transaction, lock });
};

// state 쓴 시각 넣기
exports.markOAuthStateConsumed = async (id, options = {}) => {
    return await db.OAuthState.update({ consumed_at: new Date() }, { where: { id }, ...options });
};
