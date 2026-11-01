// 계정 저장소 파일, 이메일·닉네임·uuid로 찾기 · 계정 만들기·바꾸기 · 통계 행 만들기
// 만들기·바꾸기의 유일 충돌은 409로 바꿈
const db              = require("../../models");
const { toConflictError } = require('./transaction');

// 이메일로 계정 (옵션 그대로 넘김)
exports.findByEmail = async (email, options = {}) => {
    const { transaction, lock, logging } = options;
    const findOptions = { where: { email }, transaction, lock };
    if (logging !== undefined) findOptions.logging = logging;
    return await db.User.findOne(findOptions);
};

// 닉네임으로 계정
exports.findByNickname = async (nickname) => {
    return await db.User.findOne({ where: { nickname } });
};

// uuid로 계정 (옵션 그대로 넘김)
exports.findByUuid = async (uuid, options = {}) => {
    const { transaction, lock, logging } = options;
    const findOptions = { where: { uuid }, transaction, lock };
    if (logging !== undefined) findOptions.logging = logging;
    return await db.User.findOne(findOptions);
};

// 계정 만들기, 유일 충돌은 409
exports.createUser = async (userData, options = {}) => {
    try {
        return await db.User.create(userData, options);
    } catch (error) {
        throw toConflictError(error);
    }
};

// 계정 바꾸기, 유일 충돌은 409
exports.updateUser = async (uuid, updateData, options = {}) => {
    try {
        return await db.User.update(updateData, { where: { uuid }, ...options });
    } catch (error) {
        throw toConflictError(error);
    }
};

// 새 계정 통계 행
exports.createUserStats = async (user_id, options = {}) => {
    return await db.UserStats.create({ user_id }, options);
};
