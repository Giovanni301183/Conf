// Distinta di lavorazione, calendario, Gantt di produzione e di montaggio.
import { S, R } from '../store/state';
import { CATS, GANTT0, MPAR, clone, defGantt, defMont, defMontPrev, num } from './model';
import { evalQ, tot } from './compute';
import { fL, fN } from './format';
/* ---------- 8 DISTINTA DI LAVORAZIONE ---------- */
// Dati per produzione e ufficio acquisti, ricavati dalle righe di calcolo (senza le voci extra).
export const LAV_T={barra:'Taglio',pezzo:'Carpenteria',comm:'Commerciale'};
export function rigaCfg(r){return `${r.taglia} moduli · ${r.tipo} · ${r.prof} · asse ${r.asse} mm · omega ${r.omega} mm${r.tipo==='Basso'?'':' · fond. '+fL(r.lFond)+' m'} · cusc. ${fL(r.lCusc)} m · motore ${fL(num(r.lCusc)-0.08)} m`;}
export function buildLavor(){
  const map=new Map<any,any>(S.data.listino.map(x=>[x.c,x])), mz=num(S.data.params.maggZinc);
  const mk=(l):any=>{const it=map.get(l.code)||{}, t=it.t||'comm', L=t==='barra'?num(l.L):'';
    const kgU=t==="barra"?(L as number)*num(it.kg):num(it.kg), zinc=t!=='comm'&&num(it.zn)>0;
    // kgT = peso nero totale; kgZ = peso dopo la zincatura (solo pezzi zincati, altrimenti 0)
    return {code:l.code,art:it.art||l.code,desc:String(l.desc).replace(/ · L [\d.,]+ m$/,''),dItem:it.d||l.desc,cat:l.cat,sub:l.sub,t,L,qPer:l.qPer,q:l.q,kgU,kgT:kgU*l.q,kgZ:zinc?kgU*l.q*(1+mz):0,zinc,cost:tot(l),sd:l.sd,riga:l.riga,gruppo:l.gruppo};};
  const items=R.lines.filter(l=>l.riga!=='extra').map(mk);
  const righe=S.prev.righe.map((r,i)=>{const its=items.filter(x=>x.riga===i), gruppi:any[]=[];
    for(const x of its){let G=gruppi.find(y=>y.nome===x.gruppo); if(!G)gruppi.push(G={nome:x.gruppo,items:[]}); G.items.push(x);}
    return {i,r,n:num(r.n),gruppi,kg:its.reduce((a,x)=>a+x.kgT,0),kgZ:its.reduce((a,x)=>a+x.kgZ,0)};}).filter(x=>x.n>0);
  const imp=items.filter(x=>x.riga==='imp');
  const tg=new Map<any,any>();
  for(const x of items.filter(x=>x.t==='barra')){const k=x.code+'|'+x.L;
    let e=tg.get(k); if(!e)tg.set(k,e={code:x.code,art:x.art,desc:x.dItem,L:x.L,pz:0,kg:0,kgZ:0,zinc:x.zinc,righe:new Set()});
    e.pz+=x.q; e.kg+=x.kgT; e.kgZ+=x.kgZ; if(typeof x.riga==='number')e.righe.add('R'+(x.riga+1));}
  const taglio=[...tg.values()].sort((a,b)=>a.code.localeCompare(b.code)||b.L-a.L);
  const od=new Map<any,any>();
  for(const x of items){let e=od.get(x.code);
    if(!e)od.set(x.code,e={cat:x.cat,sub:x.sub,code:x.code,art:x.art,desc:x.dItem,t:x.t,um:x.t==='barra'?'m':'pz',qty:0,kg:0,kgZ:0,zinc:x.zinc,cost:0,sd:x.sd});
    e.qty+=x.t==='barra'?x.q*x.L:x.q; e.kg+=x.kgT; e.kgZ+=x.kgZ; e.cost+=x.cost;}
  const ordini=[...CATS,'NON TROVATO'].map(c=>({cat:c,items:[...od.values()].filter(e=>e.cat===c).sort((a,b)=>(a.sub||'').localeCompare(b.sub||'')||a.code.localeCompare(b.code))})).filter(g=>g.items.length);
  const sum=k=>items.reduce((a,x)=>a+x[k],0);
  return {righe,imp,taglio,ordini,kg:sum('kgT'),kgZ:sum('kgZ'),cost:sum('cost'),mz};
}
/* ---------- Gantt di produzione ---------- */
// Date come numero di giorno (UTC, 0 = 01/01/1970): niente problemi di ora legale.
export const DAY=864e5;
export const dNum=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?Date.UTC(+m[1],+m[2]-1,+m[3])/DAY:null;};
export const dToday=()=>{const t=new Date();return Date.UTC(t.getFullYear(),t.getMonth(),t.getDate())/DAY;};
export const dDate=n=>new Date(n*DAY);
export const dFmt=n=>dDate(n).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'});
export const dow=n=>(n+4)%7;                       // 0 = domenica
export const monday=n=>n-(dow(n)+6)%7;
export function isoWeek(n){const t=monday(n)+3, y=dDate(t).getUTCFullYear();return 1+Math.floor((t-Date.UTC(y,0,1)/DAY)/7);}
// Festivita' nazionali italiane + lunedi' dell'Angelo (Pasqua con l'algoritmo di Gauss/Meeus).
export const HOL:any={};
export function holidays(y){if(HOL[y])return HOL[y];
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
    i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=(h+l-7*m+114)%31+1;
  const s=new Set(['1-1','1-6','4-25','5-1','6-2','8-15','11-1','12-8','12-25','12-26'].map(x=>{const [M,D]=x.split('-');return Date.UTC(y,+M-1,+D)/DAY;}));
  s.add(Date.UTC(y,mo-1,da)/DAY+1); return HOL[y]=s;}
