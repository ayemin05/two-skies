/* Two Skies — game engine */
"use strict";
const V3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const now=()=>performance.now();
function setLang(l){LANG=l;try{localStorage.setItem("ts.lang",l)}catch(e){}document.body.classList.toggle("my",l==="my");document.documentElement.lang=l==="my"?"my":"en";if(G.r&&RT)refreshSigns()}
const roleName=r=>r==="sun"?"☀ "+t("sun"):"☾ "+t("moon");
const otherRole=r=>r==="sun"?"moon":"sun";
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}

/* ===================== state ===================== */
const S={mode:null,role:"sun",code:"",lvl:0,start:null,advancing:false,score:{sun:0,moon:0},lastHf:0,lastHug:0};
const PL={sun:null,moon:null};let ME=null,OTHER=null,activeRole="sun";
const app=document.getElementById("app"),stage=document.getElementById("stage");
function controlled(){return S.mode==="single"?PL[activeRole]:ME}
function newPlayer(role){return{role,pos:V3(),vel:V3(),grounded:false,gkey:null,cp:0,ry:Math.PI,moving:0,walkT:0,act:null,actT:0,actN:0,hitDone:false,stun:0,spin:0,hurtT:0,hold:null,carried:null,hfAt:0,hugAt:0,model:null,seen:false,target:null,tRy:Math.PI}}
let partner=null; // {lvl,last}
function partnerHere(){return S.mode==="online"&&!!(partner&&OTHER&&OTHER.seen&&partner.lvl===S.lvl&&now()-partner.last<60000)}
function partnerAway(){return partner&&now()-partner.last>4000}
function otherOf(P){if(S.mode==="single")return P===PL.sun?PL.moon:PL.sun;return partnerHere()?(P===ME?OTHER:ME):null}

/* ===================== network ===================== */
const NET={peer:null,conns:new Set(),pending:{},dial:null,beat:null,mid:0,seen:new Set(),seenQ:[]};
function netStart(){
 return new Promise(res=>{
  if(!window.Peer){res({ok:false,err:"net"});return}
  const base=`ts3-${S.code}-${S.role}`;let done=false;const fin=v=>{if(!done){done=true;res(v)}};
  const reg=(id,alt)=>{const p=new Peer(id,{debug:0});
   p.on("open",()=>{NET.peer=p;p.on("connection",c=>attach(c));p.on("disconnected",()=>{setTimeout(()=>{try{if(!p.destroyed)p.reconnect()}catch(e){}},1000)});startDial();fin({ok:true})});
   p.on("error",e=>{if(e.type==="unavailable-id"&&!done){p.destroy();if(alt)reg(alt,null);else fin({ok:false,err:"taken"})}
    else if(!done&&e.type!=="peer-unavailable"){fin({ok:false,err:"net"})}})};
  reg(base,base+"-b");setTimeout(()=>fin({ok:false,err:"net"}),15000)})}
function startDial(){
 const ob=`ts3-${S.code}-${otherRole(S.role)}`;
 const tick=()=>{const p=NET.peer;if(!p||p.destroyed)return;
  for(const [id,c] of Object.entries(NET.pending)){if(!c.open&&now()-c._t>6000){try{c.close()}catch(e){}delete NET.pending[id]}}
  if([...NET.conns].some(c=>c.open))return;
  if(p.disconnected){try{p.reconnect()}catch(e){}return}
  const mine=p.id,own=mine.endsWith("-b")?mine.slice(0,-2):mine+"-b";
  for(const id of [ob,ob+"-b",own]){if(NET.pending[id])continue;try{const c=p.connect(id,{reliable:true});c._t=now();NET.pending[id]=c;attach(c,id)}catch(e){}}};
 clearInterval(NET.dial);NET.dial=setInterval(tick,2500);tick();
 clearInterval(NET.beat);NET.beat=setInterval(()=>{if(S.mode==="online"&&RT&&ME){sendState();sendObjs()}},100)}
function attach(c,pid){c.on("open",()=>{NET.conns.add(c);if(pid)delete NET.pending[pid];hudStatus();sendState()});
 c.on("data",onData);const gone=()=>{NET.conns.delete(c);if(pid)delete NET.pending[pid];hudStatus()};c.on("close",gone);c.on("error",gone)}
function send(o){if(o.t!=="s"&&o.t!=="o")o.mid=S.role+(++NET.mid);for(const c of NET.conns)if(c.open)try{c.send(o)}catch(e){}}
function netStop(){clearInterval(NET.dial);clearInterval(NET.beat);for(const c of NET.conns)try{c.close()}catch(e){}NET.conns.clear();NET.pending={};try{if(NET.peer)NET.peer.destroy()}catch(e){}NET.peer=null;partner=null}
function sendState(){if(!RT||!ME)return;const ch={};for(const id in RT.crates){const c=RT.crates[id];if(c.hp<c.def.hp)ch[id]=c.hp}
 const sr={};RT.stars.forEach((v,i)=>{if(v)sr[i]=v});
 send({t:"s",role:S.role,lvl:S.lvl,x:+ME.pos.x.toFixed(2),y:+ME.pos.y.toFixed(2),z:+ME.pos.z.toFixed(2),ry:+ME.ry.toFixed(2),mv:ME.moving,gr:ME.grounded?1:0,
  act:ME.act||"",an:ME.actN,st:ME.stun>0?1:0,cr:ME.carried?1:0,ch,fl:Object.keys(RT.flags),sr,kl:Object.keys(RT.kills),lt:+RT.T.toFixed(2)})}
function sendObj(o){if(S.mode!=="online")return;send({t:"o",role:S.role,lvl:S.lvl,id:o.id,x:+o.pos.x.toFixed(2),y:+o.pos.y.toFixed(2),z:+o.pos.z.toFixed(2),vx:+o.vel.x.toFixed(2),vy:+o.vel.y.toFixed(2),vz:+o.vel.z.toFixed(2),h:o.holder||"",g:o.gone?1:0})}
function sendObjs(){for(const id in RT.objs){const o=RT.objs[id];if(o.own===S.role&&(o.holder||o.vel.lengthSq()>.003||o.dirty)){o.dirty=false;sendObj(o)}}}
function onData(p){if(!p||typeof p!=="object")return;
 if(p.mid){if(NET.seen.has(p.mid))return;NET.seen.add(p.mid);NET.seenQ.push(p.mid);if(NET.seenQ.length>400)NET.seen.delete(NET.seenQ.shift())}
 if(p.t==="s")return onState(p);
 if(!RT||p.lvl!==S.lvl)return;
 if(p.t==="o"){const o=RT.objs[p.id];if(!o)return;o.pos.set(p.x,p.y,p.z);o.vel.set(p.vx,p.vy,p.vz);o.holder=p.h||null;o.own=p.role;if(p.g)o.gone=true;
  if(o.holder===S.role&&!(ME.hold&&ME.hold.obj===o.id))o.holder=null;
  if(ME.hold&&ME.hold.obj===o.id&&o.holder!==S.role)ME.hold=null;return}
 if(p.t==="hit"){knock(ME,p.nx,p.nz);return}
 if(p.t==="crate"){damageCrate(p.id,p.hp,false);return}
 if(p.t==="flag"){setFlag(p.id,false);return}
 if(p.t==="star"){takeStar(p.i,p.by,false);return}
 if(p.t==="kill"){killMonster(p.id,false);return}
 if(p.t==="grab"){if(ME.hold&&ME.hold.player){ME.hold=null}ME.carried=otherRole(S.role);return}
 if(p.t==="drop"){if(ME.hold&&ME.hold.player)ME.hold=null;return}
 if(p.t==="throw"){if(ME.carried){ME.carried=null;ME.pos.copy(OTHER.pos).y+=1.8;ME.vel.set(p.vx,p.vy,p.vz);ME.grounded=false;ME.gkey=null;ME.flyT=1.2}return}}
function onState(p){if(p.role===S.role){S.dup=now();hudStatus();return}if(typeof p.x!=="number")return;
 const fresh=!partner||partnerAway();partner={lvl:p.lvl,last:now()};
 if(p.lvl>S.lvl&&p.lvl<NL&&!S.advancing&&RT){loadLevel(p.lvl);return}
 if(!RT||!OTHER)return;
 if(p.lvl===S.lvl){
  for(const id in (p.ch||{}))damageCrate(id,p.ch[id],false);
  for(const id of (p.fl||[]))setFlag(id,false);
  for(const i in (p.sr||{}))takeStar(+i,p.sr[i],false);
  for(const id of (p.kl||[]))killMonster(id,false);
  if(S.role==="moon"&&typeof p.lt==="number"&&Math.abs(p.lt-RT.T)>.3)RT.T=p.lt}
 const v=V3(p.x,p.y,p.z);
 if(!OTHER.seen||OTHER.pos.distanceTo(v)>6)OTHER.pos.copy(v);
 OTHER.target=v;OTHER.tRy=p.ry||0;OTHER.moving=p.mv?1:0;OTHER.grounded=!!p.gr;OTHER.stun=p.st?.3:0;OTHER.seen=true;OTHER.carried=p.cr?S.role:null;
 if(ME.hold&&ME.hold.player&&!p.cr&&now()-(ME.hold.t||0)>1500)ME.hold=null;
 if(p.an!==OTHER.actN){OTHER.actN=p.an;if(p.act){OTHER.act=p.act;OTHER.actT=0;if(p.act==="heart")spawnHearts(OTHER);if(p.act==="highfive")OTHER.hfAt=now();if(p.act==="hug")OTHER.hugAt=now()}}
 if(!p.act&&OTHER.act&&OTHER.act!=="punch")OTHER.act=null;
 if(fresh)hudStatus()}
setInterval(()=>{if(S.mode!=="online")return;hudStatus();if(partnerAway()&&ME&&ME.carried){ME.carried=null}},1500);

/* ===================== runtime level ===================== */
let RT=null,F={};
function loadLevel(i){
 S.lvl=i;S.advancing=false;const d=LV[i];
 RT={T:0,dyn:[],tog:[],crates:{},objs:{},flags:{},stars:(d.stars||[]).map(()=>null),kills:{},mon:[],balls:[],lasers:[],lvScore:{sun:0,moon:0}};
 (d.movers||[]).forEach((m,k)=>RT.dyn.push({key:"m"+k,kind:"mover",def:m,x:m.x,y:m.y,z:m.z,w:m.w,h:m.h,d:m.d,dx:0,dy:0,dz:0}));
 (d.lifts||[]).forEach((m,k)=>RT.dyn.push({key:"l"+k,kind:"lift",def:m,x:m.x,y:m.y0,z:m.z,w:m.w,h:m.h,d:m.d,dx:0,dy:0,dz:0}));
 (d.toggles||[]).forEach(g=>RT.tog.push({def:g,on:false,anim:0}));
 (d.crates||[]).forEach(c=>RT.crates[c.id]={def:c,hp:c.hp,shake:0});
 (d.objs||[]).forEach(o=>RT.objs[o.id]={id:o.id,def:o,type:o.type,who:o.who,pos:V3(o.x,o.y,o.z),vel:V3(),holder:null,own:null,gone:false,dirty:false});
 (d.monsters||[]).forEach(m=>RT.mon.push({def:m,id:m.id,x:m.x0,z:m.z0,y:m.y,dir:0}));
 (d.balls||[]).forEach(b=>RT.balls.push({def:b,x:b.x0,y:b.y,z:b.z0,roll:0}));
 (d.lasers||[]).forEach(l=>RT.lasers.push({def:l,x:l.x,y:l.y,z:l.z,w:l.w,h:l.h,d:l.d,on:true}));
 for(const P of [PL.sun,PL.moon]){if(!P)continue;P.cp=0;spawn(P);P.act=null;P.stun=0;P.hold=null;P.carried=null}
 if(G.r)buildLevel();
 closeQuiz();hudLevel();hudStars()}
