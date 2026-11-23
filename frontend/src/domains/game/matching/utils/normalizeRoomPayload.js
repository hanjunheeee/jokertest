// 서버·만들기 응답 방 객체를 setRoom 형식으로 맞춤 (roomId/id 등 필드 이름 차이 흡수)
export function normalizeRoomPayload(raw) {
  if (raw === null || typeof raw !== "object") return null
  const roomId = raw.roomId ?? raw.id ?? null
  if (typeof roomId !== "string" || roomId.length === 0) return null
  const roomCode = raw.roomCode ?? raw.code ?? null
  return {
    roomId,
    roomCode: typeof roomCode === "string" ? roomCode : null,
    players: Array.isArray(raw.players) ? raw.players : [],
    hostUuid: raw.hostUuid ?? null,
    canStart: raw.canStart === true,
    accessType: raw.accessType ?? null,
    settings: raw.settings ?? null,
    settingsVersion: raw.settingsVersion ?? null,
    roomInstanceId: raw.roomInstanceId ?? null,
    bootEpoch: raw.bootEpoch ?? null,
  }
}