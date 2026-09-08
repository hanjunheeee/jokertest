/**
 * 직업 초상(portrait) public 경로 — shopItem/basic (기본 직업).
 *
 * standing — 전신 스탠딩 (레거시·전적목록 등)
 * closeup — Player Frame용 얼굴 클로즈업 (512×512 권장)
 *
 * 경비원3만 shopItem/basic에 에셋이 아직 없어 기존 frame/ingame-playercard 경로를
 * 그대로 씁니다. 슬롯을 지우면 pickJobPortrait의 index % length 매핑이 밀리므로
 * 슬롯은 유지한 채 실존 파일 경로로만 대체합니다.
 */

const BASIC_STANDING_DIR = "/shopItem/basic/jobs-standing"
const BASIC_CLOSEUP_DIR = "/shopItem/basic/jobs-closeup"
const LEGACY_STANDING_DIR = "/frame/ingame-playercard/jobs-standing"
const LEGACY_CLOSEUP_DIR = "/frame/ingame-playercard/jobs-closeup"

/** jobs-standing — 전신 PNG (상반신 CSS 크롭용, 전적목록 등) */
export const JOB_STANDING_PORTRAITS = [
  `${BASIC_STANDING_DIR}/귀족1.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/귀족2.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/귀족3.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/광대1.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/광대2.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/경비원1.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/경비원2.png`.normalize("NFD"),
  `${LEGACY_STANDING_DIR}/경비원3.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/주치의.png`.normalize("NFD"),
  `${BASIC_STANDING_DIR}/마녀사냥꾼.png`.normalize("NFD"),
]

/** jobs-closeup — Player Frame용 얼굴 클로즈업 PNG */
export const JOB_CLOSEUP_PORTRAITS = [
  `${BASIC_CLOSEUP_DIR}/귀족1_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/귀족2_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/귀족3_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/광대1_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/광대2_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/경비원1_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/경비원2_클로즈업.png`.normalize("NFD"),
  `${LEGACY_CLOSEUP_DIR}/경비원3_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/주치의_클로즈업.png`.normalize("NFD"),
  `${BASIC_CLOSEUP_DIR}/마녀사냥꾼_클로즈업.png`.normalize("NFD"),
]
