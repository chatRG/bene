import { useEffect, useState } from 'react';

type Listener = (msg: string | null) => void;
let listener: Listener | null = null;
let timer: number | undefined;

export function showToast(message: string) {
  if (!listener) return;
  listener(message);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => listener?.(null), 2200);
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    listener = setMessage;
    return () => {
      listener = null;
    };
  }, []);
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
