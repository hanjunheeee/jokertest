/**
 * e2e/.env 읽기와 좌석별 테스트 계정 해석.
 *
 * 파싱·검증은 전부 순수 함수라 playwright 없이 node:test로 그대로 돌아간다. 파일시스템에
 * 닿는 지점은 loadE2eEnv 하나뿐이다.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

/** 좌석 수 — DEBUG_FIXED_ROLES 목록 길이와 반드시 같아야 한다. */
export const E2E_SEAT_COUNT = 5

/** baseURL이 없을 때 쓰는 frontend dev 서버 기본 주소(vite 기본 포트). */
export const DEFAULT_E2E_BASE_URL = "http://localhost:5173"

/** 계정 한 좌석을 이루는 키 접미사. 하나라도 비면 그 좌석은 쓸 수 없다. */
const ACCOUNT_FIELD_SUFFIXES = Object.freeze(["EMAIL", "PASSWORD", "NICKNAME"])

/**
 * 따옴표로 감싼 값이면 벗겨내고, 아니면 그대로 돌려준다.
 * @param {string} raw 등호 오른쪽의 원문(양끝 공백은 이미 제거된 상태)
 * @flow 앞뒤가 같은 종류의 따옴표로 감싸였고 길이가 2 이상일 때만 벗긴다 — 값 안쪽에만
 *   따옴표가 있는 경우를 잘라내지 않기 위함이다.
 */
function stripQuotes(raw) {
  if (raw.length < 2) return raw
  const first = raw[0]
  const last = raw[raw.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return raw.slice(1, -1)
  }
  return raw
}

/**
 * dotenv 형식 문자열을 { KEY: value } 객체로 파싱한다(순수 함수).
 * @param {string} text .env 파일 내용
 * @flow CRLF/LF 모두를 줄 구분으로 보고, 빈 줄과 '#'으로 시작하는 줄은 건너뛴다. '='이 없는
 *   줄도 건너뛴다(형식 오류로 전체를 실패시키지 않는다 — 무엇이 없는지는 계정 해석 단계가
 *   훨씬 정확하게 알려준다). 값 안의 '='은 첫 번째 것만 구분자로 쓴다.
 * @returns {Record<string,string>}
 */
export function parseDotEnv(text) {
  if (typeof text !== "string") return {}
  const result = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    if (key.length === 0) continue
    result[key] = stripQuotes(line.slice(separatorIndex + 1).trim())
  }
  return result
}

/**
 * 좌석 번호(1-based)에 해당하는 환경변수 키 이름들을 만든다.
 * @param {number} seatNumber 1부터 시작하는 좌석 번호
 */
function accountKeys(seatNumber) {
  return ACCOUNT_FIELD_SUFFIXES.map((suffix) => `E2E_USER${seatNumber}_${suffix}`)
}

/**
 * 환경변수 객체에서 좌석 순서대로의 테스트 계정 배열을 만든다(순수 함수).
 * @param {Record<string,string>} envObj parseDotEnv 결과 또는 process.env
 * @flow 좌석 1..E2E_SEAT_COUNT를 훑으며 비어 있는 키 이름을 전부 모은다. 하나라도 비면
 *   무엇이 빠졌는지 키 이름을 그대로 담아 throw한다 — "계정이 없습니다" 같은 뭉뚱그린
 *   메시지로는 다음 사람이 어느 줄을 고쳐야 할지 알 수 없기 때문이다.
 * @returns {Array<{seatIndex:number, email:string, password:string, nickname:string}>}
 */
export function resolveE2eAccounts(envObj) {
  const source = envObj === null || typeof envObj !== "object" ? {} : envObj
  const missing = []
  const accounts = []

  for (let seatNumber = 1; seatNumber <= E2E_SEAT_COUNT; seatNumber += 1) {
    const [emailKey, passwordKey, nicknameKey] = accountKeys(seatNumber)
    const values = [emailKey, passwordKey, nicknameKey].map((key) => {
      const value = source[key]
      if (typeof value !== "string" || value.trim().length === 0) {
        missing.push(key)
        return ""
      }
      return value.trim()
    })
    accounts.push({
      seatIndex: seatNumber - 1,
      email: values[0],
      password: values[1],
      nickname: values[2],
    })
  }

  if (missing.length > 0) {
    throw new Error(
      `e2e 테스트 계정 설정이 비어 있습니다 — e2e/.env에 다음 값을 채우세요: ${missing.join(", ")}`,
    )
  }

  const nicknames = accounts.map((account) => account.nickname)
  if (new Set(nicknames).size !== nicknames.length) {
    throw new Error(
      `e2e 테스트 계정의 닉네임이 서로 겹칩니다 — 좌석을 닉네임으로 구분하므로 5개가 모두 달라야 합니다: ${nicknames.join(", ")}`,
    )
  }

  return accounts
}

/**
 * e2e/.env(있으면)와 process.env를 합쳐 baseURL과 좌석 계정을 해석한다.
 * @param {string} [envFilePath] .env 경로 override(기본값은 이 파일 기준 ../.env)
 * @flow 파일이 없으면 process.env만으로 진행한다(CI에서 환경변수로 넘길 수 있게). 실제
 *   값 충돌 시에는 process.env가 파일보다 우선한다 — 한 번 띄운 셸에서 계정을 갈아끼울 수
 *   있어야 하기 때문이다.
 * @returns {{baseUrl:string, accounts:Array<object>}}
 */
export function loadE2eEnv(envFilePath) {
  const path = envFilePath ?? fileURLToPath(new URL("../.env", import.meta.url))
  let fileEnv = {}
  try {
    fileEnv = parseDotEnv(readFileSync(path, "utf8"))
  } catch {
    // .env가 없어도 process.env만으로 돌 수 있어야 한다.
  }
  const merged = { ...fileEnv, ...process.env }
  return {
    baseUrl: merged.E2E_BASE_URL?.trim() || DEFAULT_E2E_BASE_URL,
    accounts: resolveE2eAccounts(merged),
  }
}
