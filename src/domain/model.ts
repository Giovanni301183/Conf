// Dati iniziali (da Excel), costanti e modello del preventivo. Logica portata dall'app HTML legacy.
/* ======================= DATI INIZIALI (da Excel) ======================= */
export const LISTINO0 = [{"c":"IPE 140","d":"Profilo IPE 140","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":12.9,"acq":0.95,"zn":0.5,"lav":0.1},{"c":"IPEA 140","d":"Profilo IPEA 140","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":10.9,"acq":1.05,"zn":0.5,"lav":0.3},{"c":"ASSE 120x120x3","d":"Profilo ASSE 120x120x3","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":11.8,"acq":1.25,"zn":0,"lav":0.3},{"c":"ASSE 120x120x2,5","d":"Profilo ASSE 120x120x2,5","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":9.2,"acq":1.25,"zn":0,"lav":0.3},{"c":"OMEGA 2,0","d":"Profilo OMEGA 2,0","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":3.9,"acq":0.95,"zn":0,"lav":0.3},{"c":"OMEGA 1,8","d":"Profilo OMEGA 1,8","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":3.51,"acq":0.95,"zn":0,"lav":0.3},{"c":"SUPPORTO L","d":"Profilo SUPPORTO L","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":1.36,"acq":1.18,"zn":0,"lav":0.3},{"c":"SUPPORTO V","d":"Profilo SUPPORTO V","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":0.41,"acq":1.1,"zn":0,"lav":0.3},{"c":"GAFFA","d":"Profilo GAFFA","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":1.28,"acq":0.85,"zn":0.8,"lav":0.3},{"c":"GAFFA GIUNZIONE ASSE","d":"Profilo GAFFA GIUNZIONE ASSE","cat":"STRUTTURA","sub":"Profili a barra","t":"barra","kg":5.07,"acq":0.85,"zn":0.8,"lav":0.3},{"c":"TTS.PC.002.IPE140","d":"Supporto laterale testa cuscinetto","cat":"STRUTTURA","sub":"Carpenteria","t":"pezzo","kg":2.1528,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.003.IPE140","d":"Supporto testa cuscinetto","cat":"STRUTTURA","sub":"Carpenteria","t":"pezzo","kg":2.7256,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PM.002.IPE140","d":"Supporto laterale testa riduttore","cat":"STRUTTURA","sub":"Carpenteria","t":"pezzo","kg":4.5708,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PM.003.IPE140","d":"Testa riduttore pilastro motore","cat":"STRUTTURA","sub":"Carpenteria","t":"pezzo","kg":2.54,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PF.002.IPE140","d":"Piastra giunzione montanti centrali 200x100x4 (8 fori Ø11)","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.624,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PF.003.IPE140","d":"Piastra giunzione montanti esterna 240x70x6 (12 fori Ø11)","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.7862,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PF.004.IPE140","d":"Piastra giunzione montanti interna 240x25x6 (6 fori Ø11)","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.2808,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.AR.4011","d":"Supporto superiore inclinometro","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.8424,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.AR.4012","d":"Supporto inferiore inclinometro","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":2.9484,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.AR.5011","d":"Piastra ad L supporto fine corsa","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.2184,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.AR.5012","d":"Leva battente sensore fine corsa","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.6524000000000001,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.2011.1076","d":"Angolare 40x40x4 lungo 1076 mm supporto inferiore","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":2.685696,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.2012.1076","d":"Angolare 40x40x4 lungo 1076 mm supporto superiore","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":2.685696,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.2013","d":"Palo MAX lungo mt.2,040","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":7.001280000000001,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.3011","d":"Angolare 40x40x4 lungo 869 mm superiore","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":2.169,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.3012","d":"Angolare 40x40x4 lungo 869 mm inferiore","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":2.169,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PC.3013","d":"Palo MAX lungo mt.2,150","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":7.378800000000001,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PM.2011","d":"Angolare 30x30x4 lungo 370 mm superiore","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.5195000000000001,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.PM.2012","d":"Angolare 30x30x4 lungo 370 mm inferiore","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.5195000000000001,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.SM.001","d":"Piatto 50X5X230 supporto sensori","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.451375,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"TTS.SM.002","d":"Piatto 30X3X193 leva sensore temperatura pannello","cat":"STRUTTURA","sub":"Pezzi speciali","t":"pezzo","kg":0.136355,"acq":0.95,"zn":0.5,"lav":0.3},{"c":"06TAP120X120","d":"Tappo profilato 120x120","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.01,"costo":2},{"c":"10BZ10X30","d":"Bullone testa esagonale M10X30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0245,"costo":0.0634},{"c":"10BZ10X40","d":"Bullone testa esagonale zn M10X40","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0305,"costo":0.0708},{"c":"10BZ16X140","d":"Bullone testa esagonale M16x140 mezzo filetto","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.21,"costo":0.5589},{"c":"10BZM10X160","d":"Bullone testa esagonale zn M10X160","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.095,"costo":0.2686},{"c":"10BZM10X30","d":"Bullone testa esagonale zn M10X30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0245,"costo":0.0634},{"c":"10BZM10X40","d":"Bullone testa esagonale M10X40","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0305,"costo":0.0708},{"c":"10BZM16X25","d":"Bullone testa esagonale zn M16X25","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.052,"costo":0.1746},{"c":"10BZM16X60","d":"Bullone testa esagonale M16X60","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.11,"costo":0.2967},{"c":"10BZM5X20","d":"Bullone testa esagonale zn M5x20","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0031,"costo":0},{"c":"10BZM5X30","d":"Bullone testa esagonale zn M5x30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0042,"costo":0.0162},{"c":"10BZM6X150","d":"Bullone testa esagonale zn M6X150","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.026,"costo":0.2214},{"c":"10BZM6X20","d":"Bullone testa esagonale zn M6X20","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0054,"costo":0},{"c":"10BZM6X25","d":"Bullone testa esagonale zn M6X30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0062,"costo":0.0243},{"c":"10BZM6X30","d":"Bullone testa esagonale zn M6X30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.007,"costo":0.0243},{"c":"10BZM8X150","d":"Bullone testa esagonale zn M8X150","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.049,"costo":0.1659},{"c":"10BZM8X20","d":"Bullone testa esagonale zn M8X20","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0112,"costo":0.0266},{"c":"10BZM8X25","d":"Bullone testa esagonale zn M8X25","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0129,"costo":0.0297},{"c":"10BZM8X30","d":"Bullone testa esagonale zn M8X30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0145,"costo":0.0378},{"c":"10DADAZM8","d":"Dado autobloccante M8 zn","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0048,"costo":0.0138},{"c":"10DAZAM10","d":"Dado autobloccante M10","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.009,"costo":0.0265},{"c":"10DAZAM16","d":"Dado autobloccante M16","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.036,"costo":0.0882},{"c":"10DAZAM5","d":"Dado zincato autobloc. M5","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0011,"costo":0.0063},{"c":"10DAZAM6","d":"Dado autobloccante M6","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0021,"costo":0.0078},{"c":"10DAZAM8","d":"Dado autobloccante M8","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0048,"costo":0.0127},{"c":"10ROND10","d":"Rondella zn da 10","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0039,"costo":0.0092},{"c":"10ROND16","d":"Rondella zn da 16","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0135,"costo":0.0309},{"c":"10ROND5","d":"Rondella ZN da 5","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0005,"costo":0.0019},{"c":"10ROND6","d":"Rondella zn 6","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0011,"costo":0.0036},{"c":"10ROND8","d":"Rondella zn 8","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0021,"costo":0.0049},{"c":"M5X30 8.8 ISO1207","d":"Bullone testa esagonale con intaglio M5x30","cat":"BULLONERIA","sub":"Bulloneria","t":"comm","kg":0.0042,"costo":0.0162},{"c":"15T-MOTORIDUTTORE","d":"Motoriduttore","cat":"ELETTROMECCANICO","sub":"Componenti","t":"comm","kg":50,"costo":300},{"c":"15T-INCLINOMETRO","d":"Inclinometro","cat":"ELETTRONICO","sub":"Componenti","t":"comm","kg":1.5,"costo":170},{"c":"15T-CUSCINETTO","d":"Cuscinetto asse di rotazione","cat":"ELETTROMECCANICO","sub":"Componenti","t":"comm","kg":3,"costo":14},{"c":"15T-QDSTMOTORE","d":"Quadro sotto motore","cat":"ELETTRONICO","sub":"Quadri e centralina","t":"comm","kg":5,"costo":160,"sd":[{"c":"CBRBT003","d":"BT/3 Blocchetto terminale a vite","q":5,"p":0.7416},{"c":"CBRCB240","d":"CBD.4 Morsetto passante","q":6,"p":0.7553},{"c":"CBRCB241","d":"C54/6/PT Piastrina terminale","q":3,"p":0.4954},{"c":"CBRTO430","d":"TEO.4 Morsetto di terra","q":1,"p":2.5398},{"c":"IBOB04601","d":"VTR 01 cieco quadro IP66 300x265x165","q":1,"p":61.05},{"c":"IBOB04680","d":"ST VTR - staffe doppio isolamento","q":4,"p":1.81},{"c":"LEG037404","d":"Guida simmetrica lung. 2 mt. prof. 7,5 mm","q":1,"p":3.194},{"c":"SNRABLS1A24100","d":"Alimentatore 24V 10A 1PH ottimizzato","q":1,"p":52.17},{"c":"SNRR9P35606","d":"Int. magn. RESI9 MCB 1P+N C 6A","q":1,"p":4.9},{"c":"CABLAGGIO","d":"Cablaggio / assemblaggio quadro (differenza da listino)","q":1,"p":19.1802}]},{"c":"10S-FC","d":"Finecorsa elettrico","cat":"ELETTROMECCANICO","sub":"Componenti","t":"comm","kg":0.8,"costo":27},{"c":"15T-QUADA","d":"Quadro Area A","cat":"ELETTRONICO","sub":"Quadri e centralina","t":"comm","kg":15,"costo":1000,"sd":[{"c":"ALP95-708/02NB","d":"CAVO PATCH CAT.6 2.0M U/UTP NERO CU","q":1,"p":2.2084},{"c":"ALP95-708/4-003WB","d":"CAVO DI RETE PATCH SLIM IN RAME CAT.6 BIANCO U/UTP LSZH 0.25M","q":1,"p":1.4508},{"c":"CBRBT003","d":"BT/3 BLOCCHETTO TERMINALE A VITE","q":7,"p":0.7416},{"c":"CBRCB240","d":"CBD.4 MORSETTO PASSANTE","q":24,"p":0.7553},{"c":"CBRCB241","d":"C54/6/PT PIASTRINA TERMINALE","q":5,"p":0.4954},{"c":"CBRCB340","d":"CBD.6 MORSETTO PASSANTE","q":1,"p":1.0402},{"c":"CBRCBX24","d":"CBD.4(EX)I MORS. PASSANTE","q":15,"p":0.8496},{"c":"CBRCBX34","d":"CBD.6(EX)I MORS.PASSANTE","q":1,"p":1.1452},{"c":"CBRTO120","d":"TEC.6/O MORSETTO DI TERRA","q":1,"p":0},{"c":"CEM41395","d":"MODULARE MG-CPM-04 BIANCA 5X10 X PHOENIX","q":40,"p":0.0485},{"c":"HAGKB163N","d":"BARR. CABLAGGIO 1P BLU 13M","q":2,"p":5.71},{"c":"HAGKB163P","d":"BARR. CABLAGGIO 1P MARRONE 13M","q":2,"p":5.71},{"c":"IBOB02580","d":"T1-EN 40X60 G CAN.CABL.","q":2,"p":4.51},{"c":"LEG037407","d":"GUIDA SIMMETRICA LUNG.2 MT. PROF.15 MM","q":1,"p":5.808},{"c":"SNRA9A26946","d":"IMX+OF 110/415VCA 110VCC IC40","q":1,"p":25.83},{"c":"SNRA9N15646","d":"STI 1P+N 10.3X38 500V","q":3,"p":8.99},{"c":"SNRA9S70640","d":"ISW-NA 2P 40A","q":1,"p":22.93},{"c":"SNRABLS1A24050E","d":"DIN-RAIL PSU 1PH, 120W,24VDC,5A","q":1,"p":21.74},{"c":"SNRNSYMM86","d":"NSYMM86 INT. LAM. 800X600","q":1,"p":20.01},{"c":"SNRNSYPFPLMG","d":"7035 4 STAFFE ISOL. FISS. A PARETE","q":1,"p":22.43},{"c":"SNRNSYPLM86G","d":"7035 CASS.POL.845X635X300 IP66","q":1,"p":266.13},{"c":"SNRR9P35606","d":"INT.MAGN. RESI9 MCB 1P+N C 6A","q":15,"p":4.9},{"c":"SNRTM241CE24R","d":"CONTROLLORE M241 24 I/O RELEETH","q":1,"p":321.52},{"c":"SNRXB4BS8445","d":"PULSANTE FUNGO ROSSO EMERGENZA","q":1,"p":19.49},{"c":"TDM0004490003","d":"BASETTA ADESIVA NATURALE 28X28MM","q":2,"p":10.7},{"c":"X001XUI5UV","d":"YULINCA 6 PORT GIGABIT DIN-RAIL SWITCH","q":1,"p":59.9824},{"c":"CABLAGGIO","d":"Cablaggio / assemblaggio quadro (differenza da listino)","q":1,"p":14.0756}]},{"c":"15T-QUADGEN","d":"Quadro Generale","cat":"ELETTRONICO","sub":"Quadri e centralina","t":"comm","kg":20,"costo":1800,"sd":[{"c":"ALP95-708/02NB","d":"CAVO PATCH CAT.6 2.0M U/UTP NERO CU","q":1,"p":2.2084},{"c":"ALP95-708/4-003WB","d":"CAVO DI RETE PATCH SLIM IN RAME CAT.6 BIANCO U/UTP LSZH 0.25M","q":1,"p":1.4508},{"c":"CBRBT003","d":"BT/3 BLOCCHETTO TERMINALE A VITE","q":7,"p":0.7416},{"c":"CBRCB240","d":"CBD.4 MORSETTO PASSANTE","q":11,"p":0.7553},{"c":"CBRCB241","d":"C54/6/PT PIASTRINA TERMINALE","q":5,"p":0.4954},{"c":"CBRCB340","d":"CBD.6 MORSETTO PASSANTE","q":6,"p":1.0402},{"c":"CBRCBX24","d":"CBD.4(EX)I MORS. PASSANTE","q":1,"p":0.8496},{"c":"CBRCBX34","d":"CBD.6(EX)I MORS.PASSANTE","q":4,"p":1.1452},{"c":"CEM41395","d":"MODULARE MG-CPM-04 BIANCA 5X10 X PHOENIX","q":22,"p":0.0485},{"c":"IBOB02580","d":"T1-EN 40X60 G CAN.CABL.","q":2,"p":4.51},{"c":"LEG037407","d":"GUIDA SIMMETRICA LUNG.2 MT. PROF.15 MM","q":1,"p":5.808},{"c":"SNRA9A26946","d":"IMX+OF 110/415VCA 110VCC IC40","q":1,"p":25.83},{"c":"SNRA9E18327","d":"IIL TRIFASE 3 LED ROSSI 110-230VCA","q":1,"p":33.88},{"c":"SNRA9N15646","d":"STI 1P+N 10.3X38 500V","q":3,"p":8.99},{"c":"SNRA9N15658","d":"STI 3P+N 10.3X38 500V","q":1,"p":16.47},{"c":"SNRA9P54732","d":"INT. MAGNETOT. IC40N 3P+N C 32A","q":1,"p":64.63},{"c":"SNRABLS1A24050E","d":"DIN-RAIL PSU 1PH, 120W,24VDC,5A","q":1,"p":21.74},{"c":"SNRHMIST6500","d":"HARMONY 10 WIDE BASIC HMI","q":1,"p":654.2},{"c":"SNRNSYMM86","d":"NSYMM86 INT. LAM. 800X600","q":1,"p":20.01},{"c":"SNRNSYPFPLMG","d":"7035 4 STAFFE ISOL. FISS. A PARETE","q":1,"p":22.43},{"c":"SNRNSYPLM86G","d":"7035 CASS.POL.845X635X300 IP66","q":1,"p":266.13},{"c":"SNRR9D60606","d":"INT.MTD RESI9 RCBO 1P+N C 6A 30MA AC 2M","q":1,"p":17.25},{"c":"SNRR9D60625","d":"INT. MTD RESI9 RCBO 1P+N C 25A","q":3,"p":17.25},{"c":"SNRTM241CE24R","d":"CONTROLLORE M241 24 I/O RELEETH","q":1,"p":321.52},{"c":"SNRXB4BS8445","d":"PULSANTE FUNGO ROSSO EMERGENZA","q":1,"p":19.49},{"c":"TDM0004490003","d":"BASETTA ADESIVA NATURALE 28X28MM","q":4,"p":10.7},{"c":"X001XUI5UV","d":"YULINCA 6 PORT GIGABIT DIN-RAIL SWITCH","q":1,"p":59.9824},{"c":"CABLAGGIO","d":"Cablaggio / assemblaggio quadro (differenza da listino)","q":1,"p":87.7153}]},{"c":"15T-PIRANOMETRO","d":"Piranometro","cat":"ELETTRONICO","sub":"Sensori","t":"comm","kg":0.5,"costo":350},{"c":"15T-SENSVELVEN","d":"Anemometro","cat":"ELETTRONICO","sub":"Sensori","t":"comm","kg":0.5,"costo":350},{"c":"15T-TERMARIA","d":"Termometro Aria_ mSTA.l","cat":"ELETTRONICO","sub":"Sensori","t":"comm","kg":0.5,"costo":300},{"c":"15T-TERMCONTP10","d":"Termometro a contatto P100_STC-i","cat":"ELETTRONICO","sub":"Sensori","t":"comm","kg":0.5,"costo":300},{"c":"15T-CENTRALINAM","d":"Box centralina meteo","cat":"ELETTRONICO","sub":"Quadri e centralina","t":"comm","kg":5,"costo":600,"sd":[{"c":"15T-CASCHECOLLSENS","d":"Cavo schermato per collegamento sensori","q":5,"p":29.4},{"c":"15T-JUNCTBOXIP65","d":"Junction box IP65","q":1,"p":235.2},{"c":"15T-MOD8ING","d":"Modulo 8 ingressi","q":1,"p":193.2},{"c":"CABLAGGIO","d":"Cablaggio / assemblaggio quadro (differenza da listino)","q":1,"p":24.6}]}];

