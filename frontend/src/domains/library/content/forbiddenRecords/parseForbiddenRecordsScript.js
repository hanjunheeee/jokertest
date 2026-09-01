const SECTION_HEADING_PATTERN = /^###\s+/m

/**
 * 금지된 기록 md 원고를 spread 좌측 본문 단위로 파싱합니다.
 * @param {string} raw
 * @returns {{ title: string, body: string }[]}
 */
export function parseForbiddenRecordsScript(raw) {
  return raw
    .trim()
    .split(SECTION_HEADING_PATTERN)
    .filter(Boolean)
    .map((section) => {
      const newlineIndex = section.indexOf("\n")
      const title = (newlineIndex === -1 ? section : section.slice(0, newlineIndex)).trim()
      const body = (newlineIndex === -1 ? "" : section.slice(newlineIndex + 1)).trim()

      return { title, body }
    })
}

/**
 * @param {{ title: string, body: string }[]} sections
 * @param {{ id: string, right: object }[]} spreadMeta
 */
export function mergeForbiddenRecordsSpreads(sections, spreadMeta) {
  if (sections.length !== spreadMeta.length) {
    throw new Error(
      `금지된 기록 원고 spread 수(${sections.length})와 메타 spread 수(${spreadMeta.length})가 일치하지 않습니다.`,
    )
  }

  return sections.map((section, index) => {
    const { id, right } = spreadMeta[index]

    return {
      id,
      left: {
        title: section.title,
        body: section.body,
      },
      right,
    }
  })
}
