// 칸 화면 도우미 파일, 도구 서버가 칸마다 게임 화면 index.html 맨 앞에 끼워 넣음 (앱 코드는 안 고침)
// 하는 일: Alt+숫자 단축키를 겉 화면에 넘김 · 지금 화면 주소·닉네임 알림 · 겉 화면 말에 따라 소리 끄기·켜기
(function () {
  'use strict';
  if (window.top === window) return; // 칸 주소를 따로 열었으면 아무것도 안 함
  var m = /^p(\d+)\./.exec(location.hostname);
  var slot = m ? Number(m[1]) : 0;
  var send = function (msg) {
    msg.__multi = true;
    msg.slot = slot;
    try { window.parent.postMessage(msg, '*'); } catch (e) { /* 겉 화면 없음 */ }
  };

  // 단축키: Alt+1~9·0 → 그 칸, Alt+G → 모두 보기 (게임 입력칸 글자는 안 가로챔 — Alt 같이 누른 것만)
  window.addEventListener('keydown', function (e) {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    var d = /^Digit([0-9])$/.exec(e.code);
    var key = d ? d[1] : (e.code === 'KeyG' ? 'grid' : null);
    if (!key) return;
    e.preventDefault();
    e.stopPropagation();
    send({ type: 'key', key: key });
  }, true);

  // 지금 화면 주소·로그인 닉네임 (앱 로그인 저장 칸 auth-storage에서 읽기만 함)
  var info = function () {
    var name = null;
    var loggedIn = false;
    try {
      var saved = JSON.parse(localStorage.getItem('auth-storage') || 'null');
      var user = saved && saved.state && saved.state.user;
      loggedIn = Boolean(saved && saved.state && saved.state.isLoggedIn && user);
      name = user ? (user.nickname || user.name || null) : null;
    } catch (e) { /* 못 읽으면 비움 */ }
    send({ type: 'info', path: location.pathname + location.search, name: name, loggedIn: loggedIn });
  };
  setInterval(info, 1500);
  window.addEventListener('load', info);

  // 소리 끄기: 재생하는 소리·영상 요소를 기억해 두고 muted만 바꿈 (켤 때는 앱이 정한 원래 값으로 되돌림)
  var muted = false;
  var known = [];
  var original = new WeakMap();
  var apply = function (el) {
    if (muted) {
      if (!original.has(el)) original.set(el, el.muted);
      el.muted = true;
    } else if (original.has(el)) {
      el.muted = original.get(el);
      original.delete(el);
    }
  };
  var remember = function (el) {
    if (known.indexOf(el) === -1) known.push(el);
    if (known.length > 300) known = known.slice(-200);
  };
  var play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    remember(this);
    apply(this);
    return play.apply(this, arguments);
  };
  var setMuted = function (value) {
    muted = Boolean(value);
    document.querySelectorAll('audio,video').forEach(remember);
    known.forEach(apply);
  };

  // 겉 화면이 보내는 말 (겉 화면 주소에서 온 것만)
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !e.data || e.data.__multi !== true) return;
    if (!/^http:\/\/multi\.localhost(:\d+)?$/.test(e.origin)) return;
    if (e.data.type === 'mute') setMuted(e.data.muted);
    else if (e.data.type === 'reload') location.reload();
    else if (e.data.type === 'focus') window.focus();
    else if (e.data.type === 'ping') info();
  });
  send({ type: 'hello' });
})();
