// 소켓 접속 상태 파일, 접속·끊김 때 접속 목록 고치기 + 친구에게 접속 상태 알리기
// socket.js 연결·끊김 처리기가 부름
// presence 서비스·matchmaking은 모듈 객체로 불러 시험 갈아끼우기 먹게 함
const presenceService = require("../../services/presence/status");
const matchmaking     = require("../matchmaking");
// 접속 목록은 emitter의 Map 하나만 씀 (socket.js·서비스와 같은 객체)
const { onlineUsers } = require("../emitter");

// 한 계정 한 소켓 지키려고 옛 소켓은 표시 남기고 끊음
// 목록엔 새 소켓 먼저 넣음 (옛 소켓 끊김 처리가 새 접속 안 지우게)
async function handleConnection(io, socket, uuid) {
    const existingSocketId = onlineUsers.get(uuid);

    onlineUsers.set(uuid, socket.id);
    // 옛 소켓에 표시 남김 → 그 끊김 처리가 오프라인으로 안 바꿈
    if (existingSocketId && existingSocketId !== socket.id) {
        const existingSocket = io.sockets.sockets.get(existingSocketId);

        if (existingSocket) {
            existingSocket.data.forcedLogout = true;
            existingSocket.emit("force_disconnect", {
                message: "다른 기기 또는 브라우저에서 로그인되어 현재 접속이 종료되었습니다.",
            });
            existingSocket.disconnect(true);
        }
    }

    // 접속 상태 저장·친구 알림·대기방 채널 다시 넣기는 같이 돌림
    await Promise.all([
        presenceService.setPresence(uuid, "ONLINE"),
        broadcastFriendStatus(io, uuid, "ONLINE"),
        matchmaking.resyncRoomChannelOnReconnect(socket, uuid),
    ]);
}

// 밀려난 옛 소켓·이미 새 소켓으로 바뀐 계정은 그냥 끝냄 (새 접속을 오프라인으로 덮지 않기)
async function handleDisconnect(io, socket, uuid) {
    if (socket.data.forcedLogout) return;
    if (onlineUsers.get(uuid) !== socket.id) return;

    // 여기부터 진짜 바뀜: 목록에서 빼고 오프라인 저장·친구 알림
    onlineUsers.delete(uuid);
    await Promise.all([
        presenceService.setPresence(uuid, "OFFLINE"),
        broadcastFriendStatus(io, uuid, "OFFLINE"),
    ]);
}

// 수락한 친구 중 접속 중인 사람에게만 보냄
async function broadcastFriendStatus(io, uuid, status) {
    const friendUuids = await presenceService.getAcceptedFriendUuids(uuid);

    friendUuids.forEach((friendUuid) => {
        const friendSocketId = onlineUsers.get(friendUuid);
        if (friendSocketId) {
            io.to(friendSocketId).emit("friend_status_change", { uuid, status });
        }
    });
}

module.exports = {
    handleConnection,
    handleDisconnect,
};
