document.addEventListener('DOMContentLoaded',()=>{
'use strict';
const K={inv:'freeofis_inventory',cus:'freeofis_customers',sales:'freeofis_sales',pay:'freeofis_payments',biz:'freeofis_business',exp:'freeofis_expenses'};
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const load=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch(e){return d}}, save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const uid=p=>p+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,7), today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const money=n=>'₦'+Number(n||0).toLocaleString('en-NG'), esc=v=>String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));
let inv=load(K.inv,[]), cus=load(K.cus,[]), sales=load(K.sales,[]), pay=load(K.pay,[]), exp=load(K.exp,[]), biz=load(K.biz,{name:'',address:'',phone:'',email:''});

inv=inv.map(x=>({...x,id:x.id||uid('ITEM'),quantity:Number(x.quantity||0),price:Number(x.price||0)}));
save(K.inv,inv);

sales=sales.map(s=>{
if(!Array.isArray(s.items)){
let total=Number(s.total??s.amount??0),q=Number(s.quantity||0);
s={...s,total,paid:s.payment==='credit'?0:total,balance:s.payment==='credit'?total:0,
items:q?[{productId:s.itemId||'',name:s.itemName||s.description||'Previous item',quantity:q,unitPrice:q?total/q:total,subtotal:total}]:[],
customerId:s.customerId||null,method:s.method||s.payment||'cash',status:s.status||'completed',date:s.date||today()}
}
return s});
save(K.sales,sales);

sales.forEach(s=>{
if(s.status==='cancelled'||Number(s.paid||0)<=0)return;
let linked=pay.filter(p=>p.saleId===s.id&&p.status!=='cancelled').reduce((n,p)=>n+Number(p.amount||0),0);
if(Number(s.paid)>linked)pay.push({id:uid('PAY'),customerId:s.customerId||null,saleId:s.id,amount:Number(s.paid)-linked,date:s.date||today(),method:s.method||'cash',reference:s.reference||'',status:'completed'});
});
save(K.pay,pay);

const title=$('#title');
const titles={
home:'Your workspace',business:'Business',student:'Student',media:'Media',office:'Office',
personal:'Personal',records:'Sales & Orders',inventory:'Inventory',customers:'Customers',
credit:'Credit & Debtors',receipts:'Receipts',reports:'Reports',expenses:'Expenses',
settings:'Settings',documents:'Documents',tools:'AI Tools',help:'Help'
};

function section(id,h,d){
if($('#'+id))return;
let m=$('main'),s=document.createElement('section');
s.id=id;s.className='section';
s.innerHTML=`<div class="heading"><h2>${h}</h2><p>${d}</p></div><div id="${id}-content"></div>`;
m.appendChild(s)
}

section('customers','Customers','Customer profiles, purchase history and account balances.');
section('credit','Credit & Debtors','Credit purchases and part payments.');
section('receipts','Receipts','Professional receipts with seller information.');
section('reports','Reports','Sales, payments, expenses and stock performance.');
section('expenses','Expenses','Record business expenses.');

function show(n){
$$('.section').forEach(s=>s.classList.toggle('show',s.id===n));
$$('[data-section]').forEach(x=>x.classList.toggle('active',x.dataset.section===n));
if(title)title.textContent=titles[n]||'Free Ofis';
({business:renderBusiness,records:renderSales,inventory:renderInv,customers:renderCus,credit:renderCredit,receipts:renderReceipts,reports:renderReports,expenses:renderExpenses,settings:renderSettings}[n]||(()=>{}))()
}

function wire(){
$$('[data-section]').forEach(x=>{
if(x.dataset.wired)return;
x.dataset.wired=1;
x.onclick=()=>show(x.dataset.section)
});
$$('.card').forEach(c=>{
if(c.dataset.section||c.dataset.wired)return;
let t=c.textContent.toLowerCase();
let m={'customers':'customers','credit & debtors':'credit','receipts':'receipts','reports':'reports','sales & records':'records','inventory':'inventory'};
for(let k in m)if(t.includes(k)){
c.dataset.wired=1;
c.dataset.section=m[k];
c.onclick=()=>show(m[k]);
break
}
})
}
wire();

const item=id=>inv.find(x=>x.id===id), customer=id=>cus.find(x=>x.id===id);

function balance(cid){
let a=sales.reduce((n,s)=>n+(s.customerId===cid&&s.status!=='cancelled'?Number(s.total||0):0),0);
let b=pay.reduce((n,p)=>n+(p.customerId===cid&&p.status!=='cancelled'?Number(p.amount||0):0),0);
return Math.max(0,a-b)
}

