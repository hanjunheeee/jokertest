// 장착 상태 저장 한 번 (차례대로 보내기·버전 충돌 때 서버 상태로 맞추고 다시 보내기)
// 경제 스토어의 장착 액션이 씀
import { economyApi } from "../../api/economy.api.js"
import { MAX_LOADOUT_EQUIP_AUTO_RETRIES } from "../../constants/loadout.js"
import { resolveUserId } from "./state.js"

// 장착 저장은 앞의 저장이 끝난 뒤에 보냄
let loadoutQueue = null

export const clearLoadoutQueue = () => {
  loadoutQueue = null
}

// send: 보낼 요청, matches: 서버 상태가 이미 원하는 장착인지, conflictCode: 다시 맞출 충돌 코드
export const sendLoadoutWrite = (get, set, {
  send, buildBody, matches, applyExtra, conflictCode,
  requireKnownRevision = false, replayOnConflict = true,
}) => {
  const generation = get().requestGeneration
  const userId = resolveUserId()
  // 보낸 뒤 계정이 바뀌었거나 초기화됐으면 결과를 버림
  const isCurrent = () => Boolean(userId) && generation === get().requestGeneration && userId === resolveUserId()
  const sessionChangedError = () => Object.assign(new Error("계정이 변경되어 저장을 취소했습니다."), { code: "SESSION_CHANGED" })

  const applyLoadoutResult = (loadout, { withExtra = true } = {}) => {
    if (!isCurrent()) return
    set((state) => {
      const merged = { ...state.loadout, ...loadout }
      return {
        loadout: (withExtra && applyExtra) ? { ...merged, ...applyExtra(merged) } : merged,
        loadoutWriteSeq: state.loadoutWriteSeq + 1,
      }
    })
  }

  const fetchAuthoritativeLoadout = async () => {
    if (!isCurrent()) throw sessionChangedError()
    const entitlementsResponse = await economyApi.entitlements(userId)
    if (!isCurrent()) throw sessionChangedError()
    return entitlementsResponse.loadout
  }

  // 충돌이면 서버 상태를 받아 반영하고, 이미 원하는 상태면 끝, 아니면 새 버전으로 다시 보냄
  const attemptSend = async (expectedRevision, attemptNumber) => {
    if (!isCurrent()) throw sessionChangedError()
    try {
      const result = await send(buildBody(expectedRevision))
      applyLoadoutResult(result.loadout)
      return result
    } catch (error) {
      if (!isCurrent()) throw error

      const code = error?.code
      if (code !== conflictCode || attemptNumber > MAX_LOADOUT_EQUIP_AUTO_RETRIES) throw error

      let serverLoadout
      try {
        serverLoadout = await fetchAuthoritativeLoadout()
      } catch {
        throw error
      }
      if (!isCurrent()) throw sessionChangedError()

      applyLoadoutResult(serverLoadout, { withExtra: false })

      if (matches(serverLoadout)) {
        return { loadout: serverLoadout, reconciled: true }
      }

      if (!replayOnConflict) {
        throw error
      }

      return attemptSend(serverLoadout.revision, attemptNumber + 1)
    }
  }

  // 버전이 꼭 필요한 칸인데 모르면 서버 상태부터 받음
  const run = async () => {
    let revision = get().loadout.revision
    if (requireKnownRevision && (typeof revision !== "string" || revision.length === 0)) {
      if (!isCurrent()) throw sessionChangedError()
      let authoritative
      try {
        authoritative = await fetchAuthoritativeLoadout()
      } catch {
        if (!isCurrent()) throw sessionChangedError()
        throw Object.assign(
          new Error("장착 상태를 아직 불러오지 못해 저장할 수 없습니다. 다시 시도해 주세요."),
          { code: "LOADOUT_REVISION_UNAVAILABLE" },
        )
      }
      if (!isCurrent()) throw sessionChangedError()
      applyLoadoutResult(authoritative, { withExtra: false })
      revision = authoritative.revision
    }
    return attemptSend(revision, 1)
  }
  const result = loadoutQueue ? loadoutQueue.then(run) : run()
  const settled = result.then(() => undefined, () => undefined)
  loadoutQueue = settled
  settled.then(() => { if (loadoutQueue === settled) loadoutQueue = null })
  return result
}
