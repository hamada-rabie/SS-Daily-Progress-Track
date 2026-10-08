// SS' Daily Progress Track — controlled release / version telemetry
// Candidate: 20261008-release-control-v1
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const SS_RELEASE = {
  candidateVersion: "20261008-release-control-v1",
  candidatePath: "english_dashboard-v20261008-release-control-v1.html",
  fallbackPath: "english_dashboard-dynamic.html"
};
const firebaseConfig = {
  apiKey:"AIzaSyAlrLU20zWisISrmZKAMBNoAxclSA8B9iY",
  authDomain:"ss-daily-progress-track.firebaseapp.com",
  projectId:"ss-daily-progress-track",
  storageBucket:"ss-daily-progress-track.firebasestorage.app",
  messagingSenderId:"946203049271",
  appId:"1:946203049271:web:7534618a40b304ac722eb2",
  measurementId:"G-MH3X8WZW37"
};
const app=initializeApp(firebaseConfig,"releaseControl");
const auth=getAuth(app), db=getFirestore(app);

function isStandalone(){ return window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone===true; }
function deviceLabel(){
  const w=innerWidth;
  return w<=600 ? "mobile" : w<=1024 ? "tablet" : "desktop";
}
function injectUi(){
  // This control is intentionally MOBILE-ONLY. Desktop already has a normal browser Refresh.
  if(deviceLabel() !== "mobile") return;
  if(document.getElementById("ss-release-refresh-btn")) return;
  const style=document.createElement("style");
  style.textContent=`
#ss-release-refresh-btn{position:fixed;left:14px;bottom:14px;z-index:9998;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:#0E7C74;color:#fff;padding:9px 13px;font:800 12px/1.1 Arial,sans-serif;box-shadow:0 7px 20px rgba(0,0,0,.18);cursor:pointer}
#ss-release-refresh-btn:hover{filter:brightness(1.06);transform:translateY(-1px)}
#ss-release-refresh-btn i{font-style:normal;font-size:14px}
#ss-release-hint{position:fixed;left:14px;bottom:58px;z-index:9997;max-width:min(360px,calc(100vw - 28px));padding:12px 14px;border-radius:14px;background:#fff;border:1px solid #D7E8E4;color:#173E39;box-shadow:0 10px 30px rgba(0,0,0,.18);font:700 12px/1.5 Arial,sans-serif;display:none}
#ss-release-hint.show{display:block}
#ss-release-hint b{display:block;color:#0E7C74;margin-bottom:3px}
#ss-release-update-badge{position:fixed;left:12px;bottom:51px;z-index:9999;width:10px;height:10px;border-radius:50%;background:#EF7A5C;box-shadow:0 0 0 3px #fff;display:none}
`;
  document.head.appendChild(style);
  const btn=document.createElement("button");
  btn.id="ss-release-refresh-btn"; btn.type="button";
  btn.innerHTML="<i>↻</i><span>Refresh / تحديث</span>";
  btn.title="Refresh the app to install the latest approved release / حدّث التطبيق لتثبيت آخر إصدار معتمد";
  btn.onclick=async()=>{ 
    btn.disabled=true; btn.style.opacity=".65";
    try{
      const snap=await getDoc(doc(db,"appConfig","release"));
      const release=snap.exists()?snap.data():null;
      const publishedPath=release?.publishedPath || SS_RELEASE.fallbackPath;
      const publishedVersion=release?.publishedVersion || "20261007-stab1";
      const currentFile=location.pathname.split("/").pop() || "";
      if(publishedPath && publishedPath!==currentFile){
        const q="?release="+encodeURIComponent(publishedVersion);
        location.href=publishedPath+q;
      }else{
        location.reload();
      }
    }catch(e){
      console.warn("Release refresh routing failed; reloading current page:",e);
      location.reload();
    }
  };
  document.body.appendChild(btn);
  const hint=document.createElement("div");
  hint.id="ss-release-hint";
  hint.innerHTML="<b>تحديث جديد متاح / New update available</b><span>اضغط Refresh / تحديث مرة واحدة لتثبيت الإصدار الجديد. / Tap Refresh once to install the new release.</span>";
  document.body.appendChild(hint);
  const badge=document.createElement("div"); badge.id="ss-release-update-badge"; document.body.appendChild(badge);
}
async function recordPresence(user, version){
  try{
    await setDoc(doc(db,"users",user.uid),{
      appVersion:version,
      lastSeenAt:serverTimestamp(),
      lastSeenDevice:deviceLabel(),
      lastSeenStandalone:isStandalone()
    },{merge:true});
  }catch(e){ console.warn("Release telemetry write failed:",e); }
}
async function checkRelease(user){
  let release=null;
  try{
    const snap=await getDoc(doc(db,"appConfig","release"));
    if(snap.exists()) release=snap.data();
  }catch(e){ console.warn("Release check failed:",e); }
  const publishedVersion=release?.publishedVersion || "20261007-stab1";
  const publishedPath=release?.publishedPath || SS_RELEASE.fallbackPath;
  const candidateExists=location.pathname.endsWith(SS_RELEASE.candidatePath);
  await recordPresence(user, candidateExists ? SS_RELEASE.candidateVersion : publishedVersion);
  if(candidateExists) return;
  if(publishedVersion && publishedVersion!== "20261007-stab1"){
    const lastNotice=localStorage.getItem("ss_last_update_notice");
    if(lastNotice!==publishedVersion){
      localStorage.setItem("ss_last_update_notice",publishedVersion);
      injectUi();
      document.getElementById("ss-release-hint")?.classList.add("show");
      document.getElementById("ss-release-update-badge").style.display="block";
    }
  }
  if(publishedPath && publishedPath!==location.pathname.split("/").pop()){
    // Do not redirect silently. The user explicitly asked for refresh as the installation action.
    // The current approved page remains usable until the teacher presses Refresh.
  }
}
onAuthStateChanged(auth,user=>{
  if(!user) return;
  injectUi();
  checkRelease(user);
});
