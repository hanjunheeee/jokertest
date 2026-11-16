// 대기방 화면 시험 몫 도우미: 판 끝 뒤 다시 열린 방(원래 방장 자리 남김)을 스토어에 넣고 대기방 화면을 그림, 자리 칸 읽기
// a08-reserved-host 폴더 시험만 씀 (공용 아님)
import * as K from "../a07-result/resultKit.mjs"

const { default: GameMatchingPage } = await import("../../src/domains/game/matching/pages/GameMatchingPage.jsx")

// 사람 uuid (서버처럼 uuid 모양), 예: personOf(1) → "a08a0000-0000-4000-8000-000000000001"
export const personOf = (n) => `a08a0000-0000-4000-8000-${String(n).padStart(12, "0")}`

// 대기방 화면을 me로 그림 (방 확인 get_current_room 답 = 그 방)
export async function openMatching({ room, me }) {
  const sock = K.installFakeSocket()
  K.signIn(me, "나")
  sock.answer("get_current_room", () => ({ ok: true, room }))
  K.useMatchingStore.getState().setRoom(room)
  const view = await K.renderAt("/game-matching", K.h(GameMatchingPage), { shell: false })
  await K.flush(20)
  return { sock, view }
}

// 자리 칸들 (화면 차례), 칸마다 { reserved, text, alt }
export function seatSlots() {
  const imgs = [...document.querySelectorAll('img[alt="준비 완료한 참가자"], img[alt="준비 전 참가자"], img[alt="비워 둔 방장 자리"]')]
  return imgs.map((img) => {
    const wrap = img.parentElement
    return {
      reserved: wrap?.hasAttribute("data-reserved-host") ?? false,
      text: wrap?.textContent ?? "",
      alt: img.getAttribute("alt"),
    }
  })
}

// 방장 자리 안내 글
export const RESERVED_NOTICE = "방장 자리를 비워 두었습니다. 지난 판 방장이 오지 않으면 먼저 들어온 사람이 방장이 됩니다."
