// 방 만들기·대기방 확인 흐름 추적 (개발 터미널)
function enabled() {
  return process.env.NODE_ENV !== 'production' || process.env.DEBUG_MATCHING_FLOW === '1'
}

function log(step, detail = {}) {
  if (!enabled()) return
  console.log(`[MMC-FLOW] ${step}`, detail)
}

module.exports = { logMatchingFlow: log }