// 방 만들기·대기방 확인 흐름 추적 파일
// DEBUG_MATCHING_FLOW=1일 때만 줄바꿈 치환·크기 제한 뒤 터미널에 찍음
const MAX_STEP_LEN = 64
const MAX_STRING_LEN = 160
const MAX_KEY_LEN = 48
const MAX_KEYS = 20
const MAX_ARRAY_LEN = 10
const MAX_DEPTH = 2
const MAX_DETAIL_CHARS = 512
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// 디버그 환경값이 켜졌을 때만 허용
function enabled() {
    return process.env.DEBUG_MATCHING_FLOW === '1'
}

// 줄바꿈(\r·\n) 치환 + 최대 길이 자르기 (로그 줄 끼워 넣기·폭주 막기)
function sanitizeText(value, maxLen = MAX_STRING_LEN) {
    const clean = String(value).replace(/\r/g, '\\r').replace(/\n/g, '\\n')
    return clean.length > maxLen ? `${clean.slice(0, maxLen)}…` : clean
}

// 값 하나를 깊이·길이 제한 안으로 다듬기
function sanitizeValue(value, depth = 0) {
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
        return value
    }
    if (typeof value === 'string') return sanitizeText(value, MAX_STRING_LEN)
    if (typeof value === 'bigint') return sanitizeText(value, MAX_STRING_LEN)
    if (Array.isArray(value)) {
        if (depth >= MAX_DEPTH) return '[Array]'
        return value.slice(0, MAX_ARRAY_LEN).map((item) => sanitizeValue(item, depth + 1))
    }
    if (typeof value === 'object') {
        if (depth >= MAX_DEPTH) return '[Object]'
        const out = {}
        for (const [rawKey, item] of Object.entries(value).slice(0, MAX_KEYS)) {
            if (FORBIDDEN_KEYS.has(rawKey)) continue
            out[sanitizeText(rawKey, MAX_KEY_LEN)] = sanitizeValue(item, depth + 1)
        }
        return out
    }
    return sanitizeText(typeof value, MAX_KEY_LEN)
}

// 화면이 보낸 payload를 안전한 평면 객체로 정제 (배열·원시값은 빈 객체)
function sanitizeClientFlowPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {}
    return sanitizeValue(payload, 0)
}

// 전체 직렬화 길이까지 한 번 더 제한
function capDetailSize(detail) {
    const safe = sanitizeClientFlowPayload(detail)
    try {
        const serialized = JSON.stringify(safe)
        if (serialized && serialized.length > MAX_DETAIL_CHARS) {
            return { truncated: `${serialized.slice(0, MAX_DETAIL_CHARS)}…` }
        }
    } catch {
        return { truncated: '[Unserializable]' }
    }
    return safe
}

// 흐름 한 단계 기록
function log(step, detail = {}) {
    if (!enabled()) return
    const safeStep = sanitizeText(step ?? 'unknown', MAX_STEP_LEN)
    console.log(`[MMC-FLOW] ${safeStep}`, capDetailSize(detail))
}

module.exports = {
    logMatchingFlow: log,
    sanitizeClientFlowPayload,
    sanitizeText,
}