export const isWork=n=>{const w=dow(n);return w>0&&w<6&&!holidays(dDate(n).getUTCFullYear()).has(n);};
export const nextWork=n=>{while(!isWork(n))n++;return n;};
export const prevWork=n=>{while(!isWork(n))n--;return n;};
// Fine esclusiva: il giorno dopo l'ultimo giorno lavorativo occupato.
export const addWork=(s,d)=>{let n=s;while(d>0){if(isWork(n))d--;n++;}return n;};
export const nWorkDays=(a,b)=>{let k=0;for(let n=a;n<=b;n++)if(isWork(n))k++;return k;};

// Fasi dei Gantt: nome, colore nella pagina, colore nel file Excel.
export const FASI={acc:['Approvvigionamento acciaio','--c-mat','3E6B8A'],comm:['Approvvigionamento commerciali','--c-acq','5F9473'],
  lav:['Taglio e carpenteria','--c-lav','C58A42'],zinc:['Zincatura','--c-zinc','9AA6AC'],sped:['Spedizione','--c-altro','8B72A3'],
  prog:['Progettazione esecutiva','--c-altro','8B72A3'],pull:['Pull-out test','--gold','B9843F'],tracc:['Tracciamento','--c-zinc','9AA6AC'],
  cons:['Consegna materiali','--ink','1F2B33'],pali:['Infissione pali','--c-mat','3E6B8A'],strut:['Pilastri e piastre','--c-lav','C58A42'],
  assi:['Assi, omega, inclinometri e finecorsa','--acc','235E5A'],moduli:['Posa moduli FV','--c-acq','5F9473'],
  elett:['Collegamenti elettrici, quadri e meteo','--bad','A23B32'],coll:['Collaudo e messa in servizio','--acc2','2F7A74'],
  extra:['Fase aggiunta','--ink2','3B4852']};
export const GPAR=[['ltAcc','Consegna acciaio (gg)'],['ltComm','Consegna componenti commerciali (gg)'],['kgLav','Taglio e carpenteria (kg/giorno)'],
  ['ggZinc','Zincatura: giorni minimi del giro'],['kgZinc','Zincatura: capacità (kg/giorno)'],['kgCamion','Portata camion (kg)'],['camionGg','Camion caricati al giorno'],
  ['ggTrans','Viaggio fino al cantiere (gg)']];
