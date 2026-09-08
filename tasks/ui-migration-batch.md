# 신버전 UI 이식 배치 (로컬 브랜치 기준, 원격은 소스 창고)

사람 몫(0단계, 배치 전에 끝낸다): 미커밋 revote 작업 커밋 → `frontend/public` 하위 원격 에셋을 추가만(삭제·이동 없음) 커밋 → `.pluto/config.json`의 `verifyCommands`에 `npm run test:game-core --prefix backend` 추가. 그 뒤 아래 `##` 절이 순서대로 슬라이스가 된다. 각 슬라이스 본문에 공통 계약을 복사해 두었다(파이프라인은 `##` 본문만 슬라이스에 넘긴다).

## UI-01 공용 기반 이식 (index.css·shared)

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

원격 신버전 UI는 여러 화면이 공유하는 기반을 추가했다. `frontend/src/app/index.css`에 37줄 추가, `frontend/src/shared`에 상수 2개·훅 2개·UI 컴포넌트 6개 추가, `playerPortraitAssets.js`와 `RangeSlider.jsx` 수정이다. 이후 슬라이스(로비·마이페이지·상점·설정·도서관)가 이 기반을 import한다.

### 요구사항

- 원격의 `shared/constants/playerProfileAssets.js`, `tutorialAssets.js`, `shared/hooks/useFullscreen.js`, `useVideoIntro.js`, `shared/ui/PlayerProfilePortrait.jsx`, `shared/ui/profileBorderZoom/*`, `shared/ui/tutorialGuide/*`를 로컬에 같은 경로로 추가한다.
- `shared/constants/playerPortraitAssets.js`, `shared/ui/RangeSlider.jsx`는 원격 내용으로 갱신하되, 로컬에서 이 두 파일을 import하는 곳이 깨지지 않게 export 이름을 유지한다.
- `app/index.css`에 원격이 추가한 규칙을 더한다. 로컬 기존 규칙은 삭제하지 않는다.
- 로컬 `settings/hooks/useVideoIntro.js`가 있으면 shared 버전으로 통합하고 import 경로를 바꾼다. 동작(인트로 영상 재생·건너뛰기)은 유지한다.

### 성공 조건

