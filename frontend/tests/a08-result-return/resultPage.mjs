// 결과 화면 단추 시험 몫 도우미: 끝난 판 결과 화면을 그려 결과판까지 넘김, 단추·안내 칸 찾기
// a08-result-return 폴더의 결과 화면 단추 시험(result-buttons·lobby-confirm·room-tab)이 씀 (공용 아님)
import * as K from "../a07-result/resultKit.mjs"

const { default: GameResultPage } = await import("../../src/domains/game/result/page/GameResultPage.jsx")
export { GameResultPage }

// 끝난 판 결과 화면 (영상 넘김 → 결과판·단추), before: 결과 화면 앞 기록 (뒤로 가기 시험)
// 돌려줌: { gameId, seats, meUuid, sock, view, dialogs }
export async function openResultPage({ n = 6, me = 1, connected = true, before = [] } = {}) {
  const sock = K.installFakeSocket({ connected })
  const g = K.endedGame({ n, me })
  sock.answer("get_session_snapshot", () => g.snapshot)
  sock.answer("get_current_room", { ok: true, room: null })
  const dialogs = K.installDialogs()
  const view = await K.renderAt("/gameresult", K.h(GameResultPage), { before })
  await K.finishIntro()
  await K.flush()
  if (!K.button("대기방으로")) throw new Error("결과 화면 단추가 안 그려짐")
  return { ...g, sock, view, dialogs }
}

// 단추 (대기방으로·이동 중..·로비로)
export const returnButton = () => K.button("대기방으로") ?? K.button("이동 중..")
export const lobbyButton = () => K.button("로비로")
// 떠나기 실패 안내 칸
export const notice = () => document.querySelector('[data-testid="result-leave-notice"]')
