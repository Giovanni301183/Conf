// Pannelli sulla destra (assistente e chat di squadra): uno alla volta. Aprendone uno si chiude l'altro.
export const PANNELLO = 'pannello-destra';
export const apriPannello = (nome: string) => window.dispatchEvent(new CustomEvent(PANNELLO, { detail: nome }));
// Apre la chat di squadra nella stanza di una commessa (null = Generale), per esempio dalla scheda Documenti.
export const APRI_CHAT = 'apri-squadra';
export const apriChat = (stanza: string | null) => window.dispatchEvent(new CustomEvent(APRI_CHAT, { detail: stanza }));