export function gPar(){const p=S.data.params;if(!p.gantt)p.gantt=clone(GANTT0);for(const k in GANTT0)if(p.gantt[k]==null)p.gantt[k]=GANTT0[k];return p.gantt;}
export function gPrev(){const P=S.prev;if(!P.gantt)P.gantt=defGantt();const g=P.gantt;g.dur=g.dur||{};g.da=g.da||{};return g;}
// Valori calcolati dei campi facoltativi, per percorso del campo: segnaposto in grigio e punto di partenza delle frecce.
export let AUTO:any={};
export const divUp=(a,b)=>a>0&&num(b)>0?Math.ceil(a/num(b)):0;
export const commName=()=>[S.prev.cliente,S.prev.rif].filter(Boolean).join(' · ')||'Preventivo';
export const ganttT0=()=>{const pg=gPrev();return dNum(pg.inizio)??dNum(S.prev.data)??dToday();};
export const isoDay=n=>dDate(n).toISOString().slice(0,10);
// Pianificatore comune: una fase parte dopo le fasi da cui dipende e non prima dell'avvio (calcolo automatico).
// ov = {dur, da} con le modifiche a mano del preventivo: da = inizio fissato dall'utente: libero, le fasi si possono sovrapporre.
// autoDa = data "non prima del" proposta (es. consegna dalla produzione).
// ov.hid = fasi tolte dal Gantt: non si vedono e chi dipendeva da loro eredita le loro dipendenze.
// ov.extra = fasi aggiunte dall'utente [{id,name,grp}]: senza vincoli, date e durata come le altre.
export function scheduler(t0,ov,pfx){
  const tasks:any[]=[], by:any={}, groups:any[]=[], hidden:any[]=[]; ov.hid=ov.hid||{}; ov.extra=ov.extra||[];
  const add=(id,fase,grp,base,auto,deps,name?,autoDa?):any=>{
    if(ov.hid[id]){let s=t0; const dd:any[]=[]; for(const d of deps)if(by[d]){s=Math.max(s,by[d].f); dd.push(...(by[d].hid?by[d].deps:[d]));}
      const t=by[id]={id,name:name||FASI[fase][0],hid:true,f:s,deps:[...new Set(dd)]}; hidden.push(t); return t;}
    const o=ov.dur[id], man=o!==''&&o!=null, dur=man?Math.max(0,Math.round(num(o))):auto;
    let s=t0; for(const d of deps)if(by[d])s=Math.max(s,by[d].f);
    const ad=dNum(autoDa); if(ad!=null)s=Math.max(s,ad);
    const ready=nextWork(s), daMan=dNum(ov.da[id])!=null?ov.da[id]:'';
    s=daMan?nextWork(dNum(daMan)):ready; const f=addWork(s,dur);
    const t={id,fase,grp,name:name||FASI[fase][0],base,auto,dur,ov:man,s,f,last:dur?prevWork(f-1):s,forced:daMan||autoDa||'',autoDa:autoDa||'',daMan,
      ready,deps:[...new Set(deps.filter(d=>by[d]).flatMap(d=>by[d].hid?by[d].deps:[d]))]};
    AUTO[pfx+id]=auto; tasks.push(by[id]=t); return t;};
  const done=():any=>{
    ov.extra.forEach((e,i)=>{if(!groups.some(g=>g.key===e.grp)){e.grp='extra'; if(!groups.some(g=>g.key==='extra'))groups.push({key:'extra',label:'Fasi aggiunte'});}
      add(e.id,'extra',e.grp,'aggiunta a mano',5,[],e.name||'Nuova fase').xi=i;});
    const start=nextWork(t0), act=tasks.filter(t=>t.dur);
    const end=act.length?Math.max(...act.map(t=>t.last)):start;
    // Finestra del grafico: da lunedi' a domenica, cosi' la griglia settimanale torna sempre.
    const a=monday(Math.min(t0,...tasks.map(t=>t.s))), b=monday(Math.max(end,...tasks.map(t=>t.s)))+6;
    return {tasks,groups,hidden,t0,start,end,nWork:nWorkDays(start,end),view:{a,nd:b-a+1}};};
  return {add,groups,done};
}
// Fasi per riga tracker: l'officina lavora una riga alla volta; zincatura (esterna) e spedizioni possono sovrapporsi.
// Il montaggio in campo non fa parte del Gantt di produzione: ha il suo Gantt nella scheda Montaggio.
export function buildGantt(D){
  const g=gPar(), K=scheduler(ganttT0(),gPrev(),'prev.gantt.dur.'), {add,groups}=K, div=divUp;
  const all=[...D.righe.flatMap(r=>r.gruppi.flatMap(G=>G.items)),...D.imp];
  const kgAcc=all.filter(x=>x.t!=='comm').reduce((a,x)=>a+x.kgT,0), nComm=new Set(all.filter(x=>x.t==='comm').map(x=>x.code)).size;
  groups.push({key:'app',label:'Approvvigionamento · intera commessa'});
  add('acc','acc','app',`${fN(kgAcc/1000,2)} t di acciaio`,kgAcc>0?Math.round(num(g.ltAcc)):0,[]);
  add('comm','comm','app',`${nComm} codici commerciali`,nComm?Math.round(num(g.ltComm)):0,[]);
  let prevLav=null;
  for(const R1 of D.righe){const k='r'+R1.i, its=R1.gruppi.flatMap(G=>G.items);
    groups.push({key:k,label:`R${R1.i+1} · ${fN(R1.n,0)} tracker · ${R1.r.taglia} moduli · ${R1.r.tipo}`});
    const kS=its.filter(x=>x.t!=='comm').reduce((a,x)=>a+x.kgT,0), kZ=R1.kgZ, kSp=its.reduce((a,x)=>a+(x.kgZ||x.kgT),0);
    const viaggi=div(kSp,g.kgCamion);
    const lav=add('lav-'+R1.i,'lav',k,`${fN(kS,0)} kg di acciaio`,div(kS,g.kgLav),['acc',prevLav]);
    add('zinc-'+R1.i,'zinc',k,kZ?`${fN(kZ,0)} kg zincati`:'nessun pezzo da zincare',kZ?Math.max(Math.round(num(g.ggZinc)),div(kZ,g.kgZinc)):0,[lav.id]);
    add('sped-'+R1.i,'sped',k,`${viaggi} camion · ${fN(kSp/1000,1)} t`,viaggi?div(viaggi,g.camionGg)+Math.round(num(g.ggTrans)):0,['zinc-'+R1.i,'comm']);
    prevLav=lav.id;}
  if(D.imp.length){groups.push({key:'imp',label:'Impianto · quadri e centralina meteo'});
    add('imp-sped','sped','imp',`${D.imp.length} componenti`,Math.max(1,Math.round(num(g.ggTrans))),['comm'],'Spedizione componenti impianto');}
  return K.done();
}
export function gMont(){const d=S.data;if(!d.mont)d.mont=defMont();const m=d.mont;m.par=m.par||{};for(const [k] of MPAR)if(m.par[k]==null)m.par[k]='';m.voci=m.voci||[];return m;}
export function mPrev(){const P=S.prev;if(!P.mont)P.mont=defMontPrev();const m=P.mont;for(const k of ['q','pf','pp','dur','da'])m[k]=m[k]||{};return m;}
export function montDrv(){
  const P=S.prev, d:any={TRK:0,MOT:0,CUSC:0,MOD:0,KWP:R.kwp,QUADA:num(P.imp.quadA),QUADGEN:num(P.imp.quadGen),METEO:num(P.imp.box),ANEM:num(P.imp.anem),PIRAN:num(P.imp.piran)};
  for(const k of Object.keys(S.data.sizes))d['T'+k]=0;
  for(const r of P.righe){const sz=S.data.sizes[r.taglia], n=num(r.n); if(!sz)continue;
    d.TRK+=n; d.MOT+=n*num(sz.mot); d.CUSC+=n*num(sz.cusc); d.MOD+=n*num(r.taglia); d['T'+r.taglia]+=n;}
  d.PALI=d.MOT+d.CUSC; d.SQ=Math.max(1,Math.round(num(gMont().par.squadre))); d.GG=0; return d;}
