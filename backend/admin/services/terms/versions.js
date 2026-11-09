'use strict';

// 약관 버전 서비스 파일, 버전 목록(버전별 동의 수·지금 시행 중) + 새 버전 넣기(기록 같은 트랜잭션)
// terms.controller.js가 부름, 표는 0026 terms_versions·user_terms_agreements 그대로 (재동의는 기존 플레이어 경로)
const { QueryTypes } = require('sequelize');
const { createError } = require('../../../utils/appError');
const queryQueue = require('../core/queryQueue');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const { pickCurrentVersions } = require('../../../services/auth/terms/current');

const defaultDb = () => require('../../../repositories/common/db');

const TERMS_KINDS = Object.freeze(['TERMS', 'PRIVACY']);

const versionExists = () => createError('같은 종류에 같은 버전이 이미 있어요. 버전 이름을 바꿔 주세요.', 409, 'TERMS_VERSION_EXISTS');

const toIso = (value) => (value ? new Date(value).toISOString() : null);

// 목록 한 줄, isCurrent = 지금 플레이어에게 보이는 버전
const toItem = (row, currentIds) => ({
    id: Number(row.id),
    kind: row.kind,
    version: row.version,
    title: row.title,
    url: row.url ?? null,
    hasBody: Boolean(row.has_body),
    effectiveAt: toIso(row.effective_at),
    isRequired: Boolean(row.is_required),
    isCurrent: currentIds.has(Number(row.id)),
    agreedCount: Number(row.agreed_count) || 0,
    createdAt: toIso(row.created_at),
});

// 버전 목록 → { items } (종류별, 늦게 시행하는 것부터), 동의 수는 terms_version_id 인덱스로 셈
const listTerms = async ({ now = new Date(), db = defaultDb(), queue = queryQueue } = {}) => queue.run(async () => {
    const rows = await db.sequelize.query(queryQueue.withTimeoutHint(`SELECT t.id, t.kind, t.version, t.title, t.url,
            t.body IS NOT NULL AND t.body <> '' AS has_body, t.effective_at, t.is_required, t.created_at,
            (SELECT COUNT(*) FROM user_terms_agreements a WHERE a.terms_version_id = t.id) AS agreed_count
        FROM terms_versions t ORDER BY t.kind, t.effective_at DESC, t.id DESC`), { type: QueryTypes.SELECT });
    // [{ id:3, kind:'TERMS', … }] → Set { 3 } (종류마다 지금 버전 하나)
    const currentIds = new Set(pickCurrentVersions(rows, now).map((row) => Number(row.id)));
    return { items: rows.map((row) => toItem(row, currentIds)) };
});

const isUniqueError = (error) => error?.name === 'SequelizeUniqueConstraintError';

// 새 버전 넣기 (입력은 컨트롤러가 이미 검사) → { terms } + TERMS_CREATE 기록
// 같은 종류·버전 → 409 TERMS_VERSION_EXISTS
const createTerms = async (input, { req, db = defaultDb() } = {}) => {
    try {
        return await db.sequelize.transaction(async (transaction) => {
            const exists = await db.TermsVersion.findOne({
                where: { kind: input.kind, version: input.version }, attributes: ['id'], transaction,
            });
            if (exists) throw versionExists();
            const row = await db.TermsVersion.create({
                kind: input.kind,
                version: input.version,
                title: input.title,
                body: input.body,
                url: input.url,
                effective_at: input.effectiveAt,
                is_required: input.isRequired,
                created_by_admin_id: req.admin.id,
                created_at: new Date(),
            }, { transaction });
            const terms = toItem({ ...row.get({ plain: true }), has_body: Boolean(input.body), agreed_count: 0 }, new Set());
            await audit.record({
                req,
                action: AUDIT_ACTIONS.TERMS_CREATE,
                targetType: 'terms',
                targetId: terms.id,
                after: { kind: terms.kind, version: terms.version, title: terms.title, effectiveAt: terms.effectiveAt, isRequired: terms.isRequired, url: terms.url },
            }, { transaction, db });
            return { terms };
        });
    } catch (error) {
        // 동시에 두 번 눌러 둘 다 확인을 지난 경우 유일 인덱스가 막음
        if (isUniqueError(error)) throw versionExists();
        throw error;
    }
};

module.exports = { TERMS_KINDS, listTerms, createTerms };
