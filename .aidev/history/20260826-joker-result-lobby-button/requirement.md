\# 결과 페이지 로비 복귀 버튼 (frontend)



\## 배경

게임 결과 페이지(domains/game/result/page/GameResultPage.jsx)에 로비로 돌아가는 버튼이 없어

유저가 F5로만 탈출할 수 있다. backend는 leave\_game\_session(ack 방식)을 제공하며 멱등이다 —

이미 정리된 세션에 대해서도 { ok: true }를 반환한다. 직전 slice로 ENDED 세션 재접속 시

자동 정리도 들어갔지만, 정상 이탈 경로는 여전히 필요하다.

이번 작업은 frontend만 다룬다. backend는 수정하지 않는다.



\## 요구사항

1\. 결과 페이지에 "로비로" 버튼을 추가한다. 저장소에 이미 있는 빨간색 버튼 에셋/컴포넌트를

&#x20;  찾아 재사용한다(frontend/public/button/ 및 기존 버튼 컴포넌트를 조사할 것) — 새 버튼

&#x20;  스타일을 만들지 않는다. 기존 컴포넌트(GameResultShell/Banner/MvpPanel/PlayerList/PlayerRow)는

&#x20;  수정하지 않는다 — 버튼은 GameResultPage 수준에서 배치한다.

2\. 버튼 동작: store의 gameId로 leave\_game\_session을 emit(ack 대기)하고, 성공/실패/타임아웃

&#x20;  어느 경우든 로비 경로로 navigate한다(이탈이 실패해도 유저를 결과 페이지에 가두지 않는다).

&#x20;  기존 ingame의 나가기 관례(createLeaveGameSessionRequest / createSessionEndFinalizer /

&#x20;  useInGameExit)에 재사용 가능한 경로가 있으면 재사용한다.

3\. navigate 후 store의 게임 상태(winResult 포함)를 정리한다 — 기존 clearGame/세션 정리 액션이

&#x20;  있으면 재사용한다.

4\. preview 모드(?outcome=)에서도 버튼이 보이되, gameId가 없으면 emit 없이 바로 navigate한다.



\## 수정 금지

\- backend/\*\* 전체

\- domains/game/result/components/\*\*

\- killReveal / 결과 페이지 전이(useInGameResultNavigation) 로직



\## 검증

\- 버튼 동작 단위 테스트: gameId 있음 → leave emit 후 navigate, ack 실패/타임아웃 → 그래도 navigate,

&#x20; gameId 없음(preview) → emit 없이 navigate, navigate 후 winResult 정리

\- 기존 frontend 전체 테스트 PASS, frontend build PASS

