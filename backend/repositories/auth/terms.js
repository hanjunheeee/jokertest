'use strict';

// 약관 저장소 파일, 약관 버전 전부 읽기 · 한 사람 동의 기록 읽기·쓰기
// 약관 서비스(services/auth/terms)가 부름, 지금 버전 고르기·필수 판정은 서비스 몫
const db = require('../../models');

// 약관 버전 전부 (종류·버전 몇 개뿐이라 통째로 읽고 서비스가 고름)
const findAllVersions = ({ transaction } = {}) => db.TermsVersion.findAll({
    attributes: ['id', 'kind', 'version', 'title', 'body', 'url', 'effective_at', 'is_required'],
    raw: true,
    transaction,
});

// 한 사람이 동의한 약관 버전 id 목록
const findAgreedVersionIds = async (userId, { transaction } = {}) => {
    const rows = await db.UserTermsAgreement.findAll({
        where: { user_id: userId },
        attributes: ['terms_version_id'],
        raw: true,
        transaction,
    });
    return rows.map((row) => Number(row.terms_version_id));
};

// 동의 기록 여러 줄 (이미 있는 버전은 건너뜀, 유일 인덱스가 겹침 막음)
const createAgreements = (userId, versionIds, agreedAt, { transaction } = {}) => db.UserTermsAgreement.bulkCreate(
    versionIds.map((termsVersionId) => ({ user_id: userId, terms_version_id: termsVersionId, agreed_at: agreedAt })),
    { transaction, ignoreDuplicates: true },
);

module.exports = {
    findAllVersions,
    findAgreedVersionIds,
    createAgreements,
};
