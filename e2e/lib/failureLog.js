/**
 * soft-assert의 순수 축 — 실패를 던지지 않고 모아 두었다가 시나리오 끝에서 한 번에 요약한다.
 *
 * 관측 검증(문구·활성 상태·대상 목록)은 어긋나도 그 자리에서 멈출 이유가 없다. 한 번의 재생에서
 * 무엇이 어긋났는지 전부 보는 편이 열 번 다시 돌리는 것보다 낫기 때문이다. 반대로 진행 동작
 * (제출·집계·전이)은 실패하면 그 뒤 관측이 전부 무의미해지므로 절대 여기 담지 않는다.
 *
 * playwright에 의존하지 않아 node:test로 그대로 검증된다.
 */

/**
 * 실패 항목 하나를 표시 가능한 형태로 정규화한다.
 * @param {{step:string, seatLabel:string, message:unknown}} entry 기록 요청
 * @flow message가 Error면 message 문자열만 남긴다 — 스택은 playwright의 trace·콘솔이 이미
 *   갖고 있고, 요약은 "어느 단계의 어느 좌석에서 무엇이 어긋났는지" 한 줄이면 충분하다.
 */
function normalizeEntry(entry) {
  const raw = entry?.message
  const message = raw instanceof Error ? raw.message : String(raw ?? "")
  return {
    step: String(entry?.step ?? "(단계 없음)"),
    seatLabel: String(entry?.seatLabel ?? "(좌석 없음)"),
    message: message.trim().length > 0 ? message.trim() : "(메시지 없음)",
  }
}

/**
 * 수집한 실패 항목들을 여러 줄 요약 문자열로 만든다(순수 함수).
 * @param {Array<{step:string, seatLabel:string, message:string}>} entries 실패 항목 목록
 * @flow 비어 있으면 빈 문자열이다 — 호출부가 "요약이 비었으면 성공"으로 판단할 수 있게 한다.
 *   첫 줄에 건수를 두어 목록이 길어져도 몇 건인지 스크롤 없이 보이게 한다.
 */
export function formatFailureSummary(entries) {
  const list = Array.isArray(entries) ? entries : []
  if (list.length === 0) return ""
  const lines = list.map((entry) => `  - [${entry.step}] ${entry.seatLabel}: ${entry.message}`)
  return [`관측 검증 ${list.length}건이 실패했습니다:`, ...lines].join("\n")
}

/**
 * 실패를 모으는 수집기를 만든다. 던지지 않고 기록만 하며, 판단은 호출부가 마지막에 한 번 한다.
 * @flow 내부 배열은 밖으로 새지 않는다 — entries()는 항상 복사본을 돌려주므로 호출부가 뒤에서
 *   배열을 오염시켜 요약을 조작할 수 없다.
 * @returns {{record:Function, entries:Function, hasFailures:Function, summary:Function}}
 */
export function createFailureLog() {
  const entries = []

  return {
    /**
     * 실패 한 건을 기록한다.
     * @param {{step:string, seatLabel:string, message:unknown}} entry 단계·좌석·메시지
     */
    record(entry) {
      entries.push(normalizeEntry(entry))
    },
    /** 지금까지 기록한 실패 항목의 복사본. */
    entries() {
      return entries.map((entry) => ({ ...entry }))
    },
    /** 실패가 한 건이라도 있는가. */
    hasFailures() {
      return entries.length > 0
    },
    /** 지금까지의 실패를 여러 줄 요약으로 만든다(없으면 빈 문자열). */
    summary() {
      return formatFailureSummary(entries)
    },
  }
}