function spawn(P){const c=LV[S.lvl].cps[P.cp];P.pos.set(c.x+(P.role==="sun"?-1.1:1.1),c.y+.6,c.z);P.vel.set(0,0,0);P.gkey=null;P.ry=Math.PI}
function positions(){const out=[];if(S.mode==="single")out.push(PL.sun.pos,PL.moon.pos);else{out.push(ME.pos);if(partnerHere())out.push(OTHER.pos)}return out}
function computeF(){const pos=positions(),o={};
 for(const id in RT.objs){const ob=RT.objs[id];if(!ob.gone&&!ob.holder&&ob.type!=="key")pos.push(ob.pos)}
 for(const p of LV[S.lvl].plates||[])o[p.id]=pos.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<.95&&Math.abs(q.y-p.y)<.45);
 Object.assign(o,RT.flags);o.allStars=RT.stars.length>0&&RT.stars.every(v=>v);return o}
function setFlag(id,local){if(!RT||RT.flags[id])return;RT.flags[id]=true;if(local&&S.mode==="online")send({t:"flag",id,lvl:S.lvl});markSolved(id)}

function solids(role,excl){const out=[],d=LV[S.lvl];
 for(const b of d.boxes){const[x,y,z,w,h,dd,k]=b;if(k==="g"&&role!=="sun"&&role!=="obj")continue;if(k==="b"&&role!=="moon"&&role!=="obj")continue;out.push({x,y,z,w,h,d:dd})}
 for(const g of RT.tog){const solid=g.def.type==="gate"?!g.on:g.on;if(solid)out.push(g.def)}
 for(const m of RT.dyn)out.push(m);
 for(const id in RT.crates){const c=RT.crates[id];if(c.hp>0)out.push(c.def)}
 for(const id in RT.objs){const o=RT.objs[id];if(o.type==="box"&&!o.holder&&!o.gone&&id!==excl)out.push({x:o.pos.x,y:o.pos.y+.4,z:o.pos.z,w:.8,h:.8,d:.8})}
 return out}
const PW=.3,PH=1.55;
function hitBox(p,boxes,pw=PW,ph=PH){for(const b of boxes){if(Math.abs(p.x-b.x)<b.w/2+pw&&Math.abs(p.z-b.z)<b.d/2+pw&&p.y<b.y+b.h/2&&p.y+ph>b.y-b.h/2)return b}return null}

function laserActive(L){const l=L.def;if(l.cond&&l.cond(F))return false;if(l.per)return ((RT.T+(l.ph||0))%l.per)<l.on;return true}
function updateWorld(dt){
 RT.T+=dt;const T=RT.T;
 for(const m of RT.dyn){const ox=m.x,oy=m.y,oz=m.z;
  if(m.kind==="mover"){const s=m.def.amp*Math.sin(T*m.def.sp+m.def.ph);m.x=m.def.x+(m.def.ax==="x"?s:0);m.z=m.def.z+(m.def.ax==="z"?s:0)}
  else{const tgt=m.def.cond(F)?m.def.y1:m.def.y0;const st=m.def.sp*dt;m.y+=Math.max(-st,Math.min(st,tgt-m.y))}
  m.dx=m.x-ox;m.dy=m.y-oy;m.dz=m.z-oz}
 for(const g of RT.tog){const c=!!g.def.cond(F);const was=g.on;g.on=g.def.latch?(g.on||c):c;if(!was&&g.on&&g.def.latch&&g.def.msg)toast(t(g.def.msg))}
 for(const m of RT.mon){const d=m.def,len=Math.hypot(d.x1-d.x0,d.z1-d.z0)||1;const u=(T*d.sp/len+(d.ph||0))%2,f=u<1?u:2-u;
  m.x=d.x0+(d.x1-d.x0)*f;m.z=d.z0+(d.z1-d.z0)*f;m.dir=Math.atan2((d.x1-d.x0)*(u<1?1:-1),(d.z1-d.z0)*(u<1?1:-1))}
 for(const b of RT.balls){const d=b.def,len=Math.hypot(d.x1-d.x0,d.z1-d.z0)||1;const f=(T*d.sp/len+(d.ph||0))%1;b.x=d.x0+(d.x1-d.x0)*f;b.z=d.z0+(d.z1-d.z0)*f;b.nx=(d.x1-d.x0)/len;b.nz=(d.z1-d.z0)/len}
 for(const L of RT.lasers){const l=L.def;if(l.ax){const s=l.amp*Math.sin(T*l.sp);L.x=l.x+(l.ax==="x"?s:0);L.z=l.z+(l.ax==="z"?s:0)}L.on=laserActive(L)}}

function stepPlayer(P,ix,iz,jump,dt){
 if(P.carried){const C=PL[P.carried];P.pos.set(C.pos.x,C.pos.y+1.7,C.pos.z);P.vel.set(0,0,0);P.grounded=false;P.gkey=null;P.ry=C.ry;P.moving=0;
  if(jump){P.carried=null;P.vel.set(Math.sin(P.ry)*2,6.5,Math.cos(P.ry)*2);P.pos.y+=.2;if(S.mode==="single")C.hold=null;else send({t:"drop",lvl:S.lvl})}
  collectStars(P);tickAct(P,dt);return}
 if(P.gkey){const m=RT.dyn.find(q=>q.key===P.gkey);if(m){P.pos.x+=m.dx;P.pos.y+=m.dy;P.pos.z+=m.dz}}
 const boxes=solids(P.role);
 if(P.stun>0){P.stun-=dt;ix=0;iz=0;jump=false}
 if(P.hurtT>0)P.hurtT-=dt;
 const sp=5.2,k=Math.min(1,dt*(P.stun>0?2:(P.grounded?14:5)));
 if(P.flyT>0){P.flyT-=dt;if(P.grounded&&P.flyT<.6)P.flyT=0}else{P.vel.x+=(ix*sp-P.vel.x)*k;P.vel.z+=(iz*sp-P.vel.z)*k}
 if(jump&&P.grounded){P.vel.y=8.2;P.grounded=false;P.gkey=null;P.flyT=0}
 P.vel.y-=24*dt;if(P.vel.y<-20)P.vel.y=-20;
 P.pos.x+=P.vel.x*dt;if(hitBox(P.pos,boxes)){P.pos.x-=P.vel.x*dt;P.vel.x=0}
 P.pos.z+=P.vel.z*dt;if(hitBox(P.pos,boxes)){P.pos.z-=P.vel.z*dt;P.vel.z=0}
 P.grounded=false;P.gkey=null;
 P.pos.y+=P.vel.y*dt;const b=hitBox(P.pos,boxes);
 if(b){if(P.vel.y<=0){P.pos.y=b.y+b.h/2;P.grounded=true;P.gkey=b.key||null}else P.pos.y=b.y-b.h/2-PH-.001;P.vel.y=0}
 const inside=hitBox(P.pos,boxes);if(inside&&inside.key){P.pos.y=inside.y+inside.h/2;P.grounded=true;P.gkey=inside.key}
 const v=Math.hypot(P.vel.x,P.vel.z);P.moving=v>.6&&P.stun<=0?1:0;
 if(v>.3&&P.stun<=0)P.ry=Math.atan2(P.vel.x,P.vel.z);
 if(P.moving&&(P.act==="dance"||P.act==="wave"||P.act==="hug"))P.act=null;
 if(P.grounded){LV[S.lvl].cps.forEach((c,i)=>{if(i>P.cp&&Math.hypot(P.pos.x-c.x,P.pos.z-c.z)<3.2&&P.pos.y>c.y-.4)P.cp=i})}
 if(P.pos.y<-9)hurt(P,"fell");
 hazards(P);collectStars(P);tickAct(P,dt)}
function tickAct(P,dt){if(!P.act)return;P.actT+=dt;
 if(P.act==="punch"&&!P.hitDone&&P.actT>.12){P.hitDone=true;doPunch(P)}
 const dur={punch:.38,dance:3.2,wave:1.8,heart:1.2,highfive:1.1,hug:1.8}[P.act];if(P.actT>dur)P.act=null}
function hurt(P,why){dropHeld(P);if(P.hold&&P.hold.player)releasePartner(P);spawn(P);if(P===controlled())toast(why==="fell"?t("fell"):t("ouch"))}
function hazards(P){const d=LV[S.lvl],y=P.pos.y;
 for(const s of d.spikes||[])if(Math.abs(P.pos.x-s.x)<s.w/2+.15&&Math.abs(P.pos.z-s.z)<s.d/2+.15&&y<s.y+.35&&y>s.y-1)return hurt(P,"ouch");
 for(const L of RT.lasers)if(L.on&&hitBox(P.pos,[L],.25,1.5))return hurt(P,"ouch");
 if(P.hurtT>0)return;
 for(const b of RT.balls){const dx=P.pos.x-b.x,dz=P.pos.z-b.z,dy=P.pos.y+.8-b.y;if(Math.hypot(dx,dy,dz)<b.def.r+.42){const l=Math.hypot(dx,dz)||1;knock(P,b.nx*.8+dx/l*.6,b.nz*.8+dz/l*.6,8);if(P===controlled())toast(t("ouch"));return}}
 for(const m of RT.mon){if(RT.kills[m.id])continue;const dx=P.pos.x-m.x,dz=P.pos.z-m.z;if(Math.hypot(dx,dz)<.8&&Math.abs(P.pos.y-m.y)<.9){const l=Math.hypot(dx,dz)||1;knock(P,dx/l,dz/l,7);if(P===controlled())toast(t("ouch"));return}}}
function knock(P,nx,nz,pw=7){if(!P||P.carried)return;P.vel.set(nx*pw,5.5,nz*pw);P.grounded=false;P.gkey=null;P.stun=.45;P.hurtT=.9;P.spin=1;dropHeld(P)}
function collectStars(P){const st=LV[S.lvl].stars||[];for(let i=0;i<st.length;i++){if(RT.stars[i])continue;const s=st[i];if(Math.hypot(P.pos.x-s[0],P.pos.y+.8-s[1],P.pos.z-s[2])<.95)takeStar(i,P.role,true)}}
function takeStar(i,by,local){if(!RT||RT.stars[i]||i>=RT.stars.length)return;RT.stars[i]=by;RT.lvScore[by]++;S.score[by]++;
 const m=G.stars&&G.stars[i];if(m){sparkle(m.position,0xffe08a);m.visible=false}
 if(local&&S.mode==="online")send({t:"star",i,by,lvl:S.lvl});hudStars()}
