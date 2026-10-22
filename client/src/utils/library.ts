export const money = (amount: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
export const todayISO = () => new Date().toLocaleDateString('en-CA');
export const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
export const daysLate = (due: string) => Math.max(0, Math.floor((new Date(`${todayISO()}T12:00:00`).getTime() - new Date(`${due}T12:00:00`).getTime()) / 86400000));
export const getInitials = (name: string) => name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