export const CATS = ['STRUTTURA','ELETTROMECCANICO','ELETTRONICO','BULLONERIA'];
export const GROUPS = ['PILASTRO MOTORE','PILASTRO CUSCINETTO','ASSI DI ROTAZIONE','KIT OMEGA + PANNELLI','KIT INCLINOMETRO'];
export const COLS = [['mat','Materiale','--c-mat'],['zinc','Zincatura','--c-zinc'],['lav','Lavorazione','--c-lav'],['acq','Acquisto','--c-acq'],['altro','Altro','--c-altro']];
export const OPT_LFOND = range(2.6,3.6,0.1);
export const OPT_LCUSC = range(2.3,4.5,0.1);
export const MIN_CUSC = {Agrivoltaico:2.3, Basso:2.8};

// Distinta comune a tutte le taglie. qa = quantita' Agrivoltaico, qb = Basso (vuoto = come Agrivoltaico).
// Driver: MOT = pilastri motore, CUSC = pilastri cuscinetto, OMEGA = kit omega, PANN = kit pannello (moduli).
export const TEMPLATE0 = [
  ['PILASTRO MOTORE','$PROF','Pilastro fondazione','$LFOND','MOT*1','0'],
  ['PILASTRO MOTORE','$PROF','Pilastro motore','$LMOT','MOT*1'],
  ['PILASTRO MOTORE','TTS.PF.002.IPE140','','','MOT*2','0'],
  ['PILASTRO MOTORE','TTS.PF.003.IPE140','','','MOT*2','0'],
  ['PILASTRO MOTORE','TTS.PF.004.IPE140','','','MOT*4','0'],
  ['PILASTRO MOTORE','TTS.PM.002.IPE140','','','MOT*2'],
  ['PILASTRO MOTORE','TTS.PM.003.IPE140','','','MOT*1'],
  ['PILASTRO MOTORE','10BZ10X40','','','MOT*32','0'],
  ['PILASTRO MOTORE','10BZM10X40','','','MOT*8'],
  ['PILASTRO MOTORE','10BZM16X60','','','MOT*4'],
  ['PILASTRO MOTORE','10ROND10','','','MOT*80','MOT*16'],
  ['PILASTRO MOTORE','10ROND16','','','MOT*8'],
  ['PILASTRO MOTORE','10DAZAM10','','','MOT*40','MOT*8'],
  ['PILASTRO MOTORE','10DAZAM16','','','MOT*4'],
  ['PILASTRO MOTORE','15T-MOTORIDUTTORE','','','MOT*1'],
  ['PILASTRO MOTORE','15T-QDSTMOTORE','','','MOT*1'],
  ['PILASTRO MOTORE','10S-FC','','','MOT*1'],
  ['PILASTRO CUSCINETTO','$PROF','Pilastro fondazione','$LFOND','CUSC*1','0'],
  ['PILASTRO CUSCINETTO','$PROF','Pilastro cuscinetto','$LCUSC','CUSC*1'],
  ['PILASTRO CUSCINETTO','TTS.PF.002.IPE140','','','CUSC*2','0'],
  ['PILASTRO CUSCINETTO','TTS.PF.003.IPE140','','','CUSC*2','0'],
  ['PILASTRO CUSCINETTO','TTS.PF.004.IPE140','','','CUSC*4','0'],
  ['PILASTRO CUSCINETTO','TTS.PC.002.IPE140','','','CUSC*2'],
  ['PILASTRO CUSCINETTO','TTS.PC.003.IPE140','','','CUSC*1'],
  ['PILASTRO CUSCINETTO','10BZ10X30','','','CUSC*4'],
  ['PILASTRO CUSCINETTO','10BZ16X140','','','CUSC*2'],
  ['PILASTRO CUSCINETTO','10BZM10X40','','','CUSC*32','0'],
  ['PILASTRO CUSCINETTO','10ROND10','','','CUSC*72','CUSC*8'],
  ['PILASTRO CUSCINETTO','10ROND16','','','CUSC*4'],
  ['PILASTRO CUSCINETTO','10DAZAM10','','','CUSC*36','CUSC*4'],
  ['PILASTRO CUSCINETTO','10DAZAM16','','','CUSC*2'],
  ['PILASTRO CUSCINETTO','15T-CUSCINETTO','','','CUSC*1'],
  ['KIT OMEGA + PANNELLI','$OMEGA','Omega supporto pannello',1.5,'OMEGA*1'],
  ['KIT OMEGA + PANNELLI','SUPPORTO L','Supporto a L superiore omega',0.63,'OMEGA*2'],
  ['KIT OMEGA + PANNELLI','SUPPORTO V','Supporto a V inferiore omega',1,'OMEGA*2'],
  ['KIT OMEGA + PANNELLI','GAFFA','Gaffa sotto omega',1,'OMEGA*1'],
  ['KIT OMEGA + PANNELLI','10BZM6X150','','','OMEGA*2'],
  ['KIT OMEGA + PANNELLI','10BZM8X25','','','OMEGA*4+PANN*4'],
  ['KIT OMEGA + PANNELLI','10BZM10X160','','','OMEGA*4'],
  ['KIT OMEGA + PANNELLI','10ROND6','','','OMEGA*4'],
  ['KIT OMEGA + PANNELLI','10ROND8','','','OMEGA*8+PANN*5'],
  ['KIT OMEGA + PANNELLI','10ROND10','','','OMEGA*8'],
  ['KIT OMEGA + PANNELLI','10DAZAM6','','','OMEGA*2'],
  ['KIT OMEGA + PANNELLI','10DAZAM8','','','OMEGA*8'],
  ['KIT OMEGA + PANNELLI','10DADAZM8','','','PANN*4'],
  ['KIT INCLINOMETRO','TTS.AR.4011','','','MOT*1'],
  ['KIT INCLINOMETRO','TTS.AR.4012','','','MOT*1'],
  ['KIT INCLINOMETRO','15T-INCLINOMETRO','','','MOT*1'],
  ['KIT INCLINOMETRO','10BZM8X150','','','MOT*4'],
  ['KIT INCLINOMETRO','10ROND8','','','MOT*8'],
  ['KIT INCLINOMETRO','10DAZAM8','','','MOT*4'],
  ['KIT INCLINOMETRO','M5X30 8.8 ISO1207','','','MOT*4'],
  ['KIT INCLINOMETRO','10ROND5','','','MOT*4'],
  ['KIT INCLINOMETRO','10DAZAM5','','','MOT*4'],
].map(([g,c,d,L,qa,qb])=>({g,c,d,L,qa,qb:qb??''}));

