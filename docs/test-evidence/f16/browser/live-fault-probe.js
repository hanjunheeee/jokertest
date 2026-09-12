import {createSfxPlayer} from '/src/shared/audio/sfxPlayer.js';
import {createSfxAssetLoader} from '/src/shared/audio/loadSfxAsset.js';
import {SFX_MANIFEST,SFX_REVIEW_STATUS,SFX_CLASSIFICATION} from '/src/shared/audio/sfxManifest.js';
import {__setSfxPlayerForTests,getSfxSilenceLog} from '/src/shared/hooks/useSfxRuntime.js';
import {useAuthStore} from '/src/domains/auth/store/auth.store.js';
import {useInGameStore} from '/src/domains/game/ingame/store/ingameStore.js';
import {useMatchingStore} from '/src/domains/game/matching/store/matchingStore.js';
import {useSettingsStore} from '/src/domains/settings/store/settingsStore.js';
import {getSocket} from '/src/shared/socket/socketClient.js';
const box=document.createElement('aside');box.setAttribute('aria-label','F16 실패 검증 도구');box.setAttribute('data-sfx-owner','explicit');
box.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;max-width:650px;background:white;color:black;padding:4px;font:11px sans-serif;max-height:185px;overflow:auto;border:2px solid #c33';
box.innerHTML='<strong>F16 실제 앱 실패 검증 — 시험 전용 자산/오류 주입. 배포 자산 승인·청음 아님.</strong><div id="fault-buttons"></div><pre style="white-space:pre-wrap;margin:2px" id="fault-proof"></pre>';document.body.append(box);
const output=box.querySelector('#fault-proof'),buttons=box.querySelector('#fault-buttons');
let mode='not-installed',player=null,unsubs=[],events=[],mediaAttempts=0,loadAttempts=0;
const scope=()=>{const a=useAuthStore.getState();return{accountId:a.isLoggedIn?a.user?.uuid:null,gameId:useInGameStore.getState().gameId??null,roomId:useMatchingStore.getState().roomId??null}};
const settings=()=>{const s=useSettingsStore.getState();return{masterVolume:s.volumes?.['master-volume'],sfxVolume:s.volumes?.['sfx-volume'],sfxMuted:s.sfxMuted,notifications:s.generalChecks}};
function state(){const s=useInGameStore.getState();return{gameId:s.gameId,snapshotSeq:s.snapshotSeq,phase:s.state?.phase,dayPhase:s.state?.dayPhase,dayIndex:s.state?.dayIndex,connected:getSocket()?.connected,route:location.pathname}}
function show(){output.textContent=JSON.stringify({mode,state:state(),mix:settings(),loadAttempts,mediaAttempts,events:events.slice(-18),silence:player?player.getSilenceLog().slice(-8):getSfxSilenceLog()},null,1)}
function record(data){events.push({at:Date.now(),...data});show()}
const bytes=new TextEncoder().encode('F16 deliberately invalid non-musical audio bytes; QA only');
const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const src=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
function install(next){for(const f of unsubs)f();unsubs=[];player?.dispose();mode=next;events=[];mediaAttempts=0;loadAttempts=0;
 const manifest=Object.fromEntries(Object.entries(SFX_MANIFEST).map(([kind,entry])=>[kind,{...entry,reviewStatus:SFX_REVIEW_STATUS.APPROVED,source:'local operator-authored failure fixture',creator:'F16 QA operator',usageTerms:'test-only; never production approval',sha256:hash,src:next==='http'?'http://127.0.0.1:4183/f16-intentionally-missing.wav':src,mimeType:'audio/wav',durationMs:400,classification:SFX_CLASSIFICATION.SHORT_NON_MUSICAL}]));
 const loader=createSfxAssetLoader({fetchImpl:async(...args)=>{const r=await fetch(...args);record({type:'actual-fetch',httpStatus:r.status});return r}});
 player=createSfxPlayer({manifest,getScope:scope,getSettings:settings,subscribeSettings:listener=>useSettingsStore.subscribe(listener),loadAsset:(...args)=>{loadAttempts++;return next==='load-pending'?new Promise(()=>{}):loader(...args)},createMedia:url=>{mediaAttempts++;const media=next==='play-pending'?new Audio():new Audio(url);media.addEventListener('error',()=>record({type:'actual-media-error',code:media.error?.code}));if(next==='autoplay-denial')media.play=()=>Promise.reject(new DOMException('Deterministically injected NotAllowedError at media adapter','NotAllowedError'));if(next==='play-pending')media.play=()=>new Promise(()=>{});return media}});
 const delegate=player;__setSfxPlayerForTests({...delegate,dispatch:event=>{const result=delegate.dispatch(event);record({type:'dispatch',kind:event.kind,eventId:event.eventId,origin:event.origin,status:result.status,reason:result.reason});result.completion.then(completion=>record({type:'completion',kind:event.kind,completion}));return result}});
 unsubs=[useAuthStore.subscribe(()=>player.syncScope()),useInGameStore.subscribe(()=>{player.syncScope();show()}),useMatchingStore.subscribe(()=>player.syncScope())];record({type:'installed',fault:next});collapse(true);
}
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.setAttribute('data-sfx-owner','explicit');b.style.cssText='margin:2px;padding:3px;border:1px solid #888';b.onclick=fn;buttons.append(b)}
button('HTTP 로드 실패',()=>install('http'));button('실제 미디어 오류',()=>install('invalid-media'));button('자동재생 거절 주입',()=>install('autoplay-denial'));button('로드 영구대기 주입',()=>install('load-pending'));button('재생 영구대기 주입',()=>install('play-pending'));
button('소켓 재접속',()=>{const s=getSocket();if(!s)return record({type:'no-socket'});const before=state(),loads=loadAttempts;s.once('connect',()=>{record({type:'socket-reconnected',before,after:state()});setTimeout(()=>record({type:'restoration-after-1500ms',before,after:state(),newLoadAttempts:loadAttempts-loads}),1500)});record({type:'socket-disconnect',before});s.disconnect();setTimeout(()=>s.connect(),250)});
button('검증 기록 갱신',show);show();
const toggle=document.createElement('button');toggle.textContent='검증 도구 펼치기';toggle.setAttribute('data-sfx-owner','explicit');toggle.style.cssText='padding:4px;border:1px solid #888';box.prepend(toggle);let collapsed=true;
function collapse(value){collapsed=value;for(const child of box.children)if(child!==toggle)child.style.display=value?'none':'';toggle.textContent=value?'검증 도구 펼치기':'검증 도구 접기';box.style.maxWidth=value?'140px':'650px'}
toggle.onclick=()=>collapse(!collapsed);collapse(true);