function saleBalance(s){
let p=pay.filter(x=>x.saleId===s.id&&x.status!=='cancelled').reduce((n,x)=>n+Number(x.amount||0),0);
return Math.max(0,Number(s.total||0)-Math.max(Number(s.paid||0),p))
}

function addPay(cid,amt,date=today(),method='cash',ref='',saleId=null){
amt=Number(amt);
if(!cid||amt<=0)return false;
if(saleId){
let s=sales.find(x=>x.id===saleId);
if(!s||s.status==='cancelled'||s.customerId!==cid||amt>saleBalance(s))return false;
}else if(amt>balance(cid))return false;
pay.push({id:uid('PAY'),customerId:cid,saleId,amount:amt,date,method,reference:ref,status:'completed'});
save(K.pay,pay);
return true
}

function renderBusiness(){
let s=$('#business'),r=$('.freeofis-biz',s);
if(!r){r=document.createElement('div');r.className='freeofis-biz';s.appendChild(r)}
r.innerHTML=`
<div class="quick">
<button class="card" id="bs">🧾<b>Sales & Orders</b><small>Sell multiple products and record payments.</small></button>
<button class="card" id="bi">📦<b>Inventory</b><small>Products, quantities, prices and barcodes.</small></button>
<button class="card" id="bc">👥<b>Customers</b><small>Profiles and account balances.</small></button>
<button class="card" id="bd">💳<b>Credit & Debtors</b><small>Credit purchases and part payments.</small></button>
<button class="card" id="br">🧾<b>Receipts</b><small>Seller and customer receipts.</small></button>
<button class="card" id="brep">📊<b>Reports</b><small>Business performance.</small></button>
</div>`;
[['bs','records'],['bi','inventory'],['bc','customers'],['bd','credit'],['br','receipts'],['brep','reports']]
.forEach(([a,b])=>$('#'+a).onclick=()=>show(b))
}

function renderInv(){
let s=$('#inventory'),r=$('.freeofis-inv',s);
if(!r){r=document.createElement('div');r.className='freeofis-inv';s.appendChild(r)}
let units=inv.reduce((n,x)=>n+x.quantity,0),val=inv.reduce((n,x)=>n+x.quantity*x.price,0);

r.innerHTML=`
<div class="panel">
<h3>Items Remaining</h3><strong>${units.toLocaleString()}</strong>
<h3>Stock Value</h3><strong>${money(val)}</strong><br><br>
<button class="primary" id="addstock">+ Add Inventory Item</button>
<div id="if"></div>
</div>
<div class="panel">
<h3>Inventory</h3>
<div id="il">
${inv.length?inv.map(x=>`
<div class="panel">
<b>${esc(x.name)}</b><br>
Quantity: ${x.quantity}<br>
Price: ${money(x.price)}<br>
Stock value: ${money(x.quantity*x.price)}
${x.sku?`<br>SKU/Barcode: ${esc(x.sku)}`:''}<br>
<button data-ie="${x.id}">Edit</button>
<button data-id="${x.id}">Delete</button>
</div>`).join(''):'<p>No inventory items yet.</p>'}
</div>
</div>`;

$('#addstock').onclick=()=>invForm();
$$('[data-ie]',r).forEach(b=>b.onclick=()=>invForm(item(b.dataset.ie)));
$$('[data-id]',r).forEach(b=>b.onclick=()=>{
let used=sales.some(s=>s.status!=='cancelled'&&s.items.some(i=>i.productId===b.dataset.id));
if(used)return alert('This item is already used in a sale. Edit it or set its quantity to 0 instead.');
if(confirm('Delete this inventory item?')){
inv=inv.filter(x=>x.id!==b.dataset.id);
save(K.inv,inv);
renderInv()
}
})
}

function invForm(old=null){
let a=$('#if');
a.innerHTML=`
<form id="invf">
<h3>${old?'Edit':'Add'} Item</h3>
<input id="in" placeholder="Item name" required value="${esc(old?.name||'')}"><br><br>
<input id="iq" type="number" min="0" required value="${old?.quantity??0}"><br><br>
<input id="ip" type="number" min="0" required placeholder="Selling price" value="${old?.price??0}"><br><br>
<input id="is" placeholder="SKU / Barcode" value="${esc(old?.sku||'')}"><br><br>
<button class="primary">Save Item</button>
</form>`;

$('#invf').onsubmit=e=>{
e.preventDefault();
let x={
id:old?.id||uid('ITEM'),
name:$('#in').value.trim(),
quantity:Number($('#iq').value),
price:Number($('#ip').value),
sku:$('#is').value.trim()
};
let i=inv.findIndex(z=>z.id===x.id);
i<0?inv.push(x):inv[i]=x;
save(K.inv,inv);
renderInv()
}
}