// Blocco assi: unica parte che cambia tra le taglie.
export function asse(d,L){return {c:'$ASSE',d,L,q:'2'};}
export function giunz(g,m10){return [
  {c:'GAFFA GIUNZIONE ASSE',d:'Gaffa giunzione asse',L:1,q:String(g)},
  {c:'10BZM8X150',d:'',L:'',q:String(g)},{c:'10ROND8',d:'',L:'',q:String(2*g)},{c:'10DAZAM8',d:'',L:'',q:String(g)},
  {c:'10BZM10X30',d:'',L:'',q:String(m10)},{c:'10ROND10',d:'',L:'',q:String(2*m10)},{c:'10DAZAM10',d:'',L:'',q:String(m10)}];}
export const SIZES0 = {
  '12':{mot:1,cusc:2, omega:14,assi:[asse('Asse lato motore',8.25)]},
  '18':{mot:1,cusc:4, omega:20,assi:[asse('Asse lato motore',7.2),asse('Asse esterno',5),...giunz(4,16)]},
  '20':{mot:1,cusc:4, omega:22,assi:[asse('Asse lato motore',7.2),asse('Asse esterno',6.3),...giunz(4,16)]},
  '22':{mot:1,cusc:4, omega:24,assi:[asse('Asse lato motore',8.7),asse('Asse esterno',6.15),...giunz(4,16)]},
  '36':{mot:1,cusc:8, omega:38,assi:[asse('Asse lato motore',8.7),asse('Asse esterno',6.756),asse('Asse esterno',8.645),...giunz(8,32)]},
  '40':{mot:1,cusc:10,omega:42,assi:[asse('Asse lato motore',8.7),asse('Primo asse centrale',8.25),asse('Secondo asse centrale',5),asse('Asse esterno',4.8),...giunz(12,16)]},
};

