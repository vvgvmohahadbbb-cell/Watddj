// همسة — خادم خفيف. يمرّر رسائل مشفّرة فقط ولا يقدر يقرأها.
const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {WebSocketServer}=require('ws');
const PORT=+process.env.PORT||3000, VERSION='1.7.0';
const F=path.join(__dirname,'db.json'), P=f=>path.join(__dirname,f);
let db={users:{},byNum:{},tok:{},q:{},groups:{},inv:{}};
try{db=JSON.parse(fs.readFileSync(F))}catch{}
const fix=()=>{db.groups=db.groups||{};db.inv=db.inv||{}};fix();
// تخزين دائم: إن وُجد UPSTASH_URL تُحفظ البيانات في Upstash Redis (مجاني) وإلا في db.json
const UP=process.env.UPSTASH_URL,TK=process.env.UPSTASH_TOKEN;
const rcmd=async c=>{const r=await fetch(UP,{method:'POST',headers:{Authorization:'Bearer '+TK},body:JSON.stringify(c)});
  if(!r.ok)throw new Error('upstash '+r.status);return (await r.json()).result};
const persist=()=>UP?rcmd(['SET','hamsa:db',JSON.stringify(db)]).catch(e=>console.log('save fail',e.message)):new Promise(r=>fs.writeFile(F,JSON.stringify(db),r));
let tm;const save=now=>{clearTimeout(tm);tm=setTimeout(persist,now?0:(UP?15000:1500))};
['SIGTERM','SIGINT'].forEach(g=>process.on(g,async()=>{await persist();process.exit(0)}));
const ready=(async()=>{
  if(!UP)return;
  try{const r=await rcmd(['GET','hamsa:db']);if(r){db=JSON.parse(r);fix()}}
  catch(e){console.log('تعذّر تحميل البيانات، إيقاف لحماية الحسابات:',e.message);process.exit(1)}
})();
const hash=(p,s)=>crypto.scryptSync(p,s,32).toString('hex');
const online={}, send=(w,o)=>w.readyState===1&&w.send(JSON.stringify(o));
const dnOf=u=>u.dn||u.name;
// ---- إشعارات (Firebase Cloud Messaging) ----
let SA=null;try{SA=process.env.FIREBASE_SA?JSON.parse(process.env.FIREBASE_SA):null}catch(e){console.log('FIREBASE_SA غير صالح')}
let fTok='',fExp=0;
async function fAuth(){
  if(fTok&&Date.now()<fExp)return fTok;
  const now=Math.floor(Date.now()/1000),b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
  const h=b({alg:'RS256',typ:'JWT'})+'.'+b({iss:SA.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const sig=crypto.createSign('RSA-SHA256').update(h).sign(SA.private_key,'base64url');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:'grant_type='+encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')+'&assertion='+h+'.'+sig});
  const j=await r.json();fTok=j.access_token;fExp=Date.now()+((j.expires_in||3600)-120)*1000;return fTok}
async function push(u,title,body,tag){
  if(!SA||!u||!u.fcm)return;
  try{const t=await fAuth();
    const r=await fetch(`https://fcm.googleapis.com/v1/projects/${SA.project_id}/messages:send`,{method:'POST',
      headers:{Authorization:'Bearer '+t,'content-type':'application/json'},
      body:JSON.stringify({message:{token:u.fcm,data:{title:String(title),body:String(body),tag:String(tag)},android:{priority:'HIGH'}}})});
    if(!r.ok){const x=await r.text();if(x.includes('UNREGISTERED')){delete u.fcm;save()}}
  }catch(e){console.log('push',e.message)}}
// ---- تسليم الرسائل (فوري أو في الطابور) + قرار الإشعار ----
function deliver(to,o,info){
  const w=online[to];
  if(w)send(w,o);
  else{o.ts=o.ts||Date.now();const q=db.q[to]=(db.q[to]||[]).filter(x=>Date.now()-x.ts<2.592e8);q.push(o);if(q.length>300)q.shift();save()}
  if(info){const u=db.users[db.byNum[to]];
    if(u&&(!w||!w.fg)){const mu=(u.mutes||{})[info.key];
      if(!(mu===-1||mu>Date.now())||info.mention)push(u,info.title,info.mention?'ذكرك في رسالة':'رسالة جديدة',info.key)}}}
// ---- مجموعات ----
const isAd=(g,n)=>g.owner===n||g.admins.includes(n);
const ginfo=g=>({id:g.id,name:g.name,av:g.av,owner:g.owner,admins:g.admins,members:g.members.map(n=>{const u=db.users[db.byNum[n]];return{num:n,name:dnOf(u),pub:u.pub}})});
const bcast=g=>{const i=ginfo(g);g.members.forEach(n=>deliver(n,{t:'ginfo',g:i}))};
const newCode=()=>crypto.randomBytes(8).toString('base64url');
const DL=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تحميل همسة</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1220;color:#EAF1FA;font:16px system-ui;text-align:center"><div style="padding:28px;max-width:380px">
<svg viewBox="0 0 108 108" width="110" height="110"><rect width="108" height="108" rx="28" fill="#142238"/><path fill="#F5F7FA" d="M42,32H66A12,12 0 0 1 78,44V58A12,12 0 0 1 66,70H52L38,82V68.5A12,12 0 0 1 30,58V44A12,12 0 0 1 42,32Z"/><path fill="#0E1A2B" d="M43,47h4v8h-4zM61,45h4v12h-4z"/><path fill="#FFB703" d="M52,42h4v18h-4z"/></svg>
<h1>همسة</h1><p style="color:#8CA0B8">تطبيق مراسلة خاص ومشفّر</p>
<a href="/app.apk" style="display:block;background:linear-gradient(135deg,#FFC53D,#FF9F1C);color:#1a1200;font-weight:700;padding:15px;border-radius:14px;text-decoration:none">تنزيل التطبيق (أندرويد)</a>
<p style="color:#8CA0B8;font-size:14px">بعد التنزيل افتح الملف، وإذا طلب اسمح بالتثبيت من هذا المصدر.</p><a href="/" style="color:#FFC53D">أو افتح النسخة على المتصفح</a></div></body></html>`;
const handler=(q,s)=>{
  if(q.url==='/api/ice'){
    const ice=[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
    if(process.env.TURN_URL)ice.push({urls:process.env.TURN_URL,username:process.env.TURN_USER,credential:process.env.TURN_PASS});
    s.setHeader('content-type','application/json');return s.end(JSON.stringify(ice));
  }
  if(q.url==='/api/hint'){
    let apk=0;try{apk=JSON.parse(fs.readFileSync(P('apk.json'))).apk||0}catch{}
    s.setHeader('content-type','application/json');return s.end(JSON.stringify({v:VERSION,apk}));
  }
  if(q.url==='/api/push'&&q.method==='POST'){
    let b='';q.on('data',d=>{b+=d;if(b.length>4000)q.destroy()});
    q.on('end',()=>{try{const j=JSON.parse(b),u=db.users[db.tok[j.tok]];if(u&&j.fcm){u.fcm=j.fcm;save()}}catch{}s.end('ok')});return;
  }
  if(q.url==='/download'){s.setHeader('content-type','text/html;charset=utf-8');return s.end(DL)}
  if(q.url==='/app.apk'){
    s.setHeader('content-type','application/vnd.android.package-archive');s.setHeader('content-disposition','attachment; filename="hamsa.apk"');
    return fs.createReadStream(P('app.apk')).on('error',()=>{s.statusCode=404;s.end('no apk')}).pipe(s);
  }
  s.setHeader('content-type','text/html;charset=utf-8');
  fs.createReadStream(P('index.html')).on('error',()=>s.end('missing index.html')).pipe(s);
};
const secure=!process.env.PLAIN&&fs.existsSync(P('key.pem'))&&fs.existsSync(P('cert.pem'));
const srv=secure?https.createServer({key:fs.readFileSync(P('key.pem')),cert:fs.readFileSync(P('cert.pem'))},handler):http.createServer(handler);
const wss=new WebSocketServer({server:srv,maxPayload:64*1024});

function login(ws,user,tok){
  const old=online[user.num];if(old&&old!==ws){send(old,{t:'kick'});old.close()}
  ws.num=user.num;online[user.num]=ws;
  send(ws,{t:'ok',me:{name:dnOf(user),user:user.name,num:user.num,bio:user.bio,av:user.av,mutes:user.mutes||{}},tok,v:VERSION});
  (db.q[user.num]||[]).forEach(m=>send(ws,m));delete db.q[user.num];save();
}
wss.on('connection',ws=>{
  ws.bad=0;
  ws.on('close',()=>{if(ws.num&&online[ws.num]===ws){delete online[ws.num];const u=db.users[db.byNum[ws.num]];if(u)u.ls=Date.now()}});
  ws.on('message',raw=>{
    let m;try{m=JSON.parse(raw)}catch{return}
    if(!ws.num){
      if(m.t==='register'){
        const n=String(m.u||'').trim(),k=n.toLowerCase();
        if(n.length<3||n.length>20||String(m.p||'').length<6||!m.pub)return send(ws,{t:'err',e:'بيانات غير صالحة (الاسم 3 أحرف+، السر 6+)'});
        if(db.users[k])return send(ws,{t:'err',e:'الاسم مستخدم'});
        let num;do num='7'+crypto.randomInt(10000000,99999999);while(db.byNum[num]);
        const salt=crypto.randomBytes(16).toString('hex');
        const u={name:n,num,salt,h:hash(m.p,salt),pub:m.pub};
        db.users[k]=u;db.byNum[num]=k;
        const tok=crypto.randomBytes(24).toString('hex');db.tok[tok]=k;save(1);return login(ws,u,tok);
      }
      if(m.t==='login'){
        const u=db.users[String(m.u||'').trim().toLowerCase()];
        if(!u||hash(String(m.p),u.salt)!==u.h){if(++ws.bad>=8)ws.close();return send(ws,{t:'err',e:'الاسم أو كلمة السر غلط'})}
        if(m.pub)u.pub=m.pub;
        const tok=crypto.randomBytes(24).toString('hex');db.tok[tok]=u.name.toLowerCase();save(1);return login(ws,u,tok);
      }
      if(m.t==='resume'){
        const u=db.users[db.tok[m.tok]];
        return u?login(ws,u,m.tok):send(ws,{t:'bad'});
      }
      return;
    }
    const me=db.users[db.byNum[ws.num]];
    if(m.t==='fg'){ws.fg=!!m.v;return}
    if(m.t==='prof'){
      if(typeof m.dn==='string'&&m.dn.trim())me.dn=m.dn.trim().slice(0,30);
      me.bio=String(m.bio||'').slice(0,140);
      if(m.av==='')delete me.av;else if(typeof m.av==='string'&&m.av.length<30000)me.av=m.av;
      save();return send(ws,{t:'prof',name:dnOf(me),bio:me.bio,av:me.av})}
    if(m.t==='mute'){const k=String(m.key||'').slice(0,40);me.mutes=me.mutes||{};
      if(!m.until)delete me.mutes[k];else me.mutes[k]=m.until;save();return}
    if(m.t==='pres'){const r={};for(const n of (m.nums||[]).slice(0,300)){if(online[n])r[n]=1;else{const u=db.users[db.byNum[n]];if(u&&u.ls)r[n]=u.ls}}return send(ws,{t:'pres',m:r})}
    if(m.t==='find'){
      const u=db.users[db.byNum[m.num]];
      return send(ws,u?{t:'found',num:u.num,name:dnOf(u),pub:u.pub,av:u.av,bio:u.bio}:{t:'nf',num:m.num});
    }
    if(m.t==='ack'){if(!db.byNum[m.to])return;return deliver(m.to,{t:'ack',from:me.num,id:m.id,s:m.s,g:m.g})}
    if(m.t==='msg'){
      if(!db.byNum[m.to]||!'tsi'.includes(m.k))return;
      deliver(m.to,{t:'msg',from:me.num,name:dnOf(me),c:m.c,k:m.k,id:m.id,ts:Date.now()},{key:me.num,title:dnOf(me)});
      return send(ws,{t:'sent',id:m.id});
    }
    if(m.t==='gmsg'){
      const g=db.groups[m.gid];if(!g||!g.members.includes(me.num)||!'tsi'.includes(m.k))return;
      for(const n of g.members){if(n===me.num)continue;const c=m.cs&&m.cs[n];if(!c)continue;
        const mention=Array.isArray(m.mn)&&m.mn.includes(n);
        deliver(n,{t:'gmsg',gid:g.id,from:me.num,name:dnOf(me),k:m.k,id:m.id,c,ts:Date.now(),mn:mention},{key:g.id,title:g.name+' · '+dnOf(me),mention})}
      return send(ws,{t:'sent',id:m.id});
    }
    if(m.t==='sig'){
      if(!db.byNum[m.to])return;
      const w=online[m.to],o={t:'sig',from:me.num,name:dnOf(me),d:m.d};
      if(w){send(w,o);if(m.d&&m.d.offer&&!w.fg)push(db.users[db.byNum[m.to]],dnOf(me),'مكالمة واردة','call')}
      else send(ws,{t:'sig',from:m.to,d:{end:1}});
      return;
    }
    if(m.t==='rl'){if(process.env.NO_RELAY)return send(ws,{t:'off',id:m.id});const w=online[m.to];if(w)send(w,{...m,from:me.num});else send(ws,{t:'off',id:m.id});return}
    // ---- مجموعات ----
    if(m.t==='gcreate'){
      const name=String(m.name||'').trim().slice(0,40);if(!name)return;
      const mem=[...new Set((m.members||[]).filter(n=>db.byNum[n]&&n!==me.num))].slice(0,255);
      let id;do id='g'+crypto.randomBytes(5).toString('hex');while(db.groups[id]);
      const g=db.groups[id]={id,name,owner:me.num,admins:[],members:[me.num,...mem],code:newCode()};
      db.inv[g.code]=id;save();return bcast(g);
    }
    if(m.t==='gjoin'){
      const g=db.groups[db.inv[String(m.code||'')]];if(!g)return send(ws,{t:'toast',e:'رابط الدعوة غير صالح'});
      if(!g.members.includes(me.num)){if(g.members.length>=256)return send(ws,{t:'toast',e:'المجموعة ممتلئة'});g.members.push(me.num);save()}
      return bcast(g);
    }
    const g=db.groups[m.gid];
    if(!g||!g.members.includes(me.num))return;
    if(m.t==='gleave'){
      g.members=g.members.filter(n=>n!==me.num);g.admins=g.admins.filter(n=>n!==me.num);
      deliver(me.num,{t:'gout',gid:g.id});
      if(!g.members.length){delete db.inv[g.code];delete db.groups[g.id];save();return}
      if(g.owner===me.num){g.owner=g.admins[0]||g.members[0];g.admins=g.admins.filter(n=>n!==g.owner)}
      save();return bcast(g);
    }
    if(!isAd(g,me.num)&&m.t!=='gadmin')return;
    if(m.t==='gadd'){for(const n of (m.nums||[]))if(db.byNum[n]&&!g.members.includes(n)&&g.members.length<256)g.members.push(n);save();return bcast(g)}
    if(m.t==='gkick'){
      if(!g.members.includes(m.num)||m.num===g.owner)return;
      if(g.admins.includes(m.num)&&g.owner!==me.num)return;
      g.members=g.members.filter(n=>n!==m.num);g.admins=g.admins.filter(n=>n!==m.num);
      deliver(m.num,{t:'gout',gid:g.id});save();return bcast(g);
    }
    if(m.t==='gadmin'){
      if(g.owner!==me.num||!g.members.includes(m.num)||m.num===g.owner)return;
      g.admins=g.admins.filter(n=>n!==m.num);if(m.on)g.admins.push(m.num);save();return bcast(g);
    }
    if(m.t==='gedit'){
      if(m.name&&String(m.name).trim())g.name=String(m.name).trim().slice(0,40);
      if(m.av==='')delete g.av;else if(typeof m.av==='string'&&m.av.length<30000)g.av=m.av;
      save();return bcast(g);
    }
    if(m.t==='ginv'){
      if(m.reset){delete db.inv[g.code];g.code=newCode();db.inv[g.code]=g.id;save()}
      return send(ws,{t:'ginv',gid:g.id,code:g.code});
    }
  });
});
ready.then(()=>srv.listen(PORT,'0.0.0.0',()=>console.log(`همسة تعمل على ${secure?'https':'http'}://IP-الجهاز:${PORT}`)));
