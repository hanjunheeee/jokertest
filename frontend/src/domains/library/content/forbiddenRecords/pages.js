// 금지된 기록 쪽 목록 (원고 md + 쪽별 해금 정보 합침)과 쪽 꺼내기
// 왼쪽·오른쪽 쪽 컴포넌트와 content/index.js가 씀
import forbiddenRecordsScript from "./기억의서고-금지된기록-스크립트.md?raw"
import {
  mergeSpreads,
  parseForbiddenRecordsScript,
} from "./parseForbiddenRecordsScript.js"
import { FORBIDDEN_RECORDS_SPREAD_META } from "./spreadMeta.js"

// 원고는 ?raw로 글자째 받아 불러올 때 한 번만 나눔
const sections = parseForbiddenRecordsScript(forbiddenRecordsScript)

export const FORBIDDEN_RECORDS_PAGES = mergeSpreads(
  sections,
  FORBIDDEN_RECORDS_SPREAD_META,
)

export const FORBIDDEN_RECORDS_PAGE_COUNT = FORBIDDEN_RECORDS_PAGES.length

// 쪽 번호를 범위 안으로 맞춰 꺼냄
export function getForbiddenRecordsPage(pageIndex) {
  const safeIndex = Math.min(Math.max(pageIndex, 0), FORBIDDEN_RECORDS_PAGES.length - 1)
  return FORBIDDEN_RECORDS_PAGES[safeIndex]
}