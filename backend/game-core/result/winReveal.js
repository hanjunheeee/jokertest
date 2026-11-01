// 판 결과 공개 파일
// 끝난 판 승패 + 전원 역할 공개, 스냅샷·종료 방송이 사용
const { ROLE_DEFINITIONS } = require('../core/rules/roles')

// 단계·생존 목록 + 끝났으면 승패 붙임
function buildTerminalFields(session) {
    // 생존 목록엔 uuid·생사만 (역할은 안 실음)
    const fields = {
        phase: session.phase,
        players: [...session.players.values()].map(({ uuid, alive }) => ({ uuid, isAlive: alive })),
    }
    // 승패 나온 뒤에만 전원 정체 공개 (지도 07-⑧)
    if (session.winResult) fields.winResult = buildPublicWinResult(session)
    return fields
}

// 승패 + 역할 공개 목록
function buildPublicWinResult(session) {
    return { ...session.winResult, reveals: buildRoleReveals(session) }
}

// 전원 역할·팀·생존·죽은 이유 공개
function buildRoleReveals(session) {
    return [...session.players.values()].map((player) => ({
        uuid: player.uuid,
        nickname: player.nickname,
        role: player.role,
        team: ROLE_DEFINITIONS[player.role]?.team ?? null,
        alive: player.alive,
        deathReason: player.alive ? null : (player.deathReason ?? null),
    }))
}

module.exports = { buildTerminalFields, buildPublicWinResult, buildRoleReveals }