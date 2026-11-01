// 계정 저장소 파일, 이메일·닉네임·uuid로 찾기 · 계정 만들기·바꾸기 · 통계 행 만들기
// user/index.js가 묶어 내보냄, 가입·로그인·비번·프로필 서비스가 씀 (만들기·바꾸기의 유일 충돌은 409로 바꿈)
const db              = require("../../models");
const { toConflictError } = require('./transaction');

// 이메일로 계정 (트랜잭션·잠금·쿼리 로그 끄기를 부르는 쪽이 정함)
exports.findByEmail = async (email, options = {}) => {
    const { transaction, lock, logging } = options;
    const findOptions = { where: { email }, transaction, lock };
    if (logging !== undefined) findOptions.logging = logging;
    return await db.User.findOne(findOptions);
};

// 닉네임으로 계정 (가입·닉네임 바꾸기 중복 확인)
exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

// uuid로 계정 (트랜잭션·잠금·쿼리 로그 끄기를 부르는 쪽이 정함)
exports.findByUuid = async (uuid, options = {}) => {
    const { transaction, lock, logging } = options;
    const findOptions = { where: { uuid }, transaction, lock };
    if (logging !== undefined) findOptions.logging = logging;
    return await db.User.findOne(findOptions);
};

// 계정 만들기, 닉네임·이메일 겹치면 409 (동시 가입이 앞 검사를 지나쳐도 여기서 걸림)
exports.createUser = async (userData, options = {}) => {
    try {
        return await db.User.create(userData, options);
    } catch (error) {
        throw toConflictError(error);
    }
};

// 계정 바꾸기, 닉네임 겹치면 409
exports.updateUser = async (uuid, updateData, options = {}) => {
    try {
        return await db.User.update(updateData, { where: { uuid }, ...options });
    } catch (error) {
        throw toConflictError(error);
    }
};

// 새 계정 통계 행 (값은 표 기본값)
exports.createUserStats = async (user_id, options = {}) => {
    return await db.UserStats.create({ user_id }, options);
};
