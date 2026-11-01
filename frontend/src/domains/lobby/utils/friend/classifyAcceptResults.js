// 전부 수락 결과를 수락·실패·미확정으로 나누는 계산
// 전부 수락 흐름(hooks/friendSync/acceptAll.js)이 씀

// 요청이 실패해도 서버 확인 결과가 ACCEPTED면 수락으로, 확인 못 했으면 미확정으로 봄
export function classifyAcceptResults(requestIds, settled, confirmedStatuses) {
  const accepted = []
  const failed = []
  const unconfirmed = []

  requestIds.forEach((requestId, index) => {
    const outcome = settled[index]
    if (outcome.status === "fulfilled") {
      accepted.push(requestId)
      return
    }
    const confirmed = confirmedStatuses.get(requestId)
    if (confirmed === "ACCEPTED") {
      accepted.push(requestId)
      return
    }
    if (confirmed === undefined) {
      unconfirmed.push(requestId)
      return
    }
    failed.push(requestId)
  })

  return { accepted, failed, unconfirmed }
}