function killMonster(id,local){if(!RT||RT.kills[id])return;RT.kills[id]=true;const m=RT.mon.find(q=>q.id===id);if(m&&m.mesh){sparkle(m.mesh.position,0x7be07b);m.mesh.visible=false}if(local&&S.mode==="online")send({t:"kill",id,lvl:S.lvl})}

/* ---------- objects ---------- */
function holderPos(role){return PL[role].pos}
function updateObjs(dt){
 for(const id in RT.objs){const o=RT.objs[id];if(o.gone)continue;
  if(o.holder){const hp=holderPos(o.holder);o.pos.set(hp.x,hp.y+1.95+(PL[o.holder].carried?0:0),hp.z);o.vel.set(0,0,0)}
  else{const bx=solids("obj",id),h=o.type==="box"?.4:.3;
   o.vel.y-=24*dt;
   const q=V3(o.pos.x,o.pos.y,o.pos.z);
   q.x+=o.vel.x*dt;if(hitBox(q,bx,h,h*2)){q.x=o.pos.x;o.vel.x*=-.2}
   q.z+=o.vel.z*dt;if(hitBox(q,bx,h,h*2)){q.z=o.pos.z;o.vel.z*=-.2}
   q.y+=o.vel.y*dt;const b=hitBox(q,bx,h,h*2);let gr=false;
   if(b){if(o.vel.y<=0){q.y=b.y+b.h/2;gr=true;if(b.key){q.x+=b.dx;q.z+=b.dz}}else q.y=b.y-b.h/2-h*2;o.vel.y=0}
   o.pos.copy(q);if(gr){const f=1-Math.min(1,dt*7);o.vel.x*=f;o.vel.z*=f}
   if(o.pos.y<-10){o.pos.set(o.def.x,o.def.y+.5,o.def.z);o.vel.set(0,0,0);o.dirty=true}}
  if(o.type==="key")for(const L of LV[S.lvl].locks||[]){if(L.key!==o.id||RT.flags[L.id])continue;
   if(Math.hypot(o.pos.x-L.x,o.pos.z-L.z)<1.7&&Math.abs(o.pos.y-L.y)<2.6){o.gone=true;o.dirty=true;if(o.holder&&PL[o.holder].hold&&PL[o.holder].hold.obj===o.id)PL[o.holder].hold=null;o.holder=null;
    setFlag(L.id,true);toast(t("unlocked"));if(o.mesh)o.mesh.visible=false;sendObj(o)}}}}
function dropHeld(P){if(P.hold&&P.hold.obj){const o=RT.objs[P.hold.obj];if(o){o.holder=null;o.own=P.role;o.vel.set(0,1,0);o.dirty=true;sendObj(o)}P.hold=null}}
function releasePartner(P){const O=PL[P.hold.player];P.hold=null;if(S.mode==="single"){if(O)O.carried=null}else send({t:"drop",lvl:S.lvl})}

/* ---------- actions ---------- */
function startAct(P,a){if(!P||S.advancing)return;if(a==="punch"&&P.act==="punch"&&P.actT<.3)return;
 const both=S.mode==="single"&&(a==="highfive"||a==="hug");
 for(const Q of both?[PL.sun,PL.moon]:[P]){Q.act=a;Q.actT=0;Q.actN=(Q.actN+1)%1000;Q.hitDone=false;if(a==="heart")spawnHearts(Q);if(a==="highfive")Q.hfAt=now();if(a==="hug")Q.hugAt=now()}}
function doPunch(P){
 const fx=Math.sin(P.ry),fz=Math.cos(P.ry),hx=P.pos.x+fx*.7,hz=P.pos.z+fz*.7,hy=P.pos.y+1;
 for(const id in RT.crates){const c=RT.crates[id];if(c.hp<=0)continue;const d=c.def;
  if(Math.abs(hx-d.x)<d.w/2+.45&&Math.abs(hz-d.z)<d.d/2+.45&&hy>d.y-d.h/2-.2&&hy<d.y+d.h/2+.5){damageCrate(id,c.hp-1,true);break}}
 for(const m of RT.mon){if(RT.kills[m.id])continue;if(Math.hypot(hx-m.x,hz-m.z)<1.1&&Math.abs(P.pos.y-m.y)<1.2)killMonster(m.id,true)}
 const O=otherOf(P);
 if(O&&!O.carried){const dx=O.pos.x-P.pos.x,dz=O.pos.z-P.pos.z,dist=Math.hypot(dx,dz);
  if(dist<1.5&&Math.abs(O.pos.y-P.pos.y)<1.2&&(dx*fx+dz*fz)/Math.max(dist,.01)>.3){const nx=dx/Math.max(dist,.01),nz=dz/Math.max(dist,.01);
   if(S.mode==="single")knock(O,nx,nz);else send({t:"hit",nx,nz,lvl:S.lvl})}}
 if(P.model)pow(P.pos.x+fx*.8,P.pos.y+1.1,P.pos.z+fz*.8)}
function damageCrate(id,hp,local){const c=RT.crates[id];if(!c||hp>=c.hp)return;c.hp=Math.max(0,hp);c.shake=1;
 if(c.hp===0&&c.mesh){burst(c.def);c.mesh.visible=false}
 if(local&&S.mode==="online")send({t:"crate",id,hp:c.hp,lvl:S.lvl})}
function nearQuiz(P){for(const q of LV[S.lvl].quizzes||[]){if(RT.flags[q.id])continue;if(Math.hypot(P.pos.x-q.x,P.pos.z-q.z)<1.8&&Math.abs(P.pos.y-q.y)<1.6)return q}return null}
function nearObj(P){let best=null,bd=1.35;for(const id in RT.objs){const o=RT.objs[id];if(o.gone||o.holder)continue;const dy=o.pos.y-P.pos.y;
 if(P.carried?(dy<-2.6||dy>.5):(dy<-.7||dy>1.3))continue;const d=Math.hypot(o.pos.x-P.pos.x,o.pos.z-P.pos.z);if(d<bd){bd=d;best=o}}return best}
function interact(P){if(!P||S.advancing)return;
 const fx=Math.sin(P.ry),fz=Math.cos(P.ry);
 if(P.hold&&P.hold.obj){const o=RT.objs[P.hold.obj];P.hold=null;if(!o)return;const mv=P.moving||Math.hypot(P.vel.x,P.vel.z)>1;
  o.holder=null;o.own=P.role;o.pos.set(P.pos.x+fx*.5,P.pos.y+1.6+(P.carried?1.7:0),P.pos.z+fz*.5);
  o.vel.set(fx*(mv?7.5:3.2),mv?4.5:2.6,fz*(mv?7.5:3.2));o.dirty=true;sendObj(o);return}
 if(P.hold&&P.hold.player){const O=PL[P.hold.player];P.hold=null;const vx=fx*9,vy=6.5,vz=fz*9;
  if(S.mode==="single"){O.carried=null;O.pos.set(P.pos.x,P.pos.y+1.8,P.pos.z);O.vel.set(vx,vy,vz);O.grounded=false;O.gkey=null;O.flyT=1.2}
  else{send({t:"throw",vx,vy,vz,lvl:S.lvl});OTHER.carried=null}return}
 const q=nearQuiz(P);
 if(q){if(q.who&&q.who!==P.role){toast(t("onlyAnswer")(roleName(q.who)));return}openQuiz(q);return}
 const o=nearObj(P);
 if(o){if(o.who&&o.who!==P.role){toast(t("onlyPick")(roleName(o.who)));return}
  o.holder=P.role;o.own=P.role;P.hold={obj:o.id};o.dirty=true;sendObj(o);return}
 const O=otherOf(P);
 if(O&&!P.carried&&!O.carried&&!(O.hold&&O.hold.player)&&Math.hypot(O.pos.x-P.pos.x,O.pos.z-P.pos.z)<1.6&&Math.abs(O.pos.y-P.pos.y)<1.2){
  dropHeldIfObjOther(O);P.hold={player:O.role,t:now()};
  if(S.mode==="single")O.carried=P.role;else{send({t:"grab",lvl:S.lvl});OTHER.carried=P.role}return}
 toast(t("nothing"))}
function dropHeldIfObjOther(O){if(S.mode==="single")return}
function grabLabel(P){if(!P)return["✋",t("grab")];if(P.hold)return["🫴",t("throwIt")];if(nearQuiz(P))return["❓",t("answer")];return["✋",t("grab")]}

/* ---------- couple moves ---------- */
function coupleCheck(){
 const A=S.mode==="single"?PL.sun:ME,B=S.mode==="single"?PL.moon:(partnerHere()?OTHER:null);if(!A||!B)return;
 const tn=now(),dist=Math.hypot(A.pos.x-B.pos.x,A.pos.z-B.pos.z);
 const zones=LV[S.lvl].zones||[];
 const inZone=(z)=>[A,B].every(P=>Math.hypot(P.pos.x-z.x,P.pos.z-z.z)<z.r&&Math.abs(P.pos.y-z.y)<1.5);
 if(A.hfAt&&B.hfAt&&Math.abs(A.hfAt-B.hfAt)<1800&&tn-Math.max(A.hfAt,B.hfAt)<2500&&dist<3.2&&Math.max(A.hfAt,B.hfAt)>S.lastHf){
  S.lastHf=Math.max(A.hfAt,B.hfAt);toast(t("hfDone"));sparkle(V3((A.pos.x+B.pos.x)/2,A.pos.y+1.9,(A.pos.z+B.pos.z)/2),0xffe08a);
  for(const z of zones)if(z.kind==="highfive"&&inZone(z))setFlag(z.id,true)}
 if(A.hugAt&&B.hugAt&&Math.abs(A.hugAt-B.hugAt)<1800&&tn-Math.max(A.hugAt,B.hugAt)<2500&&dist<3.2&&Math.max(A.hugAt,B.hugAt)>S.lastHug){
  S.lastHug=Math.max(A.hugAt,B.hugAt);toast(t("hugDone"));spawnHearts(A);spawnHearts(B);
  for(const z of zones)if(z.kind==="hug"&&inZone(z))setFlag(z.id,true)}
 for(const P of [A,B])if(P.act==="hug"||P.act==="highfive"){const O=P===A?B:A;if(dist<3.2&&(P===controlled()||S.mode==="single"))P.ry=Math.atan2(O.pos.x-P.pos.x,O.pos.z-P.pos.z)}}

