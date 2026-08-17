export function formatMoney(minor,currency='NGN',locale='en'){if(minor===null||minor===undefined)return'Unknown';if(!Number.isSafeInteger(minor))throw new TypeError('Money must use integer minor units.');return new Intl.NumberFormat(locale,{style:'currency',currency}).format(minor/100)}
export const formatQuantity=value=>new Intl.NumberFormat(undefined,{maximumFractionDigits:3}).format(value);
export const formatDateTime=(value,timeZone='UTC')=>new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone}).format(new Date(value));
export const formatStatus=value=>String(value||'unknown').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
