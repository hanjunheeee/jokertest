// 외부 계정 저장소 파일, 외부 계정 찾기·만들기 · OAuth state 만들기·찾기·쓴 표시
// user/index.js가 묶어 내보냄, 소셜 로그인·연결·가입 서비스(services/auth/social)가 씀
const db              = require("../../models");
const { toConflictError } = require('./transaction');

// 제공자·그쪽 계정 id로 연결된 외부 계정 (잠금은 부르는 쪽이 정함)
exports.findExternalIdentity = async ({ provider, subject }, options = {}) => {
    const { transaction, lock } = options;
    return await db.ExternalIdentity.findOne({ where: { provider, subject }, transaction, lock });
};

// 외부 계정 연결 한 줄, 이미 연결된 소셜 계정이면 409
exports.createExternalIdentity = async (data, options = {}) => {
    try {
        return await db.ExternalIdentity.create(data, options);
    } catch (error) {
        throw toConflictError(error);
    }
};

// state 한 줄 (해시만 저장)
exports.createOAuthState = async (data, options = {}) => {
    return await db.OAuthState.create(data, options);
};

// state 해시로 찾기 (잠금은 부르는 쪽이 정함)
exports.findOAuthStateByHash = async (stateHash, options = {}) => {
    const { transaction, lock } = options;
    return await db.OAuthState.findOne({ where: { state_hash: stateHash }, transaction, lock });
};

// state 쓴 시각 넣기 (같은 state 두 번 못 씀)
exports.markOAuthStateConsumed = async (id, options = {}) => {
    return await db.OAuthState.update({ consumed_at: new Date() }, { where: { id }, ...options });
};