/* ===================== 3D ===================== */
const G={r:null,scene:null,cam:null,clock:null,level:null,plates:{},sun:null,yaw:0,pitch:.48,camT:null,fx:[],stars:[],signs:[],quizM:{},lockM:{},zoneM:{}};
const mat=(c,o={})=>new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.8,metalness:.03},o));
const basic=(c,o={})=>new THREE.MeshBasicMaterial(Object.assign({color:c},o));
function initGL(){
 if(G.r)return true;if(!window.THREE)return false;
 try{G.r=new THREE.WebGLRenderer({antialias:true})}catch(e){return false}
 G.r.setPixelRatio(Math.min(2,window.devicePixelRatio||1));G.r.shadowMap.enabled=true;G.r.shadowMap.type=THREE.PCFSoftShadowMap;
 const sc=G.scene=new THREE.Scene();sc.background=new THREE.Color(0x1a2150);sc.fog=new THREE.Fog(0x1a2150,26,75);
 G.cam=new THREE.PerspectiveCamera(60,1,.1,260);
 sc.add(new THREE.HemisphereLight(0xb8c4ff,0x40301c,.85));
 const d=G.sun=new THREE.DirectionalLight(0xfff0d8,.9);d.castShadow=true;d.shadow.mapSize.set(1024,1024);
 Object.assign(d.shadow.camera,{left:-14,right:14,top:14,bottom:-14,near:1,far:60});sc.add(d);sc.add(d.target);
 const sg=new THREE.BufferGeometry(),pts=[];for(let i=0;i<1200;i++){const a=Math.random()*Math.PI*2,e=Math.random()*1.3,rr=120;pts.push(Math.cos(a)*Math.cos(e)*rr,Math.sin(e)*rr-10,Math.sin(a)*Math.cos(e)*rr-30)}
 sg.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));sc.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xe6ebff,size:.45,fog:false})));
 const s1=new THREE.Mesh(new THREE.SphereGeometry(6,32,24),basic(0xffc35a,{fog:false}));s1.position.set(-45,26,-115);sc.add(s1);
 const s2=new THREE.Mesh(new THREE.SphereGeometry(5,32,24),basic(0xdfe6ff,{fog:false}));s2.position.set(42,30,-115);sc.add(s2);
 for(let i=0;i<24;i++){const c=new THREE.Mesh(new THREE.SphereGeometry(1.2+Math.random()*1.8,12,10),mat(0x3b4590,{transparent:true,opacity:.65}));c.scale.y=.4;c.position.set((Math.random()<.5?-1:1)*(11+Math.random()*16),-5-Math.random()*5,10-Math.random()*70);sc.add(c)}
 G.heartTex=iconTex("❤","#00000000",96,"#ff5f8f");
 PL.sun.model=makeHuman("sun");PL.moon.model=makeHuman("moon");sc.add(PL.sun.model.root,PL.moon.model.root);
 G.clock=new THREE.Clock();
 const loop=()=>{requestAnimationFrame(loop);try{frame()}catch(e){console.error(e)}};loop();
 return true}
function iconTex(txt,bg,size=128,fg="#fff"){const cv=document.createElement("canvas");cv.width=cv.height=size;const x=cv.getContext("2d");
 if(bg&&bg!=="#00000000"){x.fillStyle=bg;x.beginPath();x.arc(size/2,size/2,size/2-4,0,Math.PI*2);x.fill()}
 x.fillStyle=fg;x.font=`bold ${size*.6}px "DM Sans","Noto Sans Myanmar",system-ui,sans-serif`;x.textAlign="center";x.textBaseline="middle";x.fillText(txt,size/2,size/2+size*.04);
 const tx=new THREE.CanvasTexture(cv);return tx}
function sprite(tex,s){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));sp.scale.setScalar(s);return sp}

/* ---------- signs ---------- */
function canRead(s){return !s.who||S.mode==="single"||s.who===S.role}
function signText(s){return canRead(s)?t(s.k):t("onlyRead")(roleName(s.who))}
function segs(str){if(window.Intl&&Intl.Segmenter){return Array.from(new Intl.Segmenter(undefined,{granularity:"grapheme"}).segment(str),x=>x.segment)}return Array.from(str)}
function wrap(ctx,text,maxW){const words=text.split(" "),lines=[];let cur="";
 const push=w=>{if(ctx.measureText(w).width<=maxW)return w;let part="";for(const g of segs(w)){if(ctx.measureText(part+g).width>maxW){lines.push(part);part=g}else part+=g}return part};
 for(const w of words){const test=cur?cur+" "+w:w;if(ctx.measureText(test).width<=maxW)cur=test;else{if(cur)lines.push(cur);cur=push(w)}}
 if(cur)lines.push(cur);return lines}
function drawSign(s){
 const W=640,H=440,cv=s._cv||document.createElement("canvas");cv.width=W;cv.height=H;s._cv=cv;const x=cv.getContext("2d");
 const style=s.who?(s.who==="sun"?"sun":"moon"):(s.style||"info");
 const col={info:["#e0761a","#fff3d6","#3a2410"],stop:["#c62828","#fff4f0","#3a1010"],sun:["#e8961c","#fff1c9","#3a2410"],moon:["#5a4fd0","#eceaff","#1c1840"]}[style];
 x.fillStyle="#6e4a24";x.fillRect(0,0,W,H);x.fillStyle=col[1];x.fillRect(10,10,W-20,H-20);
 x.fillStyle=col[0];x.fillRect(10,10,W-20,92);
 const fam='"DM Sans","Noto Sans Myanmar",system-ui,sans-serif';
 if(style==="stop"){x.save();x.translate(62,56);x.fillStyle="#fff";x.beginPath();for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4;x.lineTo(Math.cos(a)*36,Math.sin(a)*36)}x.closePath();x.fill();
  x.fillStyle="#c62828";x.beginPath();for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4;x.lineTo(Math.cos(a)*31,Math.sin(a)*31)}x.closePath();x.fill();x.fillStyle="#fff";x.font=`bold 15px ${fam}`;x.textAlign="center";x.textBaseline="middle";x.fillText("STOP",0,1);x.restore()}
 else{x.fillStyle="#fff";x.beginPath();x.arc(62,56,32,0,Math.PI*2);x.fill();x.fillStyle=col[0];x.font=`bold 40px ${fam}`;x.textAlign="center";x.textBaseline="middle";x.fillText(s.who?(s.who==="sun"?"☀":"☾"):"!",62,58)}
 const hdr=s.who?(s.who==="sun"?t("hdrSun"):t("hdrMoon")):(style==="stop"?t("hdrStop"):t("hdrInfo"));
 x.fillStyle="#fff";x.textAlign="left";x.textBaseline="middle";x.font=`bold 40px ${fam}`;x.fillText(hdr,112,58);
 const txt=signText(s);let fs=36,lines;const my=LANG==="my";
 for(;fs>=18;fs-=2){x.font=`600 ${fs}px ${fam}`;lines=wrap(x,txt,W-70);if(lines.length*fs*(my?1.6:1.3)<=H-130)break}
 x.fillStyle=col[2];x.textBaseline="top";const lh=fs*(my?1.6:1.3);lines.forEach((l,i)=>x.fillText(l,30,118+i*lh));
 if(s._tex){s._tex.needsUpdate=true;return s._tex}return s._tex=new THREE.CanvasTexture(cv)}
function refreshSigns(){for(const s of LV[S.lvl].signs||[]){if(s._tex)drawSign(s)}lastHint=null}
if(document.fonts&&document.fonts.load){document.fonts.load('30px "Noto Sans Myanmar"',"က").then(()=>{if(G.r&&RT)refreshSigns()}).catch(()=>{})}

/* ---------- level meshes ---------- */
function groundAt(x,z,maxY=99){let best=0;for(const[bx,by,bz,w,h,d,k] of LV[S.lvl].boxes){if(k==="wall")continue;const top=by+h/2;if(top>maxY)continue;if(Math.abs(x-bx)<=w/2&&Math.abs(z-bz)<=d/2)best=Math.max(best,top)}return best}
let _crateTex=null;
function crateTex(){if(_crateTex)return _crateTex;const cv=document.createElement("canvas");cv.width=cv.height=128;const x=cv.getContext("2d");
 x.fillStyle="#b07a3c";x.fillRect(0,0,128,128);x.strokeStyle="#6e4518";x.lineWidth=10;x.strokeRect(5,5,118,118);x.lineWidth=8;x.beginPath();x.moveTo(10,10);x.lineTo(118,118);x.moveTo(118,10);x.lineTo(10,118);x.stroke();
 x.fillStyle="#00000018";for(let i=0;i<12;i++)x.fillRect(0,i*11,128,2);return _crateTex=new THREE.CanvasTexture(cv)}
function starGeo(){const s=new THREE.Shape();for(let i=0;i<10;i++){const a=i/10*Math.PI*2-Math.PI/2,r=i%2?.13:.3;const px=Math.cos(a)*r,py=Math.sin(a)*r;i?s.lineTo(px,py):s.moveTo(px,py)}s.closePath();
 const g=new THREE.ExtrudeGeometry(s,{depth:.08,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:1});g.center();return g}