// Componenti di impianto: non si moltiplicano per il numero di tracker.
export const IMP = [
  ['quadA','15T-QUADA','QUADRI DI CAMPO'],['quadGen','15T-QUADGEN','QUADRI DI CAMPO'],
  ['box','15T-CENTRALINAM','CENTRALINA METEO'],['piran','15T-PIRANOMETRO','CENTRALINA METEO'],
  ['anem','15T-SENSVELVEN','CENTRALINA METEO'],['termAria','15T-TERMARIA','CENTRALINA METEO'],
  ['termCont','15T-TERMCONTP10','CENTRALINA METEO'],
];
export const EXTRA_MODI = [['corpo','A corpo (€)'],['tracker','Per tracker (€ × n. tracker)'],['kwp','Per kWp (€ × kWp)'],['perc','% sul costo']];
export const EXTRA_VOCI = [['altro','Altro'],['mat','Materiale'],['zinc','Zincatura'],['lav','Lavorazione'],['acq','Acquisto']];

export function range(a,b,s){const r:any[]=[];for(let x=a;x<=b+1e-9;x+=s)r.push(Math.round(x*100)/100);return r;}
export const clone=o=>JSON.parse(JSON.stringify(o));
export const num=v=>{if(typeof v==='number')return isFinite(v)?v:0;const n=parseFloat(String(v??'').replace(/\s/g,'').replace(',','.'));return isFinite(n)?n:0;};

