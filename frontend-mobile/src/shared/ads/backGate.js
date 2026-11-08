// 뒤로 가기(popstate)를 라우터보다 먼저 받는 문: 문지기 함수가 걸려 있을 때만 가로채고 라우터엔 안 넘김
// main.jsx가 App(라우터 만들기)보다 먼저 불러 등록, useBackClose가 문지기 함수를 걸고 뗌
// 이유: 결과 화면은 뒤로 가기를 막고 "게임에서 나가시겠습니까?"를 띄움, 같은 칸 POP이면 새로고침까지 됨
//       window의 popstate는 등록 순서대로 불려서(capture 소용없음) 라우터보다 먼저 등록해야 함

// 문지기 자리는 window에 하나 (개발 서버가 이 파일을 다시 읽어도 같은 자리)
const box = typeof window !== "undefined" ? (window.__mmcBackGate ??= { handler: null, installed: false }) : { handler: null }

// 문지기 함수 걸기 (null이면 평소처럼 라우터가 받음)
export function setBackGate(handler) {
    box.handler = typeof handler === "function" ? handler : null
}

// 처음 한 번만 등록
if (typeof window !== "undefined" && !box.installed) {
    box.installed = true
    window.addEventListener("popstate", (event) => {
        if (!box.handler) return
        event.stopImmediatePropagation()
        box.handler(event)
    })
}
