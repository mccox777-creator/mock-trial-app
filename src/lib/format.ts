const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(s: string) {
  const [d, t] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = (t ?? '00:00').split(':').map(Number);
  return { y, m, day, hh, mm };
}

export function fmtDate(s: string) {
  const { y, m, day } = parts(s);
  return `${MONTHS[m - 1]} ${day}, ${y}`;
}

export function fmtRange(a: string, b: string) {
  const A = parts(a);
  const B = parts(b);
  if (A.y === B.y && A.m === B.m) return `${MONTHS[A.m - 1]} ${A.day}–${B.day}, ${A.y}`;
  return `${fmtDate(a)} – ${fmtDate(b)}`;
}

export function fmtTime(s: string) {
  const { hh, mm } = parts(s);
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
}

export function fmtDateTime(s: string) {
  return `${fmtDate(s)}, ${fmtTime(s)}`;
}

export function dayBlock(s: string) {
  const { m, day } = parts(s);
  return { mon: MONTHS[m - 1].toUpperCase(), day: String(day) };
}

/** Local "now" as YYYY-MM-DDTHH:MM, comparable with stored strings. */
export function nowLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function todayLocal() {
  return nowLocal().slice(0, 10);
}

export function isValidDate(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export function isValidDateTime(s: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
}

export function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

export function ballotsText(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
