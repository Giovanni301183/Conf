// Pannelli sulla destra (assistente e chat di squadra): uno alla volta. Aprendone uno si chiude l'altro.
export const PANNELLO = 'pannello-destra';
export const apriPannello = (nome: string) => window.dispatchEvent(new CustomEvent(PANNELLO, { detail: nome }));
// Apre la chat di squadra nella stanza di una commessa (null = Generale), per esempio dalla scheda Documenti.
export const APRI_CHAT = 'apri-squadra';
export const apriChat = (stanza: string | null) => window.dispatchEvent(new CustomEvent(APRI_CHAT, { detail: stanza }));
// Apre l'assistente con una domanda già scritta (dalla ricerca in alto): la si può correggere e si preme Invia.
export const CHIEDI_AI = 'chiedi-assistente';
export const chiediAI = (testo: string) => window.dispatchEvent(new CustomEvent(CHIEDI_AI, { detail: testo }));
// Apre in primo piano una nota (doc) o una voce d'agenda (voce), per esempio dalla ricerca: vedi SchedaAperta.
export const APRI_SCHEDA = 'apri-scheda';
export type Aperta = { tipo: 'doc' | 'voce'; id: string };
export const apriScheda = (a: Aperta) => window.dispatchEvent(new CustomEvent(APRI_SCHEDA, { detail: a }));