// Parametri di produttivita' del Gantt (valgono per tutti i preventivi). Giorni = giorni lavorativi.
export const GANTT0 = {ltAcc:10,ltComm:20,kgLav:3000,ggZinc:5,kgZinc:15000,kgCamion:24000,camionGg:2,ggTrans:2};
// Parametri del Gantt di montaggio (vuoti: li compila l'utente).
export const MPAR=[['ggProg','Progettazione esecutiva (gg)'],['ggPull','Pull-out test (gg)'],['ggTracc','Tracciamento (gg)'],['squadre','Squadre di montaggio (vuoto = 1)'],
  ['paliGg','Infissione: pali/giorno per squadra'],['pilGg','Pilastri e piastre: pali/giorno per squadra'],['trkGg','Assi e accessori: tracker/giorno per squadra'],
  ['modGg','Moduli FV: moduli/giorno per squadra'],['ggElett','Collegamenti, quadri e meteo (gg)'],['ggColl','Collaudo e messa in servizio (gg)']];
export function defaultData(){return {params:{maggZinc:0.025,gantt:clone(GANTT0)},listino:clone(LISTINO0),template:clone(TEMPLATE0),sizes:clone(SIZES0),mont:defMont()};}
export function defRiga(){return {taglia:'12',n:1,tipo:'Agrivoltaico',prof:'IPE 140',asse:'2,5',omega:'2,0',lFond:3,lCusc:2.3};}
// Un preventivo nuovo parte da 0 €: una riga tracker con 0 tracker e nessun componente di impianto.
export function newPrev(){return {cliente:'',rif:'',data:new Date().toISOString().slice(0,10),note:'',
  modulo:{marca:'',wp:600},righe:[{...defRiga(),n:0}],
  imp:{quadA:0,quadGen:0,box:0,piran:0,anem:0,termAria:0,termCont:0},extra:[],marg:defMarg(),gantt:defGantt(),mont:defMontPrev(),
  stato:'bozza',luogo:defLuogo(),offerta:defOfferta()};}