function buildLevel(){
 const sc=G.scene;if(G.level){sc.remove(G.level);G.level.traverse(o=>{if(o.geometry)o.geometry.dispose()})}
 const L=G.level=new THREE.Group();sc.add(L);G.plates={};G.stars=[];G.quizM={};G.lockM={};G.zoneM={};
 const d=LV[S.lvl],box=new THREE.BoxGeometry(1,1,1);
 const top=mat(0x5d6fd6),side=mat(0x2a2f66),gold=mat(0xf2a93b,{emissive:0xb25f10,emissiveIntensity:.5}),blue=mat(0x6f82f2,{emissive:0x2c3aa8,emissiveIntensity:.6}),wall=mat(0x3a3f7c);
 for(const[x,y,z,w,h,dd,k] of d.boxes){
  const m=new THREE.Mesh(box,k==="g"?gold:k==="b"?blue:k==="wall"?wall:[side,side,top,side,side,side]);m.scale.set(w,h,dd);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;L.add(m);
  if(k==="n"&&w*dd>8){const u=new THREE.Mesh(new THREE.ConeGeometry(Math.min(w,dd)*.45,3,6),side);u.position.set(x,y-h/2-1.5,z);u.rotation.y=.4;L.add(u)}
  if(k==="g"||k==="b"){const gl=new THREE.PointLight(k==="g"?0xffb040:0x7a8cff,.6,3);gl.position.set(x,y+.6,z);L.add(gl)}}
 for(const m of RT.dyn){const col=m.kind==="lift"?m.def.col:0x9a7ff0;
  const mesh=new THREE.Mesh(box,mat(col,{emissive:col,emissiveIntensity:.35}));mesh.scale.set(m.w,m.h,m.d);mesh.castShadow=mesh.receiveShadow=true;L.add(mesh);m.mesh=mesh;
  if(m.kind==="lift"){for(const sx of[-1,1]){const r=new THREE.Mesh(box,side);r.scale.set(.15,m.def.y1-m.def.y0+1.5,.15);r.position.set(m.x+sx*(m.w/2+.15),(m.def.y0+m.def.y1)/2+.3,m.z);L.add(r)}}}
 for(const g of RT.tog){const df=g.def,grp=new THREE.Group();
  if(df.type==="gate"){const n=Math.max(5,Math.round(df.w*2));for(let i=0;i<n;i++){const b=new THREE.Mesh(new THREE.BoxGeometry(.14,df.h,.14),mat(df.col,{emissive:df.col,emissiveIntensity:.6}));b.position.set(-df.w/2+.2+i*(df.w-.4)/(n-1),0,0);b.castShadow=true;grp.add(b)}
   const tb=new THREE.Mesh(new THREE.BoxGeometry(df.w,.18,.22),mat(df.col,{emissive:df.col,emissiveIntensity:.6}));tb.position.y=df.h/2;grp.add(tb)}
  else{const n=Math.max(1,Math.round(df.d));for(let i=0;i<n;i++){const p=new THREE.Mesh(box,mat(df.col,{emissive:df.col,emissiveIntensity:.45}));p.scale.set(df.w,df.h*.9,df.d/n*.92);p.position.z=-df.d/2+(i+.5)*df.d/n;p.castShadow=p.receiveShadow=true;grp.add(p)}}
  grp.position.set(df.x,df.y,df.z);L.add(grp);g.mesh=grp;g.anim=df.type==="gate"?0:-6;grp.position.y=df.y+g.anim}
 for(const id in RT.crates){const c=RT.crates[id],df=c.def;const m=new THREE.Mesh(box,new THREE.MeshStandardMaterial({map:crateTex(),roughness:.9}));m.scale.set(df.w,df.h,df.d);m.position.set(df.x,df.y,df.z);m.castShadow=m.receiveShadow=true;L.add(m);c.mesh=m;m.visible=c.hp>0}
 for(const p of d.plates||[]){const g=new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(.85,.9,.06,32),mat(0x222744)));
  const btn=new THREE.Mesh(new THREE.CylinderGeometry(.62,.66,.18,32),mat(p.col,{emissive:p.col,emissiveIntensity:.35}));btn.position.y=.1;g.add(btn);
  if(p.star){const st=new THREE.Mesh(new THREE.OctahedronGeometry(.3),mat(0xfff2b0,{emissive:0xffd060,emissiveIntensity:1}));st.position.y=1.4;g.add(st);g.userData.star=st}
  g.position.set(p.x,p.y,p.z);g.userData.btn=btn;L.add(g);G.plates[p.id]=g}
 // signs
 for(const s of d.signs||[]){const g=new THREE.Group(),gy=groundAt(s.x,s.z);
  for(const sx of[-.75,.75]){const post=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.9,8),mat(0x6e4a24));post.position.set(sx,.95,0);g.add(post)}
  const tex=drawSign(s);const board=new THREE.Mesh(new THREE.PlaneGeometry(1.9,1.31),new THREE.MeshBasicMaterial({map:tex}));board.position.set(0,1.55,.04);g.add(board);
  const back=new THREE.Mesh(new THREE.BoxGeometry(1.96,1.37,.06),mat(0x6e4a24));back.position.set(0,1.55,0);g.add(back);
  g.position.set(s.x,gy,s.z);if(s.ry)g.rotation.y=s.ry;L.add(g)}
 // stars
 const sg=starGeo(),sm=mat(0xffd34d,{emissive:0xffb020,emissiveIntensity:.9,metalness:.3,roughness:.4});
 (d.stars||[]).forEach((s,i)=>{const m=new THREE.Mesh(sg,sm);m.position.set(s[0],s[1],s[2]);m.visible=!RT.stars[i];L.add(m);G.stars[i]=m});
 // spikes
 for(const s of d.spikes||[]){const base=new THREE.Mesh(box,mat(0x3a1f2f));base.scale.set(s.w,.06,s.d);base.position.set(s.x,s.y+.03,s.z);L.add(base);
  const cg=new THREE.ConeGeometry(.12,.45,6),cm=mat(0xdfe3f0,{metalness:.6,roughness:.3,emissive:0x501010,emissiveIntensity:.4});
  for(let ix=0;ix<Math.round(s.w/.35);ix++)for(let iz=0;iz<Math.round(s.d/.35);iz++){const c=new THREE.Mesh(cg,cm);c.position.set(s.x-s.w/2+.17+ix*.35,s.y+.25,s.z-s.d/2+.17+iz*.35);L.add(c)}}
 // lasers
 for(const Lz of RT.lasers){const l=Lz.def,col=l.col||0xff3b3b;
  const beam=new THREE.Mesh(box,basic(col,{transparent:true,opacity:.85,depthWrite:false}));beam.scale.set(l.w,l.h,l.d);L.add(beam);Lz.mesh=beam;
  const posts=new THREE.Group();const across=l.w>=l.d;
  for(const s of[-1,1]){const p=new THREE.Mesh(box,mat(0x22263f,{emissive:col,emissiveIntensity:.3}));p.scale.set(.25,l.h+.3,.25);p.position.set(across?s*(l.w/2+.12):0,0,across?0:s*(l.d/2+.12));posts.add(p)}
  L.add(posts);Lz.posts=posts}
 // balls
 for(const b of RT.balls){const m=new THREE.Mesh(new THREE.SphereGeometry(b.def.r,24,18),mat(0x7a2fb0,{emissive:0x3a0f60,emissiveIntensity:.4,roughness:.5}));m.castShadow=true;
  const band=new THREE.Mesh(new THREE.TorusGeometry(b.def.r*1.001,.06,8,32),mat(0xffd34d));m.add(band);L.add(m);b.mesh=m}
 // monsters
 for(const mo of RT.mon){const g=new THREE.Group();const body=new THREE.Mesh(new THREE.SphereGeometry(.45,20,16),mat(0x5ad36a,{transparent:true,opacity:.92,roughness:.3,emissive:0x1e6a2a,emissiveIntensity:.3}));body.scale.y=.75;body.position.y=.34;g.add(body);
  for(const sx of[-.14,.14]){const e=new THREE.Mesh(new THREE.SphereGeometry(.09,12,10),basic(0xffffff));e.position.set(sx,.48,.36);g.add(e);const pu=new THREE.Mesh(new THREE.SphereGeometry(.045,10,8),basic(0x111111));pu.position.set(sx,.48,.43);g.add(pu)}
  g.userData.body=body;L.add(g);mo.mesh=g;g.visible=!RT.kills[mo.id]}
 // objects
 for(const id in RT.objs){const o=RT.objs[id];let m;
  if(o.type==="box"){m=new THREE.Mesh(new THREE.BoxGeometry(.8,.8,.8),new THREE.MeshStandardMaterial({map:crateTex()}));m.position.y=.4;const g=new THREE.Group();g.add(m);m.castShadow=true;m=g}
  else if(o.type==="key"){const col=o.def.col||0xffc24d;m=new THREE.Group();const km=mat(col,{emissive:col,emissiveIntensity:.6,metalness:.5,roughness:.3});
   const ring=new THREE.Mesh(new THREE.TorusGeometry(.16,.05,10,24),km);ring.position.y=.55;m.add(ring);const sh=new THREE.Mesh(new THREE.BoxGeometry(.07,.42,.07),km);sh.position.y=.23;m.add(sh);
   for(const yy of[.08,.18]){const tth=new THREE.Mesh(new THREE.BoxGeometry(.14,.06,.06),km);tth.position.set(.09,yy,0);m.add(tth)}
   const gl=new THREE.PointLight(col,.8,2.5);gl.position.y=.5;m.add(gl);m.userData.spin=true;
   if(o.who){const ic=sprite(iconTex(o.who==="sun"?"☀":"☾",o.who==="sun"?"#e8961c":"#5a4fd0"),.35);ic.position.y=1.05;m.add(ic)}}
  else{m=new THREE.Mesh(new THREE.SphereGeometry(.3,18,14),mat(0xff7a59));m.position.y=.3;const g=new THREE.Group();g.add(m);m=g}
  L.add(m);o.mesh=m;m.visible=!o.gone}
 // locks
 for(const lk of d.locks||[]){const g=new THREE.Group();const key=(d.objs||[]).find(o=>o.id===lk.key);const col=key&&key.col||0xffc24d;
  const ped=new THREE.Mesh(new THREE.CylinderGeometry(.4,.5,1,16),mat(0x2a2f66));ped.position.y=.5;g.add(ped);
  const plate=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,.08,20),mat(col,{emissive:col,emissiveIntensity:.5}));plate.position.y=1.04;g.add(plate);
  const ic=sprite(iconTex("🔑",null,128),.6);ic.position.y=1.6;g.add(ic);g.userData.ic=ic;
  g.position.set(lk.x,lk.y,lk.z);L.add(g);G.lockM[lk.id]=g}
 // quiz stands
 for(const q of d.quizzes||[]){const g=new THREE.Group();const col=q.who==="sun"?"#e8961c":q.who==="moon"?"#5a4fd0":"#2f8f7a";
  const ped=new THREE.Mesh(new THREE.BoxGeometry(.9,1,.6),mat(0x2a2f66));ped.position.y=.5;g.add(ped);
  const top=new THREE.Mesh(new THREE.BoxGeometry(1,.08,.7),mat(0x8a90c8));top.position.y=1.04;top.rotation.x=-.3;g.add(top);
  const ic=sprite(iconTex(q.kind==="code"?"#":"?",col),.7);ic.position.y=1.8;g.add(ic);g.userData.ic=ic;g.userData.col=col;
  g.position.set(q.x,q.y,q.z);L.add(g);G.quizM[q.id]=g}
 // zones
 for(const z of d.zones||[]){const g=new THREE.Group();const ring=new THREE.Mesh(new THREE.RingGeometry(z.r-.15,z.r,48),basic(0xff7eb6,{transparent:true,opacity:.7,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;g.add(ring);
  const ic=sprite(iconTex(z.kind==="hug"?"🤗":"🙌",null,128),.9);ic.position.y=2.4;g.add(ic);g.userData.ring=ring;g.userData.ic=ic;
  g.position.set(z.x,z.y,z.z);L.add(g);G.zoneM[z.id]=g}
 const gl=d.goal;const beam=new THREE.Mesh(new THREE.CylinderGeometry(gl.r,gl.r,14,40,1,true),basic(0xfff0c0,{transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));
 beam.position.set(gl.x,gl.y+7,gl.z);L.add(beam);G.beam=beam;
 const glight=new THREE.PointLight(0xffe7a8,1.6,10);glight.position.set(gl.x,gl.y+2,gl.z);L.add(glight);
 for(const id in RT.flags)markSolved(id);
 G.camT=null}
function markSolved(id){if(!G.r)return;
 const q=G.quizM[id];if(q){q.userData.ic.material.map=iconTex("✓","#2f9e5b");q.userData.ic.material.needsUpdate=true}
 const l=G.lockM[id];if(l){l.userData.ic.material.map=iconTex("✓","#2f9e5b");l.userData.ic.material.needsUpdate=true}
 const z=G.zoneM[id];if(z){z.userData.ring.material.color.set(0xffd34d)}}

/* ---------- characters ---------- */
function makeHuman(role){
 const sun=role==="sun";
 const Cc=sun?{shirt:0xf6a62e,pants:0x7a3e12,hair:0x3a1f0d,acc:0xffd34d,skin:0xc98e5e,shoe:0x3a1d04}:{shirt:0x5a6ce0,pants:0x1f2650,hair:0x111428,acc:0xdfe6ff,skin:0xd9a477,shoe:0x10142e};
 const root=new THREE.Group(),body=new THREE.Group();root.add(body);
 const bx=(w,h,d,c)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(c));m.castShadow=true;return m};
 const limb=(w,h,c,y)=>{const piv=new THREE.Group();const m=bx(w,h,w,c);m.position.y=-h/2;piv.add(m);piv.position.y=y;return piv};
 const lL=limb(.2,.66,Cc.pants,.7),lR=limb(.2,.66,Cc.pants,.7);lL.position.x=-.13;lR.position.x=.13;body.add(lL,lR);
 for(const l of[lL,lR]){const sh=bx(.23,.1,.32,Cc.shoe);sh.position.set(0,-.66,.05);l.add(sh)}
 const torso=new THREE.Group();torso.position.y=.7;body.add(torso);
 const tm=bx(.52,.58,.3,Cc.shirt);tm.position.y=.29;torso.add(tm);
 const emb=new THREE.Mesh(sun?new THREE.CircleGeometry(.1,20):new THREE.RingGeometry(.05,.1,20,1,0,Math.PI*1.3),basic(Cc.acc,{side:THREE.DoubleSide}));emb.position.set(0,.35,.152);torso.add(emb);
 const aL=limb(.16,.56,Cc.shirt,.54),aR=limb(.16,.56,Cc.shirt,.54);aL.position.x=-.35;aR.position.x=.35;torso.add(aL,aR);
 for(const a of[aL,aR]){const h=new THREE.Mesh(new THREE.SphereGeometry(.1,12,10),mat(Cc.skin));h.position.y=-.6;a.add(h)}
 const head=new THREE.Group();head.position.y=.8;torso.add(head);
 const sk=new THREE.Mesh(new THREE.SphereGeometry(.24,24,18),mat(Cc.skin));sk.castShadow=true;sk.position.y=.06;head.add(sk);
 const hair=new THREE.Mesh(new THREE.SphereGeometry(.255,24,18,0,Math.PI*2,0,Math.PI*.55),mat(Cc.hair));hair.position.y=.08;hair.rotation.x=-.25;head.add(hair);
 for(const x of[-.085,.085]){const e=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8),mat(0x161616));e.position.set(x,.08,.22);head.add(e)}
 const mouth=new THREE.Mesh(new THREE.TorusGeometry(.05,.012,6,12,Math.PI),mat(0x5a1e1e));mouth.position.set(0,-.02,.225);mouth.rotation.z=Math.PI;head.add(mouth);
 if(sun){const cr=new THREE.Group();for(let i=0;i<9;i++){const a=i/9*Math.PI*2;const c=new THREE.Mesh(new THREE.ConeGeometry(.05,.17,6),mat(Cc.acc,{emissive:0xffa020,emissiveIntensity:.9}));c.position.set(Math.cos(a)*.2,.32,Math.sin(a)*.2);cr.add(c)}head.add(cr);head.userData.spin=cr}
 else{const cr=new THREE.Mesh(new THREE.TorusGeometry(.12,.035,8,24,Math.PI*1.2),mat(Cc.acc,{emissive:0x9fb1ff,emissiveIntensity:.8}));cr.position.set(.14,.3,0);cr.rotation.set(0,Math.PI/2,2.4);head.add(cr)}
 const light=new THREE.PointLight(sun?0xffb64a:0x9fb1ff,.9,4);light.position.y=1.6;root.add(light);
 const tag=sprite(iconTex(sun?"☀":"☾",sun?"#e8961c":"#5a4fd0",96),.32);tag.position.y=2.35;root.add(tag);
 root.scale.setScalar(1.05);
 return{root,body,torso,lL,lR,aL,aR,head}}
