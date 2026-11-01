// 판 조회 입구, 상수·장부 읽기·참여 확인·진행 중 판·끝난 판 찾기 묶어서 내보냄
// gameSession.js·판 준비·밤·낮·재판·채팅·스냅샷이 이 입구로 사용
// 끊김 유예 단계 이름
const { DISCONNECT_GRACE_PHASES } = require('./constants')
// 장부 읽기: id로 판 찾기·장부에 있는 그 판인지
const {
    getSessionById, hasSessionId, getPlayerGameId, hasRoomSession, isRegisteredSession,
} = require('./byId')
// 참여 확인: 기권했는지·참여 중인지·참여 번호
const {
    hasForfeited, isForfeitedFromSession, isParticipatingInSession, getParticipationRevision,
} = require('./participation')
// 진행 중 판: 어느 판인지·유예·나가기 대상·접속 현황
const {
    getActiveSessionRoutingInfo, isParticipantBlockedFromMatchmaking, getRoomCodeSessionState,
    findExpectedSession, getDisconnectGraceTarget, getActiveSessionForDeparture,
    getActiveGamePresenceSnapshot,
} = require('./live')
// 끝난 판: 남은 사람·다음 방 우편함 자격
const {
    getEndedSessionPartyBroadcastContext, getEndedSessionGameIdForParticipant,
    canLookupPartyMatchingRoom, getEndedSessionParticipantUuids,
} = require('./ended')

module.exports = {
    DISCONNECT_GRACE_PHASES,
    getSessionById, hasSessionId, getPlayerGameId, hasRoomSession, isRegisteredSession,
    hasForfeited, isForfeitedFromSession, isParticipatingInSession, getParticipationRevision,
    getActiveSessionRoutingInfo, isParticipantBlockedFromMatchmaking, getRoomCodeSessionState,
    findExpectedSession, getDisconnectGraceTarget, getActiveSessionForDeparture,
    getActiveGamePresenceSnapshot,
    getEndedSessionPartyBroadcastContext, getEndedSessionGameIdForParticipant,
    canLookupPartyMatchingRoom, getEndedSessionParticipantUuids,
}
