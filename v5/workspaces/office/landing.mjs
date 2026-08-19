const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const empty=(items,message,render)=>items.length?items.map(render).join(''):`<p class="empty">${message}</p>`;
const card=(title,detail='')=>`<article class="office-item"><strong>${escape(title)}</strong>${detail?`<span>${escape(detail)}</span>`:''}</article>`;
export async function renderOfficeLanding(host,{platform,token,workspace,context}){
  const scope={ownerType:workspace.ownerType,ownerId:workspace.ownerId,organisationId:workspace.organisationId,unitId:workspace.unitId,workspaceId:workspace.id},home=await platform.office.home(token,scope);
  host.innerHTML=`<section class="office-head"><a class="back-link" href="#home">← Free Ofis Home</a><p class="eyebrow">${escape(context.label)}${context.detail?` · ${escape(context.detail)}`:''}</p><h1>My Office</h1><p>What needs attention, what is moving, and what must be remembered.</p></section><nav class="office-tabs" aria-label="My Office sections">${['Home','My Work','Correspondence','Documents','Meetings','Projects','People','Records'].map(x=>`<button type="button" data-office-section="${x.toLowerCase().replace(' ','-')}">${x}</button>`).join('')}</nav><div id="office-content" aria-live="polite"></div>`;
  const output=host.querySelector('#office-content');
  const renderHome=()=>{output.innerHTML=`<div class="office-grid"><section class="section"><h2>Needs attention</h2>${empty([...home.overdue,...home.dueToday],'No work is due today.',x=>card(x.title,x.dueAt?`Due ${new Date(x.dueAt).toLocaleString()}`:''))}</section><section class="section"><h2>Correspondence</h2>${empty(home.pendingCorrespondence,'No correspondence yet. Record an incoming or outgoing item when your office starts handling correspondence.',x=>card(x.subject,`${x.direction} · ${x.status.replace('_',' ')}`))}</section><section class="section"><h2>Upcoming meetings</h2>${empty(home.upcomingMeetings,'No meetings coming up.',x=>card(x.title,new Date(x.startAt).toLocaleString()))}</section><section class="section"><h2>Active projects</h2>${empty(home.activeProjects,'No active projects yet.',x=>card(x.title))}</section></div>`};
  const sections={
    'my-work':async()=>['My Work',await platform.sharedWork.list(token,'task',scope),'No office work yet.'],
    correspondence:async()=>['Correspondence',await platform.office.listCorrespondence(token,scope),'No correspondence yet.'],
    documents:async()=>['Documents',await platform.sharedWork.list(token,'document',scope),'No office documents yet.'],
    meetings:async()=>['Meetings',await platform.sharedWork.list(token,'event',scope),'No meetings scheduled.'],
    projects:async()=>['Projects',await platform.sharedWork.list(token,'project',scope),'No active projects yet.'],
    people:async()=>['People',await platform.sharedWork.list(token,'person',scope),'No office contacts yet.'],
    records:async()=>['Records',await platform.sharedWork.list(token,'record',scope),'No retained office records yet.']
  };
  host.querySelector('.office-tabs').addEventListener('click',async event=>{const key=event.target.dataset.officeSection;if(!key)return;if(key==='home'){renderHome();return}const[title,items,message]=await sections[key]();output.innerHTML=`<section class="section"><h2>${title}</h2>${empty(items,message,item=>card(item.title||item.subject||item.displayName,item.status||item.direction||''))}</section>`});
  renderHome();
}
