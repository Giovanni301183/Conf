"""Genera i due flussi n8n dell'agenda su Telegram (da importare in n8n: Workflows → Import from file).

  n8n/agenda-chat-telegram.json      chat con l'assistente, pulsanti "Me ne occupo"/"Risolto", /collega e /id
  n8n/agenda-avvisi-riepilogo.json   avviso nel gruppo delle voci nuove (dal database) e riepilogo del mattino
  n8n/agenda-email-gmail.json        email inoltrate all'indirizzo dell'agenda (POSTA): l'AI le propone in privato come appunto, promemoria o riunione
  n8n/agenda-etichette-gmail.json    email etichettate «Conf/…» in Gmail: vanno in «In arrivo» nell'app (e su Telegram), poi «Conf/In app»

Uso:  python scripts/n8n-flussi.py [indirizzo dell'app]
      (predefinito: anteprima del branch calendario; per la produzione: https://conf-five.vercel.app)
Segreti e token non stanno qui: si inseriscono in n8n (credenziali e nodo "Impostazioni").
"""
import json, os, sys, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://conf-git-calendario-giovanne.vercel.app').rstrip('/')
# L'anteprima Vercel e' protetta: n8n entra con il codice "Protection Bypass for Automation". In produzione non serve.
API = BASE + '/api/agenda' + ('' if 'conf-five' in BASE else '?x-vercel-protection-bypass=INSERISCI_CODICE_BYPASS')

# Indirizzo a cui i colleghi inoltrano le email da mettere in agenda: un "+agenda" sulla casella collegata a n8n,
# niente casella nuova. Chi inoltra deve essere un utente dell'app con Telegram collegato.
POSTA = 'g.sorrentino+agenda@terranovasrl.net'
# Vale anche l'inoltro a se' stessi (dal telefono il completamento automatico toglie spesso il "+agenda").
CERCA = f'to:{POSTA} OR (from:me to:me subject:(Fwd OR I))'
GMAIL = {'gmailOAuth2': {'id': '', 'name': 'Gmail Agenda'}}

U = lambda: str(uuid.uuid4())
URL = "={{ $('Impostazioni').item.json.url }}"
AUTH = {'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth'}
CRED = {'httpHeaderAuth': {'id': '', 'name': 'Agenda - segreto'}}
TG = {'telegramApi': {'id': '', 'name': 'Telegram Agenda'}}
TID = "$('Telegram Trigger').item.json.message.from.id"
CMD = "String($json.message?.text || '').trim().split(' ')[0].split('@')[0].toLowerCase()"
# File o foto allegati al messaggio: l'assistente ne vede nome e file_id, il file lo scarica l'app (azione layout).
MSG = "$('Telegram Trigger').item.json.message"
ALLEGATO = ("(" + MSG + ".document ? ' [allegato: file \"' + " + MSG + ".document.file_name + '\", file_id=' + " + MSG + ".document.file_id + ']'"
            " : " + MSG + ".photo ? ' [allegato: foto, file_id=' + " + MSG + ".photo[" + MSG + ".photo.length - 1].file_id + ']' : '')")


def node(name, typ, ver, pos, params, creds=None):
    n = {'parameters': params, 'id': U(), 'name': name, 'type': typ, 'typeVersion': ver, 'position': pos}
    if creds: n['credentials'] = creds
    return n


def cond(expr):
    """Nodo IF: vero quando l'espressione e' vera."""
    return {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose'},
            'conditions': [{'id': U(), 'leftValue': '={{ ' + expr + ' }}', 'rightValue': '',
                            'operator': {'type': 'boolean', 'operation': 'true', 'singleValue': True}}],
            'combinator': 'and'}, 'options': {}}


def http(name, pos, body, url=URL):
    return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {'method': 'POST', 'url': url, **AUTH, 'sendBody': True, 'specifyBody': 'json',
                'jsonBody': '={{ JSON.stringify(' + body + ') }}', 'options': {}}, CRED)


def send(name, pos, chat, text, extra=None):
    return node(name, 'n8n-nodes-base.telegram', 1.2, pos, {'chatId': '={{ ' + chat + ' }}', 'text': '={{ ' + text + ' }}',
                'additionalFields': {'appendAttribution': False, **(extra or {})}}, TG)


def tool(name, pos, desc, body):
    return node(name, 'n8n-nodes-base.httpRequestTool', 4.2, pos, {'toolDescription': desc, 'method': 'POST', 'url': URL, **AUTH,
                'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify(' + body + ') }}', 'options': {}}, CRED)


def fa(k, d, t='string', default=None):
    """Parametro che sceglie l'assistente ($fromAI)."""
    return f"$fromAI('{k}', `{d}`, '{t}'" + (f', {json.dumps(default)}' if default is not None else '') + ')'


def impostazioni(name, pos):
    return node(name, 'n8n-nodes-base.set', 3.4, pos, {'assignments': {'assignments': [
        {'id': U(), 'name': 'url', 'type': 'string', 'value': API},
        {'id': U(), 'name': 'gruppo', 'type': 'string', 'value': 'INSERISCI_ID_GRUPPO'}]}, 'includeOtherFields': True, 'options': {}})


def to(*names, i=0):
    return [{'node': n, 'type': 'main', 'index': i} for n in names]