// Preparazione dall'avvio commessa; il cantiere parte dopo il tracciamento e la prima consegna, gli assi dopo l'ultima.
export function buildMontGantt(drv,Gp){
  const p=gMont().par, K=scheduler(ganttT0(),mPrev(),'prev.mont.dur.'), {add,groups}=K, sq=drv.SQ, gg=k=>Math.round(num(p[k]));
  groups.push({key:'prep',label:'Preparazione · prima del cantiere'});
  add('prog','prog','prep','a corpo',gg('ggProg'),[]);
  add('pull','pull','prep','prove in campo',gg('ggPull'),['prog']);
  add('tracc','tracc','prep','a corpo',gg('ggTracc'),['pull']);
  const sp=Gp?Gp.tasks.filter(t=>t.fase==='sped'&&t.dur):[];
  if(sp.length){groups.push({key:'cons',label:'Consegne in cantiere · dal Gantt di produzione'});
    add('cons1','cons','cons','fine prima spedizione',0,[],'Prima consegna materiali',isoDay(Math.min(...sp.map(t=>t.last))));
    add('consN','cons','cons','fine ultima spedizione',0,[],'Ultima consegna materiali',isoDay(Math.max(...sp.map(t=>t.last))));}
  groups.push({key:'cant',label:`Cantiere · ${sq} squadr${sq===1?'a':'e'}`});
  add('pali','pali','cant',`${fN(drv.PALI,0)} pali`,divUp(drv.PALI,num(p.paliGg)*sq),['tracc','cons1']);
  add('strut','strut','cant',`${fN(drv.PALI,0)} pali`,divUp(drv.PALI,num(p.pilGg)*sq),['pali']);
  add('assi','assi','cant',`${fN(drv.TRK,0)} tracker`,divUp(drv.TRK,num(p.trkGg)*sq),['strut','consN']);
  add('moduli','moduli','cant',`${fN(drv.MOD,0)} moduli`,divUp(drv.MOD,num(p.modGg)*sq),['assi']);
  add('elett','elett','cant','a corpo',gg('ggElett'),['moduli']);
  add('coll','coll','cant','a corpo',gg('ggColl'),['elett']);
  const G=K.done(), c=G.tasks.filter(t=>t.grp==='cant'&&t.dur);
  G.gg=c.length?nWorkDays(Math.min(...c.map(t=>t.s)),Math.max(...c.map(t=>t.last))):0;
  return G;}
