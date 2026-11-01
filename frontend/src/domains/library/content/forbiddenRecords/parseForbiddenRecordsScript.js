// 금지된 기록 원고 md 나누기와 쪽별 정보 합치기
// content/forbiddenRecords/pages.js가 씀
const SECTION_HEADING_PATTERN = /^###\s+/m

// ### 제목 줄마다 한 쪽: 첫 줄은 제목, 나머지는 본문
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

// 원고 쪽과 쪽별 정보(id·오른쪽)를 순번대로 합침
export function mergeSpreads(sections, spreadMeta) {
  // 쪽 수가 다르면 바로 던짐 (원고·정보 어긋남 막기)
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