SYSTEM = """=Sei l'assistente dell'agenda di Terranova (strutture tracker per impianti fotovoltaici). Parli in italiano con un collega su Telegram.
Oggi è {{ $now.setZone('Europe/Rome').setLocale('it').toFormat('cccc d LLLL yyyy') }} ({{ $now.setZone('Europe/Rome').toFormat('yyyy-MM-dd') }}), ore {{ $now.setZone('Europe/Rome').toFormat('HH:mm') }}.

Cosa fai: registri urgenze, cose da fare, promemoria, scadenze e appuntamenti; leggi l'agenda; segni le voci fatte; le assegni ai colleghi.
Fai anche preventivi: per uno nuovo mandi il modulo da compilare (modulo_preventivo); l'offerta PowerPoint arriva in chat privata, da inoltrare al cliente.
Prepari bozze di email dagli appunti (email_da_appunto), che l'operatore apre e invia da Gmail.
Salvi note (appunti) con le etichette del tema, libere o di una commessa (crea_nota, modifica_nota).

Regole:
- Se il messaggio segnala un problema o dice "urgente", crea una voce di genere "urgenza" (per oggi, salvo data diversa). Titolo breve e chiaro (es. "Mancano bulloni in cantiere: preparare il materiale"); i dettagli vanno nella nota.
- Se cita una commessa, un cliente, un numero di preventivo o un luogo, usa cerca_commesse e collega la voce con preventivo_id. Commessa = preventivo vinto: preferisci quelle. Se ci sono più risultati plausibili chiedi quale, elencando nome e numero. Se non trovi niente, chiedi o crea senza collegamento dicendolo.
- Categoria (facoltativa): bulloni, viti, dadi, rondelle → BULLONERIA; profili, pali, acciaio, carpenteria → STRUTTURA; motori, attuatori, cuscinetti → ELETTROMECCANICO; quadri, centraline, sensori, cavi → ELETTRONICO.
- Per assegnare a qualcuno usa colleghi e passa la sua email. "Me ne occupo io" = assegnata a chi scrive (usa chi_sono).
- Date relative ("domani", "lunedì", "fra una settimana") → AAAA-MM-GG. Ora → HH:MM. Senza data per una voce non urgente, chiedi.
- Non inventare mai id: prendili dagli strumenti. Prima di eliminare chiedi conferma.
- Se uno strumento risponde ok:false, spiega il problema in parole semplici. Se l'account non è collegato, spiega come collegarlo.
- I messaggi che iniziano con [vocale] sono la trascrizione di un messaggio vocale: possono contenere errori di trascrizione (nomi, numeri). Prima di salvare, ripeti in una riga cosa hai capito; se un nome di commessa o un numero è dubbio, chiedi conferma.
- Urgenze e voci assegnate vengono annunciate da sole nel gruppo: non devi farlo tu.
- Comandi del menu del bot: /oggi = agenda di oggi; /settimana = prossimi 7 giorni; /mie = solo le mie voci; /urgente <testo> = registra un'urgenza; /preventivo <cliente> = modulo per un preventivo nuovo; /aiuto o /start = spiega in poche righe cosa puoi fare e come collegare l'account (/collega CODICE, codice dal pulsante Telegram nell'app).
- Preventivo di un cliente già fatto ("mandami il preventivo di Rossi", "dammi l'offerta per Rossi", "il preventivo 2026/014"): cercalo con cerca_commesse e manda il PDF con invia_offerta. Se ce n'è più di uno, elenca numero, nome, data e stato e chiedi quale (o se li vuole tutti: allora invia_offerta per ognuno). Se non ce n'è nessuno, dillo e chiedi se ne vuole fare uno nuovo.
- Margini e costi di un preventivo ("che margine ha il preventivo di Rossi?", "mandami i margini del 2026/014"): trova il preventivo con cerca_commesse e usa margini_preventivo, che li manda in chat privata. Non riscrivere margini e costi in chat (nel gruppo mai): di' solo che sono arrivati in privato.
- Nel dubbio tra "uno già fatto" e "uno nuovo" (es. solo "preventivo per Rossi"), cerca prima con cerca_commesse: se Rossi ha già preventivi, chiedi se vuole uno di quelli o uno nuovo.
- Preventivo nuovo ("fammi un preventivo per Rossi Srl", "prepara un preventivo", /preventivo Rossi): usa SEMPRE modulo_preventivo con il nome del cliente detto dall'operatore, senza fare domande sui dati. L'operatore compila il modulo, controlla l'anteprima e lo invia da lì. Rispondi solo che il pulsante «Compila preventivo» è in chat privata.
- Per correggere un preventivo già fatto con il modulo usa modulo_preventivo con il suo id (da cerca_commesse). Solo per una modifica piccola e chiara (es. "metti il margine al 20 %" sul preventivo 2026/012) usa prepara_preventivo con l'id e i soli campi da cambiare, dopo aver ripetuto la modifica e avuto conferma. Per rimandare l'offerta così com'è usa invia_offerta.
- Il riferimento (rif) è solo il nome breve dell'impianto, il titolo della copertina: mai note o dati tecnici. Profilo (IPE/IPEA), asse (2,5/3,0 mm), omega (2,0/1,8 mm), fondazione e cuscinetto in metri vanno nei campi delle righe.
- Layout: se un messaggio ha [allegato: …] è un file o una foto mandati al bot. Se è il layout dell'impianto, mettilo nel preventivo giusto con carica_layout (file_id e nome dall'allegato; se il preventivo non è chiaro chiedi quale, cercandolo con cerca_commesse). Per un preventivo nuovo passa file_id e file_nome a prepara_preventivo: da un DXF i tracker si contano da soli, falli confermare. Il DXF va mandato come file, non come foto. Nell'immagine fatta dal DXF le scritte non compaiono. L'allegato resta valido anche nei messaggi dopo.
- Email da un appunto ("manda a Rossi l'aggiornamento della nota sui pali"): trova l'appunto con cerca_appunti (parole del titolo o della commessa; per una commessa passa anche preventivo_id da cerca_commesse); se ce n'è più di uno plausibile chiedi quale, elencando titolo e data. Poi usa email_da_appunto con l'id, le indicazioni dette (a chi, tono, cose da aggiungere) e l'indirizzo se lo conosci. Email senza appunto ("preparami una mail a Rossi per dire che il montaggio slitta al 10"): NON cercare appunti, usa subito email_da_appunto senza id, con il contenuto detto dall'operatore in appunto (e preventivo_id se cita una commessa). La bozza arriva in chat privata con i pulsanti per aprirla nell'app Gmail del telefono o in Gmail dal computer: non riscriverne il testo in chat (nel gruppo mai). Nessuna email parte da sola: la invia l'operatore da Gmail.
- Note e etichette ("segnati che…", "prendi nota…", "metti negli appunti…"): salva con crea_nota. Scegli tu da 0 a 3 etichette che descrivono davvero il tema, tra: acquisti, vendita, opportunita, sviluppo, tecnico, produzione, cantiere, logistica, qualita, amministrazione, marketing, personale, riunione, idea (es. ordine di acciaio al fornitore = acquisti; nuovo cliente interessato = opportunita, vendita; un'idea per un prodotto = sviluppo, idea). Se cita una commessa, trovala con cerca_commesse e passa preventivo_id; altrimenti la nota resta libera. Per cambiare le etichette o la commessa di una nota già salvata ("metti acquisti alla nota sull'acciaio") trovala con cerca_appunti (fonte documenti) e usa modifica_nota con il suo id. Dopo, riassumi in una riga: titolo, temi e commessa (o "libera").
- Più preventivi per lo stesso cliente che cambiano solo il materiale ("fammi un preventivo IPEA con asse 2,5, uno IPEA con asse 3 e uno IPE con asse 2,5"): ogni combinazione la dice l'operatore, non aggiungerne e non indovinarne. Serve un preventivo base già salvato con tracker, località e margini: se non c'è manda il modulo (modulo_preventivo) per compilarlo con la prima combinazione e chiedi di riscriverti quando l'ha creato; se c'è, trovalo con cerca_commesse. Ripeti l'elenco delle combinazioni, una per riga, e chiedi conferma; poi usa crea_varianti con l'id del base e l'elenco. Ogni variante diventa un preventivo con il suo numero (successivo); in chat privata arrivano le offerte PDF del base e di tutte le varianti. Riporta il confronto (testo) e gli avvisi.
- Il listino non si modifica da qui: se te lo chiedono, rispondi che si cambia nell'app (scheda Listino).
- Dopo un preventivo riporta il riepilogo dello strumento (testo), gli avvisi importanti e se l'offerta è arrivata in privato. Costi e margini solo a chi li ha chiesti: non scriverli mai nel gruppo, lì dì solo che l'offerta è in privato.
- Rispondi breve, testo semplice senza Markdown. Dopo aver registrato qualcosa, riassumi cosa hai salvato."""

