"""Genera i due flussi n8n dell'agenda su Telegram (da importare in n8n: Workflows → Import from file).

  n8n/agenda-chat-telegram.json      chat con l'assistente, pulsanti "Me ne occupo"/"Risolto", /collega e /id
  n8n/agenda-avvisi-riepilogo.json   avviso nel gruppo delle voci nuove (dal database) e riepilogo del mattino

Uso:  python scripts/n8n-flussi.py [indirizzo dell'app]
      (predefinito: anteprima del branch calendario; per la produzione: https://conf-five.vercel.app)
Segreti e token non stanno qui: si inseriscono in n8n (credenziali e nodo "Impostazioni").
"""
import json, os, sys, uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = (sys.argv[1] if len(sys.argv) > 1 else 'https://conf-git-calendario-giovanne.vercel.app').rstrip('/')
# L'anteprima Vercel e' protetta: n8n entra con il codice "Protection Bypass for Automation". In produzione non serve.
API = BASE + '/api/agenda' + ('' if 'conf-five' in BASE else '?x-vercel-protection-bypass=INSERISCI_CODICE_BYPASS')

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
- Nel dubbio tra "uno già fatto" e "uno nuovo" (es. solo "preventivo per Rossi"), cerca prima con cerca_commesse: se Rossi ha già preventivi, chiedi se vuole uno di quelli o uno nuovo.
- Preventivo nuovo ("fammi un preventivo per Rossi Srl", "prepara un preventivo", /preventivo Rossi): usa SEMPRE modulo_preventivo con il nome del cliente detto dall'operatore, senza fare domande sui dati. L'operatore compila il modulo, controlla l'anteprima e lo invia da lì. Rispondi solo che il pulsante «Compila preventivo» è in chat privata.
- Per correggere un preventivo già fatto con il modulo usa modulo_preventivo con il suo id (da cerca_commesse). Solo per una modifica piccola e chiara (es. "metti il margine al 20 %" sul preventivo 2026/012) usa prepara_preventivo con l'id e i soli campi da cambiare, dopo aver ripetuto la modifica e avuto conferma. Per rimandare l'offerta così com'è usa invia_offerta.
- Il riferimento (rif) è solo il nome breve dell'impianto, il titolo della copertina: mai note o dati tecnici. Profilo (IPE/IPEA), asse (2,5/3,0 mm), omega (2,0/1,8 mm), fondazione e cuscinetto in metri vanno nei campi delle righe.
- Layout: se un messaggio ha [allegato: …] è un file o una foto mandati al bot. Se è il layout dell'impianto, mettilo nel preventivo giusto con carica_layout (file_id e nome dall'allegato; se il preventivo non è chiaro chiedi quale, cercandolo con cerca_commesse). Per un preventivo nuovo passa file_id e file_nome a prepara_preventivo: da un DXF i tracker si contano da soli, falli confermare. Il DXF va mandato come file, non come foto. Nell'immagine fatta dal DXF le scritte non compaiono. L'allegato resta valido anche nei messaggi dopo.
- Email da un appunto ("manda a Rossi l'aggiornamento della nota sui pali"): trova l'appunto con cerca_appunti (parole del titolo o della commessa; per una commessa passa anche preventivo_id da cerca_commesse); se ce n'è più di uno plausibile chiedi quale, elencando titolo e data. Poi usa email_da_appunto con l'id, le indicazioni dette (a chi, tono, cose da aggiungere) e l'indirizzo se lo conosci. Email senza appunto ("preparami una mail a Rossi per dire che il montaggio slitta al 10"): NON cercare appunti, usa subito email_da_appunto senza id, con il contenuto detto dall'operatore in appunto (e preventivo_id se cita una commessa). La bozza arriva in chat privata con i pulsanti per aprirla nell'app Gmail del telefono o in Gmail dal computer: non riscriverne il testo in chat (nel gruppo mai). Nessuna email parte da sola: la invia l'operatore da Gmail.
- Più preventivi per lo stesso cliente che cambiano solo il materiale ("fammi un preventivo IPEA con asse 2,5, uno IPEA con asse 3 e uno IPE con asse 2,5"): ogni combinazione la dice l'operatore, non aggiungerne e non indovinarne. Serve un preventivo base già salvato con tracker, località e margini: se non c'è manda il modulo (modulo_preventivo) per compilarlo con la prima combinazione e chiedi di riscriverti quando l'ha creato; se c'è, trovalo con cerca_commesse. Ripeti l'elenco delle combinazioni, una per riga, e chiedi conferma; poi usa crea_varianti con l'id del base e l'elenco. Ogni variante diventa un preventivo con il suo numero (successivo); in chat privata arrivano le offerte PDF del base e di tutte le varianti. Riporta il confronto (testo) e gli avvisi.
- Il listino non si modifica da qui: se te lo chiedono, rispondi che si cambia nell'app (scheda Listino).
- Dopo un preventivo riporta il riepilogo dello strumento (testo), gli avvisi importanti e se l'offerta è arrivata in privato. Costi e margini solo a chi li ha chiesti: non scriverli mai nel gruppo, lì dì solo che l'offerta è in privato.
- Rispondi breve, testo semplice senza Markdown. Dopo aver registrato qualcosa, riassumi cosa hai salvato."""

# ---------- Flusso 1: chat ----------
chat = [
    node('Telegram Trigger', 'n8n-nodes-base.telegramTrigger', 1.2, [0, 300], {'updates': ['message', 'callback_query'], 'additionalFields': {}}, TG),
    impostazioni('Impostazioni', [220, 300]),
    node('È un pulsante?', 'n8n-nodes-base.if', 2.2, [440, 300], cond('!!$json.callback_query')),
    # Pulsanti sotto gli avvisi del gruppo: "prendi:<id>" e "risolvi:<id>".
    http('Pulsante → app', [680, 120], "{ azione: $json.callback_query.data.split(':')[0], id: $json.callback_query.data.split(':')[1], telegram_id: $json.callback_query.from.id }"),
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
       for t in ['chi_sono', 'cerca_commesse', 'colleghi', 'leggi_agenda', 'crea_voce', 'modifica_voce', 'collega_account', 'prepara_preventivo', 'invia_offerta', 'carica_layout', 'modulo_preventivo', 'cerca_appunti', 'email_da_appunto', 'crea_varianti']},
}

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
]
avvisi_conn = {
    'Voce nuova (Supabase)': {'main': [to('È un inserimento?')]}, 'È un inserimento?': {'main': [to('Impostazioni'), []]},
    'Impostazioni': {'main': [to('Annuncio → app')]}, 'Annuncio → app': {'main': [to('Da annunciare?')]},
    'Da annunciare?': {'main': [to('Annuncia nel gruppo'), []]},
    'Ogni mattina lun-ven 8:00': {'main': [to('Impostazioni riepilogo')]}, 'Impostazioni riepilogo': {'main': [to('Riepilogo → app')]},
    'Riepilogo → app': {'main': [to('Riepilogo nel gruppo')]},
}

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
                                   ('Agenda - Avvisi e riepilogo', avvisi, avvisi_conn, 'agenda-avvisi-riepilogo.json')]:
        t = json.dumps({'name': nome, 'nodes': nodi, 'connections': conn, 'settings': SETTINGS, 'pinData': {}}, ensure_ascii=False, indent=1)
        with open(os.path.join(ROOT, cartella, file), 'w', encoding='utf-8') as f:
            f.write(t.replace('INSERISCI_CODICE_BYPASS', sost) if sost else t)
        print('Scritto ' + os.path.join(cartella, file).replace(os.sep, '/'))

# ---------- Un unico flusso completo, pronto all'uso (solo in n8n/da-importare/) ----------
# Segreto e bypass gia' dentro: in n8n restano da collegare solo il token Telegram e la chiave del modello,
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
    tutti = json.loads(json.dumps(chat)) + av
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
    t = json.dumps({'name': 'Agenda Terranova - Telegram', 'nodes': tutti, 'connections': {**chat_conn, **av_conn}, 'settings': SETTINGS, 'pinData': {}},
                   ensure_ascii=False, indent=1).replace('INSERISCI_CODICE_BYPASS', BYPASS)
    with open(os.path.join(ROOT, 'n8n', 'da-importare', 'agenda-completo.json'), 'w', encoding='utf-8') as f: f.write(t)
    print('Scritto n8n/da-importare/agenda-completo.json (flusso unico, con segreto e bypass)')
