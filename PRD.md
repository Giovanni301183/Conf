# PRD — Preventivatore Tracker (Web App)

| | |
|---|---|
| **Versione** | 0.9 |
| **Data** | 12/10/2026 |
| **Autore** | G. Sorrentino |
| **Fonte dati** | `CONFIGURATORE TRACKER 12 MODULI 1303 (RIORDINATO).xlsx` |
| **Applicazione** | `index.html` (stessa cartella) |
| **Stato** | v1 implementata, validata sull'Excel |

### Storico revisioni
| Versione | Modifiche |
|---|---|
| 0.1 | Prima bozza, punti aperti §10 |
| 0.2 | Recepite le decisioni sui punti aperti, distinta parametrica, sezione design (§11), stato di implementazione (§14) |
| 0.3 | Ogni sezione diventa una tendina chiusa con riepilogo in una riga (§11.2); indicatori in alto ridotti a 3 |
| 0.4 | Archivio preventivi (§9bis): salva, apri, duplica, scarica, elimina, backup |
| 0.5 | All'avvio l'app parte sempre da zero sulla schermata **Preventivi** (elenco dell'archivio), diventata la prima scheda; bozza non salvata recuperabile |
| 0.6 | Scheda **Margini** (§9ter): margine generale e per categoria, margine sul prezzo o ricarico sul costo, prezzo di vendita |
| 0.7 | Le tendine restano aperte finché l'utente non le chiude (anche dopo una ricerca nel listino); Tab passa al campo successivo |
| 0.8 | Frecce ▲▼ su tutti i campi numerici; scheda **Distinta lavorazione** (§9quater) con export Excel per produzione e ordini |
| 0.9 | Peso nero / peso zincato: la maggiorazione di zincatura si aggiunge al peso solo dei pezzi zincati; distinta ed Excel mostrano entrambi i pesi |
| 1.0 | **Gantt di produzione** (§9quinquies) nella Distinta lavorazione: durate calcolate e modificabili, foglio Excel "Gantt" e stampa PDF |
| 1.1 | Gantt Excel con formule: modificando durate, date o festività in Excel si ricalcolano date e barre; nuovo foglio Calendario |
| 1.2 | Gantt solo di produzione: tolti montaggio in campo e installazione quadri (si pianificano dopo); ultima fase = spedizione |
| 1.3 | Scheda **Montaggio** (§9sexies): computo con listino montaggio, Gantt di cantiere con progettazione e pull-out test, export Excel e PDF |

---

## 1. Obiettivo

Sostituire il configuratore Excel con una **web app HTML leggera** (un solo file, apribile nel browser, senza server) che permetta di:

1. gestire il **listino** di tutti i componenti del tracker 1303, con valori **tutti modificabili** che si riflettono subito sul preventivo;
2. **configurare** una commessa (moduli FV, numero e tipo di tracker, varianti di profilo);
3. calcolare i costi, scomposti in **Materiale / Zincatura / Lavorazione / Acquisto**, e da questi il **prezzo di vendita** applicando la marginalità (§9ter);
4. **esplodere** il costo per categoria, per gruppo (assieme) e per singolo componente, fino ai componenti interni dei quadri;
5. aggiungere **voci di costo extra** libere (trasporto, montaggio, imballo, ecc.);
6. essere **piacevole da usare**: interfaccia ordinata, equilibrata e armoniosa (vedi §11).

### Fuori scope (v1)
- Sconti e listini di vendita per cliente.
- Costo dei moduli fotovoltaici: il modulo serve **solo a calcolare la potenza** (kWp) e il €/Wp.
- Multi-utente, login, database su server.
- Calcolo strutturale: l'app usa le distinte esistenti, non dimensiona i profili.

---

## 2. Utenti

| Ruolo | Cosa fa |
|---|---|
| **Ufficio tecnico / acquisti** | Mantiene il listino (€/kg, pesi, costi, sotto-distinte dei quadri) e le distinte per taglia. |
| **Operatore preventivi** | Configura la commessa e legge i costi. |

---

## 3. Struttura dell'app (schede)

```
┌───────────────────────────────────────────────────────────────────────────┐
│ ▣ Preventivatore Tracker        [Costo totale][kWp][€/Wp]                  │  ← 3 indicatori sempre visibili
├───────────────────────────────────────────────────────────────────────────┤
│ ① Preventivi ② Listino ③ Distinte ④ Configura ⑤ Costi ⑥ Extra ⑦ Margini ⑧ Lavorazione │  ← barra schede fissa
└───────────────────────────────────────────────────────────────────────────┘
```

| Scheda | Scopo |
|---|---|
| **1. Listino** | Componenti divisi in Struttura, Elettromeccanico, Elettronico, Bulloneria. Tutti i valori modificabili. |
| **2. Distinte base** | Le "ricette": driver per taglia, blocco assi per taglia, distinta comune. |
| **3. Configura** | Commessa, modulo FV (potenza), righe tracker, componenti di impianto. |
| **4. Costi** | Riepilogo, scomposizione per voce e categoria, esplosione ad albero. |
| **5. Voci extra** | Costi aggiuntivi manuali. |
| **Margini** | Marginalità generale e per categoria → prezzo di vendita. |
| **Distinta lavorazione** | Distinta per produzione e ordini, scaricabile in Excel. |
| **Preventivi** (prima scheda, schermata iniziale) | Elenco dei preventivi salvati: nuovo, apri, duplica, scarica, elimina, backup. |

---

## 4. Scheda 1 — Listino

### 4.1 Categorie (confermate)

| Categoria | Contenuto |
|---|---|
| **STRUTTURA** | Profili a barra (IPE/IPEA 140, assi 120x120 da 3,0/2,5, omega 2,0/1,8, supporti L/V, gaffe) · Carpenteria (teste e supporti) · Pezzi speciali (piastre di giunzione, supporti inclinometro, ecc.) |
| **ELETTROMECCANICO** | Motoriduttore, cuscinetto asse di rotazione, finecorsa elettrico |
| **ELETTRONICO** | Inclinometro, quadro sotto motore, Quadro Area A, Quadro Generale, box centralina meteo, sensori (piranometro, anemometro, termometri) |
| **BULLONERIA** | Bulloni, dadi, rondelle, tappi |

### 4.2 Parametro globale
| Parametro | Default |
|---|---|
| Maggiorazione peso zincatura | 2,5 % |

### 4.3 Tipi di componente

| Tipo | Campi modificabili | Colonne calcolate |
|---|---|---|
| **Profilo a barra** (€/m) | kg/m teorico, €/kg acquisto, €/kg zincatura, €/kg lavorazione | Materiale, Zincatura, Lavorazione, Totale €/m |
| **Pezzo di carpenteria** (€/pz da peso) | peso netto kg, €/kg acquisto, €/kg zincatura, €/kg lavorazione | Materiale, Zincatura, Lavorazione, Totale €/pz |
| **Componente commerciale** (€/pz) | peso kg/pz, costo €/pz *oppure* sotto-distinta | — |

### 4.4 Decisione: €/kg lavorazione (punto aperto n. 1)
Il valore 0,10 €/kg dell'IPE 140, contro 0,30 degli altri profili, è **probabilmente un refuso**. L'app **non lo corregge d'ufficio**: tutti i valori €/kg sono modificabili riga per riga e ogni modifica aggiorna subito il preventivo.
In più c'è la funzione **"Applica a tutta la Struttura"**, che imposta in un colpo solo il €/kg di acquisto, zincatura o lavorazione su tutte le voci di Struttura. La zincatura si applica solo alle voci già zincate.

### 4.5 Decisione: costo dei quadri (punto aperto n. 2)
I quadri (sotto motore, Area A, Generale, box centralina meteo) diventano **voci di costo esplose**:
- il costo €/pz del quadro è la **somma della sua sotto-distinta**, modificabile nel listino (codice, descrizione, quantità, prezzo);
- la differenza tra il prezzo a listino Excel e la somma dei componenti diventa una riga esplicita, **"Cablaggio / assemblaggio quadro"**, anch'essa modificabile.

| Quadro | Componenti | Cablaggio / assemblaggio | Totale |
|---|---|---|---|
| Sotto motore | 140,82 | 19,18 | 160,00 |
| Area A | 985,92 | 14,08 | 1.000,00 |
| Generale | 1.712,28 | 87,72 | 1.800,00 |
| Box centralina meteo | 575,40 | 24,60 | 600,00 |

Così i totali restano allineati all'Excel e ogni euro è tracciabile nell'esplosione. Qualsiasi componente commerciale può avere una propria sotto-distinta (pulsante "+ crea sotto-distinta").

### 4.6 Funzioni
- Ricerca istantanea per codice o descrizione.
- Aggiunta ed eliminazione di voci, per categoria e per tipo. Se una voce è usata nelle distinte, l'app avvisa prima di eliminarla.
- **Esporta CSV** (per Excel), **Esporta / Importa dati** (JSON con listino e distinte), **Ripristina da Excel**.
- Salvataggio automatico nel browser.

---

## 5. Scheda 2 — Distinte base

### 5.1 Principio
Tutte le taglie condividono **una distinta comune**. Cambiano solo i **driver** (quante volte si ripete ogni blocco) e il **blocco assi**.

| Driver | Significato |
|---|---|
| `MOT` | pilastri motore (1) |
| `CUSC` | pilastri cuscinetto |
| `OMEGA` | kit omega |
| `PANN` | kit pannello = numero di moduli |

| Taglia | MOT | CUSC | OMEGA | Assi (per tracker) | Gaffe giunzione |
|---|---|---|---|---|---|
| 12 | 1 | 2 | 14 | 2 × 8,25 m | — |
| 18 | 1 | 4 | 20 | 2 × 7,20 + 2 × 5,00 m | 4 |
| 20 | 1 | 4 | 22 | 2 × 7,20 + 2 × 6,30 m | 4 |
| 22 | 1 | 4 | 24 | 2 × 8,70 + 2 × 6,15 m | 4 |
| 36 | 1 | 8 | 38 | 2 × 8,70 + 2 × 6,756 + 2 × 8,645 m | 8 |
| 40 | 1 | 10 | 42 | 2 × 8,70 + 2 × 8,25 + 2 × 5,00 + 2 × 4,80 m | 12 |

### 5.2 Righe della distinta comune
Ogni riga ha: gruppo, codice, descrizione, lunghezza, **quantità Agrivoltaico** e **quantità Basso**.
- Le quantità sono formule dei driver: `CUSC*2`, `OMEGA*4+PANN*4`.
- "Q.tà Basso" vuota = uguale all'Agrivoltaico; `0` = componente assente nel Basso (piastre di giunzione, pilastro di fondazione, bulloneria di giunzione).

### 5.3 Segnaposto (risolti dalla configurazione)
| Segnaposto | Diventa |
|---|---|
| `$PROF` | IPE 140 / IPEA 140 |
| `$ASSE` | ASSE 120x120x3 / 120x120x2,5 |
| `$OMEGA` | OMEGA 2,0 / OMEGA 1,8 |
| `$LFOND`, `$LCUSC`, `$LMOT` | lunghezze scelte (motore = cuscinetto − 0,08 m) |

Tutto è modificabile; "Ripristina distinte da Excel" riporta ai valori originali.

---

## 6. Scheda 3 — Configura

### 6.1 Commessa
Cliente, riferimento commessa, data, note.

### 6.2 Moduli fotovoltaici (decisione punto aperto n. 4)
Il modulo serve **solo a creare la potenza**: marca/modello (descrittivo) e **potenza Wp**.
`kWp = Σ (moduli per tracker × n. tracker) × Wp / 1000`

### 6.3 Righe tracker
Più righe per commessa, per esempio 50 × 36 Agrivoltaico + 10 × 18 Basso.

| Campo | Opzioni |
|---|---|
| Taglia | 12 / 18 / 20 / 22 / 36 / 40 moduli |
| N. tracker | intero |
| **Tipo** | **Agrivoltaico ⇄ Basso** (selettore a due posizioni) |
| Pilastri | **IPE / IPEA** |
| Asse | **3,0 / 2,5 mm** |
| Omega | **2,0 / 1,8 mm** |
| Fondazione | 2,60 … 3,60 m (solo Agrivoltaico) |
| Cuscinetto | da 2,30 m (Agrivoltaico) · da 2,80 m (Basso) |
| Motore | automatico = cuscinetto − 0,08 m |

Ogni riga mostra in tempo reale **€/tracker, totale riga, €/Wp**. Il pulsante ⧉ duplica la riga per confrontare due varianti.
Quando si cambia il tipo, il cuscinetto passa automaticamente al minimo del nuovo tipo (2,30 ⇄ 2,80 m), se era al minimo del tipo precedente.

### 6.4 Componenti di impianto
Quadro Area A, Quadro Generale, box centralina meteo e i 4 sensori. Quantità per commessa, **non** moltiplicate per il numero di tracker.

---

## 7. Logica di calcolo

Per ogni riga di distinta: `q` = quantità × n. tracker, `L` = lunghezza (m), `mz` = maggiorazione zincatura.

```
Profilo a barra   kgT = q × L × kg/m teorico
Pezzo             kgT = q × peso netto
  Materiale   = kgT × €/kg acquisto
  Zincatura   = kgT × (1 + mz) × €/kg zincatura
  Lavorazione = kgT × €/kg lavorazione
  Peso        = kgT × (1 + mz) se il pezzo è zincato (€/kg zincatura > 0), altrimenti kgT
Commerciale
  Acquisto    = q × costo €/pz      (costo = somma sotto-distinta, se presente)

Voci extra: a corpo | € × n. tracker | € × kWp | % su (tracker + impianto)
TOTALE = Σ righe tracker + impianto + voci extra
€/Wp   = TOTALE / (kWp × 1000)
```

### 7.1 Validazione (superata)
| Configurazione | Excel | App |
|---|---|---|
| 12 mod, Agri, IPE, asse 2,5, omega 2,0, fond. 3,00, cusc. 2,30 — 1 tracker | 1.548,40 € | **1.548,40 €** ✔ |
| idem + impianto (quadri + meteo) | 6.248,40 € | **6.248,40 €** ✔ |
| Materiale / Zincatura / Lavorazione / Acquisto | 556,90 / 140,48 / 118,94 / 5.432,08 | identici ✔ |
| 18 / 20 / 22 / 36 / 40 moduli (1 tracker, senza impianto)* | 2.088,53 / 2.156,80 / 2.226,49 / 3.334,03 / 3.802,39 | identici ✔ |

\* Nei fogli Excel 18–40 il Quadro Area A (1.000 €) è incluso fisso nel totale; il confronto lo esclude.

---

## 8. Scheda 4 — Costi

1. **Riepilogo preventivo**: dati commessa e una tabella per riga tracker (n., moduli, kWp, €/tracker, totale, €/Wp), più impianto, voci extra e totale.
2. **Costi per categoria e voce**: barra proporzionale Materiale / Zincatura / Lavorazione / Acquisto (/ Altro), riquadri con importo e incidenza %, tabella categoria × voce.
3. **Esplosione ad albero**, con due viste commutabili:
   - **per categoria**: Categoria → Sottogruppo → Componente → (componenti del quadro)
   - **per gruppo di assieme**: Riga tracker → Gruppo (pilastro motore, assi…) → Componente
   Per ogni nodo: quantità, peso, Materiale, Zincatura, Lavorazione, Acquisto, Totale e %. Pulsanti "Espandi tutto" e "Comprimi".
4. **Export**: CSV della distinta costata (separatore `;`, virgola decimale, si apre direttamente in Excel), **Stampa / PDF**.

La colonna "Altro" compare solo se ci sono voci extra di tipo "Altro".

---

## 9. Scheda 5 — Voci extra

| Campo | Opzioni |
|---|---|
| Descrizione | testo libero; scorciatoie: Trasporto, Montaggio, Imballo |
| Tipo di costo | Altro / Materiale / Zincatura / Lavorazione / Acquisto (sceglie la colonna) |
| Modalità | a corpo · per tracker · per kWp · % sul costo |
| Valore | numero |

---

## 9bis. Scheda Preventivi — archivio (v0.4, avvio v0.5)

**Avvio (v0.5)**: l'app si apre **sempre** sulla schermata Preventivi con un preventivo **nuovo e vuoto**, che vale **0 €**: una riga tracker con N. = 0 e tutti i componenti di impianto a 0 (le righe aggiunte con "+ Aggiungi riga" partono invece da 1 tracker); non riprende più l'ultimo preventivo né l'ultima scheda. Il pulsante **"+ Nuovo preventivo"** porta a Configura. Se nella sessione precedente era rimasto un preventivo con modifiche non salvate, compare il riquadro **"Bozza non salvata"** con *Riprendi* / *Scarta*, così nulla va perso. Un link diretto (`index.html#config`) apre comunque quella scheda.

| Funzione | Comportamento |
|---|---|
| **Salva** (pulsante in alto o `Ctrl+S`) | Al primo salvataggio chiede un nome (proposto: cliente · commessa) e memorizza il preventivo nell'archivio. I salvataggi successivi aggiornano lo stesso preventivo. |
| **Stato** | Nella barra delle schede compare il nome del preventivo aperto con "✓ salvato" oppure "● non salvato". |
| **Elenco** | Per ogni preventivo: nome, cliente, commessa, data, tracker (es. "50×36 Agri"), kWp, totale al salvataggio, data e ora del salvataggio. Ricerca per nome, cliente o commessa. |
| **Apri** | Carica il preventivo nella scheda Configura. Se il listino è cambiato dopo il salvataggio, chiede se ricalcolare con il listino **attuale** o ripristinare quello **salvato** con il preventivo. |
| **Duplica** | Crea una copia, utile per varianti o revisioni. |
| **Scarica** | Scarica il singolo preventivo come file `.json`, con il suo listino. |
| **Elimina** | Toglie il preventivo dall'archivio, dopo conferma. |
| **Nuovo** | Avvisa se ci sono modifiche non salvate. |
| **Backup e trasferimento** | "Esporta tutto l'archivio" in un file; "Importa da file" accetta sia l'archivio completo sia un singolo preventivo. Serve per backup e per passare preventivi tra PC o colleghi. |

**Dove sono salvati**: nella memoria del browser di questo PC (localStorage). Ogni preventivo occupa circa 12 KB, quindi ci stanno diverse centinaia di preventivi. Se il browser viene ripulito, l'archivio si perde: per questo c'è l'esportazione su file da fare periodicamente.

---

## 9ter. Scheda Margini (v0.6)

| Passo | Contenuto |
|---|---|
| **1. Margine generale** | Selettore **Margine sul prezzo** ⇄ **Ricarico sul costo** e la % generale (default 0 %). |
| **2. Margine per categoria** | Struttura, Elettromeccanico, Elettronico, Bulloneria, Voci extra. Campo vuoto = usa la % generale. Per ogni categoria: costo, margine €, prezzo, margine sul prezzo. |
| **3. Prezzo di vendita** | Costo, margine €, prezzo, margine sul prezzo, ricarico sul costo, €/Wp costo → vendita; per ogni riga tracker: costo e prezzo per tracker, prezzo totale, €/Wp vendita; impianto e voci extra. |

```
Margine sul prezzo   Prezzo = Costo ÷ (1 − m)     es. 100 € al 20 % → 125 €
Ricarico sul costo   Prezzo = Costo × (1 + r)     es. 100 € al 25 % → 125 €
```

- Il margine si applica riga per riga in base alla categoria del componente, quindi i prezzi per riga tracker sono coerenti con il totale.
- Con il margine sul prezzo una % pari o superiore a 100 non è valida: compare un avviso e quella categoria resta a prezzo = costo.
- I margini sono salvati **con il preventivo**. I preventivi salvati prima della v0.6 si aprono con margine 0 %.
- In alto compare il 4° indicatore **Prezzo di vendita**. L'archivio mostra le colonne **Costo** e **Prezzo**.
- La stampa / PDF resta il riepilogo dei costi (uso interno).

---

## 9quater. Scheda Distinta lavorazione (v0.8)

Ricavata dalla configurazione del preventivo (voci extra escluse). Tre tendine in anteprima e il pulsante **Scarica Excel**, che crea un file `.xlsx` vero (scritto dall'app, senza librerie).

| Foglio Excel | Destinatario | Contenuto |
|---|---|---|
| **Commessa** | tutti | Cliente, commessa, modulo, potenza, tracker, acciaio, note; tabella configurazioni tracker; componenti di impianto; campi "Redatto da / Approvato da / Data". |
| **Produzione** | officina | Per ogni riga tracker e gruppo di assieme: codice, descrizione, lavorazione (Taglio / Carpenteria / Commerciale), L, q.tà per tracker e totale, peso unitario e totale, zincatura, colonna ✓ di spunta. **Senza prezzi.** |
| **Lista di taglio** | officina | Profili a barra raggruppati per profilo e lunghezza: pezzi, metri, kg, righe di provenienza, totali per profilo. |
| **Ordini** | ufficio acquisti | Fabbisogno per codice e categoria (profili in metri, resto in pezzi), peso, zincatura, costo unitario e totale stimati, quadri esplosi nei componenti; colonne da compilare Fornitore / N. ordine / Consegna. |

**Pesi (v0.9)**: ogni foglio riporta il **peso nero** (teorico, base per l'acquisto dell'acciaio e la lavorazione) e il **peso zincato** = nero × (1 + maggiorazione), solo per i pezzi da zincare: è il peso da consegnare allo zincatore. I totali riportano entrambi.

Formattazione: intestazioni verde petrolio, bande per riga tracker e gruppo, totali evidenziati, formati numerici italiani, prime 4 righe bloccate e ripetute in stampa, A4 orizzontale adattato alla larghezza, piè di pagina con commessa e "Pagina x di y".

## 9quinquies. Gantt di produzione (v1.0)

Quarta tendina della Distinta lavorazione. Solo **produzione e consegna**: il montaggio in campo e l'installazione di quadri e centralina sono nella scheda Montaggio (§9sexies). Il premontaggio è escluso per ora (fase futura).

| Gruppo | Fase | Durata calcolata (giorni lavorativi) | Parte dopo |
|---|---|---|---|
| Approvvigionamento | Acciaio | consegna acciaio | avvio commessa |
| Approvvigionamento | Commerciali | consegna componenti commerciali | avvio commessa |
| Per riga tracker | Taglio e carpenteria | kg acciaio ÷ kg/giorno | acciaio + riga precedente (officina in sequenza) |
| Per riga tracker | Zincatura | max(giorni minimi del giro, kg zincati ÷ capacità) | carpenteria della riga |
| Per riga tracker | Spedizione | ⌈camion ÷ camion/giorno⌉ + viaggio; camion = ⌈peso ÷ portata⌉ | zincatura della riga + commerciali |
| Impianto | Spedizione componenti | giorni di viaggio | commerciali |

- Calendario: lun–ven, escluse festività nazionali italiane e lunedì dell'Angelo.
- Parametri di produttività in `data.params.gantt` (validi per tutti i preventivi, non contano come "listino cambiato"); pianificazione della commessa in `prev.gantt` = data di avvio (vuota = data del preventivo), durate scritte a mano, date "Non prima del". Le chiavi sono per indice di riga (`lav-0`, …).
- Export: foglio **Gantt** nel file Excel della distinta (una colonna per giorno lavorativo, mesi e settimane ISO in intestazione, colonne e righe bloccate) e **Stampa / PDF** del solo Gantt in A4 orizzontale.
- **Il foglio Gantt è vivo (v1.1)**: celle gialle modificabili (avvio commessa in B3, Durata gg, Non prima del). Inizio = `WORKDAY(MAX(avvio−1; non prima del−1; fine delle fasi precedenti); 1; Festivita)`, Fine = `WORKDAY(inizio; durata−1; Festivita)`; intestazione giorni/mesi/settimane a formule; barre, riepilogo di gruppo e "oggi" con formattazione condizionale. Il grafico copre i giorni calcolati + un margine (≥ 20 giorni lavorativi). Foglio **Calendario** con le festività di tre anni e righe gialle libere per ferie e chiusure aziendali (nome definito `Festivita`). Il file si ricalcola all'apertura.

## 9sexies. Scheda Montaggio (v1.3)

Separata dal preventivo della fornitura: **non entra** nel costo totale né nel prezzo di vendita. Fonte delle voci: file "Computo montaggio".

| Tendina | Contenuto |
|---|---|
| ① Computo montaggio | Voci per gruppo con U.M., Q.tà, prezzo unitario di **fornitura** e di **posa**, totali per gruppo e totale montaggio. Quantità e prezzi correggibili solo per il preventivo (vuoto = valore calcolato o di listino, in grigio). Bordo dorato = voce con quantità ma senza prezzo. Le voci con formula che dà zero (taglie assenti) non si mostrano. |
| ② Gantt di montaggio | Preparazione (Progettazione esecutiva → Pull-out test → Tracciamento) dall'avvio commessa; consegne prima/ultima prese dalla fine delle spedizioni del Gantt di produzione (modificabili in "Non prima del"); cantiere: Infissione pali (dopo tracciamento e prima consegna) → Pilastri e piastre → Assi e accessori (anche dopo l'ultima consegna) → Moduli FV → Collegamenti, quadri e meteo → Collaudo. Fasi a quantità divise per il numero di squadre. |
| ③ Listino montaggio | Voci e prezzi unitari validi per tutti i preventivi (`data.mont`): gruppo, codice, descrizione, U.M., formula della quantità, €/u fornitura, €/u posa. Aggiungi / elimina voci, nuovi gruppi, ripristino predefiniti. |

- Formule delle quantità sui driver: `TRK`, `MOT`, `CUSC`, `PALI` (= MOT + CUSC), `MOD`, `KWP`, `T12…T40`, `QUADA`, `QUADGEN`, `METEO`, `ANEM`, `GG` (giorni lavorativi di cantiere dal Gantt di montaggio), `SQ` (squadre). Formula vuota = quantità da scrivere nel preventivo.
- Gruppi predefiniti: Progettazione, Pull-out test, Tracciamento, Fondazioni, Strutture, Assemblaggio assi e accessori (per ogni taglia), Moduli FV, Collegamenti elettrici, Quadri e meteo, **Noleggio mezzi** (battipalo e sollevatore a `GG`), Cantiere e sicurezza (trasferte a `GG*SQ`), Collaudo.
- Prezzi e parametri del cantiere partono **vuoti**: li compila l'utente.
- Export: file Excel "Montaggio" con **Computo** (celle gialle Q.tà e prezzi, totali a formule), **Gantt montaggio** a formule e **Calendario**; Stampa / PDF di computo + Gantt.
- Il listino montaggio e i parametri del Gantt non fanno scattare l'avviso "listino cambiato" all'apertura di un preventivo salvato.

## 10. Decisioni sui punti aperti

| # | Tema | Decisione |
|---|---|---|
| 1 | Lavorazione IPE 140 (0,10 €/kg) | Probabile refuso; resta il valore Excel ma è **modificabile** nel listino, anche in blocco (§4.4) |
| 2 | Costo quadri ≠ sotto-distinta | Quadri **esplosi a voce di costo** + riga "Cablaggio / assemblaggio" per la differenza (§4.5) |
| 3 | Categoria Elettronico | **Confermata** la divisione del §4.1 |
| 4 | Modulo FV | Serve **solo per la potenza** (§6.2) |
| 5 | Zincatura assi e omega = 0 | Mantenuta come da Excel; modificabile |
| 6 | Bulloneria a 0 € (M5x20, M6x20) | Non usata nelle distinte; da compilare se servirà |
| 7 | Configurazione 2P | Non prevista in v1 |

---

## 11. Design e interfaccia

Obiettivo: un'app **piacevole agli occhi**, con **equilibrio e armonia**, che si usa tutti i giorni senza stancare.

### 11.1 Principi
- **Calma**: fondo caldo neutro, superfici bianche, un solo colore d'accento (verde petrolio) e un accento secondario (ocra) solo per l'azione principale "Stampa / PDF".
- **Gerarchia chiara**: in alto gli indicatori chiave sempre visibili, poi le schede numerate nell'ordine di lavoro (1 → 5), poi il contenuto in schede bianche.
- **Ritmo regolare**: spaziature multiple di 4 px (gutter 28 px, card 22–24 px, gap 20 px), angoli arrotondati coerenti (14 px card, 8–10 px controlli).
- **Numeri leggibili**: cifre tabellari allineate a destra, separatore delle migliaia, 2 decimali per gli €, 4 per il €/Wp.
- **Meno bordi, più aria**: nelle tabelle i campi modificabili non hanno cornice finché non ci si passa sopra, così le tabelle restano pulite.

### 11.2 Tendine: si apre solo ciò che serve (v0.3)
Per non mostrare troppi numeri insieme, **ogni sezione di ogni scheda è una tendina chiusa**. Si apre e si chiude cliccando l'intestazione.
- Da chiusa mostra solo **titolo + riepilogo in una riga**, per esempio "R1: 10 × 36 mod Agrivoltaico", "Modulo · 600 Wp → 7,20 kWp" o "6.248,40 € · 7,20 kWp · 0,8678 €/Wp".
- Le sezioni di Configura e Costi sono **numerate (1, 2, 3, 4)** e indicano l'ordine dei passaggi.
- Una tendina **resta aperta finché non la chiudi tu**: scrivere, cambiare campo o cercare non la chiude mai.
- **Listino**: una tendina per categoria e, dentro la Struttura, sotto-tendine per profili e carpenteria. La ricerca apre le tendine del listino; cancellare la ricerca o cliccare un'altra tendina non le richiude.
- **Tab** porta al campo successivo con il valore selezionato, pronto da sovrascrivere.
- **Frecce ▲▼** (v0.8) su ogni campo numerico, visibili al passaggio del mouse: un clic = un passo, tenendo premuto continua, Maiusc = ×10; anche i tasti freccia su/giù. Passo per campo: pezzi e quantità 1, Wp 5, €/kg e kg 0,01, €/pz 1, lunghezze 0,05 m, margini 0,5 %, maggiorazione zincatura 0,1 %, voci extra 10 (0,5 se in %). Mai sotto zero.
- **Distinte base**: una tendina per taglie, una per gli assi e una per ogni gruppo di assieme.
- **Costi → Esplosione**: albero tutto chiuso all'apertura; si clicca una riga per scendere di livello.
- Pulsanti **"Apri tutte" / "Chiudi tutte"** su ogni scheda.
- L'app ricorda quali tendine erano aperte.
- I pulsanti di una sezione (es. "+ Aggiungi riga") compaiono solo quando la tendina è aperta. Aggiungere un elemento apre la tendina giusta.
- In alto restano solo **4 indicatori**: Costo totale, Prezzo di vendita (v0.6), Potenza, €/Wp (di costo). Tracker, €/tracker e acciaio sono nel Riepilogo.
- "Stampa / PDF" apre in automatico Riepilogo e Costi per categoria.

### 11.3 Palette
| Ruolo | Colore |
|---|---|
| Sfondo | `#f4f2ed` caldo neutro |
| Testo / intestazione | `#1f2b33` ardesia |
| Accento | `#235e5a` verde petrolio |
| Azione principale | `#b9843f` ocra |
| Materiale · Zincatura · Lavorazione · Acquisto · Altro | blu acciaio `#3e6b8a` · grigio zinco `#9aa6ac` · ocra `#c58a42` · salvia `#5f9473` · prugna `#8b72a3` |

Le categorie usano gli stessi toni (Struttura = acciaio, Elettromeccanico = ocra, Elettronico = prugna, Bulloneria = zinco), come puntino colorato e filetto in testa alla card.

### 11.4 Componenti
- **Selettori a due posizioni** (Agrivoltaico/Basso, IPE/IPEA, 3,0/2,5, 2,0/1,8): l'opzione attiva è piena, colore d'accento.
- **Indicatori** nella fascia scura in alto; il costo totale è evidenziato.
- **Totale** ripetuto a destra nella barra delle schede, che resta fissa durante lo scorrimento.
- **Stampa**: layout pulito senza pulsanti né navigazione.
- **Responsive**: su schermi stretti le tabelle scorrono in orizzontale e le colonne vanno a capo.

---

## 12. Requisiti tecnici

| Requisito | Scelta |
|---|---|
| Formato | Un unico file **`index.html`** (HTML + CSS + JavaScript, senza framework né librerie) |
| Offline | Sì. Il font Inter si carica da Google Fonts se c'è rete; altrimenti si usa Segoe UI |
| Salvataggio | Automatico nel browser (localStorage); export JSON per backup e per passare dati tra PC |
| Preventivi | Archivio interno nel browser (§9bis), con esportazione e importazione su file `.json` |
| Browser | Chrome / Edge aggiornati |
| Lingua / formati | Italiano, € con separatore migliaia, virgola decimale (anche in input) |
| Scheda diretta | `index.html#costi` (o `#listino`, `#config`…) apre direttamente quella scheda |

---

## 13. Criteri di accettazione

| # | Criterio | Esito |
|---|---|---|
| 1 | Config §7.1 → 1.548,40 €/tracker e 6.248,40 € | ✔ |
| 2 | Agrivoltaico → Basso rimuove piastre, fondazione e bulloneria di giunzione e ricalcola (1.365,27 €/tracker a 12 mod) | ✔ |
| 3 | IPE/IPEA, asse 3,0/2,5, omega 2,0/1,8 aggiornano peso e costo | ✔ |
| 4 | Esplosione fino al singolo componente (anche dentro i quadri), per categoria e per gruppo | ✔ |
| 5 | Modifica di un valore di listino → preventivo aggiornato subito | ✔ |
| 6 | Voce extra "per tracker" moltiplicata per il n. di tracker | ✔ |
| 7 | Salva / Apri dall'archivio restituisce lo stesso preventivo, anche dopo aver ricaricato la pagina | ✔ (scarica/importa file: da verificare a mano) |

---

## 14. Stato e prossimi passi

| Fase | Contenuto | Stato |
|---|---|---|
| F1 | Listino, distinta, configurazione, riepilogo, validazione | ✔ fatto |
| F2 | Tutte le taglie, più righe, Agrivoltaico/Basso, esplosione | ✔ fatto |
| F3 | Voci extra, kWp ed €/Wp, export CSV / PDF / JSON | ✔ fatto |
| F4 | Design (§11), sotto-distinte quadri | ✔ fatto |
| F5 | *Da valutare*: configurazione 2P, profili diversi per fondazione/motore/cuscinetto, storico preventivi, confronto affiancato di due configurazioni | — |
