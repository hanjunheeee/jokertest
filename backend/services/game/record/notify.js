// 전적 저장 뒤 알림 파일, 캐시 무효화 신호 보내기
// 사건 이름은 문자열 그대로 (프론트 감사 시험 잠금)
const { deps } = require('./deps')

// 원 참가자 각자에게 캐시 무효화 신호 (채널에 없어도, 내용은 판 id·범위만, 지도 07-⑦)
function invalidateAccountCaches(uuids, gameId, scopes) {
    const emit = deps.emitToUser
    if (typeof emit !== 'function') return
    for (const uuid of uuids) {
        if (typeof uuid !== 'string' || !uuid) continue
        try {
            emit(uuid, 'account_cache_invalidated', { gameId, scopes: [...scopes] })
        } catch {
            console.error('[캐시 무효화 전달 실패]', { code: 'INVALIDATION_DELIVERY_ERROR', gameId })
        }
    }
}

module.exports = {
    invalidateAccountCaches,
}
