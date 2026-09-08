// 방 목록 행에 표시할 방 코드 정보를 계산합니다.
//
// 행이 보여줄 수 있는 것은 두 가지입니다.
//  (1) 방 항목이 코드 값을 싣고 있으면 그 값을 그대로 보여줍니다(표시 = 서버가 준 문자열).
//  (2) 코드 값이 없으면 "코드가 필요한 방"이라는 사실만 배지로 보여줍니다.
//
// 지금 공개 목록 payload에는 코드 값이 담기지 않습니다 — backend/socket/matchmaking.js의
// buildPublicRoomList가 "roomCode·참가자·방장·소켓 식별자는 목록 표시에 필요 없고 참가 권한 및
// 개인정보와 연결되므로 제외한다"고 명시적으로 빼고 있습니다. 그래서 실제 화면은 대부분 (2)로
// 그려집니다. 그럼에도 표시 규칙을 (1)까지 포함해 한곳에 두는 이유는, 값을 만들어 내지 않으면서도
// "코드를 아는 방(내가 만든 방 등)이 목록 항목에 code를 실어 주면 그 값을 그대로 보여준다"는
// 계약을 화면 파일이 아니라 테스트 가능한 순수 함수로 고정하기 위해서입니다.
// 이 파일은 값을 새로 노출하지 않습니다. 들어온 room 객체에 없는 코드는 어떤 경우에도
// 만들어 내지 않습니다.
//
// 형식 판정과 정규화는 방코드 규칙의 단일 출처(matching/utils/roomCode.js)를 그대로 씁니다 —
// 표시 쪽에서 규칙을 다시 적으면 "복사 화면에서는 멀쩡한 코드가 목록에서는 깨진 코드"가 됩니다.
import { isValidRoomCode, normalizeRoomCode } from "../../matching/utils/roomCode.js"

/** 코드 값을 모를 때 배지에 쓰는 라벨입니다(자물쇠 아이콘 에셋이 아직 없어 텍스트 배지). */
export const ROOM_LIST_ROW_CODE_REQUIRED_LABEL = "코드"

/** 배지가 든 오버레이는 aria-hidden이라, 스크린리더용 문구는 따로 만들어 aria-label에 싣습니다. */
export const ROOM_LIST_ROW_CODE_REQUIRED_ARIA = "코드 필요"

/**
 * @param {{ accessType?: string, code?: unknown }} room 목록 항목 하나
 * @returns {{ visible: boolean, value: string, label: string, ariaText: string }}
 *   visible이 false면 코드 배지를 그리지 않습니다. value는 화면에 그대로 그릴 코드 값이며,
 *   코드 값을 모르면 빈 문자열입니다(label은 그때 "코드"가 됩니다).
 */
export function resolveRoomListRowCode(room) {
  if (room?.accessType !== "code") {
    return { visible: false, value: "", label: "", ariaText: "" }
  }

  const value = normalizeRoomCode(room?.code)

  // 형식이 깨졌거나 아직 못 받은 코드는 값을 보여주지 않습니다 — 반쯤 깨진 문자열을 방 코드처럼
  // 보여주면 사용자가 그대로 옮겨 적어 반드시 참가에 실패합니다.
  if (!isValidRoomCode(value)) {
    return {
      visible: true,
      value: "",
      label: ROOM_LIST_ROW_CODE_REQUIRED_LABEL,
      ariaText: ROOM_LIST_ROW_CODE_REQUIRED_ARIA,
    }
  }

  return { visible: true, value, label: value, ariaText: `코드 ${value}` }
}
