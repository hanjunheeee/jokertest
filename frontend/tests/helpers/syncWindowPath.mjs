// 메모리 라우터 주소를 jsdom 주소(window.location)에 맞춤, 앱은 브라우저 라우터라 둘이 늘 같음
// 판 끝 정리(roomHandlers)·결과 화면 이동(useInGameResultNavigation)·대기방→판 이동(navigateToInGame)이 window.location.pathname을 봐서 화면 시험 도우미가 씀
// 쓰는 법: const off = syncWindowPath(router) → 라우터가 옮길 때마다 window 주소도 같이 바뀜, 시험 끝엔 resetWindowPath()

// 지금 라우터 주소로 맞추고 앞으로 옮길 때마다 따라감 (떼는 함수 돌려줌)
export function syncWindowPath(router) {
  const apply = (location) => window.history.replaceState(null, "", `${location.pathname}${location.search ?? ""}`)
  apply(router.state.location)
  return router.subscribe((state) => apply(state.location))
}

// 시험끼리 안 섞이게 주소를 처음(/)으로
export function resetWindowPath() {
  window.history.replaceState(null, "", "/")
}
