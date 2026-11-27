// Locale-independent date formatting (no Intl/timezone dependence, so server and client render identically).
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const parts = (iso: string) => iso.split('-').map(Number);
export const fmtDay = (iso: string) => {
  const [y, m, dd] = parts(iso);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
};
export const fmtDayShort = (iso: string) => {
  const [y, m, dd] = parts(iso);
  return `${dd} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
};
export const fmtMonth = (iso: string) => {
  const [y, m] = parts(iso);
  return `${MONTHS[m - 1]} ${y}`;
};
export const fmtMonthShort = (iso: string) => {
  const [y, m] = parts(iso);
  return `${MONTHS[m - 1].slice(0, 3)} ${y}`;
};
export const fmtQuarter = (iso: string) => {
  const [y, m] = parts(iso);
  return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
};