# ---------- Flusso 1: chat ----------
chat = [
    node('Telegram Trigger', 'n8n-nodes-base.telegramTrigger', 1.2, [0, 300], {'updates': ['message', 'callback_query'], 'additionalFields': {}}, TG),
    impostazioni('Impostazioni', [220, 300]),
    node('È un pulsante?', 'n8n-nodes-base.if', 2.2, [440, 300], cond('!!$json.callback_query')),
    # Pulsanti sotto gli avvisi del gruppo: "prendi:<id>" e "risolvi:<id>"; sotto le email in arrivo "pe:<id>:<scelta>".
    http('Pulsante → app', [680, 120], "{ azione: $json.callback_query.data.split(':')[0], id: $json.callback_query.data.split(':')[1], scelta: $json.callback_query.data.split(':')[2] || '', telegram_id: $json.callback_query.from.id }"),
    node('Risposta al pulsante', 'n8n-nodes-base.telegram', 1.2, [900, 120], {'resource': 'callback', 'queryId': "={{ $('Telegram Trigger').item.json.callback_query.id }}",
         'additionalFields': {'text': '={{ ($json.ok ? $json.testo : $json.errore).slice(0, 190) }}', 'show_alert': '={{ !$json.ok }}'}}, TG),
    node('Andato a buon fine?', 'n8n-nodes-base.if', 2.2, [1120, 120], cond("$('Pulsante → app').item.json.ok")),
    send('Avvisa nel gruppo', [1340, 120], "$('Telegram Trigger').item.json.callback_query.message.chat.id", "$('Pulsante → app').item.json.testo",
         {'reply_to_message_id': "={{ $('Telegram Trigger').item.json.callback_query.message.message_id }}"}),
    # Messaggi: /id (per sapere l'id del gruppo), /collega CODICE, il resto all'assistente.
    # Primo "parola" del messaggio, senza @nomebot (nei gruppi Telegram scrive /id@nomebot). Niente espressioni regolari: alcune versioni di n8n non le leggono.
    node('È /collega o /id?', 'n8n-nodes-base.if', 2.2, [680, 440], cond(f"['/collega', '/id'].includes({CMD})")),
    node('Quale comando?', 'n8n-nodes-base.if', 2.2, [900, 360], cond(f"{CMD} === '/id'")),
    send('Rispondi id', [1120, 280], '$json.message.chat.id', "'Id di questa chat: ' + $json.message.chat.id"),
    http('Collega → app', [1120, 440], "{ azione: 'collega', telegram_id: $json.message.from.id, codice: String($json.message.text).split(' ').slice(1).join('').trim() }"),
    send('Rispondi collega', [1340, 440], "$('Telegram Trigger').item.json.message.chat.id", "$json.ok ? $json.testo : '⚠️ ' + $json.errore"),
    # Messaggi vocali (o file audio): si scaricano da Telegram, si trascrivono e il testo va all'assistente.
    node('È un vocale?', 'n8n-nodes-base.if', 2.2, [680, 620], cond('!!($json.message?.voice || $json.message?.audio)')),
    node('Scarica audio', 'n8n-nodes-base.telegram', 1.2, [680, 760], {'resource': 'file', 'fileId': '={{ ($json.message.voice || $json.message.audio).file_id }}',
         'download': True, 'additionalFields': {}}, TG),
    node('Trascrivi', '@n8n/n8n-nodes-langchain.openAi', 1.8, [800, 760], {'resource': 'audio', 'operation': 'transcribe', 'options': {'language': 'it'}},
         {'openAiApi': {'id': '', 'name': 'OpenAI'}}),
    node('Assistente', '@n8n/n8n-nodes-langchain.agent', 1.7, [900, 620], {'promptType': 'define',
         'text': "={{ $json.text ? '[vocale] ' + $json.text : ((" + MSG + ".text || " + MSG + ".caption || '') + " + ALLEGATO + ") || '(messaggio senza testo: chiedi di scriverlo a parole o con un vocale)' }}",
         'options': {'systemMessage': SYSTEM}}),
    send('Rispondi', [1340, 620], "$('Telegram Trigger').item.json.message.chat.id", '$json.output'),
    # Modello: si cambia qui (OpenAI, Anthropic, ...). Il resto del flusso non dipende dal modello.
    node('Modello', '@n8n/n8n-nodes-langchain.lmChatOpenAi', 1.2, [640, 860], {'model': {'__rl': True, 'value': 'gpt-4o-mini', 'mode': 'list'}, 'options': {}},
         {'openAiApi': {'id': '', 'name': 'OpenAI'}}),
    node('Memoria', '@n8n/n8n-nodes-langchain.memoryBufferWindow', 1.3, [780, 860], {'sessionIdType': 'customKey',
         'sessionKey': "={{ $('Telegram Trigger').item.json.message.chat.id }}", 'contextWindowLength': 12}),
    tool('chi_sono', [920, 860], "Chi sta scrivendo (email, nome, ruolo) e la data di oggi. Usalo per 'me ne occupo io'.",
         "{ azione: 'chi_sono', telegram_id: " + TID + ' }'),
    tool('cerca_commesse', [1040, 860], 'Cerca preventivi e commesse (preventivi vinti) per nome, cliente, numero, riferimento o luogo. Restituisce id, nome, numero, stato.',
         "{ azione: 'commesse', telegram_id: " + TID + ', cerca: ' + fa('cerca', 'Parole da cercare, es. Ripo oppure 2026/014', 'string', '') + ' }'),
    tool('collega_account', [1640, 860], "Collega l'account Telegram di chi scrive all'app con il codice di 6 cifre generato nell'app (pulsante Telegram). Usalo quando scrive /collega CODICE o ti da' il codice.",
         "{ azione: 'collega', telegram_id: " + TID + ', codice: ' + fa('codice', 'Codice di 6 cifre') + ' }'),
    tool('colleghi', [1160, 860], 'Elenco dei colleghi attivi (email e nome), per assegnare una voce.',
         "{ azione: 'colleghi', telegram_id: " + TID + ' }'),
    tool('leggi_agenda', [1280, 860], "Legge l'agenda: voci tra due date comprese, piu' urgenze aperte e voci rimaste indietro. Ogni voce ha un id.",
         "{ azione: 'agenda', telegram_id: " + TID + ', da: ' + fa('da', 'Data iniziale AAAA-MM-GG (vuoto = oggi)', 'string', '')
         + ', a: ' + fa('a', 'Data finale AAAA-MM-GG (vuoto = 7 giorni dopo)', 'string', '')
         + ', solo_mie: ' + fa('solo_mie', 'true per le sole voci create da me o assegnate a me', 'boolean', False) + ' }'),
    tool('crea_voce', [1400, 860], 'Crea una voce in agenda: urgenza, cosa da fare, promemoria, scadenza o appuntamento.',
         "{ azione: 'crea', telegram_id: " + TID
         + ', genere: ' + fa('genere', 'Uno tra: urgenza, attivita (cosa da fare), promemoria, scadenza, appuntamento')
         + ', titolo: ' + fa('titolo', 'Descrizione breve, massimo 200 caratteri')
         + ', giorno: ' + fa('giorno', 'Data AAAA-MM-GG; vuoto solo per le urgenze (= oggi)', 'string', '')
         + ', ora: ' + fa('ora', 'Ora HH:MM, vuoto se non indicata', 'string', '')
         + ', nota: ' + fa('nota', 'Dettagli facoltativi', 'string', '')
         + ', categoria: ' + fa('categoria', 'Facoltativa: STRUTTURA, BULLONERIA, ELETTROMECCANICO, ELETTRONICO', 'string', '')
         + ', preventivo_id: ' + fa('preventivo_id', 'id del preventivo o commessa preso da cerca_commesse, vuoto se nessuno', 'string', '')
         + ', assegnata_a: ' + fa('assegnata_a', 'email del collega presa da colleghi, vuoto se nessuno', 'string', '') + ' }'),
    tool('prepara_preventivo', [1760, 860], "Crea un preventivo nell'archivio (o cambia quello con l'id indicato), lo calcola con il listino e manda l'offerta PowerPoint nella chat privata di chi scrive. Restituisce id, numero, riepilogo (testo), avvisi ed esito dell'offerta.",
         "Object.fromEntries(Object.entries({ azione: 'preventivo', telegram_id: " + TID
         + ', id: ' + fa('id', 'Solo per cambiare un preventivo esistente: il suo id; vuoto per uno nuovo', 'string', '')
         + ', cliente: ' + fa('cliente', 'Nome del cliente (obbligatorio per uno nuovo)', 'string', '')
         + ', rif: ' + fa('rif', 'Nome breve dell impianto per la copertina, massimo 60 caratteri, mai note o dati tecnici; facoltativo', 'string', '')
         + ', righe: ' + fa('righe', 'Righe tracker come JSON, es. [{"n":40,"taglia":36,"tipo":"agrivoltaico","prof":"IPE","asse":2.5,"omega":1.8,"lFond":3,"lCusc":2.3}]; prof, asse, omega, lFond (fondazione m), lCusc (cuscinetto m) facoltativi; vuoto se invariate', 'string', '')
         + ', margine: ' + fa('margine', 'Margine generale in %, es. 18; vuoto se non detto', 'string', '')
         + ', margini: ' + fa('margini', 'Margini per categoria come JSON, es. {"STRUTTURA":25,"ZINCATURA":10}; vuoto se non detti', 'string', '')
         + ', trasporto: ' + fa('trasporto', 'Prezzo del trasporto in euro per l offerta, 0 = escluso; vuoto se non detto', 'string', '')
         + ', posa: ' + fa('posa', 'Prezzo della posa in opera in euro, 0 = non inclusa; vuoto se non detto', 'string', '')
         + ', wp: ' + fa('wp', 'Potenza del modulo in W, es. 600; vuoto se non detta', 'string', '')
         + ', modulo: ' + fa('modulo', 'Marca e modello del modulo, facoltativo', 'string', '')
         + ', localita: ' + fa('localita', 'Località dell impianto, facoltativa', 'string', '')
         + ', referente: ' + fa('referente', 'Referente del cliente, facoltativo', 'string', '')
         + ', email: ' + fa('email', 'E-mail del referente, facoltativa', 'string', '')
         + ', zona: ' + fa('zona', 'Zona del sito (es. Periferia, Zona industriale), facoltativa', 'string', '')
         + ', resa: ' + fa('resa', 'Resa Incoterms (es. DAP cantiere), facoltativa', 'string', '')
         + ', pagamento: ' + fa('pagamento', 'Condizioni di pagamento, facoltative (vuoto = Da concordare)', 'string', '')
         + ', consegna: ' + fa('consegna', 'Tempi di consegna, facoltativi', 'string', '')
         + ', validita: ' + fa('validita', "Validità dell'offerta (es. 30 giorni), facoltativa", 'string', '')
         + ', quadri_campo: ' + fa('quadri_campo', 'Numero di quadri di campo, facoltativo', 'string', '')
         + ', quadri_generali: ' + fa('quadri_generali', 'Numero di quadri generali, facoltativo', 'string', '')
         + ', file_id: ' + fa('file_id', 'file_id di un allegato con il layout (DXF o foto), facoltativo', 'string', '')
         + ', file_nome: ' + fa('file_nome', 'Nome del file allegato, es. impianto.dxf; vuoto per una foto', 'string', '')
         + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('modulo_preventivo', [2120, 860], "Manda nella chat privata di chi scrive il pulsante «Compila preventivo», che apre il modulo del preventivo dentro Telegram. Per un preventivo nuovo passa il cliente; per correggerne uno l'id.",
         "Object.fromEntries(Object.entries({ azione: 'modulo', telegram_id: " + TID + ', cliente: ' + fa('cliente', "Nome dell'azienda cliente detto dall'operatore", 'string', '')
         + ', id: ' + fa('id', 'id del preventivo da correggere, vuoto per uno nuovo', 'string', '') + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('carica_layout', [2000, 860], "Mette nel preventivo (id da cerca_commesse o da prepara_preventivo) il layout mandato al bot: DXF o foto, dal file_id dell'allegato. Poi rimanda l'offerta aggiornata in privato.",
         "Object.fromEntries(Object.entries({ azione: 'layout', telegram_id: " + TID + ', id: ' + fa('id', 'id del preventivo')
         + ', file_id: ' + fa('file_id', "file_id dell'allegato") + ', file_nome: ' + fa('file_nome', 'Nome del file allegato; vuoto per una foto', 'string', '')
         + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('invia_offerta', [1880, 860], "Manda nella chat privata di chi scrive l'offerta in PDF di un preventivo dell'archivio, così com'è salvato (id da cerca_commesse). Usalo quando chiede un preventivo già fatto.",
         "{ azione: 'offerta', telegram_id: " + TID + ', id: ' + fa('id', 'id del preventivo') + ' }'),
    tool('margini_preventivo', [2600, 860], "Manda nella chat privata di chi scrive il riepilogo dei margini di un preventivo dell'archivio (id da cerca_commesse), come la scheda Margini dell'app: costo, margine e prezzo per categoria, totale, €/Wp e prezzo per tracker.",
         "{ azione: 'margini', telegram_id: " + TID + ', id: ' + fa('id', 'id del preventivo') + ' }'),
    tool('crea_varianti', [2480, 860], "Crea varianti di un preventivo salvato (id da cerca_commesse) che cambiano solo il materiale su tutte le righe: profilo dei pilastri, spessore dell'asse, spessore dell'omega. Ogni variante è un preventivo nuovo con il suo numero e la sua offerta in chat privata. Restituisce i preventivi creati, il confronto dei prezzi (testo) e gli avvisi.",
         "{ azione: 'varianti', telegram_id: " + TID + ', id: ' + fa('id', 'id del preventivo base')
         + ', varianti: ' + fa('varianti', 'Elenco JSON delle combinazioni dette, es. [{"prof":"IPEA","asse":2.5},{"prof":"IPE","asse":3}]; prof = famiglia (IPE, IPEA) o codice (IPE 140); asse 2.5 o 3; omega 2 o 1.8; i campi non detti restano quelli del base') + ' }'),
    tool('cerca_appunti', [2240, 860], "Cerca gli appunti (note dei documenti e note delle voci d'agenda) per parole e/o commessa. Ogni risultato ha id, fonte, titolo, data, commessa ed estratto.",
         "Object.fromEntries(Object.entries({ azione: 'appunti', telegram_id: " + TID + ', cerca: ' + fa('cerca', 'Parole da cercare nel titolo, nel testo o nel nome della commessa', 'string', '')
         + ', preventivo_id: ' + fa('preventivo_id', 'id della commessa da cerca_commesse, vuoto se nessuna', 'string', '') + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('email_da_appunto', [2360, 860], "Scrive con l'AI la bozza di un'email di aggiornamento da un appunto e la manda nella chat privata di chi scrive, con i pulsanti per aprirla nell'app Gmail del telefono o in Gmail dal computer. Non invia l'email.",
         "Object.fromEntries(Object.entries({ azione: 'email', telegram_id: " + TID + ', id: ' + fa('id', "id dell'appunto da cerca_appunti; vuoto se il contenuto è dettato", 'string', '')
         + ', appunto: ' + fa('appunto', "Solo senza id: il contenuto dettato dall'operatore", 'string', '')
         + ', richiesta: ' + fa('richiesta', 'Indicazioni per la bozza: a chi è rivolta, tono (lei/tu), cose da aggiungere', 'string', '')
         + ', a: ' + fa('a', 'Indirizzi email dei destinatari separati da virgola, vuoto se non detti', 'string', '')
         + ', preventivo_id: ' + fa('preventivo_id', 'id della commessa per il contesto, vuoto se nessuna', 'string', '') + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('crea_nota', [2720, 860], "Salva una nota (appunto) nei Documenti dell'app, libera o legata a una commessa, con le etichette del tema. Restituisce id e una riga di riepilogo.",
         "Object.fromEntries(Object.entries({ azione: 'nota', telegram_id: " + TID + ', titolo: ' + fa('titolo', 'Titolo breve della nota')
         + ', testo: ' + fa('testo', 'Testo della nota in parole semplici; vuoto se basta il titolo', 'string', '')
         + ', etichette: ' + fa('etichette', 'Da 0 a 3 temi separati da virgola tra: acquisti, vendita, opportunita, sviluppo, tecnico, produzione, cantiere, logistica, qualita, amministrazione, marketing, personale, riunione, idea', 'string', '')
         + ', preventivo_id: ' + fa('preventivo_id', 'id della commessa da cerca_commesse; vuoto per una nota libera', 'string', '') + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('modifica_nota', [2840, 860], "Cambia le etichette (aggiunge e/o toglie) o la commessa di una nota già salvata (id da cerca_appunti, fonte documenti). Solo chi l'ha scritta o un amministratore.",
         "Object.fromEntries(Object.entries({ azione: 'nota_modifica', telegram_id: " + TID + ', id: ' + fa('id', 'id della nota da cerca_appunti')
         + ', aggiungi: ' + fa('aggiungi', 'Etichette da aggiungere, separate da virgola; vuoto se nessuna', 'string', '')
         + ', togli: ' + fa('togli', 'Etichette da togliere, separate da virgola; vuoto se nessuna', 'string', '')
         + ', preventivo_id: ' + fa('preventivo_id', "id della commessa a cui legarla; 'nessuno' per renderla libera; vuoto se invariata", 'string', '') + " }).filter(([, v]) => v !== '' && v != null))"),
    tool('modifica_voce', [1520, 860], 'Agisce su una voce esistente (id da leggi_agenda o crea_voce). azione: prendi (me ne occupo io), risolvi (fatta), aggiorna (cambia i campi indicati), elimina.',
         'Object.fromEntries(Object.entries({ azione: ' + fa('azione', 'Una tra: prendi, risolvi, aggiorna, elimina')
         + ', telegram_id: ' + TID + ', id: ' + fa('id', 'id della voce')
         + ', titolo: ' + fa('titolo', 'Solo per aggiorna: nuovo titolo, vuoto se invariato', 'string', '')
         + ', giorno: ' + fa('giorno', 'Solo per aggiorna: nuova data AAAA-MM-GG, vuoto se invariata', 'string', '')
         + ', ora: ' + fa('ora', 'Solo per aggiorna: nuova ora HH:MM, vuoto se invariata', 'string', '')
         + ', nota: ' + fa('nota', 'Solo per aggiorna: nuova nota, vuoto se invariata', 'string', '')
         + ', assegnata_a: ' + fa('assegnata_a', "Solo per aggiorna: email del nuovo assegnatario, vuoto se invariato", 'string', '')
         + " }).filter(([, v]) => v !== '' && v != null))"),
]
chat_conn = {
    'Telegram Trigger': {'main': [to('Impostazioni')]}, 'Impostazioni': {'main': [to('È un pulsante?')]},
    'È un pulsante?': {'main': [to('Pulsante → app'), to('È /collega o /id?')]},
    'Pulsante → app': {'main': [to('Risposta al pulsante')]}, 'Risposta al pulsante': {'main': [to('Andato a buon fine?')]},
    'Andato a buon fine?': {'main': [to('Avvisa nel gruppo'), []]},
    'È /collega o /id?': {'main': [to('Quale comando?'), to('È un vocale?')]},
    'È un vocale?': {'main': [to('Scarica audio'), to('Assistente')]},
    'Scarica audio': {'main': [to('Trascrivi')]}, 'Trascrivi': {'main': [to('Assistente')]},
    'Quale comando?': {'main': [to('Rispondi id'), to('Collega → app')]},
    'Collega → app': {'main': [to('Rispondi collega')]}, 'Assistente': {'main': [to('Rispondi')]},
    'Modello': {'ai_languageModel': [[{'node': 'Assistente', 'type': 'ai_languageModel', 'index': 0}]]},
    'Memoria': {'ai_memory': [[{'node': 'Assistente', 'type': 'ai_memory', 'index': 0}]]},
    **{t: {'ai_tool': [[{'node': 'Assistente', 'type': 'ai_tool', 'index': 0}]]}
       for t in ['chi_sono', 'cerca_commesse', 'colleghi', 'leggi_agenda', 'crea_voce', 'modifica_voce', 'collega_account', 'prepara_preventivo', 'invia_offerta', 'carica_layout', 'modulo_preventivo', 'cerca_appunti', 'email_da_appunto', 'crea_varianti', 'margini_preventivo', 'crea_nota', 'modifica_nota']},
}

# ---------- Modifiche fatte a mano in n8n (n8n/incolla-reparti.txt e incolla-settori.txt), qui con gli stessi testi ----------
# Così il flusso completo reimportato le ha già: reparti e settori in crea_voce e crea_nota, menu /nuovo, situazione di un reparto,
# risposta ai messaggi del bot, pulsanti con chat e messaggio.
A_MANO = {
    'Pulsante → app': {'jsonBody': "={{ JSON.stringify({ azione: $json.callback_query.data.split(':')[0], id: $json.callback_query.data.split(':')[1], scelta: $json.callback_query.data.split(':')[2] || '', telegram_id: $json.callback_query.from.id, chat: $json.callback_query.message.chat.id, msg: $json.callback_query.message.message_id }) }}"},
    'crea_voce': {'jsonBody': '={{ JSON.stringify({ azione: \'crea\', telegram_id: $(\'Telegram Trigger\').item.json.message.from.id, genere: $fromAI(\'genere\', `Uno tra: urgenza, attivita (cosa da fare), promemoria, scadenza, appuntamento`, \'string\'), titolo: $fromAI(\'titolo\', `Descrizione breve, massimo 200 caratteri`, \'string\'), giorno: $fromAI(\'giorno\', `Data AAAA-MM-GG; vuoto solo per le urgenze (= oggi)`, \'string\', ""), ora: $fromAI(\'ora\', `Ora HH:MM, vuoto se non indicata`, \'string\', ""), nota: $fromAI(\'nota\', `Dettagli facoltativi`, \'string\', ""), categoria: $fromAI(\'categoria\', `Facoltativa: STRUTTURA, BULLONERIA, ELETTROMECCANICO, ELETTRONICO`, \'string\', ""), preventivo_id: $fromAI(\'preventivo_id\', `id del preventivo o commessa preso da cerca_commesse, vuoto se nessuno`, \'string\', ""), assegnata_a: $fromAI(\'assegnata_a\', `email del collega presa da colleghi, vuoto se nessuno`, \'string\', ""), reparto: $fromAI(\'reparto\', `Reparto se detto o dal menu /nuovo: direzione, commerciale, tecnico, rs, acquisti, produzione, qualita, logistica, cantiere, assistenza, amministrazione, hr; vuoto se non detto`, \'string\', ""), settore: $fromAI(\'settore\', `Settore solo se detto: energia (tracker e impianti fissi), serre, vigneti, recinzioni, speciali (lavori speciali); vuoto se non detto`, \'string\', ""), chat: $(\'Telegram Trigger\').item.json.message.chat.id }) }}'},
    'crea_nota': {'jsonBody': '={{ JSON.stringify(Object.fromEntries(Object.entries({ azione: \'nota\', telegram_id: $(\'Telegram Trigger\').item.json.message.from.id, titolo: $fromAI(\'titolo\', `Titolo breve della nota`, \'string\'), testo: $fromAI(\'testo\', `Testo della nota in parole semplici; vuoto se basta il titolo`, \'string\', ""), etichette: $fromAI(\'etichette\', `Da 0 a 3 temi separati da virgola tra: acquisti, vendita, opportunita, sviluppo, tecnico, produzione, cantiere, logistica, qualita, amministrazione, marketing, personale, riunione, idea`, \'string\', ""), preventivo_id: $fromAI(\'preventivo_id\', `id della commessa da cerca_commesse; vuoto per una nota libera`, \'string\', ""), reparto: $fromAI(\'reparto\', `Reparto se detto o dal menu /nuovo: direzione, commerciale, tecnico, rs, acquisti, produzione, qualita, logistica, cantiere, assistenza, amministrazione, hr; vuoto se non detto`, \'string\', ""), settore: $fromAI(\'settore\', `Settore solo se detto: energia (tracker e impianti fissi), serre, vigneti, recinzioni, speciali (lavori speciali); vuoto se non detto`, \'string\', ""), chat: $(\'Telegram Trigger\').item.json.message.chat.id }).filter(([, v]) => v !== \'\' && v != null))) }}'},
}
for n in chat:
    if n['name'] in A_MANO: n['parameters'].update(A_MANO[n['name']])
    if n['name'] == 'Andato a buon fine?': n['parameters']['conditions']['conditions'][0]['leftValue'] = "={{ $('Pulsante → app').item.json.ok && !!$('Pulsante → app').item.json.testo }}"
    if n['name'] == 'Assistente':
        n['parameters']['text'] = '={{ ($(\'Telegram Trigger\').item.json.message?.reply_to_message?.from?.is_bot ? \'[in risposta a: \' + String($(\'Telegram Trigger\').item.json.message.reply_to_message.text || \'\').slice(0, 400) + \'] \' : \'\') + ($json.text ? \'[vocale] \' + $json.text : (($(\'Telegram Trigger\').item.json.message.text || $(\'Telegram Trigger\').item.json.message.caption || \'\') + ($(\'Telegram Trigger\').item.json.message.document ? \' [allegato: file "\' + $(\'Telegram Trigger\').item.json.message.document.file_name + \'", file_id=\' + $(\'Telegram Trigger\').item.json.message.document.file_id + \']\' : $(\'Telegram Trigger\').item.json.message.photo ? \' [allegato: foto, file_id=\' + $(\'Telegram Trigger\').item.json.message.photo[$(\'Telegram Trigger\').item.json.message.photo.length - 1].file_id + \']\' : \'\')) || \'(messaggio senza testo: chiedi di scriverlo a parole o con un vocale)\') }}'
        n['parameters']['options']['systemMessage'] += '\n' + '- Reparti: Direzione, Commerciale, Tecnico, R&S, Acquisti, Produzione, Qualità e sicurezza, Logistica, Cantiere, Assistenza, Amministrazione, Risorse umane. Se il messaggio dice in quale reparto va una voce o una nota ("nota per acquisti…", "promemoria per la logistica…"), passa reparto a crea_voce o crea_nota. Se non lo dice, non indovinarlo. Se lo strumento risponde con «pulsanti», sotto c\'è già il messaggio con i tasti per cambiare reparto o annullare: dillo in mezza riga.\n- /nuovo (o "voglio aggiungere qualcosa" senza dire cosa): usa nuovo_menu (con il reparto se l\'ha detto) e rispondi solo che il menu è in chat.\n- Un messaggio che inizia con [in risposta a: … [reparto=K tipo=T]] è la risposta al menu /nuovo: se T è nota usa crea_nota con reparto K (etichette scelte da te come al solito); altrimenti crea_voce con genere T e reparto K. Converti le date relative; se per promemoria, scadenza o appuntamento manca il giorno, chiedilo. Non chiedere altre conferme: salva e riassumi in una riga.\n- /reparto <nome> o domande come "com\'è messa la produzione?": usa situazione_reparto (reparto vuoto se non dice quale). La situazione arriva già in chat dall\'app con i suoi pulsanti: non riscriverla, rispondi solo a una domanda precisa se c\'era (es. "ci sono urgenze in produzione?").\n- Altri comandi del menu: /nuovo = aggiungi qualcosa in un reparto con i pulsanti; /reparto <nome> = situazione di un reparto.\n- Settori: Energia (tracker e impianti fissi), Serre, Vigneti, Recinzioni, Lavori speciali. Se il messaggio dice il settore di una voce o di una nota ("promemoria per le serre…", "nota vigneti…"), passa settore a crea_voce o crea_nota. Se non lo dice, non indovinarlo: vale quello della commessa collegata. Sotto quello che si salva c\'è il pulsante per cambiare settore.\n- "Com\'è messa la produzione sulle serre?" o /reparto produzione serre: situazione_reparto con reparto e settore.'
_chi = next(n for n in chat if n['name'] == 'chi_sono')
for nome, pos, desc, corpo in [('nuovo_menu', [3080, 860], 'Manda in chat il menu con i pulsanti per aggiungere qualcosa in un reparto (/nuovo): si sceglie il reparto, poi nota, promemoria, scadenza, urgenza, appuntamento o da fare, poi si risponde con il testo.', '={{ JSON.stringify({ azione: \'menu_nuovo\', telegram_id: $(\'Telegram Trigger\').item.json.message.from.id, chat: $(\'Telegram Trigger\').item.json.message.chat.id, reparto: $fromAI(\'reparto\', `Reparto se detto, altrimenti vuoto`, \'string\', "") }) }}'), ('situazione_reparto', [3200, 860], "Situazione di un reparto: urgenze, scadute, oggi, prossimi 7 giorni, ultime note e persone. L'app la manda in chat con i pulsanti; restituisce anche il testo.", '={{ JSON.stringify({ azione: \'reparto\', telegram_id: $(\'Telegram Trigger\').item.json.message.from.id, chat: $(\'Telegram Trigger\').item.json.message.chat.id, reparto: $fromAI(\'reparto\', `Reparto (es. produzione, acquisti); vuoto se non detto`, \'string\', ""), settore: $fromAI(\'settore\', `Settore se detto (energia, serre, vigneti, recinzioni, speciali); vuoto se non detto`, \'string\', "") }) }}')]:
    t = json.loads(json.dumps(_chi)); t.update({'id': U(), 'name': nome, 'position': pos})
    t['parameters'].update({'toolDescription': desc, 'jsonBody': corpo})
    chat.append(t); chat_conn[nome] = {'ai_tool': [[{'node': 'Assistente', 'type': 'ai_tool', 'index': 0}]]}

# ---------- Flusso 2: avvisi e riepilogo ----------
avvisi = [
    # Database Webhook di Supabase sulla tabella scadenze (Insert), con l'intestazione x-agenda-secret.
    node('Voce nuova (Supabase)', 'n8n-nodes-base.webhook', 2, [0, 200], {'httpMethod': 'POST', 'path': 'agenda-avvisi', 'authentication': 'headerAuth', 'options': {}}, CRED),
    node('È un inserimento?', 'n8n-nodes-base.if', 2.2, [220, 200], cond("$json.body.type === 'INSERT' && !!$json.body.record?.id")),
    impostazioni('Impostazioni', [440, 200]),
    http('Annuncio → app', [660, 200], "{ azione: 'annuncio', id: $('Voce nuova (Supabase)').item.json.body.record.id }"),
    node('Da annunciare?', 'n8n-nodes-base.if', 2.2, [880, 200], cond('$json.ok && $json.invia')),
    node('Annuncia nel gruppo', 'n8n-nodes-base.telegram', 1.2, [1100, 200], {'chatId': "={{ $('Impostazioni').item.json.gruppo }}", 'text': '={{ $json.testo }}',
         'replyMarkup': 'inlineKeyboard', 'inlineKeyboard': {'rows': [{'row': {'buttons': [
             {'text': '🙋 Me ne occupo', 'additionalFields': {'callback_data': '=prendi:{{ $json.id }}'}},
             {'text': '✅ Risolto', 'additionalFields': {'callback_data': '=risolvi:{{ $json.id }}'}}]}}]},
         'additionalFields': {'appendAttribution': False}}, TG),
    node('Ogni mattina lun-ven 8:00', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 520], {'rule': {'interval': [{'field': 'cronExpression', 'expression': '0 8 * * 1-5'}]}}),
    impostazioni('Impostazioni riepilogo', [220, 520]),
    http('Riepilogo → app', [440, 520], "{ azione: 'riepilogo' }", url="={{ $('Impostazioni riepilogo').item.json.url }}"),
    send('Riepilogo nel gruppo', [660, 520], "$('Impostazioni riepilogo').item.json.gruppo", "$json.ok ? $json.testo : '⚠️ Riepilogo non disponibile: ' + $json.errore"),
    # Riunioni: ogni 10 minuti (lun-ven 6-19) l'app manda da sola su Telegram l'avviso degli appuntamenti che iniziano tra 30-40 minuti.
    node('Ogni 10 minuti', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 760], {'rule': {'interval': [{'field': 'cronExpression', 'expression': '*/10 6-19 * * 1-5'}]}}),
    node('Impostazioni riunioni', 'n8n-nodes-base.set', 3.4, [220, 760], {'assignments': {'assignments': [
        {'id': U(), 'name': 'url', 'type': 'string', 'value': API}]}, 'includeOtherFields': True, 'options': {}}),
    http('Riunioni → app', [440, 760], "{ azione: 'avvisi_riunioni' }", url="={{ $('Impostazioni riunioni').item.json.url }}"),
]
avvisi_conn = {
    'Voce nuova (Supabase)': {'main': [to('È un inserimento?')]}, 'È un inserimento?': {'main': [to('Impostazioni'), []]},
    'Impostazioni': {'main': [to('Annuncio → app')]}, 'Annuncio → app': {'main': [to('Da annunciare?')]},
    'Da annunciare?': {'main': [to('Annuncia nel gruppo'), []]},
    'Ogni mattina lun-ven 8:00': {'main': [to('Impostazioni riepilogo')]}, 'Impostazioni riepilogo': {'main': [to('Riepilogo → app')]},
    'Riepilogo → app': {'main': [to('Riepilogo nel gruppo')]},
    'Ogni 10 minuti': {'main': [to('Impostazioni riunioni')]}, 'Impostazioni riunioni': {'main': [to('Riunioni → app')]},
}

# ---------- Flusso 3: email in arrivo (Gmail) ----------
# Ogni email nuova inoltrata a POSTA va all'app, che la fa leggere all'AI e manda la proposta in privato a chi l'ha inoltrata.
# Le scelte (pulsanti "pe:...") arrivano al flusso della chat. Le email di chi non e' un utente collegato restano ok:false nelle esecuzioni.
EM = "$('Email in arrivo').item.json"
# Nome, tipo e peso degli allegati scaricati dal nodo Gmail (attachment_0, attachment_1...).
ALLEGATI = "Object.entries($('Email in arrivo').item.binary || {}).map(([k, f]) => ({ chiave: k, nome: f.fileName || k, mime: f.mimeType || '', peso: f.fileSize || '' }))"
CODICE_ALLEGATI = """// Un elemento per ogni allegato da caricare, con il suo file preso dall'email.
const file = $('Email in arrivo').first().binary || {};
const r = $input.first().json;
return (r.ok && r.caricamenti ? r.caricamenti : []).filter(c => file[c.chiave]).map(c => ({ json: c, binary: { data: file[c.chiave] } }));"""
email = [
    node('Email in arrivo', 'n8n-nodes-base.gmailTrigger', 1.2, [0, 200], {'pollTimes': {'item': [{'mode': 'everyMinute'}]}, 'simple': False,
         'filters': {'q': CERCA}, 'options': {'downloadAttachments': True, 'dataPropertyAttachmentsPrefixName': 'attachment_'}}, GMAIL),
    node('Impostazioni email', 'n8n-nodes-base.set', 3.4, [220, 200], {'assignments': {'assignments': [
        {'id': U(), 'name': 'url', 'type': 'string', 'value': API}]}, 'includeOtherFields': True, 'options': {}}),
    http('Email → app', [440, 200], "{ azione: 'posta', gmail_id: " + EM + ".id, da: " + EM + ".from?.value?.[0]?.address || " + EM + ".from?.text || '', oggetto: "
         + EM + ".subject || '', testo: " + EM + ".text || '', data: " + EM + ".date || '', allegati: " + ALLEGATI + " }", url="={{ $('Impostazioni email').item.json.url }}"),
    # Allegati: l'app risponde con un link firmato per ognuno da tenere; qui si carica il file direttamente nello Storage.
    node('Allegati da caricare', 'n8n-nodes-base.code', 2, [660, 200], {'jsCode': CODICE_ALLEGATI}),
    node('Carica allegato', 'n8n-nodes-base.httpRequest', 4.2, [880, 200], {'method': 'PUT', 'url': '={{ $json.url }}', 'sendHeaders': True,
         'headerParameters': {'parameters': [{'name': 'content-type', 'value': '={{ $json.mime }}'}, {'name': 'apikey', 'value': '={{ $json.apikey }}'},
                                             {'name': 'x-upsert', 'value': 'false'}]},
         'sendBody': True, 'contentType': 'binaryData', 'inputDataFieldName': 'data', 'options': {}}),
]
email_conn = {'Email in arrivo': {'main': [to('Impostazioni email')]}, 'Impostazioni email': {'main': [to('Email → app')]},
              'Email → app': {'main': [to('Allegati da caricare')]}, 'Allegati da caricare': {'main': [to('Carica allegato')]}}

# ---------- Flusso 4: email etichettate in Gmail e conversazioni legate alle voci ----------
# Ogni minuto: le email con un'etichetta «Conf/…» non ancora passate (anche vecchie) e quelle delle conversazioni già legate a una voce aperta
# (anche senza etichetta). L'app dice quali leggere (azione posta_nuove: di una conversazione nuova solo l'ultima email, di una legata tutte
# quelle nuove); n8n ne prende una al minuto e la manda all'app (azione posta con per = la casella: l'email è di chi l'ha etichettata anche se
# il mittente è esterno). L'app la propone in «In arrivo», oppure, se la conversazione è già legata, la aggiunge da sola alla voce.
# Poi n8n mette «Conf/In app» (o «Conf/Non entrata» se l'app non l'ha presa) a tutta la conversazione: le sue email non tornano nella ricerca,
# e le risposte che arrivano dopo le prende la lettura delle conversazioni legate.
CASELLA = 'g.sorrentino@terranovasrl.net'
# Seconda casella con le stesse etichette: quella dell'amministrazione. Le etichette le mette il collega che la gestisce e le email vanno
# nel suo «In arrivo» (utente dell'app UTENTE_AMM), da dove sceglie per chi è il promemoria. Gmail con la sua credenziale «Gmail Amministrazione».
CASELLA_AMM = 'amministrazione@terranovasrl.net'
UTENTE_AMM = 'INSERISCI_EMAIL_COLLEGA_AMMINISTRAZIONE'
ET = "$('Email etichettata').first().json"
IMP = "$('Impostazioni etichette').first().json"
CODICE_RICERCA = r"""// Ricerca Gmail delle email con un'etichetta «Conf/…» non ancora passate all'app (anche vecchie), e nomi delle etichette per l'app.
const ll = $input.all().map(i => i.json);
const conf = ll.filter(l => /^conf\//i.test(l.name || ''));
const fatta = conf.find(l => /in app/i.test(l.name)), errore = conf.find(l => /non entrata/i.test(l.name));
const lab = n => 'label:' + n.toLowerCase().replace(/[\s\/]+/g, '-');
const cerca = conf.filter(l => l !== fatta && l !== errore);
if (!fatta || !cerca.length) return [];
return [{ json: { q: '{' + cerca.map(l => lab(l.name)).join(' ') + '} -' + lab(fatta.name) + (errore ? ' -' + lab(errore.name) : ''),
  nomi: Object.fromEntries(conf.map(l => [l.id, l.name])), fatta: fatta.id, errore: (errore || fatta).id } }];"""
CODICE_FILI = r"""// Una riga per ogni conversazione legata a una voce aperta (le dà l'app); nessuna = si passa oltre.
const ff = $('Fili attivi').first().json.fili || [];
return ff.length ? ff.map(t => ({ json: { thread: t } })) : [{ json: { nessuno: true } }];"""
CODICE_RACCOGLI = r"""// Tutte le email trovate (etichettate e delle conversazioni legate), con conversazione e data, per chiedere all'app quali leggere.
const ms = m => Number(m.internalDate) || Date.parse(m.date || (m.headers && m.headers.date) || (((m.payload && m.payload.headers) || []).find(h => /^date$/i.test(h.name)) || {}).value || '') || 0;
const piatti = xs => xs.flatMap(x => Array.isArray(x.messages) ? x.messages : [x]);
let tutti = $('Email con etichetta').all().map(i => i.json);
try { tutti = tutti.concat(piatti($('Messaggi dei fili').all().map(i => i.json))); } catch (e) {}
return [{ json: { email: tutti.filter(m => m && m.id).map(m => ({ id: m.id, thread: m.threadId || '', data: ms(m) })) } }];"""
CODICE_PRIMA = r"""// Una email al minuto, la più vecchia da leggere (così gli allegati vanno con la loro email).
const ids = $input.first().json.ids || [];
return ids.length ? [{ json: { id: ids[0] } }] : [];"""
CODICE_ALLEGATI_ET = CODICE_ALLEGATI.replace("$('Email in arrivo')", "$('Email etichettata')")
ALLEGATI_ET = ALLEGATI.replace("$('Email in arrivo').item", "$('Email etichettata').first()")
URL_ET = "={{ " + IMP + ".url }}"


def gmail(name, pos, params, **extra):
    n = node(name, 'n8n-nodes-base.gmail', 2.1, pos, params, GMAIL); n.update(extra); return n


etichette = [
    node('Ogni minuto', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 200], {'rule': {'interval': [{'field': 'minutes', 'minutesInterval': 1}]}}),
    node('Impostazioni etichette', 'n8n-nodes-base.set', 3.4, [200, 200], {'assignments': {'assignments': [
        {'id': U(), 'name': 'url', 'type': 'string', 'value': API}, {'id': U(), 'name': 'casella', 'type': 'string', 'value': CASELLA},
        {'id': U(), 'name': 'utente', 'type': 'string', 'value': CASELLA}]},
        'includeOtherFields': True, 'options': {}}),
    gmail('Etichette Gmail', [400, 200], {'resource': 'label', 'returnAll': True}),
    node('Ricerca etichette', 'n8n-nodes-base.code', 2, [600, 200], {'jsCode': CODICE_RICERCA}),
    http('Fili attivi', [800, 200], "{ azione: 'fili' }", url=URL_ET),
    gmail('Email con etichetta', [1000, 200], {'operation': 'getAll', 'limit': 30, 'filters': {'q': "={{ $('Ricerca etichette').first().json.q }}"}},
          alwaysOutputData=True),
    node('Fili da guardare', 'n8n-nodes-base.code', 2, [1200, 200], {'jsCode': CODICE_FILI}),
    node('Ci sono fili?', 'n8n-nodes-base.if', 2.2, [1400, 200], cond('!$json.nessuno')),
    gmail('Messaggi dei fili', [1600, 100], {'resource': 'thread', 'operation': 'get', 'threadId': '={{ $json.thread }}', 'options': {}},
          onError='continueRegularOutput'),
    node('Raccogli', 'n8n-nodes-base.code', 2, [1800, 200], {'jsCode': CODICE_RACCOGLI}),
    http('Quali leggere', [2000, 200], "{ azione: 'posta_nuove', email: $json.email }", url=URL_ET),
    node('Prima da leggere', 'n8n-nodes-base.code', 2, [2200, 200], {'jsCode': CODICE_PRIMA}),
    gmail('Email etichettata', [2400, 200], {'operation': 'get', 'messageId': '={{ $json.id }}', 'simple': False,
          'options': {'downloadAttachments': True, 'dataPropertyAttachmentsPrefixName': 'attachment_'}}),
    http('Etichettata → app', [2600, 200], "{ azione: 'posta', per: " + IMP + ".utente || " + IMP + ".casella, casella: " + IMP + ".casella, gmail_id: " + ET + ".id, thread_id: " + ET + ".threadId || '', da: "
         + ET + ".from?.value?.[0]?.address || " + ET + ".from?.text || '', a: " + ET + ".to?.value?.[0]?.address || '', oggetto: " + ET + ".subject || '', testo: "
         + ET + ".text || '', data: " + ET + ".date || '', data_ms: Number(" + ET + ".internalDate) || 0, etichette_gmail: (" + ET
         + ".labelIds || []).map(id => $('Ricerca etichette').first().json.nomi[id]).filter(Boolean), allegati: " + ALLEGATI_ET + " }", url=URL_ET),
    gmail('Segna in Gmail', [2800, 100], {'resource': 'thread', 'operation': 'addLabels', 'threadId': "={{ " + ET + ".threadId }}",
          'labelIds': "={{ $json.ok ? $('Ricerca etichette').first().json.fatta : $('Ricerca etichette').first().json.errore }}"}),
    node('Allegati etichettata', 'n8n-nodes-base.code', 2, [2800, 300], {'jsCode': CODICE_ALLEGATI_ET}),
    node('Carica allegato etichettata', 'n8n-nodes-base.httpRequest', 4.2, [3000, 300], {'method': 'PUT', 'url': '={{ $json.url }}', 'sendHeaders': True,
         'headerParameters': {'parameters': [{'name': 'content-type', 'value': '={{ $json.mime }}'}, {'name': 'apikey', 'value': '={{ $json.apikey }}'},
                                             {'name': 'x-upsert', 'value': 'false'}]},
         'sendBody': True, 'contentType': 'binaryData', 'inputDataFieldName': 'data', 'options': {}}),
]
etichette_conn = {'Ogni minuto': {'main': [to('Impostazioni etichette')]}, 'Impostazioni etichette': {'main': [to('Etichette Gmail')]},
                  'Etichette Gmail': {'main': [to('Ricerca etichette')]}, 'Ricerca etichette': {'main': [to('Fili attivi')]},
                  'Fili attivi': {'main': [to('Email con etichetta')]}, 'Email con etichetta': {'main': [to('Fili da guardare')]},
                  'Fili da guardare': {'main': [to('Ci sono fili?')]}, 'Ci sono fili?': {'main': [to('Messaggi dei fili'), to('Raccogli')]},
                  'Messaggi dei fili': {'main': [to('Raccogli')]}, 'Raccogli': {'main': [to('Quali leggere')]},
                  'Quali leggere': {'main': [to('Prima da leggere')]}, 'Prima da leggere': {'main': [to('Email etichettata')]},
                  'Email etichettata': {'main': [to('Etichettata → app')]}, 'Etichettata → app': {'main': [to('Segna in Gmail', 'Allegati etichettata')]},
                  'Allegati etichettata': {'main': [to('Carica allegato etichettata')]}}


# Copia per la casella dell'amministrazione: stessi nodi con « (amm.)» nel nome (nel flusso completo i nomi devono essere unici).
def copia_amm(nodi, conn):
    nomi = sorted((n['name'] for n in nodi), key=len, reverse=True)
    t = json.dumps({'n': nodi, 'c': conn}, ensure_ascii=False)
    for k in nomi: t = t.replace(json.dumps(k, ensure_ascii=False)[1:-1], k + ' (amm.)')
    t = t.replace(' (amm.) (amm.)', ' (amm.)').replace('"Gmail Agenda"', '"Gmail Amministrazione"')
    d = json.loads(t)
    for n in d['n']:
        n['id'] = U(); n['position'] = [n['position'][0], n['position'][1] + 500]
        if n['name'] == 'Impostazioni etichette (amm.)':
            for a in n['parameters']['assignments']['assignments']:
                a['id'] = U(); a['value'] = {'casella': CASELLA_AMM, 'utente': UTENTE_AMM}.get(a['name'], a['value'])
    return d['n'], d['c']
etichette_amm, etichette_amm_conn = copia_amm(etichette, etichette_conn)


SETTINGS = {'executionOrder': 'v1', 'timezone': 'Europe/Rome'}
# Copia pronta da importare con il codice di bypass di .env.local (VERCEL_BYPASS): va in n8n/da-importare/, esclusa da GitHub.
try:
    BYPASS = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env.local'), encoding='utf-8') if '=' in l).get('VERCEL_BYPASS', '')
except OSError:
    BYPASS = ''
for cartella, sost in [('n8n', None), (os.path.join('n8n', 'da-importare'), BYPASS or None)]:
    if cartella != 'n8n' and not sost: continue
    os.makedirs(os.path.join(ROOT, cartella), exist_ok=True)
    for nome, nodi, conn, file in [('Agenda - Chat Telegram', chat, chat_conn, 'agenda-chat-telegram.json'),
                                   ('Agenda - Avvisi e riepilogo', avvisi, avvisi_conn, 'agenda-avvisi-riepilogo.json'),
                                   ('Agenda - Email Gmail', email, email_conn, 'agenda-email-gmail.json'),
                                   ('Agenda - Etichette Gmail', etichette, etichette_conn, 'agenda-etichette-gmail.json'),
                                   ('Agenda - Etichette Gmail amministrazione', etichette_amm, etichette_amm_conn, 'agenda-etichette-amministrazione.json')]:
        t = json.dumps({'name': nome, 'nodes': nodi, 'connections': conn, 'settings': SETTINGS, 'pinData': {}}, ensure_ascii=False, indent=1)
        with open(os.path.join(ROOT, cartella, file), 'w', encoding='utf-8') as f:
            f.write(t.replace('INSERISCI_CODICE_BYPASS', sost) if sost else t)
        print('Scritto ' + os.path.join(cartella, file).replace(os.sep, '/'))

# ---------- Un unico flusso completo, pronto all'uso (solo in n8n/da-importare/) ----------
# Segreto e bypass gia' dentro: in n8n restano da collegare solo il token Telegram, la chiave del modello e Gmail,
# piu' l'id del gruppo nel nodo "Impostazioni avvisi" (si ricava scrivendo /id nel gruppo).
try:
    ENV = dict(l.strip().split('=', 1) for l in open(os.path.join(ROOT, '.env.local'), encoding='utf-8') if '=' in l)
except OSError:
    ENV = {}
SEGRETO = ENV.get('AGENDA_SECRET', '')
if SEGRETO and BYPASS:
    av = json.loads(json.dumps(avvisi).replace("$('Impostazioni')", "$('Impostazioni avvisi')"))
    for n in av:
        if n['name'] == 'Impostazioni': n['name'] = 'Impostazioni avvisi'
        n['position'] = [n['position'][0], n['position'][1] + 1150]
    av_conn = json.loads(json.dumps(avvisi_conn).replace('"Impostazioni"', '"Impostazioni avvisi"'))
    em = json.loads(json.dumps(email))
    for n in em: n['position'] = [n['position'][0], n['position'][1] + 1650]
    et = json.loads(json.dumps(etichette))
    for n in et: n['position'] = [n['position'][0], n['position'][1] + 2150]
    ea = json.loads(json.dumps(etichette_amm))
    for n in ea: n['position'] = [n['position'][0], n['position'][1] + 2150]
    tutti = json.loads(json.dumps(chat)) + av + em + et + ea
    for n in tutti:
        p = n['parameters']
        if p.get('authentication') == 'genericCredentialType':   # richieste all'app: segreto nell'intestazione
            del p['authentication'], p['genericAuthType']; n.pop('credentials', None)
            p['sendHeaders'] = True
            p['headerParameters'] = {'parameters': [{'name': 'x-agenda-secret', 'value': SEGRETO}]}
        if n['name'] == 'Voce nuova (Supabase)':   # avviso dal database: si controlla il segreto nell'IF che segue
            p['authentication'] = 'none'; n.pop('credentials', None)
        if n['name'] == 'È un inserimento?':
            n['parameters'] = cond(f"$json.headers['x-agenda-secret'] === '{SEGRETO}' && $json.body.type === 'INSERT' && !!$json.body.record?.id")
    t = json.dumps({'name': 'Agenda Terranova - Telegram', 'nodes': tutti, 'connections': {**chat_conn, **av_conn, **email_conn, **etichette_conn, **etichette_amm_conn}, 'settings': SETTINGS, 'pinData': {}},
                   ensure_ascii=False, indent=1).replace('INSERISCI_CODICE_BYPASS', BYPASS)
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'agenda-completo.json'), 'w', encoding='utf-8') as f: f.write(t)
    print('Scritto n8n/da-importare/agenda-completo.json (flusso unico, con segreto e bypass)')
    # Nodi da copiare e incollare (Ctrl+V) nel flusso gia' attivo, senza reimportare: avvisi delle riunioni.
    nomi = ['Ogni 10 minuti', 'Impostazioni riunioni', 'Riunioni → app']
    pezzo = {'nodes': [n for n in tutti if n['name'] in nomi], 'connections': {k: v for k, v in avvisi_conn.items() if k in nomi}}
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'incolla-avvisi-riunioni.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(pezzo, ensure_ascii=False, indent=1).replace('INSERISCI_CODICE_BYPASS', BYPASS))
    print('Scritto n8n/da-importare/incolla-avvisi-riunioni.json (nodi da incollare nel flusso)')
    # Strumenti delle note con etichette: si incollano accanto agli altri strumenti dell'Assistente, gia' collegati.
    nomi = ['crea_nota', 'modifica_nota']
    pezzo = {'nodes': [n for n in tutti if n['name'] in nomi], 'connections': {k: v for k, v in chat_conn.items() if k in nomi}}
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'incolla-note.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(pezzo, ensure_ascii=False, indent=1).replace('INSERISCI_CODICE_BYPASS', BYPASS))
    print('Scritto n8n/da-importare/incolla-note.json (strumenti delle note da incollare nel flusso)')
    nomi = ['Allegati da caricare', 'Carica allegato']
    pezzo = {'nodes': [n for n in tutti if n['name'] in nomi], 'connections': {k: v for k, v in email_conn.items() if k in nomi}}
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'incolla-allegati-email.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(pezzo, ensure_ascii=False, indent=1))
    print('Scritto n8n/da-importare/incolla-allegati-email.json (nodi degli allegati da incollare nel flusso)')
    # Flusso delle etichette Gmail e delle conversazioni, da incollare al posto del vecchio blocco (stesso flusso, segreto già dentro).
    nomi = [n['name'] for n in etichette]
    pezzo = {'nodes': [n for n in tutti if n['name'] in nomi], 'connections': {k: v for k, v in etichette_conn.items() if k in nomi}}
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'incolla-etichette-gmail.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(pezzo, ensure_ascii=False, indent=1))
    print('Scritto n8n/da-importare/incolla-etichette-gmail.json (blocco delle etichette Gmail da incollare nel flusso)')
    # Stesso blocco per la casella dell'amministrazione, da incollare nel flusso attivo accanto a quello delle etichette.
    nomi = [n['name'] for n in etichette_amm]
    pezzo = {'nodes': [n for n in tutti if n['name'] in nomi], 'connections': {k: v for k, v in etichette_amm_conn.items() if k in nomi}}
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'incolla-etichette-amministrazione.json'), 'w', encoding='utf-8') as f:
        f.write(json.dumps(pezzo, ensure_ascii=False, indent=1))
    print('Scritto n8n/da-importare/incolla-etichette-amministrazione.json (etichette Gmail della casella amministrazione da incollare nel flusso)')