function renderSales(){
let s=$('#records'),r=$('.freeofis-sales',s);
if(!r){r=document.createElement('div');r.className='freeofis-sales';s.appendChild(r)}

r.innerHTML=`
<div class="panel">
<button class="primary" id="neworder">+ New Sale / Order</button>
<div id="of"></div>
</div>
<div class="panel">
<h3>Sales & Orders</h3>
<input id="sq" placeholder="Search order, customer or item">
<div id="sl"></div>
</div>`;

$('#neworder').onclick=orderForm;
$('#sq').oninput=renderSaleList;
renderSaleList()
}

function orderForm(){
let a=$('#of');
a.innerHTML=`
<form id="order">
<h3>New Sale / Order</h3>

<label>Date</label><br>
<input id="od" type="date" value="${today()}" required><br><br>

<label>Customer</label><br>
<select id="oc">
<option value="">Walk-in Customer</option>
${cus.map(c=>`<option value="${c.id}">${esc(c.name)}${balance(c.id)?' — owes '+money(balance(c.id)):''}</option>`).join('')}
</select>

<div id="lines"></div>
<button type="button" id="aline">+ Add Item</button>

<p>Total: <b id="tot">₦0</b></p>

<label>Amount paid now</label><br>
<input id="op" type="number" min="0" value="0" required><br><br>

<select id="om">
<option>cash</option>
<option>transfer</option>
<option>pos</option>
<option>other</option>
</select><br><br>

<input id="oref" placeholder="Payment reference"><br><br>

<textarea id="on" placeholder="Notes"></textarea><br><br>

<button class="primary">Complete Sale</button>
</form>`;

addLine();
$('#aline').onclick=addLine;
$('#order').onsubmit=completeSale
}

function addLine(){
let b=$('#lines'),d=document.createElement('div');
d.className='line';
d.innerHTML=`
<select class="prod" required>
<option value="">Select product</option>
${inv.map(x=>`<option value="${x.id}">${esc(x.name)} — ${money(x.price)} — Stock ${x.quantity}</option>`).join('')}
</select>
<input class="qty" type="number" min="1" value="1" style="width:70px">
<button type="button" class="rm">Remove</button><br><br>`;

b.appendChild(d);
$('.prod',d).onchange=updateTotal;
$('.qty',d).oninput=updateTotal;
$('.rm',d).onclick=()=>{d.remove();updateTotal()};
updateTotal()
}

function lines(){
let out=[],err='',need={};
$$('.line').forEach(d=>{
let p=item($('.prod',d).value),q=Number($('.qty',d).value);
if(!p||q<1||!Number.isInteger(q))err='Select a valid item and quantity.';
else{
need[p.id]=(need[p.id]||0)+q;
out.push({productId:p.id,name:p.name,quantity:q,unitPrice:p.price,subtotal:q*p.price})
}
});
if(!err)for(let id in need){
let p=item(id);
if(p&&need[id]>p.quantity){err=`${p.name}: only ${p.quantity} available.`;break}
}
return{out,err}
}

function updateTotal(){
let z=lines(),t=z.out.reduce((n,x)=>n+x.subtotal,0);
if($('#tot'))$('#tot').textContent=money(t);
if($('#op'))$('#op').max=t
}

function completeSale(e){
e.preventDefault();
let z=lines();
if(z.err||!z.out.length)return alert(z.err||'Add at least one item.');

let total=z.out.reduce((n,x)=>n+x.subtotal,0),
paid=Number($('#op').value||0),
cid=$('#oc').value||null;

if(paid>total)return alert('Amount paid cannot exceed the order total.');
if(total-paid>0&&!cid)return alert('Select a customer for a credit balance.');

let s={
id:uid('SALE'),
date:$('#od').value,
customerId:cid,
items:z.out,
total,
paid,
balance:total-paid,
method:paid?$('#om').value:'credit',
reference:$('#oref').value.trim(),
notes:$('#on').value.trim(),
status:'completed'
};

z.out.forEach(x=>item(x.productId).quantity-=x.quantity);
sales.push(s);
if(paid>0)pay.push({id:uid('PAY'),customerId:cid,saleId:s.id,amount:paid,date:s.date,method:s.method,reference:s.reference,status:'completed'});
save(K.sales,sales);
save(K.inv,inv);
save(K.pay,pay);

renderSales();
renderInv();
renderCus();
renderCredit();
renderReports();

alert(`Sale recorded.
Order: ${s.id}
Total: ${money(total)}
Paid: ${money(paid)}
Balance: ${money(s.balance)}`)
}

