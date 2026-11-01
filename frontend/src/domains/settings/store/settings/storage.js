// 설정 기기 저장소 감싸기 (못 쓰면 메모리로 대신함)·마지막 저장 실패 기록
// 설정 스토어 입구가 모듈마다 한 번 만들어 씀, 실패 기록은 만든 쪽마다 따로 둠
function createMemoryStorage() {
  const memory = new Map()
  return {
    getItem: (name) => (memory.has(name) ? memory.get(name) : null),
    setItem: (name, value) => {
      memory.set(name, value)
    },
    removeItem: (name) => {
      memory.delete(name)
    },
  }
}

// 저장소 묶음 만듦: resolve는 persist가 부르고, 실패 기록은 get/clear로 봄
export function createSettingsStorage() {
  let lastError = null

  const report = (error, message) => {
    lastError = error
    console.warn(`[settings] ${message}`, error)
  }

  // 저장소 접근부터 막힌 경우: 메모리로 돌고 쓸 때마다 실패를 남김
  const unavailable = (error) => {
    const memory = createMemoryStorage()
    report(error, "기기 저장소를 쓸 수 없습니다 — 이번 세션에만 유지됩니다.")

    return {
      getItem: memory.getItem,
      removeItem: memory.removeItem,
      setItem: (name, value) => {
        memory.setItem(name, value)
        report(error, "기기 저장소를 쓸 수 없습니다 — 이번 세션에만 유지됩니다.")
      },
    }
  }

  const resolve = () => {
    try {
      if (typeof localStorage === "undefined") return createMemoryStorage()
    } catch (error) {
      return unavailable(error)
    }

    return {
      // 못 읽거나 JSON이 깨졌으면 저장값 없음으로 보고 기본값으로 시작
      getItem: (name) => {
        let raw
        try {
          raw = localStorage.getItem(name)
        } catch (error) {
          report(error, "기기 저장소를 읽지 못했습니다 — 기본값으로 시작합니다.")
          return null
        }

        if (raw === null) return null

        try {
          JSON.parse(raw)
        } catch {
          return null
        }
        return raw
      },
      // 쓰기 성공하면 실패 기록을 지움, 실패는 던지지 않고 기록만 함
      setItem: (name, value) => {
        try {
          localStorage.setItem(name, value)
          lastError = null
        } catch (error) {
          report(error, "기기 저장에 실패했습니다 — 이번 세션에만 유지됩니다.")
        }
      },
      removeItem: (name) => {
        try {
          localStorage.removeItem(name)
        } catch {
          // 지우기 실패는 다음 저장 때 덮이므로 무시함
        }
      },
    }
  }

  return {
    resolve,
    getError: () => lastError,
    clearError: () => {
      lastError = null
    },
  }
}
