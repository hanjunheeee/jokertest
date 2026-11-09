'use strict';

// 금지어 관리 서비스 파일, 목록 보기 · 넣기 · 켜고 끄기 + 바꾼 뒤 Node 전부 다시 읽기
// bannedWords.controller.js가 부름, 넣기·끄기 결과에 Node별 반영 결과(nodes·partial)를 같이 돌려줌
const { createError } = require('../../../utils/appError');
const audit = require('../core/audit');
const { AUDIT_ACTIONS } = require('../core/auditActions');
const queryQueue = require('../core/queryQueue');
const { reloadEverywhere } = require('../../../services/ops/reloadSync');
// 게임 서버 금지어 목록을 다시 읽기 대상으로 등록해 둠 (불러오기만 해도 등록됨)
require('../../../services/ops/bannedWords');

const defaultDb = () => require('../../../repositories/common/db');
const defaultReload = () => reloadEverywhere('bannedWords');

// 게임 서버 금지어와 같은 다듬기 (앞뒤 공백 빼고 소문자) → 같은 단어 두 번 안 들어감
const normalizeWord = (value) => String(value ?? '').trim().toLowerCase();

const isoOf = (value) => (value ? new Date(value).toISOString() : null);

// 표 한 줄 → 화면 모양 (예: { id:3, word:'욕', is_active:1 } → { id:3, word:'욕', isActive:true, … })
const toItem = (row) => {
    const get = (key) => (typeof row.get === 'function' ? row.get(key) : row[key]);
    return {
        id: Number(get('id')),
        word: get('word'),
        isActive: Boolean(get('is_active')),
        createdAt: isoOf(get('created_at')),
        updatedAt: isoOf(get('updated_at')),
    };
};

// LIKE 특수 글자 막기 (예: '50%' → '50\%')
const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

// 목록: 새로 넣은 것부터 50줄씩, q는 들어간 글자 찾기, active는 켜짐·꺼짐만
const listWords = async ({ q, active, before, limit = 50 }, { db = defaultDb() } = {}) => {
    const where = [];
    const replacements = { limit: limit + 1 };
    if (q) { where.push("word LIKE :q ESCAPE '\\\\'"); replacements.q = `%${escapeLike(normalizeWord(q))}%`; }
    if (active !== undefined) { where.push('is_active = :active'); replacements.active = active ? 1 : 0; }
    if (before) { where.push('id < :before'); replacements.before = before; }
    const sql = queryQueue.withTimeoutHint(`SELECT id, word, is_active, created_at, updated_at FROM banned_words
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT :limit`);
    const rows = await queryQueue.run(() => db.sequelize.query(sql, { replacements, type: db.Sequelize.QueryTypes.SELECT }));
    const items = rows.slice(0, limit).map(toItem);
    return { items, nextBefore: rows.length > limit ? items[items.length - 1].id : null };
};

const exists = (row) => {
    const error = createError('이미 있는 금지어예요. 꺼져 있으면 목록에서 다시 켜 주세요.', 409, 'BANNED_WORD_EXISTS');
    error.details = { id: Number(row.get('id')), isActive: Boolean(row.get('is_active')) };
    return error;
};

const isUniqueError = (error) => error?.name === 'SequelizeUniqueConstraintError';

// 넣기 → { word, nodes, partial } (기록은 같은 트랜잭션, 다시 읽기는 저장이 끝난 뒤 → 다른 Node가 새 줄을 봄)
const addWord = async ({ req, word }, { db = defaultDb(), reload = defaultReload } = {}) => {
    const text = normalizeWord(word);
    let saved;
    try {
        saved = await db.sequelize.transaction(async (transaction) => {
            const found = await db.BannedWord.findOne({ where: { word: text }, transaction });
            if (found) throw exists(found);
            const now = new Date();
            const row = await db.BannedWord.create({
                word: text, is_active: true, created_by_admin_id: req.admin.id, created_at: now, updated_at: now,
            }, { transaction });
            const item = toItem(row);
            await audit.record({
                req, action: AUDIT_ACTIONS.BANNED_WORD_ADD, targetType: 'banned_word', targetId: item.id, after: { word: text, isActive: true },
            }, { transaction, db });
            return item;
        });
    } catch (error) {
        // 둘이 같은 단어를 동시에 넣음 → 늦은 쪽도 "이미 있음"
        if (!isUniqueError(error)) throw error;
        throw exists(await db.BannedWord.findOne({ where: { word: text } }));
    }
    const { nodes, partial } = await reload();
    return { word: saved, nodes, partial };
};

// 켜고 끄기 → { word, nodes, partial }, 없는 id면 404
const toggleWord = async ({ req, id, isActive }, { db = defaultDb(), reload = defaultReload } = {}) => {
    const saved = await db.sequelize.transaction(async (transaction) => {
        const row = await db.BannedWord.findByPk(id, { transaction, lock: transaction.LOCK?.UPDATE });
        if (!row) throw createError('없는 금지어예요. 목록을 새로 불러와 주세요.', 404, 'BANNED_WORD_NOT_FOUND');
        const before = Boolean(row.get('is_active'));
        await row.update({ is_active: isActive, updated_at: new Date() }, { transaction });
        await audit.record({
            req, action: AUDIT_ACTIONS.BANNED_WORD_TOGGLE, targetType: 'banned_word', targetId: id,
            before: { word: row.get('word'), isActive: before }, after: { word: row.get('word'), isActive },
        }, { transaction, db });
        return toItem(row);
    });
    const { nodes, partial } = await reload();
    return { word: saved, nodes, partial };
};

module.exports = { listWords, addWord, toggleWord, normalizeWord };
