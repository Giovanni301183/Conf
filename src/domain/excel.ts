// Excel (.xlsx) senza librerie e CSV.
import { S, R } from '../store/state';
import { CATS, num } from './model';
import { pesoTot, tot, unitCost } from './compute';
import { LAV_T, FASI, buildGantt, buildLavor, buildMont, dDate, dNum, holidays, isWork, opt, rigaCfg } from './plan';
import { download, fDate, fN, fPeso, fileName } from './format';
/* ---------- Excel (.xlsx) senza librerie: XML di Office + archivio zip non compresso ---------- */
export const xe=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!)).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'');
export function xlStyles(){
  const fonts=['<font><sz val="10"/><color rgb="FF1F2B33"/><name val="Calibri"/><family val="2"/></font>'],
    fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'],
    borders=['<border><left/><right/><top/><bottom/><diagonal/></border>'], fmts:any[]=[], xfs=['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], dxfs:any[]=[], cache:any={};
  const idx=(arr,x)=>{let i=arr.indexOf(x);if(i<0){arr.push(x);i=arr.length-1;}return i;};
  const BI={int:3,dec:4};
  function st(o:any={}){const k=JSON.stringify(o); if(k in cache)return cache[k];
    const f=idx(fonts,`<font>${o.b?'<b/>':''}${o.i?'<i/>':''}<sz val="${o.sz||10}"/><color rgb="FF${o.c||'1F2B33'}"/><name val="Calibri"/><family val="2"/></font>`);
    const fl=o.bg?idx(fills,`<fill><patternFill patternType="solid"><fgColor rgb="FF${o.bg}"/><bgColor indexed="64"/></patternFill></fill>`):0;
    const side=(n,on)=>on?`<${n} style="${o.bs||'thin'}"><color rgb="FF${o.bc||'C9C3B6'}"/></${n}>`:`<${n}/>`;
    const bd=o.bd?idx(borders,`<border>${side('left',o.bd==='all')}${side('right',o.bd==='all')}${side('top',o.bd==='all'||o.bd==='top'||o.bd==='tb')}${side('bottom',o.bd==='all'||o.bd==='bottom'||o.bd==='tb')}<diagonal/></border>`):0;
    let nf=0; if(o.nf){nf=BI[o.nf]??(164+idx(fmts,o.nf));}
    const al=`<alignment vertical="center"${o.h?` horizontal="${o.h}"`:''}${o.wrap?' wrapText="1"':''}${o.ind?` indent="${o.ind}"`:''}/>`;
    xfs.push(`<xf numFmtId="${nf}" fontId="${f}" fillId="${fl}" borderId="${bd}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1" applyAlignment="1">${al}</xf>`);
    return cache[k]=xfs.length-1;}
  st.xml=()=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`+
    (fmts.length?`<numFmts count="${fmts.length}">${fmts.map((f,i)=>`<numFmt numFmtId="${164+i}" formatCode="${xe(f)}"/>`).join('')}</numFmts>`:'')+
    `<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders>`+
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`+
    (dxfs.length?`<dxfs count="${dxfs.length}">${dxfs.join('')}</dxfs>`:'')+`</styleSheet>`;
  // Stili della formattazione condizionale (riempimento ed eventuale colore del testo).
  st.dxf=(bg,c)=>idx(dxfs,`<dxf>${c?`<font><b/><color rgb="FF${c}"/></font>`:''}<fill><patternFill patternType="solid"><fgColor rgb="FF${bg}"/><bgColor rgb="FF${bg}"/></patternFill></fill></dxf>`);
  return st;
}
export const xcol=n=>{let s='';n++;while(n){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=(n-m-1)/26;}return s;};
// sh = {name, cols:[larghezze], rows:[{h, c:[{v,s,f}|null]}], merges:['A1:H1'], freeze:n righe, freezeCol:n colonne, titles:'4:4', footer,
//       cf:[{ref:'G7:Z7', f:'formula', dxf}]}. f = formula Excel in inglese (senza "="); v = valore gia' calcolato (facoltativo).
export function xlSheet(sh){
  const rows=sh.rows.map((r,i)=>`<row r="${i+1}"${r.h?` ht="${r.h}" customHeight="1"`:''}>${(r.c||[]).map((c,j)=>{if(!c)return '';const ref=xcol(j)+(i+1), s=c.s?` s="${c.s}"`:'';
    if(c.f)return `<c r="${ref}"${s}${typeof c.v==='number'?'':' t="str"'}><f>${xe(c.f)}</f>${typeof c.v==='number'&&isFinite(c.v)?`<v>${c.v}</v>`:''}</c>`;
    if(c.v==null||c.v==='')return `<c r="${ref}"${s}/>`;
    return typeof c.v==='number'&&isFinite(c.v)?`<c r="${ref}"${s}><v>${Math.round(c.v*1e6)/1e6}</v></c>`:`<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xe(c.v)}</t></is></c>`;}).join('')}</row>`).join('');
  const fr=sh.freeze||0, fc=sh.freezeCol||0, pn=fr&&fc?'bottomRight':fc?'topRight':'bottomLeft', tlc=xcol(fc)+(fr+1);
  const fz=fr||fc?`<pane${fc?` xSplit="${fc}"`:''}${fr?` ySplit="${fr}"`:''} topLeftCell="${tlc}" activePane="${pn}" state="frozen"/><selection pane="${pn}" activeCell="${tlc}" sqref="${tlc}"/>`:'';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`+
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView showGridLines="0" workbookViewId="0">${fz}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>`+
    `<cols>${sh.cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>`+
    (sh.merges&&sh.merges.length?`<mergeCells count="${sh.merges.length}">${sh.merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>`:'')+
    (sh.cf||[]).map((x,k)=>`<conditionalFormatting sqref="${x.ref}"><cfRule type="expression" dxfId="${x.dxf}" priority="${k+1}"${x.stop?' stopIfTrue="1"':''}><formula>${xe(x.f)}</formula></cfRule></conditionalFormatting>`).join('')+
    `<pageMargins left="0.4" right="0.4" top="0.55" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${sh.portrait?'portrait':'landscape'}" fitToWidth="1" fitToHeight="0"/>`+
    `<headerFooter><oddFooter>&amp;L${xe(String(sh.footer||'').replace(/&/g,'&&'))}&amp;RPagina &amp;P di &amp;N</oddFooter></headerFooter></worksheet>`;
}
export const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function zipStore(files){
  const enc=new TextEncoder(), parts:any[]=[], cen:any[]=[]; let off=0;
  const d=new Date(), dt=((d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1)), dd=(((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate());
  for(const [name,text] of files){
    const nb=enc.encode(name), data=enc.encode(text), crc=crc32(data);
    const h=new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,dt,true);h.setUint16(12,dd,true);
    h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,nb.length,true);h.setUint16(28,0,true);
    parts.push(new Uint8Array(h.buffer),nb,data);
    const c=new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,dt,true);c.setUint16(14,dd,true);
    c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,nb.length,true);c.setUint32(42,off,true);
    cen.push(new Uint8Array(c.buffer),nb); off+=30+nb.length+data.length;
  }
  const size=cen.reduce((a,x)=>a+x.length,0), e=new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,off,true);
  return new Blob([...parts,...cen,new Uint8Array(e.buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
// names = {Nome: "'Foglio'!$A$1:$A$9"}: nomi definiti usati nelle formule. Le formule si ricalcolano all'apertura.
export function xlsxBlob(sheets,st,names:any={}){
  const NS='http://schemas.openxmlformats.org';
  const titles=Object.entries(names).map(([n,r])=>`<definedName name="${n}">${xe(r)}</definedName>`).join('')+
    sheets.map((s,i)=>s.titles?`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xe(s.name)}'!$${s.titles.replace(':',':$')}</definedName>`:'').join('');
  return zipStore([
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((s,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s,i)=>`<sheet name="${xe(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${titles?`<definedNames>${titles}</definedNames>`:''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}/package/2006/relationships">${sheets.map((s,i)=>`<Relationship Id="rId${i+1}" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="${NS}/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',st.xml()],
    ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,xlSheet(s)])]);
}
// Stili e pezzi comuni dei file Excel: titolo, intestazioni di colonna, bande di gruppo.
export function xlKit(doc){
  const P=S.prev, st=xlStyles(), today=new Date().toLocaleDateString('it-IT');
  const ACC='235E5A', SOFT='E3EEEC', SAND='F4F2ED', TOT='EAE6DC';
  const S_={title:st({b:1,sz:16,c:ACC}), sub:st({c:'6B7780',sz:10}), lab:st({c:'6B7780',sz:10}), val:st({b:1,sz:11}),
    sec:st({b:1,sz:12,c:ACC}),
    head:st({b:1,c:'FFFFFF',bg:ACC,bd:'all',bc:ACC,wrap:1}), headR:st({b:1,c:'FFFFFF',bg:ACC,bd:'all',bc:ACC,wrap:1,h:'right'}), headC:st({b:1,c:'FFFFFF',bg:ACC,bd:'all',bc:ACC,wrap:1,h:'center'}),
    g1:st({b:1,c:ACC,bg:SOFT,bd:'all',bc:'BFD3D0'}), g2:st({b:1,sz:9,c:'3C4A52',bg:SAND,bd:'all'}),
    txt:st({bd:'all'}), code:st({bd:'all',c:'3C4A52'}), muted:st({bd:'all',c:'6B7780'}), ctr:st({bd:'all',h:'center'}),
    int:st({bd:'all',nf:'#,##0'}), intB:st({bd:'all',nf:'#,##0',b:1}), len:st({bd:'all',nf:'0.00#'}), d1:st({bd:'all',nf:'#,##0.0'}), d2:st({bd:'all',nf:'#,##0.00'}), d2B:st({bd:'all',nf:'#,##0.00',b:1}),
    eur:st({bd:'all',nf:'#,##0.00 "€"'}),
    sdT:st({bd:'all',i:1,c:'6B7780',ind:1}), sdN:st({bd:'all',i:1,c:'6B7780',nf:'#,##0'}), sdE:st({bd:'all',i:1,c:'6B7780',nf:'#,##0.00 "€"'}),
    fill:st({bd:'all',bg:'FFFBEA'}),
    totT:st({b:1,bg:TOT,bd:'all'}), totN:st({b:1,bg:TOT,bd:'all',nf:'#,##0.0'}), totE:st({b:1,bg:TOT,bd:'all',nf:'#,##0.00 "€"'}), totX:st({bg:TOT,bd:'all'})};
  const comm=[P.cliente,P.rif].filter(Boolean).join(' · ')||'Preventivo';
  const footer=`${comm} · ${doc} · ${today}`;
  const top=(title,n)=>({rows:[{h:26,c:[{v:title,s:S_.title}]},{c:[{v:`${comm} · emessa il ${today}`,s:S_.sub}]},{c:[]}],merges:[`A1:${xcol(n-1)}1`,`A2:${xcol(n-1)}2`]});
  const hdr=(cols,right,center)=>({h:30,c:cols.map((t,i)=>({v:t,s:right.includes(i)?S_.headR:center.includes(i)?S_.headC:S_.head}))});
  const band=(sh,text,n,s)=>{sh.rows.push({h:18,c:[{v:text,s},...Array(n-1).fill({s})]});const r=sh.rows.length;sh.merges.push(`A${r}:${xcol(n-1)}${r}`);};
  return {st,S_,top,hdr,band,comm,today,footer,ACC,SOFT,SAND,TOT};
}
export function lavorWorkbook(){
  const D=buildLavor(), P=S.prev, K=xlKit('Distinta di lavorazione'), {st,S_,top,hdr,band,footer,TOT}=K;
  const q=x=>Number.isInteger(Math.round(x*1000)/1000)?{v:x,s:S_.int}:{v:x,s:S_.d2};

  // Foglio 1 · Commessa
  const s1:any={name:'Commessa',cols:[22,16,16,12,12,12,14,14,12,12],...top('DISTINTA DI LAVORAZIONE',10),portrait:false,footer};
  const info=[['N° preventivo',P.num||'–'],['Cliente',P.cliente||'–'],['Commessa',P.rif||'–'],['Data preventivo',fDate(P.data)],['Modulo FV',`${P.modulo.marca||'–'} · ${fN(R.wp,0)} Wp`],
    ['Potenza impianto',`${fN(R.kwp,2)} kWp`],['Tracker',`${fN(R.nTracker,0)} (${fN(R.nModuli,0)} moduli)`],...CATS.map(c=>[`Peso ${c.toLowerCase()}`,fPeso(R.pesi[c])]),['Peso totale',fPeso(pesoTot(R.pesi))],['Note',P.note||'–']];
  for(const [l,v] of info){s1.rows.push({c:[{v:l,s:S_.lab},{v,s:S_.val}]});const r=s1.rows.length;s1.merges.push(`B${r}:J${r}`);}
  s1.rows.push({c:[]},{h:20,c:[{v:'Configurazione tracker',s:S_.sec}]});
  s1.rows.push(hdr(['Riga','Taglia','Tipo','Pilastri','Asse mm','Omega mm','Fondazione m','Cuscinetto m','Motore m','N. tracker'],[6,7,8,9],[]));
  for(const x of D.righe){const r=x.r;s1.rows.push({c:[{v:'R'+(x.i+1),s:S_.txt},{v:r.taglia+' moduli',s:S_.txt},{v:r.tipo,s:S_.txt},{v:r.prof,s:S_.txt},{v:r.asse,s:S_.ctr},{v:r.omega,s:S_.ctr},
    r.tipo==='Basso'?{v:'—',s:S_.ctr}:{v:num(r.lFond),s:S_.len},{v:num(r.lCusc),s:S_.len},{v:Math.round((num(r.lCusc)-0.08)*100)/100,s:S_.len},{v:x.n,s:S_.intB}]});}
  if(!D.righe.length)s1.rows.push({c:[{v:'Nessun tracker',s:S_.muted}]});
  if(D.imp.length){s1.rows.push({c:[]},{h:20,c:[{v:'Componenti di impianto',s:S_.sec}]});
    s1.rows.push(hdr(['Codice','Descrizione','','','','','','','','Q.tà'],[9],[]));
    for(const x of D.imp){s1.rows.push({c:[{v:x.code,s:S_.code},{v:x.desc,s:S_.txt},...Array(7).fill({s:S_.txt}),{v:x.q,s:S_.intB}]});const r=s1.rows.length;s1.merges.push(`B${r}:I${r}`);}
    const r=s1.rows.length-D.imp.length;s1.merges.push(`B${r}:I${r}`);}
  s1.rows.push({c:[]},{c:[]},{c:[{v:'Redatto da',s:S_.lab},{s:S_.fill},{s:S_.fill},{},{v:'Approvato da',s:S_.lab},{s:S_.fill},{s:S_.fill},{},{v:'Data',s:S_.lab},{s:S_.fill}]});

  // Foglio 2 · Produzione (senza prezzi). Peso nero sempre, peso zincato solo sui pezzi da zincare.
  const zc=v=>v?{v,s:S_.d1}:{s:S_.txt}, zt=v=>({v,s:S_.totN});
  const nota=`Peso nero = peso teorico del listino (acquisto acciaio e lavorazione). Peso zincato = nero + ${fN(D.mz*100,1)} %, solo sui pezzi da zincare.`;
  const notaRow=(sh,n)=>{sh.rows.push({c:[]},{c:[{v:nota,s:S_.sub}]});sh.merges.push(`A${sh.rows.length}:${xcol(n-1)}${sh.rows.length}`);};
  const N2=11, s2:any={name:'Produzione',cols:[20,40,13,9,11,11,12,12,13,10,7],...top('PRODUZIONE · DISTINTA PEZZI',N2),freeze:4,titles:'4:4',footer};
  s2.rows.push(hdr(['Codice','Descrizione','Lavorazione','L (m)','Q.tà / tracker','Q.tà totale','Peso unit. nero kg','Peso tot. nero kg','Peso tot. zincato kg','Zincatura','✓'],[3,4,5,6,7,8],[9,10]));
  const pRow=x=>({c:[{v:x.code,s:S_.code},{v:x.desc,s:S_.txt},{v:LAV_T[x.t],s:S_.muted},x.L!==''?{v:x.L,s:S_.len}:{s:S_.txt},q(x.qPer),{...q(x.q),s:Number.isInteger(x.q)?S_.intB:S_.d2B},{v:x.kgU,s:S_.d2},{v:x.kgT,s:S_.d1},zc(x.kgZ),{v:x.zinc?'Sì':'No',s:S_.ctr},{s:S_.ctr}]});
  for(const x of D.righe){band(s2,`R${x.i+1} · ${fN(x.n,0)} tracker · ${rigaCfg(x.r)}`,N2,S_.g1);
    for(const G of x.gruppi){band(s2,G.nome,N2,S_.g2);G.items.forEach(it=>s2.rows.push(pRow(it)));}
    s2.rows.push({c:[{v:`Totale R${x.i+1}`,s:S_.totT},...Array(6).fill({s:S_.totX}),zt(x.kg),zt(x.kgZ),{s:S_.totX},{s:S_.totX}]});}
  if(D.imp.length){band(s2,"IMPIANTO · per l'intera commessa",N2,S_.g1);D.imp.forEach(it=>s2.rows.push(pRow(it)));}
  s2.rows.push({c:[]},{c:[{v:'TOTALE COMMESSA',s:S_.totT},...Array(6).fill({s:S_.totX}),zt(D.kg),zt(D.kgZ),{s:S_.totX},{s:S_.totX}]});
  notaRow(s2,N2);

  // Foglio 3 · Lista di taglio
  const N3=10, s3:any={name:'Lista di taglio',cols:[22,34,13,10,13,12,13,10,14,7],...top('LISTA DI TAGLIO PROFILI',N3),freeze:4,titles:'4:4',footer};
  s3.rows.push(hdr(['Profilo','Descrizione','Lunghezza m','Pezzi','Metri totali','Peso nero kg','Peso zincato kg','Zincatura','Righe','✓'],[2,3,4,5,6],[7,9]));
  for(const code of [...new Set(D.taglio.map(x=>x.code))]){const xs=D.taglio.filter(x=>x.code===code);
    band(s3,`${code} · ${xs[0].desc}`,N3,S_.g2);
    for(const x of xs)s3.rows.push({c:[{v:x.code,s:S_.code},{v:x.desc,s:S_.txt},{v:x.L,s:S_.len},{v:x.pz,s:S_.intB},{v:x.pz*x.L,s:S_.d2},{v:x.kg,s:S_.d1},zc(x.kgZ),{v:x.zinc?'Sì':'No',s:S_.ctr},{v:[...x.righe].join(', '),s:S_.muted},{s:S_.ctr}]});
    s3.rows.push({c:[{v:`Totale ${code}`,s:S_.totT},{s:S_.totX},{s:S_.totX},{v:xs.reduce((a,x)=>a+x.pz,0),s:st({b:1,bg:TOT,bd:'all',nf:'#,##0'})},{v:xs.reduce((a,x)=>a+x.pz*x.L,0),s:st({b:1,bg:TOT,bd:'all',nf:'#,##0.00'})},{v:xs.reduce((a,x)=>a+x.kg,0),s:S_.totN},zt(xs.reduce((a,x)=>a+x.kgZ,0)),{s:S_.totX},{s:S_.totX},{s:S_.totX}]});}
  if(!D.taglio.length)s3.rows.push({c:[{v:'Nessun profilo da tagliare',s:S_.muted}]});
  else notaRow(s3,N3);

  // Foglio 4 · Ordini (fabbisogno con costo stimato e colonne da compilare)
  const N4=12, s4:any={name:'Ordini',cols:[20,38,6,11,12,13,10,13,14,20,13,13],...top('ORDINI · FABBISOGNO MATERIALI',N4),freeze:4,titles:'4:4',footer};
  s4.rows.push(hdr(['Codice','Descrizione','U.M.','Quantità','Peso nero kg','Peso zincato kg','Zincatura','Costo unit.','Costo totale','Fornitore','N. ordine','Consegna'],[3,4,5,7,8],[2,6]));
  for(const g of D.ordini){band(s4,g.cat,N4,S_.g1); let ct=0,kt=0,kz=0;
    for(const x of g.items){ct+=x.cost;kt+=x.kg;kz+=x.kgZ;
      s4.rows.push({c:[{v:x.code,s:S_.code},{v:x.desc,s:S_.txt},{v:x.um,s:S_.ctr},x.um==='m'?{v:x.qty,s:S_.d2B}:{...q(x.qty),s:S_.intB},{v:x.kg,s:S_.d1},zc(x.kgZ),{v:x.t==='comm'?'':x.zinc?'Sì':'No',s:S_.ctr},{v:x.qty?x.cost/x.qty:0,s:S_.eur},{v:x.cost,s:S_.eur},{s:S_.fill},{s:S_.fill},{s:S_.fill}]});
      if(x.sd)for(const c of x.sd)s4.rows.push({c:[{v:'↳ '+c.c,s:S_.sdT},{v:c.d,s:S_.sdT},{v:'pz',s:S_.ctr},{v:x.qty*num(c.q),s:S_.sdN},{s:S_.txt},{s:S_.txt},{s:S_.txt},{v:num(c.p),s:S_.sdE},{v:x.qty*num(c.q)*num(c.p),s:S_.sdE},{s:S_.fill},{s:S_.fill},{s:S_.fill}]});}
    s4.rows.push({c:[{v:`Totale ${g.cat.toLowerCase()}`,s:S_.totT},...Array(3).fill({s:S_.totX}),{v:kt,s:S_.totN},zt(kz),{s:S_.totX},{s:S_.totX},{v:ct,s:S_.totE},{s:S_.totX},{s:S_.totX},{s:S_.totX}]});}
  s4.rows.push({c:[]},{c:[{v:'TOTALE COMMESSA',s:S_.totT},...Array(3).fill({s:S_.totX}),{v:D.kg,s:S_.totN},zt(D.kgZ),{s:S_.totX},{s:S_.totX},{v:D.cost,s:S_.totE},{s:S_.totX},{s:S_.totX},{s:S_.totX}]});
  s4.rows.push({c:[]},{c:[{v:'Costi stimati dal listino del preventivatore. I quadri sono esplosi nei loro componenti (righe ↳): il costo del quadro comprende già i componenti e il cablaggio. '+nota,s:S_.sub}]});
  s4.merges.push(`A${s4.rows.length}:${xcol(N4-1)}${s4.rows.length}`);

  // Fogli 5-6 · Gantt di produzione con formule + Calendario
  const sheets=[s1,s2,s3,s4], X=ganttSheets(buildGantt(D),K,{name:'Gantt',title:'GANTT DI PRODUZIONE',endLabel:'FINE PRODUZIONE E CONSEGNE',
    note:'Le fasi a valle partono dopo quelle da cui dipendono (officina una riga alla volta). Il montaggio in campo non è compreso: è nel file del montaggio.'});
  sheets.push(...X.sheets);
  return xlsxBlob(sheets,st,X.names);
}
// Gantt "vivo": date con formule GIORNO.LAVORATIVO (WORKDAY) e barre con formattazione condizionale, piu' il foglio Calendario.
// Cambiando in Excel durate, "Inizio fissato", avvio o festivita' si ricalcolano date, intestazione e barre.
export function ganttSheets(G,K,o){
  const {st,S_,top,hdr,footer,ACC,TOT}=K, sheets:any[]=[], names:any={};
  if(G.tasks.length){
    const xd=n=>n+25569;   // 25569 = 01/01/1970 nel calendario di Excel
    const nDays=G.nWork+Math.max(20,Math.ceil(G.nWork*.5));   // margine per allungare le fasi in Excel
    const days:any[]=[]; for(let n=G.start;days.length<nDays;n++)if(isWork(n))days.push(n);
    const L=6, N5=L+days.length, C0=xcol(L), CN=xcol(N5-1), FEST='Festivita';
    const s5:any={name:o.name,cols:[32,24,9,12,11,11,...days.map(()=>3.4)],...top(o.title,N5),freeze:6,freezeCol:L,titles:'4:6',footer,cf:[]};
    const inD=st({b:1,bd:'all',bc:'E3C77A',bg:'FFF4CC',nf:'dd/mm/yyyy',h:'center'}), inN=st({bd:'all',bc:'E3C77A',bg:'FFF4CC',h:'center'}), inNB=st({b:1,bd:'all',bc:'E3C77A',bg:'FFF4CC',h:'center'});
    s5.rows[2]={h:20,c:[{v:'Avvio commessa',s:S_.lab},{v:xd(G.t0),s:inD},{v:'Celle gialle modificabili: date e barre si ricalcolano da sole. Festività e chiusure nel foglio Calendario.',s:S_.sub}]};
    s5.merges.push(`C3:${xcol(Math.min(N5,L+24)-1)}3`);
    const hM=st({b:1,sz:8,c:'FFFFFF',bg:ACC,bd:'all',bc:'4A7F7A',nf:'mmm'}), hW=st({sz:8,c:'FFFFFF',bg:ACC,bd:'all',bc:'4A7F7A'}), hDay=st({b:1,sz:8,c:'FFFFFF',bg:ACC,bd:'all',bc:'4A7F7A',h:'center',nf:'d'});
    const r4:any={h:16,c:['Fase','Base di calcolo','Durata gg','Inizio fissato','Inizio','Fine'].map((x,i)=>({v:x,s:i>1?S_.headC:S_.head}))}, r5:any={h:16,c:Array(L).fill({s:S_.head})}, r6:any={h:16,c:Array(L).fill({s:S_.head})};
    days.forEach((n,i)=>{const c=xcol(L+i), p=xcol(L+i-1);
      r6.c[L+i]={f:i?`WORKDAY(${p}6,1,${FEST})`:`WORKDAY($B$3-1,1,${FEST})`,v:xd(n),s:hDay};
      r4.c[L+i]={f:i?`IF(MONTH(${c}6)<>MONTH(${p}6),${c}6,"")`:`${c}6`,s:hM};
      r5.c[L+i]={f:i?`IF(WEEKDAY(${c}6,2)<WEEKDAY(${p}6,2),"S"&WEEKNUM(${c}6,21),"")`:`"S"&WEEKNUM(${c}6,21)`,s:hW};});
    s5.rows.push(r4,r5,r6);
    for(let j=0;j<L;j++)s5.merges.push(`${xcol(j)}4:${xcol(j)}6`);
    s5.cf.push({ref:`${C0}6:${CN}6`,f:`${C0}$6=TODAY()`,dxf:st.dxf('A23B32')});
    const dE=st({bd:'all',bc:'ECE8E0'}), dt=st({bd:'all',nf:'dd/mm/yyyy',h:'center'}), rowOf:any={};
    // Fine di una fase come espressione: con durata 0 le fasi successive partono lo stesso giorno.
    const fineX=r=>`WORKDAY(E${r},C${r}-1,${FEST})`;
    for(const gr of G.groups){const ts=G.tasks.filter(x=>x.grp===gr.key); if(!ts.length)continue;
      s5.rows.push({h:18,c:[{v:gr.label,s:S_.g1},...Array(L-1).fill({s:S_.g1}),...days.map(()=>({s:dE}))]});
      const rg=s5.rows.length, a1=rg+1, b1=rg+ts.length; s5.merges.push(`A${rg}:${xcol(L-1)}${rg}`);
      s5.cf.push({ref:`${C0}${rg}:${CN}${rg}`,f:`AND(${C0}$6>=MIN($E$${a1}:$E$${b1}),${C0}$6<=MAX($F$${a1}:$F$${b1}))`,dxf:st.dxf('BFD3D0')});
      for(const x of ts){const r=s5.rows.length+1; rowOf[x.id]=r;
        s5.rows.push({c:[{v:x.name,s:S_.txt},{v:x.base,s:S_.muted},{v:x.dur,s:x.ov?inNB:inN},x.daMan?{v:xd(dNum(x.daMan)),s:inD}:{s:inD},
          {f:`IF(D${r}<>"",WORKDAY(D${r}-1,1,${FEST}),WORKDAY(MAX($B$3-1${x.autoDa?','+(xd(dNum(x.autoDa))-1):''}${x.deps.map(d=>','+fineX(rowOf[d])).join('')}),1,${FEST}))`,v:xd(x.s),s:dt},
          {f:`IF(C${r}=0,E${r},${fineX(r)})`,v:xd(x.last),s:dt},...days.map(()=>({s:dE}))]});
        s5.cf.push({ref:`${C0}${r}:${CN}${r}`,f:`AND(${C0}$6>=$E${r},${C0}$6<=$F${r},$C${r}>0)`,dxf:st.dxf(FASI[x.fase][2])});
        s5.cf.push({ref:`${C0}${r}:${CN}${r}`,f:`AND(${C0}$6=$E${r},$C${r}=0)`,dxf:st.dxf('1F2B33')});}}
    const last=s5.rows.length, re=last+2, tS=st({b:1,bg:TOT,bd:'all',nf:'dd/mm/yyyy',h:'center'});
    s5.rows.push({c:[]},{c:[{v:o.endLabel,s:S_.totT},{s:S_.totX},{f:`NETWORKDAYS(E${re},F${re},${FEST})`,v:G.nWork,s:st({b:1,bg:TOT,bd:'all',h:'center'})},{s:S_.totX},
      {f:`${C0}6`,v:xd(G.start),s:tS},{f:`MAX(F7:F${last})`,v:xd(G.end),s:tS},...days.map(()=>({s:dE}))]});
    s5.cf.push({ref:`${C0}${re}:${CN}${re}`,f:`${C0}$6=$F$${re}`,dxf:st.dxf('1F2B33')});
    s5.rows.push({c:[]},{c:[{v:`Durate in giorni lavorativi. ${o.note} Il grafico copre ${days.length} giorni lavorativi dall'avvio: oltre, le barre non si vedono. In grassetto le durate già modificate nel preventivatore.`,s:S_.sub}]});
    s5.merges.push(`A${s5.rows.length}:${xcol(Math.min(N5,L+30)-1)}${s5.rows.length}`);
    sheets.push(s5);

    // Foglio 6 · Calendario: festivita' nazionali + righe libere per ferie e chiusure aziendali.
    const y0=dDate(G.start).getUTCFullYear(), HN={'1-1':'Capodanno','1-6':'Epifania','4-25':'Festa della Liberazione','5-1':'Festa dei lavoratori','6-2':'Festa della Repubblica',
      '8-15':'Ferragosto','11-1':'Ognissanti','12-8':'Immacolata Concezione','12-25':'Natale','12-26':'Santo Stefano'};
    const s6:any={name:'Calendario',cols:[14,44],...top('CALENDARIO · FESTIVITÀ E CHIUSURE',2),portrait:true,freeze:4,footer};
    s6.rows[2]={c:[{v:'Aggiungi in fondo ferie e chiusure aziendali (una data per riga): il Gantt le salta.',s:S_.sub}]}; s6.merges.push('A3:B3');
    s6.rows.push(hdr(['Data','Descrizione'],[],[0]));
    for(let y=y0;y<=y0+2;y++)for(const n of [...holidays(y)].sort((a:any,b:any)=>a-b)){const d=dDate(n);
      s6.rows.push({c:[{v:xd(n),s:dt},{v:HN[`${d.getUTCMonth()+1}-${d.getUTCDate()}`]||"Lunedì dell'Angelo",s:S_.txt}]});}
    for(let k=0;k<30;k++)s6.rows.push({c:[{s:inD},{s:st({bd:'all',bc:'E3C77A',bg:'FFF4CC'})}]});
    names[FEST]=`'Calendario'!$A$5:$A$${s6.rows.length+100}`;
    sheets.push(s6);}
  return {sheets,names};
}
export function downloadLavorXlsx(){
  const P=S.prev, a=document.createElement('a');
  a.href=URL.createObjectURL(lavorWorkbook()); a.download=`Distinta_lavorazione_${fileName(P.rif||P.cliente||'preventivo')}_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
// File del montaggio: Computo (quantita' e prezzi modificabili, totali a formule) + Gantt di montaggio + Calendario.
export function montWorkbook(){
  const M=buildMont(), K=xlKit('Montaggio'), {st,S_,top,hdr,footer,TOT}=K, N=9;
  const s1:any={name:'Computo',cols:[12,62,8,10,13,13,14,14,15],...top('COMPUTO MONTAGGIO',N),freeze:4,titles:'4:4',footer};
  s1.rows[2]={c:[{v:'Celle gialle modificabili (quantità e prezzi unitari): i totali si ricalcolano. Separato dal preventivo della fornitura.',s:S_.sub}]}; s1.merges.push(`A3:${xcol(N-1)}3`);
  s1.rows.push(hdr(['Codice','Descrizione','U.M.','Q.tà','Fornitura €/u','Posa €/u','Fornitura €','Posa €','Totale €'],[3,4,5,6,7,8],[2]));
  const yQ=st({bd:'all',bc:'E3C77A',bg:'FFF4CC',nf:'#,##0.##'}), yE=st({bd:'all',bc:'E3C77A',bg:'FFF4CC',nf:'#,##0.00'}), eu=st({bd:'all',nf:'#,##0.00'}), euB=st({bd:'all',nf:'#,##0.00',b:1});
  const desc=st({bd:'all',wrap:1}), tE=st({b:1,bg:TOT,bd:'all',nf:'#,##0.00'}), subs:any[]=[];
  const hide=r=>!r.q&&!r.qMan&&String(r.v.q??'').trim()!=='';
  for(const g0 of M.gruppi){const g={...g0,rows:g0.rows.filter(r=>!hide(r))}; if(!g.rows.length)continue;
    s1.rows.push({h:18,c:[{v:g.g,s:S_.g1},...Array(N-1).fill({s:S_.g1})]}); const rg=s1.rows.length; s1.merges.push(`A${rg}:${xcol(N-1)}${rg}`);
    for(const r of g.rows){const n=s1.rows.length+1;
      s1.rows.push({c:[{v:r.v.c,s:S_.code},{v:r.v.d,s:desc},{v:r.v.um,s:S_.ctr},{v:r.q,s:yQ},opt(r.pf)?{v:num(r.pf),s:yE}:{s:yE},opt(r.pp)?{v:num(r.pp),s:yE}:{s:yE},
        {f:`D${n}*E${n}`,v:r.tf,s:eu},{f:`D${n}*F${n}`,v:r.tp,s:eu},{f:`G${n}+H${n}`,v:r.tot,s:euB}]});}
    const a1=rg+1, b1=s1.rows.length, n=b1+1, t=k=>g.rows.reduce((a,r)=>a+r[k],0); subs.push(n);
    s1.rows.push({c:[{v:'Totale · '+g.g,s:S_.totT},...Array(5).fill({s:S_.totX}),{f:`SUM(G${a1}:G${b1})`,v:t('tf'),s:tE},{f:`SUM(H${a1}:H${b1})`,v:t('tp'),s:tE},{f:`SUM(I${a1}:I${b1})`,v:t('tot'),s:tE}]});}
  const sumOf=c=>`SUM(${subs.map(n=>c+n).join(',')})`;
  s1.rows.push({c:[]},{c:[{v:'TOTALE MONTAGGIO',s:S_.totT},...Array(5).fill({s:S_.totX}),{f:sumOf('G'),v:M.tf,s:tE},{f:sumOf('H'),v:M.tp,s:tE},{f:sumOf('I'),v:M.tot,s:tE}]});
  s1.rows.push({c:[]},{c:[{v:`Quantità calcolate dalla configurazione del preventivo (giorni di cantiere GG = ${M.G.gg}); in Excel sono valori fissi: se cambi il Gantt, aggiorna a mano le voci a giorni.`,s:S_.sub}]});
  s1.merges.push(`A${s1.rows.length}:${xcol(N-1)}${s1.rows.length}`);
  const X=ganttSheets(M.G,K,{name:'Gantt montaggio',title:'GANTT DI MONTAGGIO',endLabel:'FINE MONTAGGIO',
    note:'Il cantiere parte dopo tracciamento e prima consegna, gli assi dopo l\'ultima consegna (date dal Gantt di produzione). "Inizio fissato" vuoto = calcolo automatico.'});
  return xlsxBlob([s1,...X.sheets],st,X.names);
}
export function downloadMontXlsx(){
  const P=S.prev, a=document.createElement('a');
  a.href=URL.createObjectURL(montWorkbook()); a.download=`Montaggio_${fileName(P.rif||P.cliente||'preventivo')}_${new Date().toISOString().slice(0,10)}.xlsx`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
export function csvRow(a){return a.map(x=>typeof x==='number'?String(Math.round(x*10000)/10000).replace('.',','):`"${String(x??'').replace(/"/g,'""')}"`).join(';');}
export function exportCSV(){
  const rows=[['Riga','Gruppo','Categoria','Sottogruppo','Codice','Descrizione','Lunghezza m','Q.tà','Peso kg','Materiale','Zincatura','Lavorazione','Acquisto','Altro','Totale']];
  for(const l of R.lines)rows.push([l.rigaLabel,l.gruppo,l.cat,l.sub,l.code,l.desc,l.L,l.q,l.peso,l.mat,l.zinc,l.lav,l.acq,l.altro,tot(l)]);
  rows.push(['TOTALE','','','','','','','',R.T.peso,R.T.mat,R.T.zinc,R.T.lav,R.T.acq,R.T.altro,R.total]);
  download(`distinta_costi_${(S.prev.rif||'preventivo').replace(/[^\w-]+/g,'_')}.csv`,'﻿'+rows.map(csvRow).join('\r\n'),'text/csv');
}
export function exportListinoCSV(){
  const rows=[['Categoria','Sottogruppo','Tipo','Codice','Descrizione','kg/m o kg/pz','€/kg acquisto','€/kg zincatura','€/kg lavorazione','Costo €/pz']];
  for(const it of S.data.listino)rows.push([it.cat,it.sub,it.t,it.c,it.d,num(it.kg),it.t==='comm'?'':num(it.acq),it.t==='comm'?'':num(it.zn),it.t==='comm'?'':num(it.lav),it.t==='comm'?unitCost(it):'']);
  download('listino_tracker.csv','﻿'+rows.map(csvRow).join('\r\n'),'text/csv');
}
