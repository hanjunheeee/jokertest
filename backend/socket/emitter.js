// 사용자 한 명에게 보내는 창구 파일, 접속 목록 Map·io 들고 있음
// socket.js·서비스·컨트롤러가 이 파일만 불러 보냄 (socket.js 통째로 안 불러 순환 막기)
const onlineUsers = new Map();

// initSocket 전엔 비어 있음, 비어 있으면 아무것도 안 보냄
let _io = null;

// initSocket이 만든 io 넣기
function setIo(io) {
    _io = io;
}

// 지금 io 꺼내기
function getIo() {
    return _io;
}

// 접속 중인 사용자 소켓 하나에만 보냄, 없거나 io 없으면 그냥 넘어감
function emitToUser(uuid, event, payload) {
    const socketId = onlineUsers.get(uuid);
    if (socketId && _io) {
        _io.to(socketId).emit(event, payload);
    }
}

module.exports = { onlineUsers, setIo, getIo, emitToUser };