function renderSaleList(){
let q=($('#sq')?.value||'').toLowerCase(),r=$('#sl');
if(!r)return;

let a=sales.slice().reverse().filter(s=>{
let c=customer(s.customerId)?.name||'walk-in';
return !q||
s.id.toLowerCase().includes(q)||
c.toLowerCase().includes(q)||
s.items.some(i=>i.name.toLowerCase().includes(q))
});

r.innerHTML=a.length?a.map(s=>`
<div class="panel">
<b>${esc(s.id)}</b><br>
${s.date} — ${esc(customer(s.customerId)?.name||'Walk-in Customer')}<br>
${s.items.map(i=>`${esc(i.name)} × ${i.quantity}`).join(', ')}<br>
Total ${money(s.total)} | Paid ${money(s.paid)} | Balance <b>${money(s.balance)}</b><br>
<button data-r="${s.id}">Receipt</button>
${s.balance?`<button data-p="${s.id}">Payment</button>`:''}
<button data-c="${s.id}">Cancel</button>
</div>`).join(''):'<p>No sales/orders found.</p>';

$$('[data-r]',r).forEach(b=>b.onclick=()=>receipt(b.dataset.r));
$$('[data-p]',r).forEach(b=>b.onclick=()=>salePay(b.dataset.p));
$$('[data-c]',r).forEach(b=>b.onclick=()=>cancelSale(b.dataset.c))
}

function salePay(id){
let s=sales.find(x=>x.id===id);
if(!s)return;
let bal=saleBalance(s);
let a=Number(prompt(`Order ${s.id}
Current balance: ${money(bal)}
Payment amount:`));

if(!a||a>bal)return alert('Invalid payment.');

if(!addPay(s.customerId,a,today(),s.method||'cash',s.reference||'',s.id))return alert('Payment could not be recorded.');

s.paid=Number(s.paid||0)+a;
s.balance=Math.max(0,s.total-s.paid);

save(K.sales,sales);
renderSales();
renderCredit();
renderCus();
renderReports();

alert(`Payment recorded. Remaining: ${money(s.balance)}`)
}

function cancelSale(id){
let s=sales.find(x=>x.id===id);
if(!s||s.status==='cancelled')return;

if(!confirm('Cancel this order and restore its stock?'))return;

s.status='cancelled';
pay.filter(p=>p.saleId===s.id&&p.status!=='cancelled').forEach(p=>p.status='cancelled');

s.items.forEach(i=>{
let p=item(i.productId);
if(p)p.quantity+=i.quantity
});

save(K.sales,sales);
save(K.inv,inv);
save(K.pay,pay);
renderSales();
renderInv();
renderCus();
renderCredit();
renderReports()
}

function renderCus(){
let r=$('#customers-content');

r.innerHTML=`
<div class="panel">
<button class="primary" id="nc">+ Add Customer</button>
<div id="cf"></div>
<input id="cq" placeholder="Search customer">
<div id="cl"></div>
</div>`;

$('#nc').onclick=()=>cusForm();
$('#cq').oninput=renderCusList;
renderCusList()
}

function cusForm(old=null){
let a=$('#cf');

a.innerHTML=`
<form id="cusf">
<h3>${old?'Edit':'Add'} Customer</h3>
<input id="cn" placeholder="Customer name" required value="${esc(old?.name||'')}"><br><br>
<input id="cp" placeholder="Phone" value="${esc(old?.phone||'')}"><br><br>
<input id="ca" placeholder="Address" value="${esc(old?.address||'')}"><br><br>
<button class="primary">Save Customer</button>
</form>`;

$('#cusf').onsubmit=e=>{
e.preventDefault();

let x={
id:old?.id||uid('CUS'),
name:$('#cn').value.trim(),
phone:$('#cp').value.trim(),
address:$('#ca').value.trim()
};

let i=cus.findIndex(z=>z.id===x.id);
i<0?cus.push(x):cus[i]=x;

save(K.cus,cus);
renderCus()
}
}

