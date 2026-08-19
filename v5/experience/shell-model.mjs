export const greetingForHour=hour=>hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
export function parseRoute(hash=''){const value=hash.replace(/^#/,'')||'home',[page,id]=value.split('/');return{page,id:id||null}}
