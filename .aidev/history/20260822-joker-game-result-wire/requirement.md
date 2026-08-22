\# 게임 결과 페이지에 실제 winResult 연결 (frontend)



\## 배경

domains/game/result/에 완성된 결과 페이지(GameResultPage + Shell/Banner/MvpPanel/PlayerList/PlayerRow)가 있으나

useGameResultPreview가 gameResultPreviewData의 고정 더미를 공급한다. backend는 ENDED 시

winResult = { winner: "JOKER"|"CITIZEN", reveals: \[{uuid, nickname, role, team, alive}], mvp: null }를

night\_result\_applied / 재판 판정 broadcast / 세션 스냅샷에 포함한다.

이번 작업은 frontend만 다룬다. backend는 수정하지 않는다. 결과 페이지의 컴포넌트·레이아웃·에셋은 수정하지 않는다.



\## 기존 페이지 계약 (변경 금지)

GameResultPage가 소비하는 shape: { outcome: "win"|"lose", players: \[{id, name, job, portraitSrc}], mvp: player|null }

\- job은 한글 표시명: JOKER→"광대", CITIZEN→"귀족", DOCTOR→"주치의", GUARD→"경비원", WITCH\_HUNTER→"귀족"(임시 — 전용 에셋 추가 시 한 곳만 교체)

\- portraitSrc는 기존 pickInGameJobPortrait 관례를 따른다



\## 요구사항

1\. store: winResult를 { winner, reveals, mvp } 전체로 보존한다. 현재 winner만 취하는 세 파서

&#x20;  (applySessionSnapshot, parseNightResultAppliedPayload, applyTribunalResolved)를 갱신한다.

&#x20;  reveals가 배열이 아니면 빈 배열로 정규화한다.

2\. 순수 함수 utils/buildGameResultViewModel.js:

&#x20;  (winResult, selfUuid) → 위 "기존 페이지 계약" shape.

&#x20;  - outcome: 본인 reveal의 team === winner 이면 "win", 아니면 "lose". 본인이 reveals에 없으면 "lose".

&#x20;  - players 순서는 reveals 순서. id=uuid, name=nickname.

&#x20;  - mvp: winResult.mvp가 null이면 null. GameResultMvpPanel이 null을 받을 때 빈 슬롯으로 렌더되는지

&#x20;    확인하고, null을 처리하지 못하면 mvp 패널 호출부에서만 조건부 렌더한다(패널 내부는 수정 금지).

3\. useGameResultPreview를 대체하는 useGameResultData: store의 winResult·selfUuid에서 view model을 만든다.

&#x20;  winResult가 없으면 null을 돌려주고 페이지는 로비로 리다이렉트한다.

&#x20;  기존 preview 훅과 더미 데이터는 삭제하지 않고 그대로 둔다(개발용 ?outcome= 진입 유지).

&#x20;  GameResultPage는 store에 winResult가 있으면 실데이터, 없고 ?outcome= 쿼리가 있으면 preview를 쓴다.

4\. ENDED 전이: ingame에서 phase가 ENDED가 되고 killReveal 큐(사망 영상)가 모두 끝난 뒤 결과 페이지로

&#x20;  navigate한다. 기존 createGameEndedHandler / useInGameExit의 세션 정리 경로를 깨지 않는다 —

&#x20;  결과 페이지로 이동해도 store의 winResult는 유지되어야 한다(페이지가 읽어야 하므로).

&#x20;  결과 페이지의 나가기 버튼이 기존 로비 복귀 경로로 이어지는지 확인한다.



\## 수정 금지

\- backend/\*\* 전체

\- domains/game/result/components/\*\*, constants/gameResultAssets.js, gameResultLayout.js

\- killReveal 영상 재생 로직

\- DAY Enter-to-send 채팅 관련 코드



\## 검증

\- buildGameResultViewModel 단위 테스트: JOKER 승/CITIZEN 승 × 본인 각 역할 → outcome, job 한글 매핑 5종, reveals 누락/본인 미포함

\- 세 파서 테스트: reveals·mvp 보존, 비배열 reveals → \[]

\- 전이 테스트: ENDED + killReveal 큐 빔 → navigate 호출, 큐 남아있으면 대기

\- 기존 frontend 전체 테스트 PASS, frontend build PASS