function renderCusList(){
let r=$('#cl'),q=($('#cq')?.value||'').toLowerCase();

r.innerHTML=cus.filter(c=>
c.name.toLowerCase().includes(q)||
(c.phone||'').includes(q)
).map(c=>`
<div class="panel">
<b>${esc(c.name)}</b><br>
${esc(c.phone||'')}<br>
Outstanding: <b>${money(balance(c.id))}</b><br>
<button data-st="${c.id}">Statement</button>
<button data-pp="${c.id}">Record Payment</button>
</div>`).join('')||'<p>No customers found.</p>';

$$('[data-st]',r).forEach(b=>b.onclick=()=>statement(b.dataset.st));
$$('[data-pp]',r).forEach(b=>b.onclick=()=>customerPay(b.dataset.pp))
}

function customerPay(cid){
let c=customer(cid);
if(!c)return;

let a=Number(prompt(`${c.name}
Outstanding: ${money(balance(cid))}
Payment amount:`));

if(!a||a>balance(cid))return alert('Invalid payment.');

let remaining=a;
sales.filter(s=>s.customerId===cid&&s.status!=='cancelled'&&saleBalance(s)>0)
.sort((a,b)=>a.date.localeCompare(b.date))
.forEach(s=>{
if(remaining<=0)return;
let x=Math.min(remaining,saleBalance(s));
if(addPay(cid,x,today(),s.method||'cash',s.reference||'',s.id)){
s.paid=Number(s.paid||0)+x;
s.balance=Math.max(0,s.total-s.paid);
remaining-=x;
}
});
if(remaining>0)return alert('Payment could not be fully recorded.');

save(K.sales,sales);
renderCus();
renderCredit();
renderSales();
renderReports();

alert('Payment recorded.')
}

function statement(cid){
let c=customer(cid),rows=[],run=0;

sales.filter(s=>s.customerId===cid&&s.status!=='cancelled')
.forEach(s=>rows.push({date:s.date,type:'Purchase',d:s.total,c:0}));

pay.filter(p=>p.customerId===cid&&p.status!=='cancelled')
.forEach(p=>rows.push({date:p.date,type:'Payment',d:0,c:p.amount}));

rows.sort((a,b)=>a.date.localeCompare(b.date));

modal(`
<h2>${esc(c.name)} — Statement</h2>
<p>Outstanding: <b>${money(balance(cid))}</b></p>
<table style="width:100%">
<tr><th>Date</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>
${rows.map(x=>{
run+=x.d-x.c;
return`<tr>
<td>${x.date}</td>
<td>${x.type}</td>
<td>${money(x.d)}</td>
<td>${money(x.c)}</td>
<td>${money(run)}</td>
</tr>`
}).join('')}
</table>`)
}

function renderCredit(){
let r=$('#credit-content'),
d=cus.filter(c=>balance(c.id)>0);

r.innerHTML=`
<div class="panel">
<h3>Total Outstanding</h3>
<h2>${money(d.reduce((n,c)=>n+balance(c.id),0))}</h2>
<p>Debtors: ${d.length}</p>
</div>
${d.map(c=>`
<div class="panel">
<b>${esc(c.name)}</b><br>
Owing: <b>${money(balance(c.id))}</b><br>
<button data-st="${c.id}">Statement</button>
<button data-pp="${c.id}">Record Payment</button>
</div>`).join('')}`;

$$('[data-st]',r).forEach(b=>b.onclick=()=>statement(b.dataset.st));
$$('[data-pp]',r).forEach(b=>b.onclick=()=>customerPay(b.dataset.pp))
}

function receipt(id){
let s=sales.find(x=>x.id===id);
if(!s)return;

let c=customer(s.customerId),w=open('','_blank');
if(!w)return alert('Allow pop-ups for receipts.');

w.document.write(`
<html>
<head><title>${s.id}</title></head>
<body style="font-family:Arial;max-width:700px;margin:30px auto">
<h2>${esc(biz.name||'Free Ofis')}</h2>
<p>
${esc(biz.address||'')}<br>
${esc(biz.phone||'')}<br>
${esc(biz.email||'')}
</p>
<hr>
<p>
Receipt: <b>${s.id}</b><br>
Date: ${s.date}<br>
Customer: ${esc(c?.name||'Walk-in Customer')}
</p>

<table border="1" cellspacing="0" cellpadding="8" width="100%">
<tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
${s.items.map(i=>`
<tr>
<td>${esc(i.name)}</td>
<td>${i.quantity}</td>
<td>${money(i.unitPrice)}</td>
<td>${money(i.subtotal)}</td>
</tr>`).join('')}
</table>

<h3>Total: ${money(s.total)}</h3>
<p>
Paid: ${money(s.paid)}<br>
Balance: ${money(s.balance)}<br>
Payment: ${esc(s.method)}
</p>

<script>onload=()=>print()<\/script>
</body>
</html>`);

w.document.close()
}