// Dati dell'offerta da inviare (scheda Invia preventivo): intestazione, prezzi (pieno barrato, trasporto, posa), layout, dati di progetto.
export function defOfferta(){return {nome:'',rev:'0',data:'',referente:'',pieno:'',trasporto:'',posa:'',posaNota:'',posaModo:'',
  layout:'',layoutW:0,layoutH:0,layoutNome:'',dxf:null as null|Record<string,number>,prog:{} as Record<string,string>,inviata:''};}
// Stato commerciale del preventivo: [chiave, etichetta, colore, simbolo]. Il colore non basta mai da solo: c'e' sempre etichetta e simbolo.
export const STATI=[['bozza','Bozza','#8a969c','○'],['inviato','Inviato','#2f6fb0','➜'],['vinto','Vinto','#2e8b57','✓'],['perso','Perso','#c0453a','✕'],['alternativa','Non scelta','#a8946a','⊘']] as const;
export const statoOf=k=>STATI.find(s=>s[0]===k)||STATI[0];
// Posizione dell'impianto: nome della localita' e coordinate (vuote = non ancora sulla mappa).
export function defLuogo(){return {nome:'',lat:null,lng:null};}
// Pianificazione della commessa: data di avvio, durate scritte a mano e date "non prima del" per fase (vuoto = calcolato).
export function defGantt(){return {inizio:'',dur:{},da:{}};}
// Marginalita': % generale + % per categoria (vuota = usa la generale). modo: 'margine' sul prezzo | 'ricarico' sul costo.
// LAVORAZIONE e ZINCATURA non sono categorie del listino: sono le voci di costo "lavorazione" e "zincatura" di tutte le righe, con un margine proprio.
export const LAV_CAT='LAVORAZIONE', ZINC_CAT='ZINCATURA';
export const MCATS=[CATS[0],ZINC_CAT,...CATS.slice(1),'VOCI EXTRA',LAV_CAT];
export function hasOwnMarg(prev,cat){const v=prev.marg&&prev.marg.cat&&prev.marg.cat[cat];return !(v===''||v==null);}
export function defMarg(){return {modo:'margine',gen:0,cat:Object.fromEntries(MCATS.map(c=>[c,'']))};}
// Progressivo del preventivo "AAAA/NNN": l'anno e' quello della data del preventivo, il numero riparte ogni anno. arch = voci con prev.num.
export function numSucc(p,arch){
  const y=/^\d{4}/.test(p.data||'')?p.data.slice(0,4):String(new Date().getFullYear());
  const max=arch.reduce((m,e)=>{const r=/^(\d{4})\/(\d+)$/.exec((e.prev?.num||'').trim());return r&&r[1]===y?Math.max(m,+r[2]):m;},0);
  return `${y}/${String(max+1).padStart(3,'0')}`;}
