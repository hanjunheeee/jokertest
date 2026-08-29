/**
 * 방코드의 형식 규칙과 "복사해도 되는 값인지" 판정을 한곳에 모은 유틸입니다.
 *
 * 서버(backend/utils/roomCode.js)는 오인 방지 문자(I·O·0·1)를 뺀
 * 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'에서 6글자를 뽑아 방코드를 만듭니다.
 * 즉 방코드는 숫자만이 아니라 영문자가 섞인 6자 영숫자 문자열입니다.
 *
 * 여기서 판정 기준을 서버의 문자 집합(I·O 제외)까지 그대로 따라가지 않고 일반 영숫자로
 * 두는 이유는, 서버가 문자 집합을 넓히거나 좁혀도 화면이 멀쩡한 코드를 "잘못된 코드"로
 * 몰아세우지 않게 하기 위해서입니다. 화면이 막아야 하는 건 오탈자가 아니라 아직 코드를
 * 받지 못한 상태(빈 값·null)와 명백히 형식이 깨진 값뿐입니다.
 *
 * 이 파일은 방코드를 "보여주는 쪽"(matching의 RoomCodeViewModal)과 "입력받는 쪽"
 * (mode의 useRoomCodeInput)이 함께 씁니다. 두 화면이 서로 다른 문자 규칙을 갖게 되면
 * 한쪽에서 정상으로 보이는 코드를 다른 쪽에서 입력할 수 없게 되므로, 규칙의 출처를
 * 도메인마다 복제하지 않고 이 파일 하나로 유지합니다.
 *
 * 대소문자 정책: 어느 함수도 대문자로 바꾸지 않습니다. 서버의 코드 비교는
 * `room.code === normalizedCode`라 대소문자를 구분하므로, 화면이 임의로 케이스를 바꾸면
 * 사용자가 친 값과 서버로 나가는 값이 달라집니다. 입력값은 문자 집합만 거르고 그대로
 * 흘려보냅니다.
 */

// 방코드 길이입니다. 표시 칸 수·검증 길이가 서로 어긋나지 않도록 여기서만 정의합니다.
export const ROOM_CODE_LENGTH = 6

// 방코드 형식입니다. 길이를 ROOM_CODE_LENGTH에서 만들어 두 값이 항상 함께 움직입니다.
// g 플래그를 쓰지 않는다는 점이 중요합니다 — g가 붙으면 정규식이 lastIndex 상태를 갖게 되어
// 같은 문자열을 두 번 test할 때 결과가 번갈아 바뀝니다.
export const ROOM_CODE_PATTERN = new RegExp(`^[A-Za-z0-9]{${ROOM_CODE_LENGTH}}$`)

// 방코드에 쓸 수 없는 문자입니다. ROOM_CODE_PATTERN이 허용하는 집합([A-Za-z0-9])의 여집합으로,
// 두 값이 갈라지면 "입력은 되는데 유효하지 않은 코드"가 만들어지므로 항상 함께 봐야 합니다.
// 여기엔 g 플래그가 필요합니다(문자열 전체에서 걸러내야 하므로). 위 ROOM_CODE_PATTERN과 달리
// 이 정규식은 test()가 아니라 replace()에만 쓰입니다 — replace()는 매 호출마다 0부터 훑고
// 끝나면 lastIndex를 되돌려 놓아, g 플래그로 인한 상태 누적 문제가 생기지 않습니다.
const ROOM_CODE_DISALLOWED_PATTERN = /[^A-Za-z0-9]/g

/** 복사 실패 시 사용자에게 읽어줄 안내 문구입니다. */
export const ROOM_CODE_COPY_ERRORS = {
  // 아직 서버에서 방코드를 못 받았거나 형식이 깨진 값이 내려온 경우입니다.
  UNAVAILABLE: "방코드를 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.",
  // 클립보드 접근 자체가 막힌 경우(권한 거부·비보안 컨텍스트 등)입니다.
  CLIPBOARD_FAILED: "방코드를 복사하지 못했습니다. 화면의 코드를 직접 입력해 공유해주세요.",
}

/**
 * 문자열이 아닌 방코드(null·undefined·숫자 등)를 빈 문자열로 바꿔 줍니다.
 * 방코드 표시 칸은 value[index]로 글자를 꺼내므로, null이 그대로 흘러가면
 * "Cannot read properties of null" 예외로 모달 전체가 깨집니다.
 * @param {unknown} code
 * @returns {string}
 */
export function normalizeRoomCode(code) {
  return typeof code === "string" ? code : ""
}

/**
 * 표시·복사해도 되는 방코드인지 판정합니다.
 * @param {unknown} code
 * @returns {boolean} 6자 영숫자면 true
 */
export function isValidRoomCode(code) {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(code))
}

/**
 * 방코드 입력 칸 한 곳에 들어온 값에서 실제로 채워 넣을 한 글자만 남깁니다.
 *
 * 한 칸은 한 글자만 담으므로, 여러 글자가 들어오면 마지막 글자를 씁니다 — 이미 글자가
 * 있는 칸에 타이핑하면 브라우저가 "기존 글자 + 새 글자"를 함께 주는데, 사용자가 방금 친
 * 글자는 그중 마지막이기 때문입니다.
 *
 * @param {unknown} char
 * @returns {string} 방코드에 쓸 수 있는 한 글자, 없으면 빈 문자열
 */
export function normalizeRoomCodeChar(char) {
  return normalizeRoomCode(char).replace(ROOM_CODE_DISALLOWED_PATTERN, "").slice(-1)
}

/**
 * 붙여넣기·자동완성처럼 여러 글자가 한 번에 들어온 값을 방코드 한 벌로 정리합니다.
 * 쓸 수 없는 문자(공백·하이픈 등)를 걷어내고 방코드 길이까지만 남깁니다 — 사용자가
 * "AB2-C3D"처럼 구분자를 섞어 복사해 와도 그대로 입력되게 하기 위해서입니다.
 *
 * @param {unknown} text
 * @returns {string} 최대 ROOM_CODE_LENGTH 길이의 영숫자 문자열
 */
export function normalizeRoomCodeText(text) {
  return normalizeRoomCode(text)
    .replace(ROOM_CODE_DISALLOWED_PATTERN, "")
    .slice(0, ROOM_CODE_LENGTH)
}

/**
 * 복사 버튼이 눌렸을 때 클립보드에 실제로 써도 되는지와, 안 된다면 무엇을 안내할지를
 * 한 번에 결정합니다. 화면(RoomCodeViewModal)은 이 결과를 그대로 적용하기만 하면 되고,
 * "성공 표시를 언제 하면 안 되는가"라는 판단은 여기 한 곳에만 존재합니다.
 * @param {unknown} code 화면에 표시 중인 방코드
 * @returns {{ ok: boolean, value: string, error: string }}
 *   ok가 false면 클립보드를 건드리지 말고 error를 안내해야 합니다.
 */
export function resolveRoomCodeCopy(code) {
  const value = normalizeRoomCode(code)

  if (!isValidRoomCode(value)) {
    return { ok: false, value: "", error: ROOM_CODE_COPY_ERRORS.UNAVAILABLE }
  }

  // 표시값과 복사값이 갈라지지 않도록, 잘라내거나 대문자로 바꾸는 등의 가공을 하지 않고
  // 화면에 보이는 문자열을 그대로 돌려줍니다.
  return { ok: true, value, error: "" }
}