function animate(P,dt,T){const m=P.model;if(!m)return;
 m.root.position.copy(P.pos);
 const L=(o,v,s=14)=>o+(v-o)*Math.min(1,dt*s);
 let d=P.ry-m.root.rotation.y;d=Math.atan2(Math.sin(d),Math.cos(d));m.root.rotation.y+=d*Math.min(1,dt*12);
 const air=!P.grounded&&!P.carried;if(P.moving&&!air)P.walkT+=dt*11;
 const sw=air?0:(P.moving?Math.sin(P.walkT)*.8:0);
 let lL=air?-.6:sw,lR=air?.3:-sw,aLx=air?-2.6:-sw*.9,aRx=air?-2.6:sw*.9,aLz=air?-.3:0,aRz=air?.3:0,ty=0,tz=0,bodyRy=0,bodyY=(P.moving&&!air?Math.abs(Math.cos(P.walkT))*.06:Math.sin(T*2.4)*.015);
 const a=P.act,at=P.actT;
 if(P.hold){aLx=-2.9;aRx=-2.9;aLz=.15;aRz=-.15}
 if(P.carried){lL=-1.4;lR=-1.4;aLx=-.6;aRx=-.6;aLz=-.9;aRz=.9}
 if(a==="punch"){const k=at<.12?at/.12:Math.max(0,1-(at-.12)/.26);aRx=-1.6*k;aRz=0;ty=-.25*k;aLx=.4*k}
 else if(a==="dance"){const b=T*9;aLx=-2.8+Math.sin(b)*.4;aRx=-2.8-Math.sin(b)*.4;aLz=-.5;aRz=.5;lL=Math.max(0,Math.sin(b))*.6;lR=Math.max(0,-Math.sin(b))*.6;tz=Math.sin(b)*.18;bodyY=Math.abs(Math.sin(b))*.12;bodyRy=at*4}
 else if(a==="wave"){aRz=2.6+Math.sin(T*14)*.35;aRx=0}
 else if(a==="heart"){aLx=-1.9;aRx=-1.9;aLz=.5;aRz=-.5}
 else if(a==="highfive"){aRx=-2.5;aRz=.25;ty=-.2}
 else if(a==="hug"){aLx=-1.45;aRx=-1.45;aLz=.55;aRz=-.55}
 if(S.advancing){aLx=-2.9;aRx=-2.9;bodyY=Math.abs(Math.sin(T*7))*.3}
 if(P.stun>0){bodyRy=(P.spin||0)*(.45-P.stun)*14}
 m.lL.rotation.x=L(m.lL.rotation.x,lL);m.lR.rotation.x=L(m.lR.rotation.x,lR);
 m.aL.rotation.x=L(m.aL.rotation.x,aLx,a==="punch"?30:14);m.aR.rotation.x=L(m.aR.rotation.x,aRx,a==="punch"?30:14);
 m.aL.rotation.z=L(m.aL.rotation.z,aLz);m.aR.rotation.z=L(m.aR.rotation.z,aRz);
 m.torso.rotation.y=L(m.torso.rotation.y,ty,20);m.torso.rotation.z=L(m.torso.rotation.z,tz);
 m.body.rotation.y=a==="dance"||P.stun>0?bodyRy:L(m.body.rotation.y,0,10);
 m.body.position.y=bodyY;
 if(m.head.userData.spin)m.head.userData.spin.rotation.y+=dt*1.2}

/* ---------- effects ---------- */
function spawnHearts(P){if(!G.r)return;for(let i=0;i<5;i++){const s=sprite(G.heartTex,.35+Math.random()*.2);
 s.position.set(P.pos.x+(Math.random()-.5)*.6,P.pos.y+1.8+Math.random()*.3,P.pos.z+(Math.random()-.5)*.6);G.scene.add(s);
 G.fx.push({o:s,v:V3((Math.random()-.5)*.6,1.2+Math.random(),(Math.random()-.5)*.6),life:1.6,max:1.6,g:0,delay:i*.12})}}
function sparkle(p,col){if(!G.r)return;for(let i=0;i<12;i++){const m=new THREE.Mesh(new THREE.OctahedronGeometry(.07),basic(col,{transparent:true}));m.position.copy(p);G.scene.add(m);
 G.fx.push({o:m,v:V3((Math.random()-.5)*4,1+Math.random()*3,(Math.random()-.5)*4),life:.8,max:.8,g:6})}}
function pow(x,y,z){const r=new THREE.Mesh(new THREE.RingGeometry(.05,.18,20),basic(0xffe08a,{transparent:true,side:THREE.DoubleSide,depthWrite:false}));
 r.position.set(x,y,z);r.lookAt(G.cam.position);G.scene.add(r);G.fx.push({o:r,v:V3(),life:.3,max:.3,g:0,grow:6})}
function burst(d){for(let i=0;i<10;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.3,.3,.3),new THREE.MeshStandardMaterial({map:crateTex()}));
 m.position.set(d.x+(Math.random()-.5)*d.w,d.y+(Math.random()-.5)*d.h,d.z+(Math.random()-.5)*d.d);G.scene.add(m);
 G.fx.push({o:m,v:V3((Math.random()-.5)*5,3+Math.random()*3,(Math.random()-.5)*5),life:1.2,max:1.2,g:14,spin:Math.random()*8})}}
function updateFx(dt){for(let i=G.fx.length-1;i>=0;i--){const f=G.fx[i];if(f.delay>0){f.delay-=dt;f.o.visible=false;continue}f.o.visible=true;
 f.life-=dt;f.v.y-=f.g*dt;f.o.position.addScaledVector(f.v,dt);if(f.spin){f.o.rotation.x+=f.spin*dt;f.o.rotation.z+=f.spin*dt}
 if(f.grow)f.o.scale.addScalar(f.grow*dt);
 const a=Math.max(0,f.life/f.max);if(f.o.material){f.o.material.transparent=true;f.o.material.opacity=a}
 if(f.life<=0){G.scene.remove(f.o);if(f.o.geometry&&f.o.geometry.type!=="BufferGeometry")f.o.geometry.dispose();G.fx.splice(i,1)}}}

/* ===================== input ===================== */
const IN={keys:{},jump:false};
const KEYMAP={w:"f",arrowup:"f",s:"b",arrowdown:"b",a:"l",arrowleft:"l",d:"r",arrowright:"r"};
document.addEventListener("keydown",e=>{if(!S.mode||e.target.tagName==="INPUT"||!quizEl.hidden)return;const k=e.key.toLowerCase();
 if(KEYMAP[k]||[" ","q","e","f","g","tab"].includes(k))e.preventDefault();
 IN.keys[k]=true;if(k===" ")IN.jump=true;if(e.repeat)return;
 if(k==="f")startAct(controlled(),"punch");if(k==="g")interact(controlled());
 const em={"1":"dance","2":"wave","3":"heart","4":"highfive","5":"hug"}[k];if(em)startAct(controlled(),em);
 if(k==="tab"&&S.mode==="single")swapChar()});
