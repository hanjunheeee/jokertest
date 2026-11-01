// 값 모양 검사: 일반 객체·빈 문자열 아닌 문자열·0 이상 정수
// game 하위 영역(ingame·mode·setup)의 저장값·payload·설정 검사가 씀

// 배열·null 아닌 객체
export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 빈 문자열 아닌 문자열
export function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0
}

// 0 이상 정수
export function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}
