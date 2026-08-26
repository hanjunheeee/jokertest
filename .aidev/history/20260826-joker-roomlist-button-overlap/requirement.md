\# 방 목록 입장 버튼이 사운드 컨트롤에 가려 클릭 불가 (frontend)



\## 배경 (E2E 실행으로 확인된 실제 UI 버그)

/multiplay의 "선택한 방 입장" 버튼(RoomListShell footer, ROOM\_LIST\_FOOTER\_CLASS)이

우하단 사운드 컨트롤(ModePageControls.jsx의 absolute bottom-4 right-4 래퍼 안 SoundControl)과

겹쳐, 버튼 중앙 클릭이 사운드 위젯에 가로채인다. Playwright 에러 원문:

"<img src=/frame/soundControll/노사운드 표시.png> from <div class=absolute bottom-4 right-4>

subtree intercepts pointer events". 1280×720 뷰포트에서 재현. 실제 유저도 화면 크기에 따라

버튼 일부를 클릭할 수 없다.



\## 요구사항

1\. /multiplay에서 "선택한 방 입장" 버튼과 사운드 컨트롤이 1280×720을 포함한 일반 뷰포트에서

&#x20;  겹치지 않게 한다. 접근 후보: footer에 우측 여백, 사운드 래퍼 위치 조정, z-order 조정 중

&#x20;  시각 변화가 가장 작은 방법을 선택하고 주석으로 근거를 남긴다.

2\. 같은 패턴의 MatchingPageControls.jsx·GameSetupPageControls.jsx(z-30 래퍼)도 해당 화면의

&#x20;  주 조작 버튼(준비완료/게임시작/방 삭제하기, 방 생성 버튼 등)과 겹치는지 확인하고,

&#x20;  겹치면 동일한 방식으로 수정한다. 겹치지 않으면 수정하지 않고 plan에 확인 결과만 남긴다.



\## 수정 금지

\- backend/\*\*, e2e/\*\*

\- SoundControl.jsx 내부 조작 로직(음소거 버튼·볼륨 input의 pointer-events는 유지)



\## 검증

\- 기존 frontend 전체 테스트 PASS, frontend build PASS

