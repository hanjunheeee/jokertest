'use strict';

// 지금 약관 고르기 파일, 종류마다 시행 중인 가장 늦은 버전 · 화면에 줄 모양
// 같은 폴더 agreements.js·index.js가 씀, 저장소는 모듈 객체로 불러 시험 갈아끼우기 먹게
const termsRepository = require('../../../repositories/auth/terms');

const toTime = (value) => (value ? new Date(value).getTime() : Number.NaN);
const isTrue = (value) => value === true || value === 1 || value === '1';

// 종류마다 시행일 지난 것 중 가장 늦은 버전 (시행일 같으면 id 큰 것), 종류 이름 순
// 예: TERMS v1(11/1)·v2(12/1), 지금 11/9 → TERMS v1
const pickCurrentVersions = (rows, now = new Date()) => {
    const nowMs = now.getTime();
    const byKind = new Map();
    for (const row of rows ?? []) {
        const effectiveMs = toTime(row.effective_at);
        if (!Number.isFinite(effectiveMs) || effectiveMs > nowMs) continue;
        const best = byKind.get(row.kind);
        const later = !best
            || effectiveMs > toTime(best.effective_at)
            || (effectiveMs === toTime(best.effective_at) && Number(row.id) > Number(best.id));
        if (later) byKind.set(row.kind, row);
    }
    return [...byKind.values()].sort((a, b) => String(a.kind).localeCompare(String(b.kind)));
};

// 약관 전문 주소는 http·https만 (javascript: 같은 주소가 화면 링크로 가서 스크립트 도는 것 막기)
const safeLinkOf = (value) => {
    if (typeof value !== 'string') return null;
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? value : null;
    } catch {
        return null;
    }
};

// 화면에 줄 모양 (관리자 id·만든 시각은 안 보냄)
const toPublicTerms = (row) => ({
    id: Number(row.id),
    kind: row.kind,
    version: row.version,
    title: row.title,
    body: row.body ?? null,
    url: safeLinkOf(row.url),
    effectiveAt: new Date(row.effective_at).toISOString(),
    required: isTrue(row.is_required),
});

// 지금 약관 목록 (가입 화면·전체 보기 창)
const getCurrentTerms = async ({ now = new Date(), transaction } = {}) => {
    const rows = await termsRepository.findAllVersions({ transaction });
    return pickCurrentVersions(rows, now).map(toPublicTerms);
};

module.exports = {
    pickCurrentVersions,
    toPublicTerms,
    getCurrentTerms,
};
