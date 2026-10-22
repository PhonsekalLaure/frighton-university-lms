export const LIBRARY_TIME_ZONE = 'Asia/Manila';
export const money = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
export const dateISO = (value: string | Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: LIBRARY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(typeof value === 'string' ? new Date(value) : value);
export const todayISO = () => dateISO(new Date());
export const formatDate = (value: string) => new Intl.DateTimeFormat('en-PH', {
  timeZone: LIBRARY_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric',
}).format(new Date(value.length === 10 ? value + 'T12:00:00+08:00' : value));
export const daysLate = (due: string) => Math.max(0, Math.floor((Date.parse(todayISO()) - Date.parse(due)) / 86400000));
export const getInitials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
export const coverTone = (id: string) => [...id].reduce((tone, character) => (tone + character.charCodeAt(0)) % 4, 0);