export function righeTxt(p){return p.righe.map(r=>`${num(r.n)}×${r.taglia} ${r.tipo==='Basso'?'Basso':'Agri'}`).join(', ');}
export function normPrev(p){if(p&&!p.offerta)p.offerta=defOfferta();if(p&&!p.stato)p.stato='bozza';if(p&&!p.luogo)p.luogo=defLuogo();if(p&&!p.marg)p.marg=defMarg();if(p&&!p.gantt)p.gantt=defGantt();if(p&&!p.mont)p.mont=defMontPrev();return p;}
export function margPct(prev,cat){const M=prev.marg||defMarg(),v=M.cat&&M.cat[cat];return v===''||v==null?num(M.gen):num(v);}
// Fattore prezzo/costo. Margine sul prezzo: P = C / (1 - m). Ricarico sul costo: P = C * (1 + r).
export function margFactor(prev,cat){const p=margPct(prev,cat)/100;
  if((prev.marg||{}).modo==='ricarico')return p>-1?1+p:null;
  return p<1?1/(1-p):null;}

/* ---------- Montaggio: computo e Gantt di cantiere (separati dal costo del preventivo) ---------- */
// Driver per le formule delle quantita' (come nelle distinte): si possono sommare e moltiplicare, es. GG*SQ.
export const MDRV=[['TRK','tracker'],['MOT','pilastri motore'],['CUSC','pilastri cuscinetto'],['PALI','pali = MOT + CUSC'],['MOD','moduli FV'],['KWP','kWp'],
  ['T12 … T40','tracker di quella taglia'],['QUADA','quadri di campo'],['QUADGEN','quadri generali'],['METEO','centraline meteo'],['ANEM','anemometri'],
  ['GG','giorni lavorativi di cantiere (dal Gantt di montaggio)'],['SQ','squadre di montaggio']];