document.addEventListener("keyup",e=>{IN.keys[e.key.toLowerCase()]=false});
document.addEventListener("gesturestart",e=>e.preventDefault());
document.addEventListener("dblclick",e=>{if(S.mode)e.preventDefault()},{passive:false});
let joy=null,looks={};
function bindStage(){
 const jz=document.getElementById("joy");
 jz.addEventListener("pointerdown",e=>{e.preventDefault();jz.setPointerCapture(e.pointerId);if(joy)return;
  const b=document.createElement("div");b.className="joybase";b.innerHTML='<div class="joyknob"></div>';b.style.left=e.clientX+"px";b.style.top=e.clientY+"px";stage.appendChild(b);
  joy={id:e.pointerId,ox:e.clientX,oy:e.clientY,b,k:b.firstChild,x:0,y:0};document.getElementById("joyhint").hidden=true});
 jz.addEventListener("pointermove",e=>{if(!joy||e.pointerId!==joy.id)return;let dx=e.clientX-joy.ox,dy=e.clientY-joy.oy;const l=Math.hypot(dx,dy),mx=55;if(l>mx){dx*=mx/l;dy*=mx/l}joy.x=dx/mx;joy.y=dy/mx;joy.k.style.transform=`translate(${dx}px,${dy}px)`});
 const je=e=>{if(joy&&e.pointerId===joy.id){joy.b.remove();joy=null}};jz.addEventListener("pointerup",je);jz.addEventListener("pointercancel",je);
 const lk=document.getElementById("look");
 lk.addEventListener("pointerdown",e=>{e.preventDefault();lk.setPointerCapture(e.pointerId);looks[e.pointerId]={x:e.clientX,y:e.clientY};document.getElementById("emos").hidden=true});
 lk.addEventListener("pointermove",e=>{const p=looks[e.pointerId];if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
  G.yaw-=dx*.0085;G.pitch=Math.max(.12,Math.min(1.25,G.pitch+dy*.006))});
 const le=e=>{delete looks[e.pointerId]};lk.addEventListener("pointerup",le);lk.addEventListener("pointercancel",le);
 document.querySelectorAll(".abtn").forEach(b=>{b.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();b.classList.add("down");const a=b.dataset.a;
   if(a==="jump")IN.jump=true;else if(a==="grab")interact(controlled());else if(a==="emo")document.getElementById("emos").hidden=!document.getElementById("emos").hidden;
   else{startAct(controlled(),a);if(b.classList.contains("emo2"))document.getElementById("emos").hidden=true}});
  const up=()=>b.classList.remove("down");b.addEventListener("pointerup",up);b.addEventListener("pointercancel",up);b.addEventListener("pointerleave",up)});
 document.getElementById("swap").addEventListener("pointerdown",e=>{e.preventDefault();swapChar()});
 document.getElementById("menubtn").addEventListener("click",()=>toggleMenu())}
function readInput(){let x=0,z=0;const k=IN.keys;
 for(const key in KEYMAP)if(k[key]){const d=KEYMAP[key];if(d==="f")z-=1;if(d==="b")z+=1;if(d==="l")x-=1;if(d==="r")x+=1}
 if(joy){x+=joy.x;z+=joy.y}
 const l=Math.hypot(x,z);if(l>1){x/=l;z/=l}if(l<.12){x=0;z=0}
 if(k.q)G.yaw+=.035;if(k.e)G.yaw-=.035;
 if(!quizEl.hidden){x=0;z=0}
 const c=Math.cos(G.yaw),s=Math.sin(G.yaw);
 const j=IN.jump&&quizEl.hidden;IN.jump=false;return{x:x*c+z*s,z:-x*s+z*c,j}}

/* ===================== loop ===================== */
let lastHint=null,lastUi=0;
function frame(){
 if(stage.hidden||!G.r||!RT)return;
 const dt=Math.min(.05,G.clock.getDelta()),T=G.clock.elapsedTime;
 const inp=readInput();
 F=computeF();
 const subs=Math.ceil(dt/.016),h=dt/subs;
 for(let i=0;i<subs;i++){updateWorld(h);
  if(S.mode==="single"){const a=controlled(),b=a===PL.sun?PL.moon:PL.sun;stepPlayer(a,inp.x,inp.z,i===0&&inp.j,h);stepPlayer(b,0,0,false,h)}
  else stepPlayer(ME,inp.x,inp.z,i===0&&inp.j,h);
  updateObjs(h)}
 if(S.mode==="online"&&OTHER){
  if(ME.hold&&ME.hold.player){OTHER.pos.set(ME.pos.x,ME.pos.y+1.7,ME.pos.z);OTHER.ry=ME.ry;OTHER.carried=S.role}
  else if(OTHER.target){OTHER.pos.lerp(OTHER.target,1-Math.exp(-dt*12));let d=OTHER.tRy-OTHER.ry;d=Math.atan2(Math.sin(d),Math.cos(d));OTHER.ry+=d*Math.min(1,dt*12)}
  if(OTHER.act){OTHER.actT+=dt;if(OTHER.actT>3.3)OTHER.act=null}}
 coupleCheck();
 // visuals
 for(const m of RT.dyn)if(m.mesh)m.mesh.position.set(m.x,m.y,m.z);
 for(const g of RT.tog){const df=g.def,want=df.type==="gate"?(g.on?-df.h-.2:0):(g.on?0:-6);g.anim+=(want-g.anim)*Math.min(1,dt*(df.latch?4:9));g.mesh.position.y=df.y+g.anim;g.mesh.visible=g.anim>-5.8}
 for(const id in RT.crates){const c=RT.crates[id];if(c.mesh&&c.hp>0){c.shake=Math.max(0,c.shake-dt*4);c.mesh.position.x=c.def.x+Math.sin(T*60)*.06*c.shake}}
 for(const p of LV[S.lvl].plates||[]){const g=G.plates[p.id];if(!g)continue;const on=F[p.id],bt=g.userData.btn;
  bt.position.y+=((on?.03:.1)-bt.position.y)*Math.min(1,dt*14);bt.material.emissiveIntensity+=((on?1.3:.35)-bt.material.emissiveIntensity)*Math.min(1,dt*10);
  if(g.userData.star){g.userData.star.rotation.y+=dt*2;g.userData.star.position.y=1.4+Math.sin(T*2)*.1}}
 G.stars.forEach((m,i)=>{if(m&&m.visible){m.rotation.y+=dt*2.2;m.position.y=LV[S.lvl].stars[i][1]+Math.sin(T*2.5+i)*.08}});
 for(const Lz of RT.lasers){if(!Lz.mesh)continue;Lz.mesh.position.set(Lz.x,Lz.y,Lz.z);Lz.posts.position.set(Lz.x,Lz.y,Lz.z);Lz.mesh.material.opacity=Lz.on?.8+Math.sin(T*30)*.1:.07}
 for(const b of RT.balls){if(!b.mesh)continue;b.mesh.position.set(b.x,b.y,b.z);b.mesh.rotation.x-=dt*b.def.sp/b.def.r*(b.nz||0);b.mesh.rotation.z+=dt*b.def.sp/b.def.r*(b.nx||0)}
 for(const mo of RT.mon){if(!mo.mesh)continue;mo.mesh.position.set(mo.x,mo.y,mo.z);mo.mesh.rotation.y=mo.dir;const s=1+Math.sin(T*8+mo.x)*.1;mo.mesh.userData.body.scale.set(1/s,.75*s,1/s)}
 for(const id in RT.objs){const o=RT.objs[id];if(!o.mesh)continue;o.mesh.visible=!o.gone;o.mesh.position.copy(o.pos);if(o.mesh.userData.spin)o.mesh.rotation.y+=dt*2}
 for(const id in G.quizM){const g=G.quizM[id];g.userData.ic.position.y=1.8+Math.sin(T*2.4)*.08}
 for(const id in G.zoneM){const g=G.zoneM[id];g.userData.ic.position.y=2.4+Math.sin(T*2)*.1}
 if(G.beam)G.beam.material.opacity=.14+Math.sin(T*2)*.05;
 for(const P of [PL.sun,PL.moon]){const vis=S.mode==="single"||P===ME||partnerHere();P.model.root.visible=vis;if(vis)animate(P,dt,T)}
 updateFx(dt);
 // camera
 const Cp=controlled().pos;
 if(!G.camT)G.camT=Cp.clone();
 G.camT.x+=(Cp.x-G.camT.x)*Math.min(1,dt*10);G.camT.z+=(Cp.z-G.camT.z)*Math.min(1,dt*10);G.camT.y+=(Cp.y-G.camT.y)*Math.min(1,dt*3);
 const dist=7.2,cp=Math.cos(G.pitch);
 G.cam.position.set(G.camT.x+Math.sin(G.yaw)*cp*dist,G.camT.y+1.1+Math.sin(G.pitch)*dist,G.camT.z+Math.cos(G.yaw)*cp*dist);
 G.cam.lookAt(G.camT.x,G.camT.y+1.1,G.camT.z);
 G.sun.position.set(Cp.x-6,Cp.y+14,Cp.z+6);G.sun.target.position.copy(Cp);
 // hints + grab label (a few times a second)
 if(now()-lastUi>200){lastUi=now();uiTick()}
 // level complete
 const gl=LV[S.lvl].goal,ps=S.mode==="single"?[PL.sun.pos,PL.moon.pos]:(partnerHere()?[ME.pos,OTHER.pos]:[ME.pos]);
 if(!S.advancing&&ps.length===2&&ps.every(p=>Math.hypot(p.x-gl.x,p.z-gl.z)<gl.r&&p.y>gl.y-.5))levelDone();
 G.r.render(G.scene,G.cam)}
function uiTick(){
 const C=controlled(),Cp=C.pos;let txt=null,key=null;
 const q=nearQuiz(C);
 if(q){key="q"+q.id+LANG;txt=q.who&&q.who!==C.role?t("onlyAnswer")(roleName(q.who)):t("tapAnswer")}
 else{let best=1e9;for(const s of LV[S.lvl].signs||[]){const d=Math.hypot(Cp.x-s.x,Cp.z-s.z);if(d<s.r&&d<best){best=d;key=s.k+LANG+S.role;txt=signText(s)}}}
 const hint=document.getElementById("hint");if(txt){if(lastHint!==key){hint.querySelector("span").textContent=txt;lastHint=key}hint.classList.remove("off")}else hint.classList.add("off");
 const [ic,lb]=grabLabel(C);const gb=document.getElementById("grabbtn");const html=`<span>${ic}</span><small>${lb}</small>`;if(gb._h!==html){gb.innerHTML=html;gb._h=html}}
function levelDone(){S.advancing=true;closeQuiz();const ban=document.getElementById("ban");const d=LV[S.lvl];
 let extra=t("starsGot")(RT.lvScore.sun,RT.lvScore.moon);
 if(d.race){const a=RT.lvScore.sun,b=RT.lvScore.moon;extra=(a===b?t("raceTie"):t("raceWin")(roleName(a>b?"sun":"moon")))+"<br>"+extra}
 ban.innerHTML=`<div>${t("lvDone")}<div class="sub">${extra}</div></div>`;ban.hidden=false;
 const next=S.lvl+1;ls("ts.reached",Math.max(+(ls("ts.reached")||0),next));
 setTimeout(()=>{ban.hidden=true;if(next>=NL)showEnd();else loadLevel(next)},3200)}
function toast(msg){const d=document.createElement("div");d.className="toast";d.textContent=msg;stage.appendChild(d);setTimeout(()=>d.remove(),2000)}
let rzT=null;function resize(){if(!G.r)return;const w=window.innerWidth,h=window.innerHeight;G.r.setSize(w,h,false);G.cam.aspect=w/h;G.cam.updateProjectionMatrix()}
window.addEventListener("resize",()=>{clearTimeout(rzT);rzT=setTimeout(resize,120)});

