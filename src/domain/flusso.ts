// Flusso delle voci d'agenda fino alla chiusura (migrazione 20261030040000_flusso_voci.sql):
// aperta → in corso («La prendo io») → in attesa (di chi + data del sollecito) → fatta (con l'esito) → chiusa (confermata da chi l'ha creata).
// Annullata (con motivo): sempre l'amministratore; l'autore da solo solo se la voce è ancora intatta, altrimenti chiede l'annullamento.
// Le regole vere le applica il database; qui le stesse per i pulsanti e per l'app senza server.
import type { Scadenza } from './calendario';
import { dNum } from './plan';

export type Stato = 'aperta' | 'in_corso' | 'in_attesa' | 'fatta' | 'chiusa' | 'annullata';
export const STATI: Record<Stato, string> = {
  aperta: 'Da fare', in_corso: 'In corso', in_attesa: 'In attesa', fatta: 'Fatta · da confermare', chiusa: 'Chiusa', annullata: 'Annullata',
};
export const FINITI: Stato[] = ['fatta', 'chiusa', 'annullata'];
/** Dopo tanti rinvii la voce si segnala. */
export const RINVII_TROPPI = 3;
/** Seguono il flusso le cose da fare, le scadenze e le urgenze; appuntamenti e promemoria avvengono e basta. */
export const nelFlusso = (s?: Pick<Scadenza, 'genere'> | null) => !!s && (s.genere === 'attivita' || s.genere === 'scadenza' || s.genere === 'urgenza');
export const statoDi = (s: Pick<Scadenza, 'fatto'> & { stato?: Stato | null }): Stato => s.stato || (s.fatto ? 'chiusa' : 'aperta');
/** Giorno che conta per gli allarmi: per una voce in attesa, la data del sollecito. */
export const giornoAllarme = (s: Scadenza | undefined, giorno: number) => (s && statoDi(s) === 'in_attesa' && s.sollecito ? dNum(s.sollecito) ?? giorno : giorno);
/** Intatta: ancora aperta, senza passaggi, senza note o file e senza messaggi legati. */
export const intatta = (s: Scadenza, nAllegati: number, nMessaggi: number) => statoDi(s) === 'aperta' && !s.passaggi && !nAllegati && !nMessaggi;

/** Cosa può fare chi guarda la voce. segue = l'ha creata, è sua, è coinvolto, o la voce è per chiunque. */
export function azioni(s: Scadenza, me: string, admin: boolean, intatta: boolean) {
  const st = statoDi(s), autore = s.creato_da === me, finita = FINITI.includes(st);
  const segue = autore || admin || s.assegnata_a === me || !!s.coinvolti?.includes(me) || !s.assegnata_a;
  const puoAnnullare = admin || (autore && intatta);
  return {
    prendi: segue && st === 'aperta' && (!s.assegnata_a || s.assegnata_a === me || !!s.coinvolti?.includes(me)),
    attesa: segue && !finita,
    fatta: segue && !finita,
    conferma: st === 'fatta' && (autore || admin),
    riapri: (st === 'fatta' && segue) || ((st === 'chiusa' || st === 'annullata') && (autore || admin)),
    annulla: !finita && puoAnnullare,
    chiediAnnullo: !finita && !puoAnnullare && segue && !s.annullo_chiesto,
    decidiAnnullo: !finita && !!s.annullo_chiesto && admin,
    elimina: admin || (autore && intatta),
  };
}

/** Stessa logica del trigger del database, per l'app senza server: restituisce la voce cambiata o l'errore. */
export function cambia(old: Scadenza, patch: Partial<Scadenza>, me: string, admin: boolean, oggi: string, intatta: boolean): Scadenza | string {
  const n: Scadenza = { ...old, ...patch }, prima = statoDi(old), autore = me === old.creato_da;
  n.stato = patch.stato ?? (patch.fatto !== undefined && patch.fatto !== old.fatto ? (patch.fatto ? 'fatta' : old.assegnata_a ? 'in_corso' : 'aperta') : prima);
  if (n.stato === 'fatta' && prima !== 'fatta' && autore) n.stato = 'chiusa';
  n.fatto = FINITI.includes(n.stato);
  if (n.stato !== prima) {
    if (n.stato === 'annullata' && !admin && !(autore && intatta)) return "Annullare questa voce spetta all'amministratore: chiedi l'annullamento";
    if (prima === 'annullata' && !admin && !autore) return "Una voce annullata la rimettono in agenda solo chi l'ha creata e l'amministratore";
    if (n.stato === 'chiusa' && prima === 'fatta' && !admin && !autore) return "La chiusura la conferma chi ha creato la voce (o l'amministratore)";
    if (prima === 'chiusa' && !admin && !autore) return "Una voce chiusa la riaprono solo chi l'ha creata e l'amministratore";
    if (n.stato !== 'in_attesa') { n.attesa_di = null; n.sollecito = null; }
    if (!FINITI.includes(n.stato) && FINITI.includes(prima)) n.esito = null;
    if (n.stato === 'annullata') { n.annullo_chiesto = null; n.annullo_da = null; }
    n.passaggi = (old.passaggi || 0) + 1;
  }
  if (n.giorno > old.giorno && old.giorno <= oggi && !n.fatto) { n.rinvii = (old.rinvii || 0) + 1; n.passaggi = (n.passaggi || 0) + 1; }
  if (patch.annullo_chiesto !== undefined && patch.annullo_chiesto !== old.annullo_chiesto) {
    if (patch.annullo_chiesto) { n.annullo_da = me || null; n.passaggi = (n.passaggi || 0) + 1; }
    else if (n.stato !== 'annullata') {
      if (!admin && me !== old.annullo_da) return "La richiesta di annullamento la toglie l'amministratore (o chi l'ha fatta)";
      n.annullo_da = null;
    }
  }
  delete n.motivo;
  return n;
}