- 추가한 shared 파일이 모두 존재하고 production build가 통과한다.
- `RangeSlider`·`playerPortraitAssets`를 쓰는 기존 로컬 화면의 테스트가 그대로 통과한다.
- `useVideoIntro`가 코드베이스에 한 곳만 남는다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/app/index.css`
- `frontend/src/shared/constants/playerPortraitAssets.js`, `playerProfileAssets.js`(신규), `tutorialAssets.js`(신규)
- `frontend/src/shared/hooks/useFullscreen.js`(신규), `useVideoIntro.js`(신규)
- `frontend/src/shared/ui/RangeSlider.jsx`, `PlayerProfilePortrait.jsx`(신규), `profileBorderZoom/*`(신규 4), `tutorialGuide/*`(신규 2)
- `frontend/src/domains/settings/hooks/useVideoIntro.js`(삭제 또는 re-export)

## UI-02 로비 화면 이식

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 `domains/lobby`는 분기 이후 변경이 없다. 원격은 로비 배경·메뉴·프로필 영역·디스코드 버튼과 친구 목록(즐겨찾기 별, 로컬 필터, 폴더·행 레이아웃)을 새로 그렸다. 원격 lobby 변경은 23개 수정, 7개 추가이며 친구 목록 필터는 프론트 로컬 상태만 쓴다(서버 API 변경 없음).

### 요구사항

- 원격 `domains/lobby`의 components·constants·hooks·utils·store 변경을 로컬에 옮긴다. 친구 목록 즐겨찾기·필터는 원격 구현(`useFriendListLocalFilter`, `applyFriendFavoriteFlags`, `filterFriendListItems`, `friend.store.js`)을 가져오되, 기존 친구 동기화(`useFriendListSync`)·검색(`useFriendSearch`)의 서버 호출 계약은 로컬 것을 유지한다.
- 로비 메뉴는 `/library`, `/podium` 항목을 포함한다. 두 라우트는 뒤 슬라이스에서 추가되므로, 이 슬라이스에서는 라우트가 없어도 빌드가 깨지지 않게 링크만 둔다.
- 로비 인트로 영상은 UI-01의 shared `useVideoIntro`를 사용한다.

### 성공 조건

- 로비 페이지가 렌더링되고 메뉴 5개 이상(게임 플레이·상점·도서관·포디움·설정)과 친구 목록 토글이 표시되는 테스트가 통과한다.
- 친구 즐겨찾기 토글과 필터 입력이 목록을 바꾸는 단위 테스트가 통과한다.
- 기존 친구 요청 수락·거절·검색 테스트가 그대로 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/lobby/**` (원격 기준 30개 파일)
- `frontend/src/shared/constants/lobby*` 참조가 있으면 함께

## UI-03 마이페이지·프로필 편집·스킨 카드 이식

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 `domains/user`는 분기 이후 변경이 없다. 원격은 마이페이지 레이아웃·배너·전적 프레임을 다시 그리고 프로필 편집 오버레이, 스킨 카드 착용 오버레이, 프로필 커스터마이징 store를 추가했다(추가 25, 수정 17, 삭제 4). 원격은 프로필 API 응답에서 `title` 필드를 제거했지만 로컬 백엔드는 `title`을 계속 내려준다.

### 요구사항

- 원격 `domains/user`의 components·constants·hooks·store 변경을 로컬에 옮긴다. 원격이 삭제한 4개 파일(`MyPageProfileFrame.jsx`, `bloodRecordFrameStyle.js`, `fateMaskFooterStyle.js`, `myPageBannerLayout.js`)은 참조가 남지 않은 것을 확인한 뒤 삭제한다.
- `useMyProfile`은 로컬 API 응답 계약을 유지한다. 응답에 `title`이 있어도 무시하거나 표시하되, 백엔드·API를 바꾸지 않는다.
- 프로필 편집·스킨 카드 착용은 원격과 같이 프론트 store(`profileCustomization.store.js`, `skinCardWear.store.js`)에만 저장한다. 서버 저장 API를 새로 만들지 않는다.

### 성공 조건

- 마이페이지가 렌더링되고 프로필 편집 오버레이·스킨 카드 착용 오버레이가 열리고 닫히는 테스트가 통과한다.
- 스킨 카드 선택이 store에 반영되고 미리보기가 바뀌는 단위 테스트가 통과한다.
- 로컬 `useMyProfile` 테스트가 있으면 그대로 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/user/**` (원격 기준 46개 파일)

## UI-04 상점 화면 이식

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 `domains/store`는 분기 이후 변경이 없다. 원격은 상점 패널·사이드바를 `components/panel/`로 재구성하고 대량 구매 오버레이, 스킨 확대 오버레이, 재화 잔액 표시, 공지 상수를 추가했다(추가 21, 수정 5, 삭제 3). 결제·재화 API는 없고 모두 프론트 상수·로컬 상태다.

### 요구사항

- 원격 `domains/store`의 변경을 로컬에 옮긴다. 원격이 삭제한 `components/StorePanel.jsx`, `StoreSidebar.jsx`, `constants/storeTabs.js`는 새 위치의 파일로 대체된 뒤 삭제한다.
- 대량 구매 합계는 원격 `calculateBulkPurchaseTotal.js`를 그대로 가져오고 단위 테스트를 붙인다.
- 실제 결제·재화 차감 API를 만들지 않는다. 재화 잔액은 원격과 같이 프리뷰 상수에서 읽는다.

### 성공 조건

- 상점 페이지가 렌더링되고 카테고리 필터가 항목 목록을 바꾸는 테스트가 통과한다.
- 대량 구매 합계 계산 단위 테스트가 통과한다.
- 스킨 확대 오버레이가 열리고 닫히는 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/store/**` (원격 기준 29개 파일)

## UI-05 설정 화면 이식

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 `domains/settings`는 분기 이후 변경이 없다. 원격은 설정 탭·패널 레이아웃을 바꾸고 사운드 탭을 추가했으며 `useVideoIntro`를 shared로 옮겼다(UI-01에서 처리). 변경은 수정 8, 추가 2, 이름 변경 1이다.

### 요구사항

- 원격 `domains/settings`의 components·constants·pages 변경을 로컬에 옮긴다. 사운드 탭(`SoundSettingsTab.jsx`, `soundSettings.js`)을 추가한다.
- 일반 설정의 기존 동작(전체화면·인트로 영상 토글 등 로컬에 있는 항목)은 유지한다. 원격 `useFullscreen`(UI-01)을 사용한다.
- 사운드 값은 원격과 같이 프론트 상태에만 저장한다. 서버 저장을 만들지 않는다.

### 성공 조건

- 설정 페이지에서 일반·사운드 탭 전환이 되는 테스트가 통과한다.
- 슬라이더 조작이 상태에 반영되는 단위 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/settings/**` (원격 기준 11개 파일)

## UI-06 도서관 화면 신설

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬에는 `domains/library`가 없다. 원격은 책 형태의 도서관 화면(목차·북마크 탭·페이지 이동, 금서 기록 스프레드, 초대된 손님 스프레드)을 51개 파일로 추가했고 라우트 `/library`를 등록했다. 모든 데이터는 프론트 상수다.

### 요구사항

- 원격 `domains/library` 전체를 로컬에 추가하고 `app/routes/index.jsx`에 `/library` 라우트를 ProtectedRoute 아래에 등록한다.
- 서버 API를 만들지 않는다. 직업 통계·랭킹은 원격과 같이 프리뷰 상수에서 읽는다.
- UI-01의 shared 컴포넌트(`ProfileBorderZoom*`, `PlayerProfilePortrait`)를 사용한다.

### 성공 조건

- `/library`가 렌더링되고 목차에서 두 스프레드(금서 기록·초대된 손님)로 이동하는 테스트가 통과한다.
- 페이지 이동 훅 또는 상태의 단위 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/library/**` (신규 51개 파일)
- `frontend/src/app/routes/index.jsx`

## UI-07 포디움 화면 신설

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬에는 `domains/podium`이 없다. 원격은 포디움(랭킹) 화면을 16개 파일로 추가했고 라우트 `/podium`을 등록했다. 데이터는 프론트 상수다.

### 요구사항

- 원격 `domains/podium` 전체를 로컬에 추가하고 `/podium` 라우트를 ProtectedRoute 아래에 등록한다.
- 서버 API를 만들지 않는다.

### 성공 조건

- `/podium`이 렌더링되는 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/podium/**` (신규 16개 파일)
- `frontend/src/app/routes/index.jsx`

## UI-08 방 목록·방 코드·게임 설정 화면 이식 (로컬 로직 유지)

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

이 영역은 양쪽 모두 손댔다. 로컬은 L1(방 코드 입장 배선·잘못된 payload 거부), QA1(방 목록 코드 표시), QA2(모바일 코드 입력), revote(역할 구성 `roleComposition`, `gameSetupOptions`)를 구현했고 `matching/utils/roomCode.js`, `mode/hooks/useRoomCodeInput.js`에 테스트가 있다. 원격은 `RoomListRow`, `RoomListShell`, `RoomCodeInput`, `MultiplayEntryPage`, `GameSetupPanel`, `RoleCompositionSection`을 새 레이아웃으로 그렸고 자체 `sanitizeRoomCode.js`와 `useRoomCodeInput` 변경을 넣었다.

### 요구사항

- 원격의 컴포넌트 레이아웃(`RoomListRow`, `RoomListShell`, `RoomCodeInput`, `MultiplayEntryPage`, `RoomCodeViewModal`, `GameSetupPanel`, `RoleCompositionSection`, `roomListLayout.js`)을 옮기되, props 계약은 로컬 훅에 맞춘다.
- 로컬 `useRoomCodeInput.js`, `useRoomInvitePage.js`, `useMatchingRoom.js`, `matching/utils/roomCode.js`, `setup/utils/roleComposition.js`, `buildCreateRoomPayload.js`, `setup/constants/gameSetupOptions.js`, `roleComposition.js`는 로직을 바꾸지 않는다. 원격 `sanitizeRoomCode.js`와 원격 `useRoomCodeInput` 변경은 가져오지 않는다.
- 원격 `useSetupContentScrollOnRoleModeChange.js`는 순수 스크롤 훅이므로 가져온다.
- 360×800, 390×844에서 방 코드 입력·제출이 가로 잘림 없이 가능해야 한다(QA2 계약).

### 성공 조건

- 로컬 `useRoomCodeInput.test.js`, `roomCode.test.js`, `roleComposition.test.js`, `buildCreateRoomPayload.test.js`, `useRoleCompositionState.test.js`가 수정 없이 통과한다.
- 방 목록 행이 방 코드를 표시하고, 코드 입력이 로컬 훅의 정규화 결과를 제출하는 테스트가 통과한다.
- 모바일 두 뷰포트에서 방 코드 입력 화면을 실제 브라우저로 확인하고 스크린샷을 남긴다. 확인하지 못하면 미검증으로 표기한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/mode/components/**`, `mode/constants/roomListLayout.js`, `mode/pages/MultiplayEntryPage.jsx`
- `frontend/src/domains/game/matching/components/RoomCodeViewModal.jsx`
- `frontend/src/domains/game/setup/components/GameSetupPanel.jsx`, `RoleCompositionSection.jsx`, `setup/hooks/useSetupContentScrollOnRoleModeChange.js`(신규)

## UI-09 게임 결과 화면 이식 (로컬 winResult 연결)

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 결과 페이지는 아직 `useGameResultPreview` 더미 데이터만 쓴다. 로컬 store에는 서버가 내려준 `state.winResult`가 이미 있다(pluto R1·applySessionSnapshot). 원격은 결과 화면을 인트로 영상·승리 팀 배지·로스터 카드로 다시 그리고, `useGameResultData`가 `state.winResult`와 `state.self.uuid`로 view model을 만든다. 원격 `useGameResultLobbyExit`·`createGameResultExitRequest`는 원격 서버 계약(종료 세션 정리)에 맞춘 것이므로 그대로 가져오지 않는다.

### 요구사항

- 원격 결과 화면 컴포넌트·상수·`buildGameResultViewModel`·`useGameResultData`를 옮긴다. `buildGameResultViewModel`은 로컬 `winResult` 실제 형태(백엔드 `gameSession.js`가 만드는 구조)에 맞춰 조정하고, 형태 차이가 있으면 view model 쪽을 고친다.
- 로비로 돌아가기는 로컬의 기존 종료 경로(`useInGameExit` 또는 현재 결과 페이지가 쓰는 방식)를 사용한다. 원격 `useGameResultLobbyExit`는 가져오지 않는다.
- `?outcome=` 프리뷰 진입은 원격과 같이 유지한다.
- 승리 팀·개인 승패·역할 공개는 게임이 ENDED일 때만 표시한다. 진행 중 게임의 역할을 노출하지 않는다.

### 성공 조건

- 로컬 백엔드가 만드는 `winResult` 샘플로 `buildGameResultViewModel` 단위 테스트가 통과한다.
- store에 `winResult`가 있으면 실데이터, 없고 `?outcome=`이면 프리뷰, 둘 다 없으면 로비로 돌려보내는 페이지 테스트가 통과한다.
- 결과 화면의 로비 이동이 로컬 종료 경로를 호출하는 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/result/**` (원격 기준 24개 중 `useGameResultLobbyExit*`, `createGameResultExitRequest*` 제외)

## UI-10 인게임 플레이어 보드·카드·명판 이식

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬은 서버가 배정한 `colorIndex`를 snapshot과 이벤트로 받아 store에 두고 있으며 `assignInGamePlayerThemeIndices`, `buildInGamePreviewPlayers`, `mergeSourcePlayerWithPreview`, `buildPlayerSessionSourceFromGameState`가 플레이어 표시 데이터를 만든다. 원격은 플레이어 카드·보드 레이아웃, 명판(`InGamePlayerNameplate`), 카드 테마 스타일(`resolveInGamePlayerCardThemeStyles`, `buildInGamePlayerNameplateStyle`), 에셋 상수를 새로 그렸고 에셋 경로를 `shopItem/player-card/`, `shopItem/basic/`으로 옮겼다.

### 요구사항

- 원격 `components/board/*`, `constants/board/*`, `constants/ingamePlayerTheme.js`, `constants/ingamePlayerAssets.js`, `utils/resolveInGamePlayerCardThemeStyles.js`, `utils/buildInGamePlayerNameplateStyle.js`를 옮긴다.
- 색상은 로컬 store의 `colorIndex`만 쓴다. 원격 컴포넌트가 다른 이름의 필드를 읽으면 로컬 데이터 유틸(`mergeSourcePlayerWithPreview` 등)의 출력에 맞춰 컴포넌트 쪽을 고친다. 로컬 유틸의 로직과 테스트는 유지한다.
- 에셋 경로 상수를 0단계에서 추가한 새 경로로 바꾼다. 옛 경로 파일은 아직 삭제하지 않는다(UI-15).
- 사망·생존 프레임, 자기 자신 강조, 역할 공개 상태는 로컬 `isAlive`·`self` 기준으로 결정한다.

### 성공 조건

- 로컬 `InGamePlayerCard.playerColor.test.js`(있으면)와 board 관련 테스트가 통과하고, 새 명판이 `colorIndex`별 스타일을 내는 단위 테스트가 통과한다.
- 로컬 `mergeSourcePlayerWithPreview.test.js`, `buildPlayerSessionSourceFromGameState.test.js`, `buildInGamePreviewPlayers.test.js`가 수정 없이 통과한다.
- 참조하는 모든 에셋 경로가 `frontend/public`에 실제로 존재함을 스크립트나 테스트로 보인다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/ingame/components/board/**`
- `frontend/src/domains/game/ingame/constants/board/**`, `ingamePlayerTheme.js`, `ingamePlayerAssets.js`, `ingameAssets.js`
- `frontend/src/domains/game/ingame/utils/resolveInGamePlayerCardThemeStyles.js`(신규), `buildInGamePlayerNameplateStyle.js`(신규)

## UI-11 인게임 상단 컨트롤·사이드 패널·인게임 설정·기록 패널 이식

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

원격은 인게임 상단 컨트롤에 설정 버튼을 추가하고, 공용 사이드 패널(`SidePanel`, `SidePanelHeader`), 인게임 설정 패널(채팅·방·사운드 탭, 슬라이더·체크박스 행, 강퇴 모달), 플레이어 기록 패널 재구성을 넣었다(controls 컴포넌트 18개, 상수 11개). 강퇴 모달은 원격에서도 소켓을 호출하지 않는 UI 전용이며 방장 여부는 `useInGameSettingIsHost`가 store의 `hostUuid`로 판단한다. 로컬 store에는 `hostUuid`가 없을 수 있다.

### 요구사항

- 원격 `components/controls/**`, `constants/controls/**`, `hooks/useInGameSettingIsHost.js`를 옮기고 `InGameTopControls`에 설정 버튼을 추가한다.
- 방장 판단은 로컬 store 또는 matching store에 이미 있는 방장 정보를 읽는다. 없으면 강퇴 탭을 숨기고 `unsure`에 기록한다. 서버 강퇴 이벤트를 새로 만들지 않는다.
- 플레이어 기록 패널은 로컬 데이터 소스(현재 `PlayerRecordListPanel`이 읽는 것)를 유지한다. 원격이 삭제한 `PlayerRecordListHeader.jsx`, `ingamePlayerRecordListAssets.js`는 참조가 없어진 뒤 삭제한다.
- 인게임 설정의 사운드 값은 UI-05의 설정 상태와 같은 store를 쓴다.

### 성공 조건

- 상단 컨트롤의 메뉴·설정 버튼이 각각 기록 패널·설정 패널을 열고 서로 배타적으로 닫히는 테스트가 통과한다.
- 설정 패널 탭 전환과 슬라이더 반영 테스트가 통과한다.
- 방장이 아닐 때 강퇴 UI가 보이지 않는 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/ingame/components/controls/**`
- `frontend/src/domains/game/ingame/constants/controls/**`
- `frontend/src/domains/game/ingame/hooks/useInGameSettingIsHost.js`(신규)

## UI-12 인게임 액션 패널·대상 선택·양피지 모달 이식 (로컬 revote 유지)

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 액션 패널은 `useInGameActionPanel`, `useInGameDayVoteSubmit`, `buildDayVoteTargets`, `buildNightActionTargets`, `dayVoteRound`, `ingameActionPanel.js` 상수로 낮 투표·재투표·밤 행동을 구현했고 `liveRevoteControls.test.js`, `ingameActionPanel.test.js`, `useInGameActionPanel.test.js`로 고정했다. 원격은 `InGameActionPanel`, `InGameTargetPicker`의 레이아웃과 양피지 모달(`InGameParchmentModalAnimated`, `InGameParchmentModalBase`, `InGameParchmentConfirmButton`, motion·variants 상수)을 새로 그렸다. 원격 액션 패널 내부의 대상 계산·단계 판정은 원격 게임 로직에 묶여 있다.

### 요구사항

- 원격 `components/actions/*`, `components/parchment/*`, `constants/parchment/*`의 레이아웃·애니메이션을 옮기되, 패널이 읽는 상태와 호출하는 핸들러는 로컬 `useInGameActionPanel`·`useInGameDayVoteSubmit`이 내는 것만 쓴다.
- 로컬 `hooks/useInGameActionPanel.js`, `useInGameDayVoteSubmit.js`, `utils/buildDayVoteTargets.js`, `buildNightActionTargets.js`, `dayVoteRound.js`, `constants/actions/ingameActionPanel.js`의 로직은 바꾸지 않는다. 표시용 라벨·에셋 키 추가만 허용한다.
- 재투표 라운드(현재 라운드, 동률 대상 축소, 기권)가 새 패널에 표시된다.
- 사망 self는 패널 비활성, 생존 self는 준비·대상 선택·제출 가능(QA4 계약).
- 로컬 `InGameVoteStatusPanel`(투표 현황)은 유지한다.

### 성공 조건

- `liveRevoteControls.test.js`, `ingameActionPanel.test.js`, `useInGameActionPanel.test.js`, `useInGameActionPanel.canonicalAlive.test.js`가 로직 수정 없이 통과한다.
- 동률 → 재투표 → 처형 시나리오에서 새 패널의 대상 목록이 `buildDayVoteTargets` 결과와 같은 테스트가 통과한다.
- 양피지 모달 열림·확인·닫힘 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/ingame/components/actions/**`, `components/parchment/**`
- `frontend/src/domains/game/ingame/constants/parchment/**`, `constants/actions/ingameActionPanel.js`(라벨·에셋 키만)

## UI-13 인게임 배경·타임바·페이지 조립 이식 (로컬 데이터 흐름 유지)

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 `InGamePage`는 서버 주도 밤 턴(`selectInGameNightTurnRole`, `selectInGameNightTurnDeadline`, `useInGameNightTurnCountdown`)을 타임바에 넘기고, `useInGameSessionSnapshotSync`의 `checking` 상태 동안 리다이렉트를 보류한다(QA3). 원격 `InGamePage`는 `InGameBackground` 컴포넌트, 설정 패널 연결, 타임바 `statusMessage`(원격 은닉 릴에서 파생)를 쓴다. 타임바의 밤 턴 표시는 로컬 값이 기준이다.

### 요구사항

- 원격 `InGameBackground.jsx`, `components/timebar/*`, `constants/timebar/*`의 레이아웃·에셋을 옮긴다.
- `InGamePage`는 로컬 구조를 유지한다. 유지 항목: `snapshotSyncStatus === "checking"` 리다이렉트 보류, `nightTurnRole`·`nightTurnRemainingSec` 전달, `InGameVoteStatusPanel`, 로컬 오버레이 스택 호출. 추가 항목: `InGameBackground`, UI-11의 설정 패널 열기.
- 타임바 상태 문구는 로컬 `nightTurnRole`과 phase에서 만든다. 원격 `selectInGameTimebarStatusMessage`를 가져오려면 로컬 값을 입력으로 받도록 바꾸고, 원격 `nightTurn.statusRole`·릴 계산은 가져오지 않는다.
- 사망한 역할 보유자의 정보가 타임바 문구로 새지 않아야 한다. 로컬 S1-4 은닉 테스트 기준을 따른다.

### 성공 조건

- 로컬 `useInGameNightTurnAnnouncement.test.js`, `useInGameOverlayStack.nightTurn.test.js`, `selectInGameNightTurnDeadline.test.js`, `useInGameActionPanel.canonicalAlive.test.js`, `dayTwoVoteAliveScenario.test.js`가 수정 없이 통과한다.
- 타임바가 phase·dayIndex·밤 턴 역할·남은 시간을 표시하는 테스트가 통과한다.
- 새로고침 후 `checking` 동안 리다이렉트하지 않는 기존 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/ingame/pages/InGamePage.jsx`
- `frontend/src/domains/game/ingame/components/InGameBackground.jsx`, `components/timebar/**`
- `frontend/src/domains/game/ingame/constants/timebar/**`, `utils/selectInGameTimebarStatusMessage.js`(신규, 로컬 입력)

## UI-14 인게임 오버레이 이식 (역할 공개·페이즈 진입·밤 턴 안내·사망 연출·개인 결과)

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

로컬 오버레이 스택(`useInGameOverlayStack`)은 역할 공개·페이즈 진입·밤 턴 안내를 서버 이벤트 순서로 제어한다. 원격은 이 세 오버레이의 레이아웃·에셋을 바꾸고, 사망 연출(`InGameKillRevealOverlay`, 영상 `video-direction/kill-animation.mp4`)과 밤 개인 결과(`InGameNightPrivateResultOverlay`)를 추가했다. 로컬 백엔드는 `night_action_result`(본인에게만 가는 개인 결과)와 `night_result_applied`를 이미 보내지만, 로컬 프론트 소켓 훅은 `night_action_result`를 아직 받지 않는다.

### 요구사항

- 원격 `roleReveal`, `phaseEntrance`, `nightTurn` 오버레이 컴포넌트·상수의 레이아웃을 옮기되 props는 로컬 `useInGameOverlayStack`이 내는 것만 쓴다. 로컬 오버레이 스택 로직은 바꾸지 않는다.
- 사망 연출: 로컬 `night_result_applied`·재판 처형 결과에서 사망자를 읽어 `InGameKillRevealOverlay`를 띄운다. 원격 `reduceInGameKillReveal`은 로컬 payload 형태에 맞춰 조정한다. 결과 페이지 이동은 연출이 끝난 뒤로 미룬다(로컬 이동 경로 유지).
- 밤 개인 결과: 로컬 백엔드가 보내는 `night_action_result` payload를 `useGameSessionSocketEvents`에서 받아 store 최상위 `nightPrivateResult`에 저장하고 오버레이에 넘긴다. payload 형태는 로컬 `backend/socket/gameSession.js`가 보내는 것을 기준으로 하고 서버는 바꾸지 않는다. 결과는 본인 것만 저장한다.
- `nightPrivateResult`는 오버레이 확인, NIGHT 재진입, gameId 변경에서만 비운다. `night_result_applied`로는 비우지 않는다.

### 성공 조건

- 로컬 `useInGameOverlayStack*.test.js`, `useInGameNightTurnAnnouncement.test.js`, `useInGameResolveNight.test.js`가 수정 없이 통과한다.
- 로컬 `night_action_result` payload 샘플로 오버레이가 조사/보호 결과 문구를 표시하고, 타인 결과는 store에 들어가지 않는 테스트가 통과한다.
- 밤 사망자 1명·2명·0명 각각에서 사망 연출이 순서대로 재생되고 결과 이동이 끝까지 보류되는 테스트가 통과한다.
- 이벤트 순차 적용과 snapshot 복구에서 `nightPrivateResult`가 유실되지 않는 테스트가 통과한다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/ingame/components/roleReveal/**`, `phaseEntrance/**`, `nightTurn/**`, `killReveal/**`(신규), `nightPrivateResult/**`(신규)
- `frontend/src/domains/game/ingame/constants/roleReveal/**`, `phaseEntrance/**`, `nightTurn/*Layout.js`, `killReveal/**`(신규), `nightPrivateResult/**`(신규)
- `frontend/src/domains/game/ingame/hooks/useGameSessionSocketEvents.js`(`night_action_result` 수신 추가), `store/ingameStore.js`(`nightPrivateResult` 필드 추가)
- `frontend/src/domains/game/ingame/utils/reduceInGameKillReveal.js`(신규), `reduceInGameNightPrivateResult.js`(신규)

## UI-15 인게임 채팅 색상·에셋 경로 정리·옛 에셋 삭제

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다. 단, 이 슬라이스(UI-15)만 참조가 없는 옛 에셋 파일 삭제를 허용한다.

### 배경

원격은 채팅 메시지 행에 플레이어 색상을 적용했고(`InGameChatShell`, `InGameChatMessageRow.playerColor.test.js`), 에셋 28개를 `frame/ingame-playercard/*`·`button/friendList/*`·`assets/ingame/*`에서 `shopItem/*`·`video-direction/*`로 옮기고 26개를 삭제했다. 0단계에서 새 경로 파일만 추가했으므로 옛 경로 파일이 아직 남아 있다.

### 요구사항

- 채팅 행에 로컬 `colorIndex` 기반 색상을 적용한다. 로컬 채팅 채널 규칙(`inGameChatChannel`, 역할 채팅 권한)은 바꾸지 않는다.
- `frontend/src`에서 `publicAsset(...)`과 에셋 상수가 참조하는 모든 경로가 `frontend/public`에 존재함을 검사하는 테스트를 추가한다.
- 원격이 삭제·이동한 옛 경로 파일 중 `frontend/src`에서 더 이상 참조하지 않는 것만 삭제한다. 참조가 남아 있으면 삭제하지 않고 참조를 새 경로로 바꾼다.

### 성공 조건

- 에셋 참조 존재 검사 테스트가 통과한다.
- 채팅 색상 테스트(원격 `InGameChatMessageRow.playerColor.test.js`를 로컬 데이터 형태로 조정)가 통과한다.
- 로컬 `inGameChatChannel.test.js`와 채팅 권한 테스트가 수정 없이 통과한다.
- 삭제한 파일 목록과 각 파일의 참조 없음 근거를 커밋 메시지 또는 `docs/qa`에 남긴다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `frontend/src/domains/game/ingame/components/chat/**`
- 에셋 경로를 참조하는 상수 파일(수정 필요한 것만)
- `frontend/public/**` 옛 경로 파일 삭제
- 에셋 존재 검사 테스트(신규)

## UI-16 신버전 UI 전체 흐름 실제 브라우저 회귀 검증

### 공통 계약

- 기준 브랜치는 로컬(현재 브랜치)이다. 원격 `origin/feature/ui-Phase1complete`는 UI 소스 창고로만 쓴다. `git merge`, `git cherry-pick`, `git checkout <원격> -- <경로>`로 통째로 덮는 방식은 금지한다. 필요한 파일은 `git show origin/feature/ui-Phase1complete:<경로>`로 읽어 내용을 옮기고, 로컬에 이미 있는 파일은 로컬 로직을 유지한 채 표현 부분만 바꾼다.
- 게임 규칙·소켓 이벤트·store 상태 전이·훅의 데이터 흐름은 로컬 구현이 기준이다. 원격이 같은 문제를 다르게 푼 로직(밤 턴 은닉 계산, 밤 개인 결과 병렬 필드, 방 코드 검증, 결과 화면 종료 요청 등)은 가져오지 않는다. 원격 UI가 로컬에 없는 데이터를 요구하면 서버를 바꾸지 말고 계획 단계 `unsure`에 남기고, 해당 표시만 비활성화한 채 나머지를 완성한다.
- 백엔드(`backend/**`), DB schema/migration, 인증, 외부 서비스는 변경하지 않는다.
- 기존 로컬 테스트는 삭제하지 않는다. 표현 변경으로 테스트 수정이 필요하면 검증 대상 행동은 그대로 두고 셀렉터·문구만 맞춘다.
- 다른 플레이어의 역할·밤 행동 비밀을 클라이언트 state, 로그, 화면에 새로 노출하지 않는다.
- `npm test --prefix frontend`, `npm run build --prefix frontend`, `npm run test:game-core --prefix backend`가 통과해야 한다. 다른 명령으로 대체하지 않는다.
- 에셋은 0단계에서 이미 `frontend/public`에 추가돼 있다. 슬라이스는 에셋 파일을 만들거나 옮기지 않고 경로 상수만 바꾼다.

### 배경

UI-01~UI-15로 화면을 모두 이식했다. 단위 테스트는 화면 조각을 검증하지만, 로그인부터 결과까지 한 판이 신버전 UI에서 로컬 게임 규칙대로 진행되는지는 실제 브라우저로만 확인할 수 있다. 로컬에는 QA3·QA4·QA5에서 쓴 실제 브라우저 검증 절차와 `docs/qa` 기록 형식이 있다.

### 요구사항

- 로그인 → 로비 → 방 생성/코드 입장 → 게임 설정 → 역할 공개 → 밤 턴(서버 주도) → 밤 개인 결과 → 낮 토론/투표 → 재투표 → 처형 → 사망 연출 → 결과 화면 → 로비 복귀를 실제 브라우저에서 한 판 수행한다. 참가 인원은 로컬 게임 설정의 최소 인원으로 한다.
- 새로고침 후 세션 복구(QA3), 생존 self 낮 조작 가능·사망 self 잠금(QA4)을 같은 판에서 확인한다.
- 각 화면 스크린샷과 발견한 결함을 `docs/qa`에 기록한다. 결함 수정은 이 슬라이스에서 하지 않고 목록으로 남긴다.
- DB나 서버를 기동하지 못해 검증하지 못한 단계는 미검증으로 표기하고 통과로 꾸미지 않는다.

### 성공 조건

- `docs/qa`에 단계별 스크린샷과 결과(통과/결함/미검증)가 기록된 문서가 생긴다.
- 기록된 결함 각각에 재현 절차와 관련 화면이 적혀 있다.
- 코드 변경은 없거나 `docs/qa` 기록에 한정된다.
- frontend 전체 테스트·production build·backend game-core 테스트가 통과한다.

### 예상 범위

- `docs/qa/**` (신규 기록 문서·스크린샷)
