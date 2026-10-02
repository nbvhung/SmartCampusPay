'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

const key = 'scp.theme';
const eventName = 'scp-theme';
function subscribe(callback: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const update = () => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(key) ?? localStorage.getItem('scp.login.theme'); } catch { /* system preference */ }
    document.documentElement.dataset.theme = saved === 'light' || saved === 'dark' ? saved : media.matches ? 'dark' : 'light';
    callback();
  };
  const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) update(); };
  window.addEventListener(eventName, callback);
  window.addEventListener('storage', storage);
  media.addEventListener('change', update);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener('storage', storage);
    media.removeEventListener('change', update);
  };
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', () => 'light');
  const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(key, next); } catch { /* session still works */ }
    window.dispatchEvent(new Event(eventName));
  }
  return <button className="theme-toggle" type="button" onClick={toggle} aria-label={label} title={label}>
    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}<span>{theme === 'dark' ? 'Sáng' : 'Tối'}</span>
  </button>;
}
