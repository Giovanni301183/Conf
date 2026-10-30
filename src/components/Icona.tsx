// Icone dell'interfaccia (Lucide, stesso tratto delle icone della barra laterale) al posto delle emoji, che cambiano disegno
// da Windows a iPhone. Le emoji restano solo nei testi che escono dall'app (Telegram, email) e nei dati salvati.
import type { SVGProps } from 'react';
import {
  AlarmClock, Bell, BellOff, Calendar, ChartColumn, ChartPie, CircleCheck, Compass, Construction, Eye, Factory, FileText, Handshake,
  HardHat, Inbox, Link, Lock, Mail, MapPin, MessageCircle, Mic, Microscope, NotebookPen, PartyPopper, Paperclip, Pin, Ruler, Search,
  Send, ShoppingCart, TriangleAlert, Truck, User, Users, Video, Wrench, Bolt, Sun, Warehouse, Grape, Fence, Sparkles, Hand, Hourglass,
  RotateCcw, Ban, History, CheckCheck, type LucideIcon,
} from 'lucide-react';

const ICONE = {
  cerca: Search, allega: Paperclip, chat: MessageCircle, email: Mail, lega: Pin, collega: Link, vocale: Mic, nota: NotebookPen,
  persone: Users, persona: User, smistare: Inbox, voce: AlarmClock, avvisi: Bell, muto: BellOff, vedi: Eye, grafico: ChartColumn,
  video: Video, telegram: Send, fatto: CircleCheck, luogo: MapPin, giorno: Calendar, preventivo: FileText, articolo: Bolt,
  festa: PartyPopper, attenzione: TriangleAlert, privato: Lock,
  prendo: Hand, attesa: Hourglass, riapri: RotateCcw, annulla: Ban, storico: History, conferma: CheckCheck,
} satisfies Record<string, LucideIcon>;
export type NomeIcona = keyof typeof ICONE;

const REPARTO: Record<string, LucideIcon> = {
  direzione: Compass, commerciale: Handshake, tecnico: Ruler, rs: Microscope, acquisti: ShoppingCart, produzione: Factory,
  qualita: HardHat, logistica: Truck, cantiere: Construction, assistenza: Wrench, amministrazione: ChartPie, hr: Users, smistare: Inbox,
};

const SETTORE: Record<string, LucideIcon> = { energia: Sun, serre: Warehouse, vigneti: Grape, recinzioni: Fence, speciali: Sparkles };

type Props = { s?: number } & Omit<SVGProps<SVGSVGElement>, 'ref'>;
const props = ({ s = 14, className, ...p }: Props) => ({ size: s, strokeWidth: 1.9, className: 'ic' + (className ? ' ' + className : ''), 'aria-hidden': true, ...p });

/** Icona per nome: <Ic n="allega" />. Si allinea al testo accanto (classe .ic). */
export function Ic({ n, ...p }: { n: NomeIcona } & Props) { const C = ICONE[n]; return <C {...props(p)} />; }
/** Icona di un reparto (chiavi di domain/reparti.ts, più «smistare»). */
export function IcReparto({ k, ...p }: { k: string } & Props) { const C = REPARTO[k] || Inbox; return <C {...props(p)} />; }
/** Icona di un settore della mappa (energia, serre, vigneti, recinzioni, speciali). */
export function IcSettore({ k, ...p }: { k: string } & Props) { const C = SETTORE[k] || Sparkles; return <C {...props(p)} />; }