export const opt=v=>v!==''&&v!=null;
export function buildMont(){
  const M=gMont(), mp=mPrev(), drv=montDrv(), G=buildMontGantt(drv,buildGantt(buildLavor()));
  drv.GG=G.gg;
  const rows=M.voci.map((v,i)=>{const auto=String(v.q??'').trim()?evalQ(v.q,drv):0;
    AUTO['prev.mont.q.'+v.id]=auto; AUTO['prev.mont.pf.'+v.id]=num(v.pf); AUTO['prev.mont.pp.'+v.id]=num(v.pp);
    const q=opt(mp.q[v.id])?num(mp.q[v.id]):auto, pf=opt(mp.pf[v.id])?num(mp.pf[v.id]):v.pf, pp=opt(mp.pp[v.id])?num(mp.pp[v.id]):v.pp;
    const tf=q*num(pf), tp=q*num(pp);
    return {v,i,auto,q,pf,pp,qMan:opt(mp.q[v.id]),fMan:opt(mp.pf[v.id]),pMan:opt(mp.pp[v.id]),tf,tp,tot:tf+tp,miss:q>0&&!opt(pf)&&!opt(pp)};});
  const gruppi:any[]=[]; for(const r of rows){let g=gruppi.find(x=>x.g===r.v.g); if(!g)gruppi.push(g={g:r.v.g,rows:[]}); g.rows.push(r);}
  const sum=k=>rows.reduce((a,r)=>a+r[k],0);
  return {rows,gruppi,G,drv,tf:sum('tf'),tp:sum('tp'),tot:sum('tot'),miss:rows.filter(r=>r.miss).length};}
