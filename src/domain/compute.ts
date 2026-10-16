// Calcolo dei costi e albero di esplosione.
import { CATS, EXTRA_VOCI, IMP, margFactor, num } from './model';
import { fL } from './format';
/* ======================= CALCOLO ======================= */
export function evalQ(expr,drv){
  let tot=0;
  for(const term of String(expr??'').split('+')){
    const t=term.trim(); if(!t)continue;
    let k=1;
    for(const f of t.split('*')){const x=f.trim().toUpperCase(); k*= (x in drv)?drv[x]:num(x);}
    tot+=k;
  }
  return tot;
}
export function unitCost(it){return it.sd&&it.sd.length? it.sd.reduce((s,r)=>s+num(r.q)*num(r.p),0) : num(it.costo);}
export function costLine(it,q,L,mz){
  const r={peso:0,mat:0,zinc:0,lav:0,acq:0,altro:0};
  if(!it)return r;
  if(it.t==='barra'||it.t==='pezzo'){
    // Materiale e lavorazione sul peso nero; zincatura sul peso zincato (nero + maggiorazione).
    // Il peso mostrato e' quello zincato solo per i pezzi che si zincano, altrimenti il nero.
    const kgT=q*(it.t==='barra'?num(L):1)*num(it.kg), kgZ=kgT*(1+mz), zn=num(it.zn);
    r.peso=zn>0?kgZ:kgT; r.mat=kgT*num(it.acq); r.zinc=kgZ*zn; r.lav=kgT*num(it.lav);
  } else { r.peso=q*num(it.kg); r.acq=q*unitCost(it); }
  return r;
}
export const tot=o=>o.mat+o.zinc+o.lav+o.acq+o.altro;
export function rigaLabel(r,i){return `R${i+1} · ${r.taglia} mod · ${r.tipo} · ×${num(r.n)}`;}

