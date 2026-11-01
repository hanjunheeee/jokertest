// 사용자 저장소 트랜잭션 파일, 트랜잭션 열기 · 유일 충돌을 409로 바꾸기
// 인증 서비스가 user/index.js 거쳐 씀, 409 바꾸기는 account.js·oauth.js가 씀
const db              = require("../../models");
const { createError } = require("../../utils/appError");
const { UNIQUE_CONFLICTS } = require('./constants');

// 유일 제약 오류면 걸린 칸 문구로 409, 아니면 원래 오류 그대로
const toConflictError = (error) => {
    if (error?.name !== "SequelizeUniqueConstraintError") return error;

    // 걸린 칸 이름 후보를 errors·fields 양쪽에서 모음 (방언마다 담기는 곳이 다름)
    const errorItems = Array.isArray(error.errors) ? error.errors : [];
    const fields     = error.fields ?? {};
    const hints      = [
        ...errorItems.map((item) => item?.path),
        ...(Array.isArray(fields) ? fields : Object.keys(fields)),
    ].filter(Boolean).map(String);

    // 표에 없는 칸이면 일반 문구
    const hit = UNIQUE_CONFLICTS.find(({ field }) => hints.some((hint) => hint.includes(field)));
    return createError(hit?.message ?? "이미 사용 중인 값입니다.", 409);
};

// 옵션 없으면 (work)로, 있으면 (options, work)로 넘김 (비번 재설정은 쿼리 로그 끄기 옵션을 줌)
exports.withTransaction = async (work, options = {}) => {
    if (Object.keys(options).length === 0) {
        return await db.sequelize.transaction(work);
    }
    return await db.sequelize.transaction(options, work);
};

exports.toConflictError = toConflictError;
