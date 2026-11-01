// 직업 전신·클로즈업 초상 그림 경로 (순번으로 고름)
// pickJobPortrait·ingame 초상 고르기가 씀 (전신 목록은 시험만 봄)
const BASIC_STANDING_DIR = "/shopItem/basic/jobs-standing"
const BASIC_CLOSEUP_DIR = "/shopItem/basic/jobs-closeup"
// 경비원3은 basic 폴더에 없어 옛 ingame-playercard 폴더 그림을 씀
const LEGACY_STANDING_DIR = "/frame/ingame-playercard/jobs-standing"
const LEGACY_CLOSEUP_DIR = "/frame/ingame-playercard/jobs-closeup"

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