function renderReceipts(){
let r=$('#receipts-content');

r.innerHTML=`
<div class="panel">
<b>${esc(biz.name||'Seller information not set')}</b><br>
${esc(biz.address||'')}<br>
${esc(biz.phone||'')}<br>
<button class="primary" onclick="document.querySelector('[data-section=settings]').click()">Edit Seller Information</button>
</div>

<div class="panel">
${sales.slice().reverse().slice(0,50).map(s=>`
<p>
${s.date} — ${s.id} — ${money(s.total)}
<button data-r="${s.id}">Print</button>
</p>`).join('')||'<p>No receipts.</p>'}
</div>`;

$$('[data-r]',r).forEach(b=>b.onclick=()=>receipt(b.dataset.r))
}

function renderReports(){
let valid=sales.filter(s=>s.status!=='cancelled'),
st=valid.reduce((n,s)=>n+s.total,0),
received=pay.reduce((n,p)=>n+(p.status!=='cancelled'?Number(p.amount||0):0),0),
deb=cus.reduce((n,c)=>n+balance(c.id),0),
ex=exp.reduce((n,e)=>n+e.amount,0);

$('#reports-content').innerHTML=`
<div class="panel">
<p>Total sales: <b>${money(st)}</b></p>
<p>Payments received: <b>${money(received)}</b></p>
<p>Credit outstanding: <b>${money(deb)}</b></p>
<p>Expenses: <b>${money(ex)}</b></p>
<p>Net cash movement: <b>${money(received-ex)}</b></p>
<p>Orders: <b>${valid.length}</b></p>
</div>`
}

function renderExpenses(){
let r=$('#expenses-content');

r.innerHTML=`
<div class="panel">
<button class="primary" id="ae">+ Add Expense</button>
<div id="ef"></div>
</div>
<div class="panel">
${exp.slice().reverse().map(x=>`${x.date} — ${esc(x.description)} — ${money(x.amount)}`).join('<br>')||'No expenses.'}
</div>`;

$('#ae').onclick=()=>{
$('#ef').innerHTML=`
<form id="exf">
<input id="ed" placeholder="Description" required><br><br>
<input id="ea" type="number" min="0" placeholder="Amount" required><br><br>
<input id="exd" type="date" value="${today()}" required><br><br>
<button class="primary">Save Expense</button>
</form>`;

$('#exf').onsubmit=e=>{
e.preventDefault();

exp.push({
id:uid('EXP'),
description:$('#ed').value,
amount:Number($('#ea').value),
date:$('#exd').value
});

save(K.exp,exp);
renderExpenses()
}
}
}

function renderSettings(){
let s=$('#settings'),r=$('.freeofis-set',s);

if(!r){
r=document.createElement('div');
r.className='freeofis-set';
s.appendChild(r)
}

r.innerHTML=`
<div class="panel">
<h3>Seller / Store Information</h3>
<form id="bf">
<input id="bn" placeholder="Store name" value="${esc(biz.name)}"><br><br>
<input id="ba" placeholder="Address" value="${esc(biz.address)}"><br><br>
<input id="bp" placeholder="Phone" value="${esc(biz.phone)}"><br><br>
<input id="be" placeholder="Email" value="${esc(biz.email)}"><br><br>
<button class="primary">Save</button>
</form>
</div>`;

$('#bf').onsubmit=e=>{
e.preventDefault();

biz={
name:$('#bn').value,
address:$('#ba').value,
phone:$('#bp').value,
email:$('#be').value
};

save(K.biz,biz);
alert('Seller information saved.')
}
}

function modal(h){
let o=document.createElement('div');

o.style='position:fixed;inset:0;background:#0008;z-index:9999;padding:20px;overflow:auto';

o.innerHTML=`
<div style="background:white;max-width:800px;margin:40px auto;padding:24px;border-radius:12px">
<button id="x" style="float:right">Close</button>
${h}
</div>`;

document.body.appendChild(o);
$('#x',o).onclick=()=>o.remove()
}

renderInv();
renderSales();
show('home');
});