// Voci dal "Computo montaggio" + progettazione, pull-out test, noleggio mezzi, cantiere e collaudo. Prezzi e parametri vuoti: li compila l'utente.
export function defMont(){
  const v=(g,c,d,um,q)=>({id:c.replace(/[^\w-]/g,'_'),g,c,d,um,q,pf:'',pp:''}), A='ASSEMBLAGGIO ASSI E ACCESSORI';
  const assi=Object.keys(SIZES0).sort((a:any,b:any)=>a-b).flatMap(t=>[
    v(A,'ASSE-'+t,`Assemblaggio dell'asse tracker da ${t} moduli, incluso il montaggio dei traversi omega e il tiro in alto fino all'alloggiamento in sella`,'n','T'+t),
    v(A,'INCL-'+t,`Fissaggio in bolla dell'inclinometro · tracker da ${t} moduli`,'n','T'+t),
    v(A,'FC-'+t,`Fissaggio finecorsa con relativo battente · tracker da ${t} moduli`,'n','T'+t)]);
  return {par:Object.fromEntries(MPAR.map(([k])=>[k,''])),voci:[
    v('PROGETTAZIONE','PRG.1','Progettazione esecutiva strutture e layout di impianto','ac.','1'),
    v('PULL-OUT TEST','PULL.1','Prove di estrazione dei pali in campo (pull-out test)','n',''),
    v('PULL-OUT TEST','PULL.2','Relazione delle prove di pull-out','ac.','1'),
    v('TRACCIAMENTO','B.1','Tracciamento per la predisposizione delle strutture di fissaggio','ac.','1'),
    v('FONDAZIONI','B.2','Foro su roccia con perforatrice ad aria compressa, Ø 330 mm, profondità massima 3000 mm, con riporto del cutting di scavo','n',''),
    v('FONDAZIONI','B.2.1','Battipalo: infissione del palo di fondazione','n','PALI'),
    v('STRUTTURE','B.2.2','Fornitura e posa delle strutture di fissaggio dei moduli per impianti a inseguitori monoassiali, come da progetto (escluse infissione o predrilling, posizionamento pali e assemblaggio tracker)','ac.','1'),
    v('STRUTTURE','B.2.3','Assemblaggio piastre motore su pilastro IPE 140','n','MOT'),
    v('STRUTTURE','B.2.4','Assemblaggio piastre cuscinetto su pilastro IPE 140','n','CUSC'),
    v('STRUTTURE','B.2.5','Posa in opera del palo tracker IPE 140, parte superiore, e allineamento','n','PALI'),
    ...assi,
    v(A,'B.3.9','Installazione e posizionamento quadri sotto motore','n','MOT'),
    v('MODULI FV','B.4.0','Posa in opera dei moduli fotovoltaici, completa di stringatura e fascettatura dei cavi','cad.','MOD'),
    v('COLLEGAMENTI ELETTRICI','B.4.1','Fornitura cavi e collegamento elettrico di inclinometro, quadro sotto motore, motoriduttore e finecorsa','n','MOT'),
    v('QUADRI E METEO','B.4.2','Posa dei quadri di alimentazione motori tracker (quadri di campo)','n','QUADA'),
    v('QUADRI E METEO','B.4.3','Posa del quadro principale nel vano tecnico, con pannello operatore 10"','n','QUADGEN'),
    v('QUADRI E METEO','B.4.4','Fornitura e posa UPS 6 kVA monofase per tracker','n',''),
    v('QUADRI E METEO','B.4.5','Fornitura anemometri','cad.','ANEM'),
    v('QUADRI E METEO','B.4.6','Posa anemometri e centralina meteo (senza cablaggio)','cad.','METEO'),
    v('NOLEGGIO MEZZI','NOL.1','Noleggio battipalo','gg','GG'),
    v('NOLEGGIO MEZZI','NOL.2','Noleggio sollevatore telescopico / muletto','gg','GG'),
    v('NOLEGGIO MEZZI','NOL.3','Noleggio piattaforma aerea','gg',''),
    v('NOLEGGIO MEZZI','NOL.4','Trasporto andata e ritorno dei mezzi','ac.','1'),
    v('CANTIERE E SICUREZZA','CAN.1','Allestimento cantiere: container, servizi igienici, recinzione','ac.','1'),
    v('CANTIERE E SICUREZZA','CAN.2','Trasferta squadre: vitto e alloggio','gg × sq.','GG*SQ'),
    v('CANTIERE E SICUREZZA','CAN.3','Oneri della sicurezza (PSC / POS)','ac.','1'),
    v('CANTIERE E SICUREZZA','CAN.4','Smaltimento imballi e pulizia finale','ac.','1'),
    v('COLLAUDO','COL.1','Collaudo e messa in servizio dei tracker','ac.','1')]};}
export function defMontPrev(){return {q:{},pf:{},pp:{},dur:{},da:{}};}