/* ===================== quiz UI ===================== */
const quizEl=document.getElementById("quiz");let quizQ=null,quizCode="";
function openQuiz(q){quizQ=q;quizCode="";renderQuiz();quizEl.hidden=false}
function closeQuiz(){quizEl.hidden=true;quizQ=null}
function renderQuiz(){const q=quizQ;if(!q)return;
 const who=q.who?`<p class="eyebrow">${q.who==="sun"?t("hdrSun"):t("hdrMoon")}</p>`:"";
 if(q.kind==="code"){quizEl.innerHTML=`<div class="qbox">${who}<h3>${t("enterCode")}</h3><div class="qcode">${quizCode.padEnd(q.code.length,"•")}</div>
  <div class="keypad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-n="${n}">${n}</button>`).join("")}<button data-c="1">${t("clear")}</button><button data-n="0">0</button><button data-ok="1" class="kok">${t("ok")}</button></div>
  <button class="ghost qclose">${t("close")}</button></div>`;
  quizEl.querySelectorAll("[data-n]").forEach(b=>b.onclick=()=>{if(quizCode.length<q.code.length){quizCode+=b.dataset.n;renderQuiz()}});
  quizEl.querySelector("[data-c]").onclick=()=>{quizCode="";renderQuiz()};
  quizEl.querySelector("[data-ok]").onclick=()=>answer(quizCode===q.code)}
 else{const Q=t(q.q);quizEl.innerHTML=`<div class="qbox">${who}<h3>${Q.q}</h3><div class="opts">${Q.o.map((o,i)=>`<button data-i="${i}">${o}</button>`).join("")}</div><button class="ghost qclose">${t("close")}</button></div>`;
  quizEl.querySelectorAll("[data-i]").forEach(b=>b.onclick=()=>answer(+b.dataset.i===q.ans))}
 quizEl.querySelector(".qclose").onclick=closeQuiz}
function answer(ok){const q=quizQ;closeQuiz();if(!q)return;if(ok){setFlag(q.id,true);toast(t("opened"))}else toast(t("wrong"))}

/* ===================== views ===================== */
function langToggle(){return `<div class="lang" role="group"><button data-l="en" aria-pressed="${LANG==="en"}">English</button><button data-l="my" aria-pressed="${LANG==="my"}">မြန်မာ</button></div>`}
function bindLang(root,rerender){root.querySelectorAll(".lang button").forEach(b=>b.onclick=()=>{setLang(b.dataset.l);rerender()})}
let pickedLv=0,lobbyMode=ls("ts.mode")||"together",pickedRole=null;
function lobby(){
 document.body.classList.remove("playing");stage.hidden=true;app.hidden=false;S.mode=null;
 const code=S.code||ls("ts.code")||("sky"+Math.floor(1000+Math.random()*9000));
 const reached=+(ls("ts.reached")||0);
 const lvGrid=`<div class="field"><label>${t("chooseLv")}</label><div class="levels">${LV.map((l,i)=>`<button class="lvbtn" data-i="${i}" aria-pressed="${i===pickedLv}"><b>${i+1}${i<reached?"<i>✓</i>":""}</b><span>${t(l.name)}</span></button>`).join("")}</div></div>`;
 app.innerHTML=`${langToggle()}<div class="hero"><p class="eyebrow">${t("tag")}</p><h1><span class="s">Two</span> <span class="m">Skies</span></h1><p>${t("intro")}</p></div>
  <div class="modes"><button class="mode" data-m="single" aria-pressed="${lobbyMode==="single"}"><b>🎮 ${t("single")}</b><span>${t("singleSub")}</span></button><button class="mode" data-m="together" aria-pressed="${lobbyMode==="together"}"><b>💞 ${t("together")}</b><span>${t("togetherSub")}</span></button></div>
  ${lobbyMode==="together"?`<div class="field"><label>${t("pickRole")}</label><div class="pick">
   <button class="role sun" data-r="sun" aria-pressed="${pickedRole==="sun"}"><h3>☀ ${t("sun")}</h3><span>${t("sunSub")}</span></button>
   <button class="role moon" data-r="moon" aria-pressed="${pickedRole==="moon"}"><h3>☾ ${t("moon")}</h3><span>${t("moonSub")}</span></button></div></div>`:""}
  ${lvGrid}
  ${lobbyMode==="together"?`<div class="field"><label for="code">${t("code")}</label><div class="row"><input id="code" value="${code}" maxlength="20" autocomplete="off"><button class="primary" id="go" ${pickedRole?"":"disabled"}>${t("join")}</button></div><p class="err" id="err"></p></div>
  <div class="card"><p class="eyebrow">${t("how")}</p><ol><li>${t("h1")}</li><li>${t("h2")}</li><li>${t("h3")}</li><li>${t("h4")}</li></ol></div>`
  :`<div class="row"><button class="primary" id="solo">${t("start")}</button></div>`}`;
 bindLang(app,lobby);
 app.querySelectorAll(".mode").forEach(b=>b.onclick=()=>{lobbyMode=b.dataset.m;ls("ts.mode",lobbyMode);lobby()});
 app.querySelectorAll(".lvbtn").forEach(b=>b.onclick=()=>{pickedLv=+b.dataset.i;app.querySelectorAll(".lvbtn").forEach(x=>x.setAttribute("aria-pressed",x===b))});
 app.querySelectorAll(".role").forEach(b=>b.onclick=()=>{pickedRole=b.dataset.r;app.querySelectorAll(".role").forEach(x=>x.setAttribute("aria-pressed",x===b));const g=document.getElementById("go");if(g)g.disabled=false});
 const go=document.getElementById("go");
 if(go)go.onclick=async()=>{const inp=document.getElementById("code");const v=inp.value.toLowerCase().replace(/[^a-z0-9]/g,"");const err=document.getElementById("err");
  if(!v){err.textContent=t("noCode");return}
  go.disabled=true;go.textContent=t("joining");S.code=v;ls("ts.code",v);S.role=pickedRole;
  const r=await netStart();
  if(!r.ok){netStop();go.disabled=false;go.textContent=t("join");err.textContent=r.err==="taken"?t("taken")(roleName(pickedRole)):t("noConn");return}
  S.mode="online";startGame()};
 const solo=document.getElementById("solo");if(solo)solo.onclick=()=>{S.mode="single";S.role="sun";activeRole="sun";startGame()}}
function startGame(){
 if(!window.THREE){app.innerHTML=`<p class="err">${t("noGL")}</p>`;return}
 PL.sun=PL.sun||newPlayer("sun");PL.moon=PL.moon||newPlayer("moon");
 ME=S.mode==="online"?PL[S.role]:PL.sun;OTHER=S.mode==="online"?PL[otherRole(S.role)]:null;if(OTHER){OTHER.seen=false;OTHER.target=null}
 S.start=Date.now();S.score={sun:0,moon:0};
 app.hidden=true;stage.hidden=false;document.body.classList.add("playing");document.body.classList.toggle("moonrole",S.mode==="online"&&S.role==="moon");
 if(!initGL()){stage.insertAdjacentHTML("beforeend",`<div class="nogl">${t("noGL")}</div>`);return}
 if(!stage.querySelector("canvas")){stage.prepend(G.r.domElement);bindStage()}
 resize();G.yaw=0;G.pitch=.48;
 loadLevel(pickedLv);hudTexts();window.scrollTo(0,0)}
function hudLevel(){document.getElementById("lvname").textContent=`${t("level")(S.lvl+1)} · ${t(LV[S.lvl].name)}`;lastHint=null}
function hudStars(){if(!RT)return;const tot=RT.stars.length,got=RT.stars.filter(Boolean).length;
 document.getElementById("stars").innerHTML=`⭐ ${got}/${tot} <span>☀ ${RT.lvScore.sun} · ☾ ${RT.lvScore.moon}</span>`}
function hudTexts(){document.getElementById("jumpbtn").textContent=t("jump");document.getElementById("joyhint").textContent=t("walk");
 document.getElementById("swap").hidden=S.mode!=="single";hudLevel();hudStatus();hudStars();buildMenu();lastHint=null;document.getElementById("grabbtn")._h=null}
function hudStatus(){
 const sw=document.getElementById("swap");if(sw)sw.textContent=t("switchTo")(roleName(otherRole(activeRole)));
 const st=document.getElementById("status");if(!st)return;
 if(S.mode==="single"){st.innerHTML=`<span class="dot on"></span>${t("practice")} · ${roleName(activeRole)}`;return}
 if(S.mode!=="online")return;
 const o=roleName(otherRole(S.role));const open=[...NET.conns].some(c=>c.open);
 let s,on=false;if(S.dup&&now()-S.dup<6000){st.innerHTML=`<span class="dot"></span>${t("dupRole")(roleName(S.role))}`;return}
 if(partner&&!partnerAway()&&open){on=true;s=partner.lvl===S.lvl?t("here")(o):t("elsewhere")(o)}
 else if(partner)s=t("away")(o);else s=`${t("waiting")(o)} <b>${S.code}</b>`;
 st.innerHTML=`<span class="dot ${on?"on":""}"></span>${t("you")(roleName(S.role))} · ${s}`}
function buildMenu(){const m=document.getElementById("menu");
 m.innerHTML=`${langToggle()}<button class="ghost" id="mBack">${t("back")}</button><button class="ghost" id="mRestart">${t("restart")}</button><button class="ghost" id="mLeave">${t("leave")}</button>`;
 bindLang(m,()=>{hudTexts();refreshSigns()});
 m.querySelector("#mBack").onclick=()=>{const C=controlled();dropHeld(C);spawn(C);toggleMenu(false)};
 m.querySelector("#mRestart").onclick=()=>{loadLevel(S.lvl);toggleMenu(false)};
 m.querySelector("#mLeave").onclick=()=>{toggleMenu(false);netStop();lobby()}}
function toggleMenu(force){const m=document.getElementById("menu");m.hidden=typeof force==="boolean"?!force:!m.hidden}
function swapChar(){activeRole=otherRole(activeRole);G.camT=null;hudStatus();lastHint=null}
function showEnd(){
 document.body.classList.remove("playing");stage.hidden=true;app.hidden=false;
 const mins=S.start?Math.max(1,Math.round((Date.now()-S.start)/60000)):null;
 app.innerHTML=`${langToggle()}<div class="end"><h2>${t("win")}</h2><div class="eclipse"></div><p>${t("winSub")(mins)}</p><p>${t("starsGot")(S.score.sun,S.score.moon)}</p>
  <div class="row"><button class="primary" id="again">${t("again")}</button><button class="ghost" id="lobby">${t("lobby")}</button></div></div>`;
 bindLang(app,showEnd);
 document.getElementById("again").onclick=()=>{pickedLv=0;app.hidden=true;stage.hidden=false;document.body.classList.add("playing");S.score={sun:0,moon:0};loadLevel(0)};
 document.getElementById("lobby").onclick=()=>{netStop();lobby()}}
setLang(LANG);
lobby();
