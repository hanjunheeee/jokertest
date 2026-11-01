// 게임 초대 수락 경로의 소켓 보내기 (응답 기다리기·연결 같은지 보기)
// 초대 수락 흐름(hooks/friendSocket/inviteAccept.js)이 씀
import { getSocket } from "../../../shared/socket/socketClient.js";

// 응답이 안 오거나 보내다 터져도 결과 모름(unknown)으로 끝나게 함
function emitWithAck(socket, event, payload, timeoutMs) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
        const timer = setTimeout(() => finish({ ok: false, code: "UNKNOWN", unknown: true }), timeoutMs);
        try {
            socket.emit(event, payload, (ack) => {
                clearTimeout(timer);
                finish(ack ?? { ok: false, code: "UNKNOWN", unknown: true });
            });
        } catch (error) {
            clearTimeout(timer);
            finish({ ok: false, code: "EMIT_FAILED", unknown: true });
        }
    });
}

// 초대 수락 요청
export const emitAcceptInvite = (socket, inviteId, timeoutMs) => (
    emitWithAck(socket, "accept_game_invite", { inviteId }, timeoutMs)
);

// 수락 결과를 모를 때 서버에 결과를 다시 물음
export const emitInviteResult = (socket, inviteId, timeoutMs) => (
    emitWithAck(socket, "get_game_invite_result", { inviteId }, timeoutMs)
);

// 들어간 방이 진짜 지금 방인지 확인함
export const emitCurrentRoom = (socket, timeoutMs) => (
    emitWithAck(socket, "get_current_room", {}, timeoutMs)
);

// 요청을 보낸 연결이 아직 공용 연결인지 (재접속으로 바뀌었으면 결과를 못 믿음)
export function isSameConnection(socket, connectionId) {
    if (!socket) return false;
    if (connectionId === null) return socket === getSocket();
    return socket === getSocket() && socket.id === connectionId;
}
