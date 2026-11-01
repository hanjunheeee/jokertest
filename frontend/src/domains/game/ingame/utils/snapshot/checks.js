// 스냅샷 검사에 쓰는 작은 모양 검사와 "거절" 표시
// utils/snapshot/ 파일들이 사용

// 부분 검사가 "스냅샷 전체 거절"을 알릴 때 돌려주는 값 (null은 "필드 없음"으로 씀)
export const BAD = Symbol("snapshot-bad")

// 모양 검사 도우미 (0 이상 정수·빈칸 아닌 글자·배열 아닌 객체)
export const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0

export const isNonEmptyString = (value) => typeof value === "string" && value.length > 0

export const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
