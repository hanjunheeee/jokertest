import forbiddenRecordsScript from "@/domains/library/content/forbiddenRecords/기억의서고-금지된기록-스크립트.md?raw"
import {
  mergeForbiddenRecordsSpreads,
  parseForbiddenRecordsScript,
} from "@/domains/library/content/forbiddenRecords/parseForbiddenRecordsScript.js"
import { FORBIDDEN_RECORDS_SPREAD_META } from "@/domains/library/content/forbiddenRecords/spreadMeta.js"

const forbiddenRecordsSections = parseForbiddenRecordsScript(forbiddenRecordsScript)

/** 금지된 기록 — 책 spread 목록 (좌·우 반페이지, 본문은 md 원고 + spreadMeta) */
export const FORBIDDEN_RECORDS_PAGES = mergeForbiddenRecordsSpreads(
  forbiddenRecordsSections,
  FORBIDDEN_RECORDS_SPREAD_META,
)

export const FORBIDDEN_RECORDS_PAGE_COUNT = FORBIDDEN_RECORDS_PAGES.length

/** spread index로 금지된 기록 페이지를 가져옵니다. */
export function getForbiddenRecordsPage(pageIndex) {
  const safeIndex = Math.min(Math.max(pageIndex, 0), FORBIDDEN_RECORDS_PAGES.length - 1)
  return FORBIDDEN_RECORDS_PAGES[safeIndex]
}