export function compute(data,prev){
  const mz=num(data.params.maggZinc);
  const map=new Map<any,any>(data.listino.map(x=>[x.c,x]));
  const lines:any[]=[], warn=new Set<string>();
  const wp=num(prev.modulo.wp);
  let nTracker=0, nModuli=0;
  const righe=prev.righe.map((r,i)=>{
    const sz=data.sizes[r.taglia]; const n=num(r.n);
    const out={i,label:rigaLabel(r,i),n,moduli:0,tot:0};
    if(!sz){warn.add(`Taglia ${r.taglia} non definita`);return out;}
    out.moduli=num(r.taglia)*n; nTracker+=n; nModuli+=out.moduli;
    const drv={MOT:num(sz.mot),CUSC:num(sz.cusc),OMEGA:num(sz.omega),PANN:num(r.taglia)};
    const res={'$PROF':r.prof,'$ASSE':r.asse==='3,0'?'ASSE 120x120x3':'ASSE 120x120x2,5','$OMEGA':'OMEGA '+r.omega};
    const resL={'$LFOND':num(r.lFond),'$LCUSC':num(r.lCusc),'$LMOT':Math.round((num(r.lCusc)-0.08)*100)/100};
    const rows=[...data.template, ...sz.assi.map(a=>({g:'ASSI DI ROTAZIONE',c:a.c,d:a.d,L:a.L,qa:a.q,qb:''}))];
    for(const t of rows){
      const expr=(r.tipo==='Basso'&&String(t.qb??'').trim()!=='')?t.qb:t.qa;
      const q1=evalQ(expr,drv); if(!q1)continue;
      const code=res[t.c]??t.c; const L=(typeof t.L==='string'&&t.L.startsWith('$'))?resL[t.L]:t.L;
      const it=map.get(code);
      if(!it)warn.add(`Codice "${code}" non trovato nel listino (${t.g})`);
      const c=costLine(it,q1*n,L,mz);
      const base=t.d||(it?it.d:code);
      lines.push({riga:i,rigaLabel:out.label,gruppo:t.g,cat:it?it.cat:'NON TROVATO',sub:it?it.sub:'',code,
        desc:base+(num(L)&&it&&it.t==='barra'?` · L ${fL(L)} m`:''),L:it&&it.t==='barra'?num(L):'',q:q1*n,qPer:q1,sd:it&&it.sd,...c});
    }
    return out;
  });
  for(const [k,code,g] of IMP){
    const q=num(prev.imp[k]); if(!q)continue;
    const it=map.get(code); if(!it){warn.add(`Codice "${code}" non trovato nel listino`);continue;}
    lines.push({riga:'imp',rigaLabel:'IMPIANTO (indipendente dal n. tracker)',gruppo:g,cat:it.cat,sub:it.sub,code,desc:it.d,L:'',q,qPer:q,sd:it.sd,...costLine(it,q,0,mz)});
  }
  const kwp=nModuli*wp/1000;
  const base=lines.reduce((s,l)=>s+tot(l),0);
  for(const e of prev.extra){
    const v=num(e.val); let imp=0,q=1;
    if(e.modo==='tracker'){imp=v*nTracker;q=nTracker;} else if(e.modo==='kwp'){imp=v*kwp;q=kwp;} else if(e.modo==='perc'){imp=base*v/100;} else imp=v;
    const c={peso:0,mat:0,zinc:0,lav:0,acq:0,altro:0}; c[e.voce||'altro']=imp; e._imp=imp;
    lines.push({riga:'extra',rigaLabel:'VOCI EXTRA',gruppo:'VOCI EXTRA',cat:'VOCI EXTRA',sub:EXTRA_VOCI.find(x=>x[0]===(e.voce||'altro'))![1],code:'',desc:e.desc||'(senza descrizione)',L:'',q,qPer:q,...c});
  }
  const T={peso:0,mat:0,zinc:0,lav:0,acq:0,altro:0};
  for(const l of lines){for(const k in T)T[k]+=l[k]; if(typeof l.riga==='number')righe[l.riga].tot+=tot(l);}
  const steel=lines.filter(l=>l.cat==='STRUTTURA').reduce((s,l)=>s+l.peso,0);
  const totTracker=righe.reduce((s,r)=>s+r.tot,0);
  let prezzo=0; righe.forEach(r=>r.prezzo=0);
  for(const l of lines){let f=margFactor(prev,l.cat);
    if(f==null){warn.add(`Margine di "${l.cat}" non valido: con il margine sul prezzo deve essere sotto il 100 %`);f=1;}
    l.prezzo=tot(l)*f; prezzo+=l.prezzo; if(typeof l.riga==='number')righe[l.riga].prezzo+=l.prezzo;}
  return {lines,righe,T,total:tot(T),prezzo,kwp,wp,nTracker,nModuli,steel,totTracker,warn:[...warn]};
}

/* ======================= ALBERO DI ESPLOSIONE ======================= */
export const zero=()=>({peso:0,mat:0,zinc:0,lav:0,acq:0,altro:0,q:0});
export function addTo(n,l){for(const k of ['peso','mat','zinc','lav','acq','altro'])n[k]+=l[k];}
export function buildTree(lines,levels){
  const root:any={children:new Map<any,any>(),...zero()};
  for(const l of lines){
    let node=root; addTo(node,l);
    levels.forEach((lv,i)=>{
      const {key,label,sub}=lv(l);
      let ch=node.children.get(key);
      if(!ch){ch={key,label,sub,children:new Map<any,any>(),...zero()};node.children.set(key,ch);}
      node=ch; addTo(node,l);
      if(i===levels.length-1){node.q+=l.q;node.leaf=true;if(l.sd){node.sd=l.sd;}}
    });
  }
  return root;
}
export const leafLv=l=>({key:l.code+'|'+l.L+'|'+l.desc,label:l.desc,sub:l.code});
export const VIEWS={
  cat:{name:'Per categoria',levels:[
    l=>({key:l.cat,label:l.cat}),
    l=>({key:l.sub||'-',label:l.sub||'-'}),
    leafLv],
    order:k=>{const i=[...CATS,'VOCI EXTRA'].indexOf(k);return i<0?99:i;}},
  grp:{name:'Per gruppo di assieme',levels:[
    l=>({key:String(l.riga),label:l.rigaLabel}),
    l=>({key:l.gruppo,label:l.gruppo}),
    leafLv],order:()=>0},
  voce:{name:'Per voce di costo',levels:null},
};
