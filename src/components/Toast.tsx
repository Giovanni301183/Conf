import { useCallback, useRef, useState } from 'react';

export function useToast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const t = useRef<number>(undefined);
  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setShow(false), 2600);
  }, []);
  const node = <div className={`toast ${show ? 'show' : ''}`}>{msg}</div>;
  return { toast, node };
}
