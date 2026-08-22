// 파일 역할: normalizeWinResult.js - 여러 곳에서 재사용하는 유틸 함수입니다.

// 백엔드 finalizeGameSession이 확정하는 승자 값 — 이 둘 외에는 종료 결과로 인정하지 않는다.
const WIN_RESULT_WINNERS = new Set(["CITIZEN", "JOKER"])

/**
 * null·배열이 아닌 순수 객체인지 판정한다.
 * @param {unknown} value 검사할 값
 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

/**
 * 방송/스냅샷이 실어 나른 winResult를 검증하고 { winner, reveals, mvp } 전체로 정규화한다.
 *
 * 세 파서(applySessionSnapshotPure / applyTribunalResolvedPure /
 * parseNightResultAppliedPayload)가 모두 이 함수 하나만 호출한다 — 같은 검증을 세 벌 복제하지
 * 않으므로 accept/reject 집합이 구조적으로 동일하다(applySessionSnapshot.test.js의 패리티
 * 테스트가 지키던 등가성을 코드 구조로 보장한다). 매 호출마다 새 객체·새 배열을 만들므로,
 * 호출부가 이후 원본 payload를 변형해도 store에는 영향이 없다.
 *
 * @param {unknown} raw 신뢰하지 않는 외부 입력(payload.winResult / response.winResult)
 * @flow winner가 CITIZEN/JOKER가 아니면 null(=거부)이다. reveals는 배열이 아니거나 원소 중
 *   하나라도 순수 객체가 아니면 통째로 []로 만든다 — 일부만 신뢰한 명단은 잘못된 로스터를
 *   그리므로 all-or-nothing이다. 정상 배열이면 원소마다 공개 다섯 필드만 새 객체로 복사한다.
 *   mvp는 순수 객체일 때만 얕게 복사하고, 없거나 null이거나 원시값이면 null로 둔다.
 */
export function normalizeWinResult(raw) {
  if (!isPlainObject(raw)) return null
  if (!WIN_RESULT_WINNERS.has(raw.winner)) return null

  const revealsUsable = Array.isArray(raw.reveals) && raw.reveals.every(isPlainObject)
  const reveals = revealsUsable
    ? raw.reveals.map((reveal) => ({
        uuid: reveal.uuid,
        nickname: reveal.nickname,
        role: reveal.role,
        team: reveal.team,
        alive: reveal.alive,
      }))
    : []

  return {
    winner: raw.winner,
    reveals,
    mvp: isPlainObject(raw.mvp) ? { ...raw.mvp } : null,
  }
}
