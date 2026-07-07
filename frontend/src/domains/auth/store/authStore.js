/**
 * @file authStore.js
 * @desc 로그인 상태와 유저 정보를 관리하는 Zustand 스토어. localStorage에 persist됩니다.
 *
 * Zustand는 useState처럼 컴포넌트 안에 값을 두는 대신, 컴포넌트 트리 밖에
 * "전역 상태 저장소"를 하나 만들어 여러 컴포넌트가 함께 구독하도록 해주는
 * 상태 관리 라이브러리입니다. create()가 반환하는 useAuthStore가 바로 그
 * 저장소를 사용하기 위한 훅입니다.
 *
 * 이 스토어가 제공하는 것:
 * - state: isLoggedIn(로그인 여부), user(로그인한 사용자 정보)
 * - actions(함수): login(user)로 로그인 처리, logout()으로 로그아웃 처리
 *   (login/logout은 내부적으로 set(...)을 호출해 state를 갱신함)
 *
 * persist 미들웨어로 감싸져 있어서, 위 state가 브라우저 localStorage에도
 * 자동 저장/복원됩니다("auth-storage" 키). 그래서 새로고침해도 로그인
 * 상태가 유지됩니다. partialize는 저장할 필드를 isLoggedIn·user로 제한합니다.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LOBBY_INTRO_SESSION_KEY } from "@/domains/lobby/hooks/useLobbyIntro";

export const useAuthStore = create(
    persist(
        (set) => ({
            isLoggedIn: false,
            user:       null,
            // 사용자가 "직접" 로그아웃 버튼을 눌러서 인증이 풀린 것인지 표시하는 플래그.
            // ProtectedRoute가 "로그인이 필요한 페이지입니다" alert를 띄울지 말지 이 값으로
            // 판단합니다 — 미인증 상태로 페이지에 곧바로 접근한 경우와 구분하기 위함.
            loggedOutIntentionally: false,
            login: (user) => {
                // 로그인마다 인트로 기록을 초기화해 이번 세션에서 정확히 한 번 재생되도록 보장
                localStorage.removeItem(LOBBY_INTRO_SESSION_KEY);
                // 로그인 성공 시 플래그를 항상 초기화 — 다음 로그아웃 전까지 false를 보장
                return set({ isLoggedIn: true, user, loggedOutIntentionally: false });
            },
            logout: () => {
                localStorage.removeItem(LOBBY_INTRO_SESSION_KEY);
                // isLoggedIn을 내리는 동시에 "의도된 로그아웃"임을 표시
                return set({ isLoggedIn: false, user: null, loggedOutIntentionally: true });
            },
            // 로그인 페이지가 마운트된 뒤(LoginPage의 마운트 effect에서) 호출해 플래그를 되돌리는 액션.
            // ProtectedRoute 스스로가 자기 판단 effect 안에서 이 액션을 호출하면, 언마운트되기
            // 전에 한 번 더 리렌더→effect 재실행이 일어나 alert가 뒤늦게 뜨는 레이스가 생기므로
            // 반드시 LoginPage 쪽에서만 호출할 것.
            clearLoggedOutIntentionally: () => set({ loggedOutIntentionally: false }),
        }),
        {
            name:       "auth-storage",
            // loggedOutIntentionally는 세션 중에만 의미있는 임시 플래그라 저장 대상에서 제외
            partialize: (state) => ({ isLoggedIn: state.isLoggedIn, user: state.user }),
        }
    )
);

// selectIsAuthenticated처럼 "state를 받아 필요한 값만 뽑아내는 함수"를 selector라고 부릅니다.
// useAuthStore(selector) 형태로 호출하면, 컴포넌트는 스토어 전체가 아니라 그 값이
// 바뀔 때만 리렌더링됩니다. (예: LoginPage의 useAuthStore(selectIsAuthenticated))
// 컴포넌트마다 필요한 값만 구독하게 되어 불필요한 리렌더링을 줄일 수 있습니다.
/** isLoggedIn && user 둘 다 있을 때만 인증됨으로 간주 */
export const selectIsAuthenticated = (state) => state.isLoggedIn && state.user != null;
/** 방금 로그아웃해서 인증이 풀린 것인지 (ProtectedRoute가 alert 스킵 여부 판단에 사용) */
export const selectLoggedOutIntentionally = (state) => state.loggedOutIntentionally;
