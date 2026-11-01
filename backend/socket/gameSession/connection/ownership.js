// 연결 소유권 파일
// socket.js 접속 목록 주입 + 연결 소유권 기록·1회 소비 + 지금 그 계정 소켓인지 판정, socket gameSession이 씀

// 바깥에서 넣어 주는 참조 묶음 (socket.js onlineUsers, uuid → 소켓 id)
const deps = {
    onlineUsersRegistry: null,
}

// 접속 목록이 바뀐 횟수, 바뀌면 옛 소유 기록은 무효 (지도 08-②)
let registryGeneration = 0

// 연결 때 검증한 소유 기록: 소켓별 + 계정별 최신 (disconnect 때 1회 소비)
const connectionOwnershipBySocket = new WeakMap()
const connectionOwnershipByUuid = new Map()

// 접속 목록 넣기, 세대 올리고 계정별 소유 기록 비움 (null이면 시험용 초기화)
function setOnlineUsersRegistry(registry) {
    deps.onlineUsersRegistry = registry
    registryGeneration += 1
    connectionOwnershipByUuid.clear()
}

function getOnlineUsersRegistry() {
    return deps.onlineUsersRegistry
}

// 접속 목록이 들어와 있는지 (없으면 소켓 판정을 못 함)
function hasOnlineUsersRegistry() {
    return deps.onlineUsersRegistry instanceof Map
}

// 접속 목록에 적힌 그 계정의 소켓 id (목록 없으면 undefined)
function registeredSocketIdFor(uuid) {
    return hasOnlineUsersRegistry() ? deps.onlineUsersRegistry.get(uuid) : undefined
}

// 소켓 목록 찾기: io 쪽 먼저, 없으면 소켓의 namespace
function namespaceRegistryFor(socket, io = null) {
    const fromIo = io?.sockets?.sockets
    if (fromIo && typeof fromIo.get === 'function') return fromIo
    const fromSocket = socket?.nsp?.sockets
    if (fromSocket && typeof fromSocket.get === 'function') return fromSocket
    return null
}

// 소켓 id·계정 uuid가 둘 다 비지 않은 문자열인지
function hasSocketIdAndUuid(socket, uuid) {
    if (!socket || typeof socket.id !== 'string' || socket.id.length === 0) return false
    return typeof uuid === 'string' && uuid.length > 0
}

// 인증된 계정이 그 uuid고 접속 목록도 있는지 (소유권 기록·끊김 판정 공통 앞단)
function isOwnedIdentity(socket, uuid) {
    if (!hasSocketIdAndUuid(socket, uuid)) return false
    if (socket.data?.user?.uuid !== uuid) return false
    return hasOnlineUsersRegistry()
}

// 연결 때 소유 기록 남기기: 접속 목록·소켓 목록 둘 다 이 소켓일 때만
function recordConnectionOwnership(io, socket, uuid) {
    if (!isOwnedIdentity(socket, uuid)) return null
    if (deps.onlineUsersRegistry.get(uuid) !== socket.id) return null
    const namespace = namespaceRegistryFor(socket, io)
    if (!namespace || namespace.get(socket.id) !== socket) return null

    const record = {
        socket,
        socketId: socket.id,
        uuid,
        registry: deps.onlineUsersRegistry,
        generation: registryGeneration,
    }
    connectionOwnershipBySocket.set(socket, record)
    connectionOwnershipByUuid.set(uuid, record)
    return record
}

// 이 disconnect를 처리해도 되나: 옛 소켓의 늦은 끊김이면 거절 (지도 08-②)
function canProcessDisconnectFor(io, socket, uuid) {
    if (!isOwnedIdentity(socket, uuid)) return false

    // 소켓 목록에 아직 있으면 목록·접속 목록으로 판정
    const namespace = namespaceRegistryFor(socket, io)
    const present = namespace ? namespace.get(socket.id) : undefined
    if (present !== undefined) {
        return present === socket && deps.onlineUsersRegistry.get(uuid) === socket.id
    }

    // 이미 목록에서 빠졌으면 연결 때 남긴 소유 기록이 지금 세대·지금 접속 목록 그대로인지
    const owned = connectionOwnershipBySocket.get(socket)
    if (!owned) return false
    if (owned.socket !== socket || owned.socketId !== socket.id || owned.uuid !== uuid) return false
    if (owned.registry !== deps.onlineUsersRegistry || owned.generation !== registryGeneration) return false
    if (connectionOwnershipByUuid.get(uuid) !== owned) return false
    if (socket.connected !== false) return false
    if (deps.onlineUsersRegistry.get(uuid) !== owned.socketId) return false
    return true
}

// 소유 기록 1회 소비 (같은 끊김을 두 번 처리 못 하게)
function consumeConnectionOwnership(socket, uuid) {
    const owned = connectionOwnershipBySocket.get(socket)
    if (!owned) return
    connectionOwnershipBySocket.delete(socket)
    if (connectionOwnershipByUuid.get(uuid) === owned) connectionOwnershipByUuid.delete(uuid)
}

// 지금 그 계정에 등록된 바로 그 소켓인지 (아니면 STALE_SOCKET, 지도 05-①)
function isCurrentSocketForUuid(uuid, socket, io = null) {
    if (!hasSocketIdAndUuid(socket, uuid)) return false
    if (socket.data?.user?.uuid !== undefined && socket.data.user.uuid !== uuid) return false
    if (!hasOnlineUsersRegistry()) return false
    if (deps.onlineUsersRegistry.get(uuid) !== socket.id) return false
    if (socket.connected !== true) return false
    const namespace = namespaceRegistryFor(socket, io)
    if (!namespace) return false
    return namespace.get(socket.id) === socket
}

// 그 계정의 지금 연결된 소켓 (없거나 끊겼으면 null)
function getSocketForUuid(io, uuid) {
    const socketId = registeredSocketIdFor(uuid)
    if (!socketId) return null
    const socket = io?.sockets?.sockets?.get(socketId)
    return socket?.connected === true ? socket : null
}

// 그 계정이 지금 연결돼 있는지
function isUuidConnected(io, uuid) {
    return getSocketForUuid(io, uuid) !== null
}

module.exports = {
    setOnlineUsersRegistry,
    getOnlineUsersRegistry,
    hasOnlineUsersRegistry,
    registeredSocketIdFor,
    recordConnectionOwnership,
    canProcessDisconnectFor,
    consumeConnectionOwnership,
    isCurrentSocketForUuid,
    getSocketForUuid,
    isUuidConnected,
}
