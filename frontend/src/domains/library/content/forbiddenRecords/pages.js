import forbiddenRecordsScript from "./기억의서고-금지된기록-스크립트.md?raw"
import {
  mergeForbiddenRecordsSpreads,
  parseForbiddenRecordsScript,
} from "./parseForbiddenRecordsScript.js"
import { FORBIDDEN_RECORDS_SPREAD_META } from "./spreadMeta.js"

const forbiddenRecordsSections = parseForbiddenRecordsScript(forbiddenRecordsScript)

export const FORBIDDEN_RECORDS_PAGES = mergeForbiddenRecordsSpreads(
  forbiddenRecordsSections,
  FORBIDDEN_RECORDS_SPREAD_META,
)

export const FORBIDDEN_RECORDS_PAGE_COUNT = FORBIDDEN_RECORDS_PAGES.length

export function getForbiddenRecordsPage(pageIndex) {
  const safeIndex = Math.min(Math.max(pageIndex, 0), FORBIDDEN_RECORDS_PAGES.length - 1)
  return FORBIDDEN_RECORDS_PAGES[safeIndex]
}