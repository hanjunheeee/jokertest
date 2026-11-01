// 추방 응답 확인: 보낸 때와 계정·신원·소켓·소속이 그대로인지 묻는 함수 만들기, 요청 id 만들기
// 추방 요청 훅·결과 조회, 카드 추방·대기방 강퇴의 소속 확인이 사용
import { getSocket } from "../../../../../shared/socket/socketClient.js"
import { useAuthStore } from "../../../../auth/store/auth.store.js"

// 소속 확인용: 범위 id·참여 수정 번호까지 그대로여야 지금 것 (값이 하나라도 없으면 아님)
export function captureVerificationGuard({ socket, getMembershipScopeId, getRevision }) {
  const readScopeId = () => (typeof getMembershipScopeId === "function" ? getMembershipScopeId() : null)
  const readRevision = () => (typeof getRevision === "function" ? getRevision() : null)

  // 만들 때 계정·신원·소켓·범위 id·수정 번호를 잡아 둠
  const auth = useAuthStore.getState()
  const identityGeneration = auth.identityGeneration
  const authUuid = auth.user?.uuid ?? null
  const socketId = typeof socket?.id === "string" && socket.id ? socket.id : null
  const scopeId = readScopeId()
  const revision = readRevision()

  return function isStillCurrent() {
    if (!authUuid || !socketId || !scopeId) return false
    if (!Number.isInteger(revision)) return false

    const now = useAuthStore.getState()
    if (now.identityGeneration !== identityGeneration) return false
    if ((now.user?.uuid ?? null) !== authUuid) return false
    if (getSocket() !== socket) return false
    if (socket.id !== socketId) return false
    if (readScopeId() !== scopeId) return false
    if (readRevision() !== revision) return false
    return true
  }
}

// 추방 응답용: 화면이 살아 있고 훅 세대·요청 세대·계정·소켓·범위 id가 그대로여야 지금 것
export function captureAckGuard({ socket, scopeId, requestGeneration, generation, refs, getMembershipScopeId }) {
  const auth = useAuthStore.getState()
  const identityGeneration = auth.identityGeneration
  const authUuid = auth.user?.uuid ?? null
  const socketId = typeof socket?.id === "string" && socket.id ? socket.id : null

  return function isStillCurrent() {
    if (!refs.mountedRef.current) return false
    if (generation !== refs.generationRef.current) return false
    if (requestGeneration !== refs.requestGenerationRef.current) return false
    const now = useAuthStore.getState()
    if (now.identityGeneration !== identityGeneration) return false
    if ((now.user?.uuid ?? null) !== authUuid) return false
    if (getSocket() !== socket) return false
    if (socketId === null || socket.id !== socketId) return false
    if (scopeId !== getMembershipScopeId()) return false
    return true
  }
}

// 추방 요청 id 순번 (모듈 하나에 하나)
let requestSeq = 0

// 추방 요청 id (순번 + 무작위, 결과 조회 때 이 id로 물음)
export function nextRequestId() {
  requestSeq += 1
  return `kick-${requestSeq}-${Math.random().toString(36).slice(2, 10)}`
}
