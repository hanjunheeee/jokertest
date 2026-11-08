// 점검 중 거절 파일, 방 만들기·시작·코드 입장·자동 매칭 사건 앞에서 점검이면 거절 답
// socket/matchmaking.js가 사건 등록 때 부름, 진행 중 판·방 안 행동은 안 막음 (점검 상태는 services/ops/maintenance.js)
const maintenance = require('../../../services/ops/maintenance')
const { emitRoomJoinFailed } = require('./guards')

// 점검 중이면 거절 답 보내고 true (답 함수 없는 사건은 입장 실패 사건으로)
function rejectDuringMaintenance(socket, callback) {
    const blocked = maintenance.maintenanceRejection()
    if (!blocked) return false
    if (typeof callback === 'function') callback(blocked)
    else emitRoomJoinFailed(socket, blocked.code, blocked.message, { endsAt: blocked.endsAt })
    return true
}

module.exports = { rejectDuringMaintenance }
