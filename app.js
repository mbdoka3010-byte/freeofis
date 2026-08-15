document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* =========================================================
     FREE OFIS - CONSOLIDATED APP.JS
     ========================================================= */

  const K = {
    inv: 'freeofis_inventory',
    cus: 'freeofis_customers',
    sales: 'freeofis_sales',
    pay: 'freeofis_payments',
    biz: 'freeofis_business',
    exp: 'freeofis_expenses'
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const load = (key, fallback) => {
    try {
      return JSON.parse(
        localStorage.getItem(key) || JSON.stringify(fallback)
      );
    } catch (e) {
      return fallback;
    }
  };

  const save = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Free Ofis storage error:', e);
      alert('Free Ofis could not save this change. Please check available browser storage.');
      return false;
    }
  };

  const uid = prefix =>
    prefix +
    '-' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 7);

  /* =========================================================
     DATE / TIME
     ========================================================= */

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function localDateTime() {
    const d = new Date();

    return (
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes()) +
      ':' +
      pad(d.getSeconds())
    );
  }

  function today() {
    return localDateTime().slice(0, 10);
  }

  function timeNow() {
    return localDateTime().slice(11, 16);
  }

  function transactionTimestamp(date, time) {
    const d = date || today();
    const t = time || timeNow();

    return `${d}T${t}:00`;
  }

  function formatDateTime(value) {
    if (!value) return '';

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) {
      return String(value);
    }

    return (
      d.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }) +
      ' ' +
      d.toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit'
      })
    );
  }

  function transactionDate(value) {
    if (!value) return today();

    if (String(value).includes('T')) {
      return String(value).slice(0, 10);
    }

    return String(value);
  }

  function transactionTime(value) {
    if (!value) return '';

    if (String(value).includes('T')) {
      return String(value).slice(11, 16);
    }

    return '';
  }

  /* =========================================================
     GENERAL HELPERS
     ========================================================= */

  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const roundMoney = v =>
    Math.round((num(v) + Number.EPSILON) * 100) / 100;

  const money = n =>
    '₦' +
    roundMoney(n).toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });

  /* Monetary tolerance for floating-point comparisons (kobo-level). */
  const MONEY_EPSILON = 0.01;

  const esc = v =>
    String(v ?? '').replace(
      /[&<>'"]/g,
      m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#039;',
        '"': '&quot;'
      })[m]
    );

  const norm = v =>
    String(v || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

  let inv = load(K.inv, []);
  let cus = load(K.cus, []);
  let sales = load(K.sales, []);
  let pay = load(K.pay, []);
  let exp = load(K.exp, []);

  let biz = load(K.biz, {
    name: '',
    address: '',
    phone: '',
    email: ''
  });

  /* =========================================================
     BASIC DATA NORMALISATION
     ========================================================= */

  inv = Array.isArray(inv)
    ? inv.map(x => ({
        ...x,
        id: x.id || uid('ITEM'),
        name: x.name || 'Unnamed Item',
        quantity: Number(x.quantity || 0),
        price: Number(x.price || 0),
        sku: x.sku || '',
        lowStock: Math.max(0, num(x.lowStock ?? 5))
      }))
    : [];

  cus = Array.isArray(cus)
    ? cus.map(x => ({
        ...x,
        id: x.id || uid('CUS'),
        name: x.name || 'Unnamed Customer',
        phone: x.phone || '',
        address: x.address || ''
      }))
    : [];

  sales = Array.isArray(sales) ? sales : [];
  pay = Array.isArray(pay) ? pay : [];
  exp = Array.isArray(exp) ? exp : [];

  /* =========================================================
     LEGACY SALES MIGRATION
     ========================================================= */

  sales = sales.map(s => {
    if (!s || typeof s !== 'object') return null;

    if (!Array.isArray(s.items)) {
      const total = Number(s.total ?? s.amount ?? 0);
      const q = Number(s.quantity || 0);

      s = {
        ...s,
        id: s.id || uid('SALE'),
        total,
        paid: s.payment === 'credit' ? 0 : total,
        balance: s.payment === 'credit' ? total : 0,

        items: q
          ? [
              {
                productId: s.itemId || '',
                name: s.itemName || s.description || 'Previous item',
                quantity: q,
                unitPrice: q ? total / q : total,
                subtotal: total
              }
            ]
          : [],

        customerId: s.customerId || null,
        method: s.method || s.payment || 'cash',
        reference: s.reference || '',
        notes: s.notes || '',
        status: s.status || 'completed',
        date: s.date || today()
      };
    }

    const date = transactionDate(s.transactionAt || s.date);
    const time =
      transactionTime(s.transactionAt) ||
      s.time ||
      '00:00';

    return {
      ...s,
      id: s.id || uid('SALE'),
      date,
      time,
      transactionAt:
        s.transactionAt || transactionTimestamp(date, time),
      total: Number(s.total || 0),
      paid: Number(s.paid || 0),
      balance: Number(s.balance || 0),
      customerId: s.customerId || null,
      status: s.status || 'completed'
    };
  }).filter(Boolean);

  /* =========================================================
     PAYMENT MIGRATION
     ========================================================= */

  pay = pay
    .filter(Boolean)
    .map(p => {
      const date = transactionDate(p.transactionAt || p.date);
      const time =
        transactionTime(p.transactionAt) ||
        p.time ||
        '00:00';

      return {
        ...p,
        id: p.id || uid('PAY'),
        customerId: p.customerId || null,
        saleId: p.saleId || null,
        amount: Number(p.amount || 0),
        date,
        time,
        transactionAt:
          p.transactionAt || transactionTimestamp(date, time),
        method: p.method || 'cash',
        reference: p.reference || '',
        status: p.status || 'completed'
      };
    })
    .filter(p => p.amount > 0);

  /* =========================================================
     VERSIONED DATA MIGRATION / REPAIR
     Runs only when freeofis_data_version is below current.
     Never deletes existing payments. Ambiguous unlinked
     payments are left unlinked rather than guessed onto a sale.
     ========================================================= */

  const DATA_VERSION = 3;
  let dataVersion = Number(
    localStorage.getItem('freeofis_data_version') || 0
  );
  let migrationChanged = false;

  if (dataVersion < DATA_VERSION) {
    // Repair legacy payment links and normalize financial fields.
    // Existing records are preserved; ambiguous payments are never guessed onto sales.
    sales.forEach(s => {
      if (!s || s.status === 'cancelled') return;

      s.total = roundMoney(s.total);
      s.items = Array.isArray(s.items) ? s.items.map(i => ({
        ...i,
        quantity: Math.max(0, num(i.quantity)),
        unitPrice: roundMoney(i.unitPrice),
        subtotal: roundMoney(num(i.quantity) * num(i.unitPrice))
      })) : [];

      const linked = pay
        .filter(p => p.saleId === s.id && p.status !== 'cancelled')
        .reduce((n, p) => n + num(p.amount), 0);

      s.paid = roundMoney(linked);
      s.balance = roundMoney(Math.max(0, s.total - linked));
    });

    pay = pay.map(p => {
      const sale = p.saleId ? sales.find(s => s.id === p.saleId) : null;
      return {
        ...p,
        amount: roundMoney(p.amount),
        customerId: p.customerId || sale?.customerId || null
      };
    });

    exp = exp.map(e => ({
      ...e,
      amount: Math.max(0, roundMoney(e.amount))
    }));

    // Repair sales that record a paid amount but have no
    // corresponding payment record. We only create a payment
    // when the sale itself is the source of truth (s.paid > 0
    // and no already-linked payments). We do NOT attempt to
    // match unlinked payments by customer+amount+date because
    // that matching is non-deterministic when a customer has
    // multiple same-amount orders on the same day.
    sales.forEach(s => {
      if (!s || s.status === 'cancelled') return;

      const linked = pay
        .filter(
          p =>
            p.saleId === s.id &&
            p.status !== 'cancelled'
        )
        .reduce((n, p) => n + Number(p.amount || 0), 0);

      if (Number(s.paid || 0) > 0 && linked === 0) {
        pay.push({
          id: uid('PAY'),
          customerId: s.customerId || null,
          saleId: s.id,
          amount: roundMoney(s.paid),
          date: transactionDate(s.transactionAt || s.date),
          time: transactionTime(s.transactionAt) || '00:00',
          transactionAt:
            s.transactionAt ||
            transactionTimestamp(
              transactionDate(s.date),
              transactionTime(s.transactionAt) || '00:00'
            ),
          method: s.method || 'cash',
          reference: s.reference || '',
          status: 'completed'
        });
        migrationChanged = true;
      }
    });

    // Recompute cached payment fields after any repair-created payments.
    sales.forEach(s => {
      if (!s || s.status === 'cancelled') return;
      syncSalePaymentFields(s);
    });

    localStorage.setItem(
      'freeofis_data_version',
      String(DATA_VERSION)
    );
    migrationChanged = true;
  }

  // Persist only when normalisation or migration actually changed data.
  // (Normalisation above may have added missing ids / defaults.)
  if (migrationChanged || dataVersion < DATA_VERSION) {
    save(K.inv, inv);
    save(K.cus, cus);
    save(K.sales, sales);
    save(K.pay, pay);
    save(K.exp, exp);
    save(K.biz, biz);
  }

  /* =========================================================
     TITLES
     ========================================================= */

  const title = $('#title');

  const titles = {
    home: 'Your workspace',
    business: 'Business',
    student: 'Student',
    media: 'Media',
    office: 'Office',
    personal: 'Personal',
    records: 'Sales & Orders',
    inventory: 'Inventory',
    customers: 'Customers',
    credit: 'Credit & Debtors',
    receipts: 'Receipts',
    reports: 'Reports',
    expenses: 'Expenses',
    settings: 'Settings',
    documents: 'Documents',
    tools: 'AI Tools',
    help: 'Help'
  };

  /* =========================================================
     DYNAMIC SECTIONS
     ========================================================= */

  function section(id, heading, description) {
    if ($('#' + id)) return;

    const main = $('main');

    const s = document.createElement('section');

    s.id = id;
    s.className = 'section';

    s.innerHTML = `
      <div class="heading">
        <h2>${heading}</h2>
        <p>${description}</p>
      </div>

      <div id="${id}-content"></div>
    `;

    main.appendChild(s);
  }

  section(
    'customers',
    'Customers',
    'Customer profiles, purchase history and account balances.'
  );

  section(
    'credit',
    'Credit & Debtors',
    'Credit purchases and part payments.'
  );

  section(
    'receipts',
    'Receipts',
    'Professional receipts with seller information.'
  );

  section(
    'reports',
    'Reports',
    'Sales, payments, expenses and stock performance.'
  );

  section(
    'expenses',
    'Expenses',
    'Record business expenses.'
  );

  // These sections are created only when the host HTML does not already provide them.
  // This lets Free Ofis grow into a multi-workspace platform without breaking the existing shell.
  section('student', 'Student', 'Study, assignments, notes and personal academic records.');
  section('media', 'Media', 'Content planning, clients, publications and media workflows.');
  section('office', 'Office', 'Documents, tasks, contacts and everyday office administration.');
  section('personal', 'Personal', 'Personal records, planning and lightweight organization.');

  /* =========================================================
     NAVIGATION + INTERNAL HISTORY STACK
     =========================================================
     - navigate(id) pushes onto the stack (unless already top)
     - show(id, {replace:true}) or goBack() does not push
     - rendering a view never auto-pushes
     - Back is hidden/disabled at the root of the stack
     - hierarchy example: business → records → (customer modal)
       → order → payment. Main sections use this stack.
  */

  const navStack = [];
  let currentSection = 'home';

  function updateBackUI() {
    let btn = $('#freeofis-back');
    if (!btn) {
      const topbar = $('.topbar');
      if (topbar) {
        btn = document.createElement('button');
        btn.id = 'freeofis-back';
        btn.type = 'button';
        btn.textContent = '← Back';
        btn.style.cssText =
          'margin-right:12px;padding:6px 12px;cursor:pointer;';
        topbar.insertBefore(btn, topbar.firstChild);
        btn.onclick = () => goBack();
      }
    }
    if (btn) {
      const canGoBack = navStack.length > 1;
      btn.style.display = canGoBack ? '' : 'none';
      btn.disabled = !canGoBack;
    }
  }

  function show(id, opts = {}) {
    const replace = !!opts.replace;
    const isBack = !!opts.back;

    $$('.section').forEach(s =>
      s.classList.toggle('show', s.id === id)
    );

    $$('[data-section]').forEach(x =>
      x.classList.toggle(
        'active',
        x.dataset.section === id
      )
    );

    if (title) {
      title.textContent = titles[id] || 'Free Ofis';
    }

    currentSection = id;

    if (!isBack && !replace) {
      if (navStack[navStack.length - 1] !== id) {
        navStack.push(id);
      }
    }

    updateBackUI();

    const renders = {
      home: renderHome,
      business: renderBusiness,
      student: renderStudent,
      media: renderMedia,
      office: renderOffice,
      personal: renderPersonal,
      records: renderSales,
      inventory: renderInv,
      customers: renderCus,
      credit: renderCredit,
      receipts: renderReceipts,
      reports: renderReports,
      expenses: renderExpenses,
      settings: renderSettings
    };

    if (renders[id]) renders[id]();
  }

  function navigate(id) {
    show(id); // pushes
  }

  function goBack() {
    if (navStack.length <= 1) return;
    navStack.pop();
    const prev = navStack[navStack.length - 1] || 'home';
    show(prev, { back: true });
  }

  function wire() {
    $$('[data-section]').forEach(x => {
      if (x.dataset.wired) return;

      x.dataset.wired = '1';

      x.onclick = () => navigate(x.dataset.section);
    });

    $$('.card').forEach(card => {
      if (card.dataset.section || card.dataset.wired)
        return;

      const text = card.textContent.toLowerCase();

      const map = {
        customers: 'customers',
        'credit & debtors': 'credit',
        receipts: 'receipts',
        reports: 'reports',
        'sales & orders': 'records',
        inventory: 'inventory'
      };

      for (const key in map) {
        if (text.includes(key)) {
          card.dataset.wired = '1';
          card.dataset.section = map[key];
          card.onclick = () => navigate(map[key]);
          break;
        }
      }
    });
  }

  wire();

  /* =========================================================
     HOME / WORKSPACE OVERVIEW
     ========================================================= */

  function renderHome() {
    const root = $('#home');
    if (!root) return;

    let r = $('.freeofis-home', root);
    if (!r) {
      r = document.createElement('div');
      r.className = 'freeofis-home';
      root.appendChild(r);
    }

    const activeSales = sales.filter(s => s.status !== 'cancelled');
    const todaySales = activeSales
      .filter(s => transactionDate(s.transactionAt || s.date) === today())
      .reduce((n, s) => n + num(s.total), 0);
    const todayReceived = pay
      .filter(p => p.status !== 'cancelled' && transactionDate(p.transactionAt || p.date) === today())
      .reduce((n, p) => n + num(p.amount), 0);
    const stockUnits = inv.reduce((n, x) => n + num(x.quantity), 0);
    const stockValue = inv.reduce((n, x) => n + num(x.quantity) * num(x.price), 0);
    const debt = cus.reduce((n, c) => n + balance(c.id), 0);
    const lowStock = inv.filter(x => num(x.quantity) <= num(x.lowStock ?? 5));

    r.innerHTML = `
      <div class="panel">
        <h2>${esc(biz.name || 'Free Ofis')}</h2>
        <p>Your central workspace. Choose a module below to continue.</p>
      </div>

      <div class="panel">
        <h3>Today</h3>
        <p>Sales: <b>${money(todaySales)}</b></p>
        <p>Payments received: <b>${money(todayReceived)}</b></p>
        <p>Outstanding credit: <b>${money(debt)}</b></p>
      </div>

      <div class="panel">
        <h3>Business Snapshot</h3>
        <p>Stock units: <b>${stockUnits.toLocaleString()}</b></p>
        <p>Stock value: <b>${money(stockValue)}</b></p>
        <p>Low-stock items: <b>${lowStock.length}</b></p>
        <p>Customers: <b>${cus.length}</b></p>
      </div>

      <div class="panel">
        <h3>Workspaces</h3>
        <button data-home-nav="business">Business</button>
        <button data-home-nav="student">Student</button>
        <button data-home-nav="media">Media</button>
        <button data-home-nav="office">Office</button>
        <button data-home-nav="personal">Personal</button>
      </div>

      <div class="panel">
        <h3>Quick Actions</h3>
        <button class="primary" data-home-nav="records">New Sale / Orders</button>
        <button data-home-nav="inventory">Inventory</button>
        <button data-home-nav="customers">Customers</button>
        <button data-home-nav="reports">Reports</button>
      </div>
    `;

    $$('[data-home-nav]', r).forEach(b => {
      b.onclick = () => navigate(b.dataset.homeNav);
    });
  }

  function renderWorkspace(id, name, description, modules) {
    const root = $('#' + id);
    if (!root) return;
    let r = $('.freeofis-workspace', root);
    if (!r) {
      r = document.createElement('div');
      r.className = 'freeofis-workspace';
      root.appendChild(r);
    }
    r.innerHTML = `
      <div class="panel">
        <h2>${esc(name)}</h2>
        <p>${esc(description)}</p>
      </div>
      <div class="panel">
        <h3>Workspace modules</h3>
        ${modules.map(m => `
          <button type="button" data-workspace-module="${esc(m)}">${esc(m)}</button>
        `).join('')}
      </div>
    `;
    $$('[data-workspace-module]', r).forEach(b => {
      b.onclick = () => alert(`${b.dataset.workspaceModule} is part of the Free Ofis workspace roadmap and can be enabled as the module is implemented.`);
    });
  }

  function renderStudent() {
    renderWorkspace('student', 'Student', 'A dedicated workspace for academic organization.', ['Courses', 'Assignments', 'Notes', 'Study Planner']);
  }

  function renderMedia() {
    renderWorkspace('media', 'Media', 'A dedicated workspace for media and content operations.', ['Content Planner', 'Clients', 'Publications', 'Production Tracker']);
  }

  function renderOffice() {
    renderWorkspace('office', 'Office', 'A dedicated workspace for everyday office administration.', ['Documents', 'Tasks', 'Contacts', 'Office Records']);
  }

  function renderPersonal() {
    renderWorkspace('personal', 'Personal', 'A lightweight workspace for personal organization.', ['Notes', 'Tasks', 'Records', 'Planner']);
  }

  /* =========================================================
     DATA HELPERS
     ========================================================= */

  const item = id =>
    inv.find(x => x.id === id);

  const customer = id =>
    cus.find(x => x.id === id);

  function customerTotal(cid) {
    return sales.reduce(
      (n, s) =>
        n +
        (
          s.customerId === cid &&
          s.status !== 'cancelled'
            ? Number(s.total || 0)
            : 0
        ),
      0
    );
  }

  function customerPaid(cid) {
    return pay.reduce(
      (n, p) =>
        n +
        (
          p.customerId === cid &&
          p.status !== 'cancelled'
            ? Number(p.amount || 0)
            : 0
        ),
      0
    );
  }

  function balance(cid) {
    return Math.max(
      0,
      customerTotal(cid) - customerPaid(cid)
    );
  }

  function salePaid(s) {
    const linked = pay
      .filter(
        p =>
          p.saleId === s.id &&
          p.status !== 'cancelled'
      )
      .reduce(
        (n, p) => n + Number(p.amount || 0),
        0
      );

    return linked > 0
      ? Math.min(Number(s.total || 0), linked)
      : Math.min(
          Number(s.total || 0),
          Number(s.paid || 0)
        );
  }

  function saleBalance(s) {
    return Math.max(
      0,
      Number(s.total || 0) - salePaid(s)
    );
  }

  function syncSalePaymentFields(s) {
    s.paid = salePaid(s);
    s.balance = saleBalance(s);
    return s;
  }

  /* =========================================================
     PAYMENT SYSTEM
     ========================================================= */

  /*
     IMPORTANT:
     Order payments are validated against the ORDER balance,
     not against the customer's aggregate balance.

     MONEY_EPSILON tolerates floating-point noise so a payment
     that is effectively equal to the remaining balance is accepted.
     Meaningful overpayments are still rejected.

     Idempotency: a short-lived signature of (saleId|cid + amount +
     rounded timestamp) prevents accidental double-submission from
     double-clicks or immediate retries of the exact same request.
     Legitimate separate payments (even of the same amount) are allowed
     once the signature window expires or the amount/sale differs.
  */

  const recentPaySignatures = new Set();
  const PAY_IDEMPOTENCY_MS = 2500;

  function addPay(
    cid,
    amount,
    date = today(),
    method = 'cash',
    reference = '',
    saleId = null,
    time = timeNow()
  ) {
    let amt = roundMoney(amount);

    if (!Number.isFinite(amt) || amt <= 0) {
      return false;
    }

    // Explicit customer validation for non-sale payments
    if (!saleId) {
      if (!cid || !customer(cid)) {
        return false;
      }
    }

    if (saleId) {
      const s = sales.find(x => x.id === saleId);

      if (!s || s.status === 'cancelled') {
        return false;
      }

      if (s.customerId && s.customerId !== cid) {
        return false;
      }

      const bal = saleBalance(s);
      if (amt > bal + MONEY_EPSILON) {
        return false;
      }
      // Normalize floating-point noise to exact remaining balance
      if (Math.abs(amt - bal) <= MONEY_EPSILON) {
        amt = bal;
      }
    } else {
      const bal = balance(cid);
      if (amt > bal + MONEY_EPSILON) {
        return false;
      }
      if (Math.abs(amt - bal) <= MONEY_EPSILON) {
        amt = bal;
      }
    }

    // Deterministic short-window idempotency signature
    const sig =
      (saleId || cid || '') +
      '|' +
      amt.toFixed(2) +
      '|' +
      Math.floor(Date.now() / 1000);
    if (recentPaySignatures.has(sig)) {
      return false; // duplicate submission blocked
    }
    recentPaySignatures.add(sig);
    setTimeout(
      () => recentPaySignatures.delete(sig),
      PAY_IDEMPOTENCY_MS
    );

    const transactionAt =
      transactionTimestamp(date, time);

    const paymentRecord = {
      id: uid('PAY'),
      customerId: cid || null,
      saleId: saleId || null,
      amount: amt,
      date,
      time,
      transactionAt,
      method,
      reference,
      status: 'completed'
    };

    pay.push(paymentRecord);

    if (!save(K.pay, pay)) {
      pay.pop();
      return false;
    }

    if (saleId) {
      const s = sales.find(x => x.id === saleId);
      if (s) {
        syncSalePaymentFields(s);
        save(K.sales, sales);
      }
    }

    return true;
  }

  /**
   * Cancel an individual payment (does NOT cancel the sale).
   * Marks status=cancelled + cancelledAt. History is preserved.
   * Idempotent: already-cancelled payments are left untouched.
   */
  function cancelPayment(payId) {
    const p = pay.find(x => x.id === payId);
    if (!p || p.status === 'cancelled') {
      return false;
    }

    if (
      !confirm(
        'Cancel this payment? The payment will remain in history but will no longer affect balances.'
      )
    ) {
      return false;
    }

    p.status = 'cancelled';
    p.cancelledAt = localDateTime();

    save(K.pay, pay);

    if (p.saleId) {
      const s = sales.find(x => x.id === p.saleId);
      if (s) {
        syncSalePaymentFields(s);
        save(K.sales, sales);
      }
    }

    renderSales();
    renderCredit();
    renderCus();
    renderReports();
    if (typeof renderReceipts === 'function') renderReceipts();

    return true;
  }

  /* =========================================================
     BUSINESS
     ========================================================= */

  function renderBusiness() {
    const s = $('#business');

    let r = $('.freeofis-biz', s);

    if (!r) {
      r = document.createElement('div');
      r.className = 'freeofis-biz';
      s.appendChild(r);
    }

    r.innerHTML = `
      <div class="quick">

        <button class="card" id="bs">
          🧾
          <b>Sales & Orders</b>
          <small>
            Sell multiple products and record payments.
          </small>
        </button>

        <button class="card" id="bi">
          📦
          <b>Inventory</b>
          <small>
            Products, quantities, prices and barcodes.
          </small>
        </button>

        <button class="card" id="bc">
          👥
          <b>Customers</b>
          <small>
            Profiles and account balances.
          </small>
        </button>

        <button class="card" id="bd">
          💳
          <b>Credit & Debtors</b>
          <small>
            Credit purchases and part payments.
          </small>
        </button>

        <button class="card" id="br">
          🧾
          <b>Receipts</b>
          <small>
            Seller and customer receipts.
          </small>
        </button>

        <button class="card" id="brep">
          📊
          <b>Reports</b>
          <small>
            Business performance.
          </small>
        </button>

      </div>
    `;

    [
      ['bs', 'records'],
      ['bi', 'inventory'],
      ['bc', 'customers'],
      ['bd', 'credit'],
      ['br', 'receipts'],
      ['brep', 'reports']
    ].forEach(([a, b]) => {
      $('#' + a).onclick = () => navigate(b);
    });
  }

  /* =========================================================
     INVENTORY
     ========================================================= */

  function renderInv() {
    const s = $('#inventory');

    let r = $('.freeofis-inv', s);

    if (!r) {
      r = document.createElement('div');
      r.className = 'freeofis-inv';
      s.appendChild(r);
    }

    const units = inv.reduce(
      (n, x) => n + Number(x.quantity || 0),
      0
    );

    const value = inv.reduce(
      (n, x) =>
        n +
        Number(x.quantity || 0) *
          Number(x.price || 0),
      0
    );

    r.innerHTML = `
      <div class="panel">

        <h3>Items Remaining</h3>
        <strong>${units.toLocaleString()}</strong>

        <h3>Stock Value</h3>
        <strong>${money(value)}</strong>

        <br><br>

        <button class="primary" id="addstock">
          + Add Inventory Item
        </button>

        <div id="if"></div>

      </div>

      <div class="panel">

        <h3>Inventory</h3>

        <input id="isearch" placeholder="Search inventory by name or SKU">
        <br><br>

        <div id="il">

          ${
            inv.length
              ? inv
                  .map(
                    x => `
                      <div class="panel">

                        <b>${esc(x.name)}</b><br>

                        Quantity:
                        ${Number(x.quantity || 0)}<br>

                        Price:
                        ${money(x.price)}<br>

                        Stock value:
                        ${money(
                          Number(x.quantity || 0) *
                          Number(x.price || 0)
                        )}
                        <br>
                        Low-stock threshold: ${num(x.lowStock ?? 5)}
                        ${num(x.quantity) <= num(x.lowStock ?? 5) ? '<br><b>⚠ Low stock</b>' : ''}

                        ${
                          x.sku
                            ? `<br>SKU/Barcode:
                               ${esc(x.sku)}`
                            : ''
                        }

                        <br>

                        <button data-ie="${x.id}">
                          Edit
                        </button>

                        <button data-id="${x.id}">
                          Delete
                        </button>

                      </div>
                    `
                  )
                  .join('')
              : '<p>No inventory items yet.</p>'
          }

        </div>
      </div>
    `;

    $('#addstock').onclick = () => invForm();

    $('#isearch').oninput = () => {
      const q = norm($('#isearch').value);
      $$('#il .panel', r).forEach(card => {
        card.style.display = !q || norm(card.textContent).includes(q) ? '' : 'none';
      });
    };

    $$('[data-ie]', r).forEach(
      b =>
        (b.onclick = () =>
          invForm(item(b.dataset.ie)))
    );

    $$('[data-id]', r).forEach(
      b =>
        (b.onclick = () => {
          const id = b.dataset.id;
          const usedInSales = sales.some(s =>
            s.status !== 'cancelled' && (s.items || []).some(i => i.productId === id)
          );

          if (usedInSales) {
            return alert('This item is referenced by a previous sale and cannot be deleted. Set its quantity to 0 or edit it instead so historical records remain intact.');
          }

          if (!confirm('Delete this inventory item?')) return;

          inv = inv.filter(x => x.id !== id);
          save(K.inv, inv);
          renderInv();
        })
    );
  }

  function invForm(old = null) {
    const a = $('#if');

    a.innerHTML = `
      <form id="invf">

        <h3>
          ${old ? 'Edit' : 'Add'} Item
        </h3>

        <input
          id="in"
          placeholder="Item name"
          required
          value="${esc(old?.name || '')}"
        >
        <br><br>

        <input
          id="iq"
          type="number"
          min="0"
          required
          placeholder="Quantity"
          value="${old?.quantity ?? 0}"
        >
        <br><br>

        <input
          id="ip"
          type="number"
          min="0"
          step="0.01"
          required
          placeholder="Selling price"
          value="${old?.price ?? 0}"
        >
        <br><br>

        <input
          id="ilt"
          type="number"
          min="0"
          step="1"
          placeholder="Low-stock alert threshold"
          value="${old?.lowStock ?? 5}"
        >
        <br><br>

        <input
          id="is"
          placeholder="SKU / Barcode"
          value="${esc(old?.sku || '')}"
        >
        <br><br>

        <button class="primary">
          Save Item
        </button>

      </form>
    `;

    $('#invf').onsubmit = e => {
      e.preventDefault();

      const name =
        $('#in').value.trim();

      const sku =
        $('#is').value.trim();

      const quantity =
        Number($('#iq').value);

      const price =
        Number($('#ip').value);

      const lowStock =
        Number($('#ilt').value);

      if (!name) {
        return alert(
          'Enter an item name.'
        );
      }

      if (
        !Number.isFinite(quantity) ||
        quantity < 0
      ) {
        return alert(
          'Enter a valid quantity.'
        );
      }

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        return alert(
          'Enter a valid price.'
        );
      }

      if (!Number.isFinite(lowStock) || lowStock < 0) {
        return alert('Enter a valid low-stock threshold.');
      }

      /*
         When adding a NEW item, avoid creating a second
         inventory record for the same product.
      */

      if (!old) {
        const duplicate = inv.find(
          x =>
            (sku &&
              x.sku &&
              norm(x.sku) === norm(sku)) ||
            (!sku &&
              !x.sku &&
              norm(x.name) === norm(name))
        );

        if (duplicate) {
          duplicate.quantity += quantity;
          duplicate.price = roundMoney(price);
          duplicate.lowStock = lowStock;

          if (sku) {
            duplicate.sku = sku;
          }

          save(K.inv, inv);
          renderInv();

          return alert(
            'Existing inventory item updated. Quantity has been added to its balance.'
          );
        }
      }

      const x = {
        id: old?.id || uid('ITEM'),
        name,
        quantity,
        price: roundMoney(price),
        lowStock,
        sku
      };

      const i = inv.findIndex(
        z => z.id === x.id
      );

      if (i < 0) {
        inv.push(x);
      } else {
        inv[i] = x;
      }

      save(K.inv, inv);
      renderInv();
    };
  }

  /* =========================================================
     SALES
     ========================================================= */

  function renderSales() {
    const s = $('#records');

    let r = $('.freeofis-sales', s);

    if (!r) {
      r = document.createElement('div');
      r.className = 'freeofis-sales';
      s.appendChild(r);
    }

    r.innerHTML = `
      <div class="panel">

        <button
          class="primary"
          id="neworder"
        >
          + New Sale / Order
        </button>

        <div id="of"></div>

      </div>

      <div class="panel">

        <h3>Sales & Orders</h3>

        <input
          id="sq"
          placeholder="Search customer, order or item"
        >

        <div id="sl"></div>

      </div>
    `;

    $('#neworder').onclick = orderForm;

    $('#sq').oninput = renderSaleList;

    renderSaleList();
  }

  function orderForm() {
    const a = $('#of');

    a.innerHTML = `
      <form id="order">

        <h3>New Sale / Order</h3>

        <label>Date</label><br>

        <input
          id="od"
          type="date"
          value="${today()}"
          required
        >

        <br><br>

        <label>Time</label><br>

        <input
          id="ot"
          type="time"
          value="${timeNow()}"
          required
        >

        <br><br>

        <label>Customer</label><br>

        <select id="oc">

          <option value="">
            Walk-in Customer
          </option>

          ${cus
            .map(
              c => `
                <option value="${c.id}">
                  ${esc(c.name)}
                  ${
                    balance(c.id)
                      ? ' — owes ' +
                        money(balance(c.id))
                      : ''
                  }
                </option>
              `
            )
            .join('')}

        </select>

        <br><br>

        <div id="lines"></div>

        <button
          type="button"
          id="aline"
        >
          + Add Item
        </button>

        <p>
          Total:
          <b id="tot">₦0</b>
        </p>

        <label>
          Amount paid now
        </label>

        <br>

        <input
          id="op"
          type="number"
          min="0"
          value="0"
          required
        >

        <br><br>

        <select id="om">

          <option>cash</option>
          <option>transfer</option>
          <option>pos</option>
          <option>other</option>

        </select>

        <br><br>

        <input
          id="oref"
          placeholder="Payment reference"
        >

        <br><br>

        <textarea
          id="on"
          placeholder="Notes"
        ></textarea>

        <br><br>

        <button class="primary">
          Complete Sale
        </button>

      </form>
    `;

    addLine();

    $('#aline').onclick = addLine;

    $('#order').onsubmit =
      completeSale;
  }

  function addLine() {
    const b = $('#lines');

    const d =
      document.createElement('div');

    d.className = 'line';

    d.innerHTML = `
      <select
        class="prod"
        required
      >

        <option value="">
          Select product
        </option>

        ${inv
          .map(
            x => `
              <option value="${x.id}">
                ${esc(x.name)}
                —
                ${money(x.price)}
                —
                Stock ${x.quantity}
              </option>
            `
          )
          .join('')}

      </select>

      <input
        class="qty"
        type="number"
        min="1"
        value="1"
        style="width:70px"
      >

      <button
        type="button"
        class="rm"
      >
        Remove
      </button>

      <br><br>
    `;

    b.appendChild(d);

    $('.prod', d).onchange =
      updateTotal;

    $('.qty', d).oninput =
      updateTotal;

    $('.rm', d).onclick = () => {
      d.remove();
      updateTotal();
    };

    updateTotal();
  }

  function lines() {
    const out = [];
    let err = '';
    const requested = {};

    $$('.line').forEach(d => {
      const p =
        item($('.prod', d).value);

      const q =
        Number($('.qty', d).value);

      if (
        !p ||
        q < 1 ||
        !Number.isInteger(q)
      ) {
        err =
          'Select a valid item and quantity.';
        return;
      }

      requested[p.id] =
        (requested[p.id] || 0) + q;

      out.push({
        productId: p.id,
        name: p.name,
        quantity: q,
        unitPrice: Number(p.price),
        subtotal:
          q * Number(p.price)
      });
    });

    if (!err) {
      for (const id in requested) {
        const p = item(id);

        if (
          p &&
          requested[id] > p.quantity
        ) {
          err =
            `${p.name}: only ${p.quantity} available.`;
          break;
        }
      }
    }

    return {
      out,
      err
    };
  }

  function updateTotal() {
    const z = lines();

    const total =
      z.out.reduce(
        (n, x) =>
          n + Number(x.subtotal || 0),
        0
      );

    if ($('#tot')) {
      $('#tot').textContent =
        money(total);
    }

    if ($('#op')) {
      $('#op').max = total;
    }
  }

  function completeSale(e) {
    e.preventDefault();

    const z = lines();

    if (z.err || !z.out.length) {
      return alert(
        z.err ||
          'Add at least one item.'
      );
    }

    const total =
      z.out.reduce(
        (n, x) =>
          n + Number(x.subtotal || 0),
        0
      );

    const paid =
      Number($('#op').value || 0);

    const cid =
      $('#oc').value || null;

    const date =
      $('#od').value || today();

    const time =
      $('#ot').value || timeNow();

    const method =
      paid
        ? $('#om').value
        : 'credit';

    const reference =
      $('#oref').value.trim();

    if (
      !Number.isFinite(paid) ||
      paid < 0
    ) {
      return alert(
        'Enter a valid payment amount.'
      );
    }

    if (paid > total + MONEY_EPSILON) {
      return alert(
        'Amount paid cannot exceed the order total.'
      );
    }
    if (Math.abs(paid - total) <= MONEY_EPSILON) {
      // normalize floating-point noise
      // (paid already captured; will be used as-is after clamp if needed)
    }

    if (
      total - paid > 0 &&
      !cid
    ) {
      return alert(
        'Select a customer for a credit balance.'
      );
    }

    const transactionAt =
      transactionTimestamp(
        date,
        time
      );

    const s = {
      id: uid('SALE'),
      date,
      time,
      transactionAt,
      customerId: cid,
      items: z.out,
      total,
      paid: 0,
      balance: total,
      method,
      reference,
      notes:
        $('#on').value.trim(),
      status: 'completed'
    };

    /* Reduce inventory */
    z.out.forEach(x => {
      const p =
        item(x.productId);

      if (p) {
        p.quantity -= x.quantity;
      }
    });

    sales.push(s);

    /*
       Create the initial payment as a proper payment
       transaction. This keeps sales, payments and statements
       using the same source of truth.
    */

    if (paid > 0) {
      pay.push({
        id: uid('PAY'),
        customerId: cid,
        saleId: s.id,
        amount: paid,
        date,
        time,
        transactionAt,
        method,
        reference,
        status: 'completed'
      });
    }

    syncSalePaymentFields(s);

    save(K.sales, sales);
    save(K.inv, inv);
    save(K.pay, pay);

    renderSales();
    renderInv();
    renderCredit();
    renderCus();
    renderReports();

    alert(
      `Sale recorded.

Order: ${s.id}
Date: ${formatDateTime(s.transactionAt)}
Total: ${money(total)}
Paid: ${money(s.paid)}
Balance: ${money(s.balance)}`
    );
  }

  /* =========================================================
     SALES LIST
     CUSTOMER-FIRST VIEW
     ========================================================= */

  function renderSaleList() {
    const r = $('#sl');

    if (!r) return;

    const q =
      ($('#sq')?.value || '')
        .trim()
        .toLowerCase();

    let list = sales
      .filter(
        s =>
          s.status !== 'cancelled'
      )
      .slice()
      .sort(
        (a, b) =>
          String(
            b.transactionAt ||
              b.date
          ).localeCompare(
            String(
              a.transactionAt ||
                a.date
            )
          )
      );

    /*
       Group sales by customer.

       This prevents the Sales & Orders page from becoming a
       long rough list containing many repeated customer names.
    */

    const groups = {};

    list.forEach(s => {
      const cid =
        s.customerId || '__walkin__';

      if (!groups[cid]) {
        groups[cid] = [];
      }

      groups[cid].push(s);
    });

    let entries = Object.entries(
      groups
    );

    if (q) {
      entries = entries.filter(
        ([cid, arr]) => {
          const c =
            customer(cid);

          const customerName =
            c?.name ||
            'Walk-in Customer';

          return (
            customerName
              .toLowerCase()
              .includes(q) ||
            arr.some(
              s =>
                s.id
                  .toLowerCase()
                  .includes(q) ||
                s.items.some(i =>
                  i.name
                    .toLowerCase()
                    .includes(q)
                )
            )
          );
        }
      );
    }

    if (!entries.length) {
      r.innerHTML =
        '<p>No customers/orders found.</p>';

      return;
    }

    r.innerHTML = entries
      .map(([cid, arr]) => {
        const c =
          customer(cid);

        const name =
          c?.name ||
          'Walk-in Customer';

        const total =
          arr.reduce(
            (n, s) =>
              n + Number(s.total || 0),
            0
          );

        const outstanding =
          c
            ? balance(cid)
            : arr.reduce(
                (n, s) =>
                  n +
                  saleBalance(s),
                0
              );

        return `
          <div class="panel">

            <h3>
              <button
                type="button"
                data-customer="${esc(cid)}"
                style="
                  background:none;
                  border:0;
                  padding:0;
                  font-size:inherit;
                  font-weight:bold;
                  cursor:pointer;
                  text-align:left;
                "
              >
                ${esc(name)}
              </button>
            </h3>

            <p>
              Orders:
              <b>${arr.length}</b>
            </p>

            <p>
              Total purchases:
              <b>${money(total)}</b>
            </p>

            <p>
              Outstanding:
              <b>${money(outstanding)}</b>
            </p>

            <button
              data-customer="${esc(cid)}"
            >
              Open Customer
            </button>

            <button
              data-statement="${esc(cid)}"
            >
              Statement
            </button>

            ${
              outstanding > 0
                ? `
                  <button
                    data-payment="${esc(cid)}"
                  >
                    Record Payment
                  </button>
                `
                : ''
            }

            <hr>

            ${arr
              .map(
                s => `
                  <div
                    style="
                      padding:8px 0;
                      border-bottom:1px solid #ddd;
                    "
                  >

                    <b>${esc(s.id)}</b><br>

                    ${formatDateTime(
                      s.transactionAt ||
                        s.date
                    )}<br>

                    ${s.items
                      .map(
                        i =>
                          `${esc(
                            i.name
                          )} × ${
                            i.quantity
                          }`
                      )
                      .join(', ')}

                    <br>

                    Total:
                    ${money(s.total)}
                    |
                    Paid:
                    ${money(
                      salePaid(s)
                    )}
                    |
                    Balance:
                    <b>
                      ${money(
                        saleBalance(s)
                      )}
                    </b>

                    <br>

                    <button
                      data-r="${esc(s.id)}"
                    >
                      Receipt
                    </button>

                    ${
                      saleBalance(s)
                        ? `
                          <button
                            data-p="${esc(
                              s.id
                            )}"
                          >
                            Payment
                          </button>
                        `
                        : ''
                    }

                    <button
                      data-c="${esc(s.id)}"
                    >
                      Cancel
                    </button>

                  </div>
                `
              )
              .join('')}

          </div>
        `;
      })
      .join('');

    $$('[data-customer]', r).forEach(
      b => {
        b.onclick = () =>
          customerPage(
            b.dataset.customer
          );
      }
    );

    $$('[data-statement]', r).forEach(
      b => {
        b.onclick = () =>
          statement(
            b.dataset.statement
          );
      }
    );

    $$('[data-payment]', r).forEach(
      b => {
        b.onclick = () =>
          customerPay(
            b.dataset.payment
          );
      }
    );

    $$('[data-r]', r).forEach(
      b => {
        b.onclick = () =>
          receipt(b.dataset.r);
      }
    );

    $$('[data-p]', r).forEach(
      b => {
        b.onclick = () =>
          salePay(b.dataset.p);
      }
    );

    $$('[data-c]', r).forEach(
      b => {
        b.onclick = () =>
          cancelSale(b.dataset.c);
      }
    );
  }

  /* =========================================================
     ORDER PAYMENT
     ========================================================= */

  function salePay(id) {
    const s =
      sales.find(x => x.id === id);

    if (
      !s ||
      s.status === 'cancelled'
    ) {
      return;
    }

    const current =
      saleBalance(s);

    if (current <= 0) {
      return alert(
        'This order is already fully paid.'
      );
    }

    const amount = Number(
      prompt(
        `Order ${s.id}

Current balance: ${money(current)}

Payment amount:`
      )
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > current + MONEY_EPSILON
    ) {
      return alert(
        'Invalid payment.'
      );
    }

    let method = prompt(
      'Payment method: cash, transfer, pos or other',
      'cash'
    );

    if (method === null) return;

    method =
      method.trim().toLowerCase() ||
      'cash';

    if (
      ![
        'cash',
        'transfer',
        'pos',
        'other'
      ].includes(method)
    ) {
      return alert(
        'Invalid payment method.'
      );
    }

    let reference = prompt(
      'Payment reference (optional):',
      ''
    );

    if (reference === null) {
      reference = '';
    }

    const date = today();
    const time = timeNow();

    /*
       FIX:
       addPay validates against this specific order,
       not the customer's aggregate balance.
    */

    if (
      !addPay(
        s.customerId,
        amount,
        date,
        method,
        reference,
        s.id,
        time
      )
    ) {
      return alert(
        'Payment could not be recorded.'
      );
    }

    syncSalePaymentFields(s);

    save(K.sales, sales);

    renderSales();
    renderCredit();
    renderCus();
    renderReports();

    alert(
      `Payment recorded.

Date: ${formatDateTime(
        s.transactionAt
      )}

Remaining:
${money(saleBalance(s))}`
    );
  }

  /* =========================================================
     CANCEL SALE
     ========================================================= */

  function cancelSale(id) {
    const s =
      sales.find(x => x.id === id);

    // Idempotent: already-cancelled sales are left untouched
    // (no second inventory restore, no re-processing).
    if (
      !s ||
      s.status === 'cancelled'
    ) {
      return;
    }

    if (
      !confirm(
        'Cancel this order and restore its stock?'
      )
    ) {
      return;
    }

    s.status = 'cancelled';
    s.cancelledAt = localDateTime();

    // Cascade-cancel linked payments so they no longer affect balances.
    // Individual payments can still be cancelled separately via cancelPayment().
    pay
      .filter(
        p =>
          p.saleId === s.id &&
          p.status !== 'cancelled'
      )
      .forEach(p => {
        p.status = 'cancelled';
        p.cancelledAt = s.cancelledAt;
      });

    // Restore inventory exactly once (guarded by the status check above).
    (s.items || []).forEach(i => {
      const p = item(i.productId);
      if (p) {
        p.quantity += Number(i.quantity || 0);
      }
    });

    save(K.sales, sales);
    save(K.inv, inv);
    save(K.pay, pay);

    renderSales();
    renderInv();
    renderCredit();
    renderCus();
    renderReports();
  }

  /* =========================================================
     CUSTOMERS
     ========================================================= */

  function renderCus() {
    const r =
      $('#customers-content');

    r.innerHTML = `
      <div class="panel">

        <button
          class="primary"
          id="nc"
        >
          + Add Customer
        </button>

        <div id="cf"></div>

        <input
          id="cq"
          placeholder="Search customer"
        >

        <div id="cl"></div>

      </div>
    `;

    $('#nc').onclick =
      () => cusForm();

    $('#cq').oninput =
      renderCusList;

    renderCusList();
  }

  function cusForm(old = null) {
    const a = $('#cf');

    a.innerHTML = `
      <form id="cusf">

        <h3>
          ${old ? 'Edit' : 'Add'}
          Customer
        </h3>

        <input
          id="cn"
          placeholder="Customer name"
          required
          value="${esc(
            old?.name || ''
          )}"
        >

        <br><br>

        <input
          id="cp"
          placeholder="Phone"
          value="${esc(
            old?.phone || ''
          )}"
        >

        <br><br>

        <input
          id="ca"
          placeholder="Address"
          value="${esc(
            old?.address || ''
          )}"
        >

        <br><br>

        <button class="primary">
          Save Customer
        </button>

      </form>
    `;

    $('#cusf').onsubmit = e => {
      e.preventDefault();

      const x = {
        id:
          old?.id ||
          uid('CUS'),

        name:
          $('#cn').value.trim(),

        phone:
          $('#cp').value.trim(),

        address:
          $('#ca').value.trim()
      };

      if (!x.name) {
        return alert(
          'Enter the customer name.'
        );
      }

      const i =
        cus.findIndex(
          z => z.id === x.id
        );

      if (i < 0) {
        cus.push(x);
      } else {
        cus[i] = x;
      }

      save(K.cus, cus);

      renderCus();
    };
  }

  function renderCusList() {
    const r = $('#cl');

    const q =
      ($('#cq')?.value || '')
        .toLowerCase()
        .trim();

    const filtered =
      cus.filter(
        c =>
          norm(c.name).includes(q) ||
          norm(c.phone).includes(q)
      );

    r.innerHTML =
      filtered.length
        ? filtered
            .map(
              c => `
                <div class="panel">

                  <button
                    data-customer="${c.id}"
                    style="
                      background:none;
                      border:0;
                      padding:0;
                      font-weight:bold;
                      font-size:18px;
                      cursor:pointer;
                    "
                  >
                    ${esc(c.name)}
                  </button>

                  <br>

                  ${esc(c.phone || '')}

                  <br>

                  Outstanding:
                  <b>
                    ${money(
                      balance(c.id)
                    )}
                  </b>

                  <br><br>

                  <button
                    data-st="${c.id}"
                  >
                    Statement
                  </button>

                  ${
                    balance(c.id) > 0
                      ? `
                        <button
                          data-pp="${c.id}"
                        >
                          Record Payment
                        </button>
                      `
                      : ''
                  }

                </div>
              `
            )
            .join('')
        : '<p>No customers found.</p>';

    $$('[data-customer]', r).forEach(
      b =>
        (b.onclick = () =>
          customerPage(
            b.dataset.customer
          ))
    );

    $$('[data-st]', r).forEach(
      b =>
        (b.onclick = () =>
          statement(
            b.dataset.st
          ))
    );

    $$('[data-pp]', r).forEach(
      b =>
        (b.onclick = () =>
          customerPay(
            b.dataset.pp
          ))
    );
  }

  /* =========================================================
     CUSTOMER PAGE
     ========================================================= */

 function customerPage(cid) {
  const isWalkIn = cid === '__walkin__';
  const actualCid = isWalkIn ? null : cid;

  const c = isWalkIn
    ? {
        id: null,
        name: 'Walk-in Customer',
        phone: '',
        address: ''
      }
    : customer(cid);

  if (!c) {
    return alert(
      'Customer not found.'
    );
  }

    const customerSales =
      sales
        .filter(
          s =>
            s.customerId === actualCid &&
            s.status !== 'cancelled'
        )
        .sort(
          (a, b) =>
            String(
              b.transactionAt ||
                b.date
            ).localeCompare(
              String(
                a.transactionAt ||
                  a.date
              )
            )
        );

    // Include cancelled payments for audit/history; they are marked as cancelled.
    const customerPayments =
      pay
        .filter(
          p => p.customerId === actualCid
        )
        .sort(
          (a, b) =>
            String(
              b.transactionAt ||
                b.date
            ).localeCompare(
              String(
                a.transactionAt ||
                  a.date
              )
            )
        );

    modal(`
      <h2>${esc(c.name)}</h2>

      <p>
        Phone:
        ${esc(c.phone || 'Not provided')}
      </p>

      <p>
        Address:
        ${esc(
          c.address || 'Not provided'
        )}
      </p>

      <hr>

      <p>
        Total purchases:
        <b>
          ${money(
            customerTotal(cid)
          )}
        </b>
      </p>

      <p>
        Total payments:
        <b>
          ${money(
            customerPaid(cid)
          )}
        </b>
      </p>

      <p>
        Outstanding:
        <b>
          ${money(
            balance(cid)
          )}
        </b>
      </p>

      <button
        id="cpay"
        ${balance(cid) <= 0 ? 'disabled' : ''}
      >
        Record Payment
      </button>

      <button id="cstatement">
        Full Statement
      </button>

      <h3>Purchase History</h3>

      ${
        customerSales.length
          ? customerSales
              .map(
                s => `
                  <div
                    style="
                      padding:10px 0;
                      border-bottom:1px solid #ddd;
                    "
                  >

                    <b>${esc(s.id)}</b><br>

                    ${formatDateTime(
                      s.transactionAt ||
                        s.date
                    )}

                    <br>

                    ${s.items
                      .map(
                        i =>
                          `${esc(
                            i.name
                          )} × ${
                            i.quantity
                          }`
                      )
                      .join(', ')}

                    <br>

                    Total:
                    ${money(s.total)}

                    <br>

                    Paid:
                    ${money(
                      salePaid(s)
                    )}

                    <br>

                    Balance:
                    ${money(
                      saleBalance(s)
                    )}

                    <br>

                    <button
                      data-cr="${s.id}"
                    >
                      Receipt
                    </button>

                  </div>
                `
              )
              .join('')
          : '<p>No purchases yet.</p>'
      }

      <h3>Payment History</h3>

      ${
        customerPayments.length
          ? customerPayments
              .map(
                p => `
                  <div
                    style="
                      padding:8px 0;
                      border-bottom:1px solid #ddd;
                    "
                  >

                    ${formatDateTime(
                      p.transactionAt ||
                        p.date
                    )}

                    —
                    <b>
                      ${money(
                        p.amount
                      )}
                    </b>

                    —
                    ${esc(
                      p.method
                    )}
                    ${
                      p.status === 'cancelled'
                        ? ' <em>(cancelled)</em>'
                        : ''
                    }

                    ${
                      p.reference
                        ? `
                          <br>
                          Reference:
                          ${esc(
                            p.reference
                          )}
                        `
                        : ''
                    }

                    ${
                      p.status !== 'cancelled'
                        ? `
                          <br>
                          <button data-cancel-pay="${esc(p.id)}"
                            style="margin-top:4px;font-size:12px;">
                            Cancel Payment
                          </button>
                        `
                        : ''
                    }

                  </div>
                `
              )
              .join('')
          : '<p>No payments yet.</p>'
      }
    `);

    $('#cpay').onclick = () =>
      customerPay(cid);

    $('#cstatement').onclick = () =>
      statement(cid);

    $$('[data-cr]').forEach(
      b =>
        (b.onclick = () =>
          receipt(
            b.dataset.cr
          ))
    );

    $$('[data-cancel-pay]').forEach(
      b =>
        (b.onclick = () => {
          if (cancelPayment(b.dataset.cancelPay)) {
            // re-open customer page to refresh list
            customerPage(cid);
          }
        })
    );
  }

  /* =========================================================
     CUSTOMER PAYMENT
     ========================================================= */

  function customerPay(cid) {
    const c =
      customer(cid);

    if (!c) return;

    const outstanding =
      balance(cid);

    if (outstanding <= 0) {
      return alert(
        'This customer has no outstanding balance.'
      );
    }

    const amount = Number(
      prompt(
        `${c.name}

Outstanding:
${money(outstanding)}

Payment amount:`
      )
    );

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > outstanding
    ) {
      return alert(
        'Invalid payment.'
      );
    }

    let method = prompt(
      'Payment method: cash, transfer, pos or other',
      'cash'
    );

    if (method === null) return;

    method =
      method.trim().toLowerCase() ||
      'cash';

    if (
      ![
        'cash',
        'transfer',
        'pos',
        'other'
      ].includes(method)
    ) {
      return alert(
        'Invalid payment method.'
      );
    }

    let reference = prompt(
      'Payment reference (optional):',
      ''
    );

    if (reference === null) {
      reference = '';
    }

    /*
       Allocate the customer's payment against the oldest
       unpaid orders.

       One customer can therefore have multiple orders,
       while the payment is still reflected correctly
       against those orders.
    */

    let remaining = amount;

    const openSales =
      sales
        .filter(
          s =>
            s.customerId === cid &&
            s.status !== 'cancelled' &&
            saleBalance(s) > 0
        )
        .sort(
          (a, b) =>
            String(
              a.transactionAt ||
                a.date
            ).localeCompare(
              String(
                b.transactionAt ||
                  b.date
              )
            )
        );

    const date = today();
    const time = timeNow();

    for (const s of openSales) {
      if (remaining <= 0) break;

      const portion =
        Math.min(
          remaining,
          saleBalance(s)
        );

      pay.push({
        id: uid('PAY'),
        customerId: cid,
        saleId: s.id,
        amount: portion,
        date,
        time,
        transactionAt:
          transactionTimestamp(
            date,
            time
          ),
        method,
        reference,
        status: 'completed'
      });

      remaining -= portion;

      syncSalePaymentFields(s);
    }

    if (remaining > 0) {
      return alert(
        'Payment could not be fully allocated.'
      );
    }

    save(K.pay, pay);
    save(K.sales, sales);

    renderCus();
    renderCredit();
    renderSales();
    renderReports();

    alert(
      `Payment recorded.

Date:
${formatDateTime(
        transactionTimestamp(
          date,
          time
        )
      )}

Remaining customer balance:
${money(balance(cid))}`
    );
  }

  /* =========================================================
     CUSTOMER STATEMENT
     ========================================================= */

  function statement(cid) {
    const c =
      customer(cid);

    if (!c) return;

    const rows = [];

    sales
      .filter(
        s =>
          s.customerId === cid &&
          s.status !== 'cancelled'
      )
      .forEach(s => {
        rows.push({
          at:
            s.transactionAt ||
            `${s.date || today()}T00:00:00`,
          type: 'Purchase',
          reference: s.id,
          debit: Number(
            s.total || 0
          ),
          credit: 0
        });
      });

    pay
      .filter(
        p =>
          p.customerId === cid &&
          p.status !== 'cancelled'
      )
      .forEach(p => {
        rows.push({
          at:
            p.transactionAt ||
            `${p.date || today()}T00:00:00`,
          type: 'Payment',
          reference:
            p.reference ||
            p.saleId ||
            p.id,
          debit: 0,
          credit: Number(
            p.amount || 0
          )
        });
      });

    /*
       Sort using full timestamp.

       If two transactions have the exact same timestamp,
       purchases are shown before payments so the ledger
       remains logically understandable.
    */

    rows.sort((a, b) => {
      const diff =
        new Date(a.at).getTime() -
        new Date(b.at).getTime();

      if (diff !== 0) return diff;

      if (
        a.type === 'Purchase' &&
        b.type === 'Payment'
      )
        return -1;

      if (
        a.type === 'Payment' &&
        b.type === 'Purchase'
      )
        return 1;

      return 0;
    });

    let running = 0;

    modal(`
      <h2>
        ${esc(c.name)}
        — Statement
      </h2>

      <p>
        Current Outstanding:
        <b>
          ${money(
            balance(cid)
          )}
        </b>
      </p>

      <table
        style="
          width:100%;
          border-collapse:collapse;
        "
      >

        <tr>
          <th>Date / Time</th>
          <th>Type</th>
          <th>Reference</th>
          <th>Debit</th>
          <th>Credit</th>
          <th>Balance</th>
        </tr>

        ${rows
          .map(x => {
            running +=
              x.debit - x.credit;

            return `
              <tr>

                <td>
                  ${formatDateTime(
                    x.at
                  )}
                </td>

                <td>
                  ${x.type}
                </td>

                <td>
                  ${esc(
                    x.reference
                  )}
                </td>

                <td>
                  ${money(
                    x.debit
                  )}
                </td>

                <td>
                  ${money(
                    x.credit
                  )}
                </td>

                <td>
                  <b>
                    ${money(
                      running
                    )}
                  </b>
                </td>

              </tr>
            `;
          })
          .join('')}

      </table>
    `);
  }

  /* =========================================================
     CREDIT / DEBTORS
     ========================================================= */

  function renderCredit() {
    const r =
      $('#credit-content');

    const debtors =
      cus.filter(
        c => balance(c.id) > 0
      );

    r.innerHTML = `
      <div class="panel">

        <h3>Total Outstanding</h3>

        <h2>
          ${money(
            debtors.reduce(
              (n, c) =>
                n + balance(c.id),
              0
            )
          )}
        </h2>

        <p>
          Debtors:
          ${debtors.length}
        </p>

      </div>

      ${
        debtors.length
          ? debtors
              .map(
                c => `
                  <div class="panel">

                    <button
                      data-customer="${c.id}"
                      style="
                        background:none;
                        border:0;
                        padding:0;
                        font-size:18px;
                        font-weight:bold;
                        cursor:pointer;
                      "
                    >
                      ${esc(c.name)}
                    </button>

                    <br>

                    Owing:
                    <b>
                      ${money(
                        balance(c.id)
                      )}
                    </b>

                    <br><br>

                    <button
                      data-st="${c.id}"
                    >
                      Statement
                    </button>

                    <button
                      data-pp="${c.id}"
                    >
                      Record Payment
                    </button>

                  </div>
                `
              )
              .join('')
          : '<p>No outstanding debtors.</p>'
      }
    `;

    $$('[data-customer]', r).forEach(
      b =>
        (b.onclick = () =>
          customerPage(
            b.dataset.customer
          ))
    );

    $$('[data-st]', r).forEach(
      b =>
        (b.onclick = () =>
          statement(
            b.dataset.st
          ))
    );

    $$('[data-pp]', r).forEach(
      b =>
        (b.onclick = () =>
          customerPay(
            b.dataset.pp
          ))
    );
  }

  /* =========================================================
     RECEIPT
     ========================================================= */

  function receipt(id) {
    const s =
      sales.find(x => x.id === id);

    if (!s) return;

    const c =
      customer(s.customerId);

    const w =
      window.open(
        '',
        '_blank'
      );

    if (!w) {
      return alert(
        'Allow pop-ups for receipts.'
      );
    }

    const paid =
      salePaid(s);

    const outstanding =
      saleBalance(s);

    w.document.write(`
      <!doctype html>

      <html>

      <head>

        <meta charset="utf-8">

        <meta
          name="viewport"
          content="width=device-width,initial-scale=1"
        >

        <title>
          Receipt ${esc(s.id)}
        </title>

        <style>

          body {
            font-family: Arial, sans-serif;
            max-width: 700px;
            margin: 30px auto;
            padding: 20px;
          }

          button {
            padding: 10px 16px;
            margin-right: 8px;
            cursor: pointer;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th,
          td {
            border: 1px solid #ccc;
            padding: 8px;
            text-align: left;
          }

          .actions {
            margin-bottom: 20px;
          }

          @media print {
            .actions {
              display:none;
            }
          }

        </style>

      </head>

      <body>

        <div class="actions">

          <button
            onclick="window.close()"
          >
            ← Back
          </button>

          <button
            onclick="window.print()"
          >
            Print
          </button>

        </div>

        <h2>
          ${esc(
            biz.name ||
              'FREE OFIS'
          )}
        </h2>

        <p>
          ${
            esc(
              biz.address || ''
            )
          }

          ${
            biz.phone
              ? `<br>${esc(
                  biz.phone
                )}`
              : ''
          }

          ${
            biz.email
              ? `<br>${esc(
                  biz.email
                )}`
              : ''
          }
        </p>

        <hr>

        <p>

          Receipt:
          <b>${esc(s.id)}</b>

          <br>

          Date & Time:
          ${formatDateTime(
            s.transactionAt ||
              s.date
          )}

          <br>

          Customer:
          ${esc(
            c?.name ||
              'Walk-in Customer'
          )}

        </p>

        <table>

          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Price</th>
            <th>Total</th>
          </tr>

          ${s.items
            .map(
              i => `
                <tr>

                  <td>
                    ${esc(i.name)}
                  </td>

                  <td>
                    ${i.quantity}
                  </td>

                  <td>
                    ${money(
                      i.unitPrice
                    )}
                  </td>

                  <td>
                    ${money(
                      i.subtotal
                    )}
                  </td>

                </tr>
              `
            )
            .join('')}

        </table>

        <h3>
          Total:
          ${money(s.total)}
        </h3>

        <p>

          Paid:
          ${money(paid)}

          <br>

          Balance:
          ${money(
            outstanding
          )}

          <br>

          Payment:
          ${esc(
            s.method || 'credit'
          )}

        </p>

      </body>

      </html>
    `);

    w.document.close();
  }

  /* =========================================================
     RECEIPTS LIST
     ========================================================= */

  function renderReceipts() {
    const r =
      $('#receipts-content');

    r.innerHTML = `
      <div class="panel">

        <b>
          ${esc(
            biz.name ||
              'Seller information not set'
          )}
        </b>

        <br>

        ${esc(
          biz.address || ''
        )}

        <br>

        ${esc(
          biz.phone || ''
        )}

        <br>

        ${esc(
          biz.email || ''
        )}

        <br><br>

        <button
          class="primary"
          id="editSeller"
        >
          Edit Seller Information
        </button>

      </div>

      <div class="panel">

        <h3>Recent Receipts</h3>

        ${
          sales.length
            ? sales
                .slice()
                .reverse()
                .slice(0, 50)
                .map(
                  s => `
                    <p>

                      ${formatDateTime(
                        s.transactionAt ||
                          s.date
                      )}

                      —
                      ${esc(s.id)}

                      —
                      ${money(s.total)}

                      <button
                        data-r="${s.id}"
                      >
                        Print / View
                      </button>

                    </p>
                  `
                )
                .join('')
            : '<p>No receipts.</p>'
        }

      </div>
    `;

    $('#editSeller').onclick =
      () => navigate('settings');

    $$('[data-r]', r).forEach(
      b =>
        (b.onclick = () =>
          receipt(
            b.dataset.r
          ))
    );
  }

  /* =========================================================
     REPORTS
     ========================================================= */

  function renderReports() {
    const root = $('#reports-content');
    if (!root) return;

    const active = sales.filter(s => s.status !== 'cancelled');
    const todayDate = today();
    const period = root.dataset.period || 'all';

    const inPeriod = s => {
      if (period === 'today') return transactionDate(s.transactionAt || s.date) === todayDate;
      if (period === '7') {
        const d = new Date(transactionDate(s.transactionAt || s.date) + 'T00:00:00');
        const now = new Date(todayDate + 'T00:00:00');
        return (now - d) >= 0 && (now - d) <= 7 * 86400000;
      }
      if (period === '30') {
        const d = new Date(transactionDate(s.transactionAt || s.date) + 'T00:00:00');
        const now = new Date(todayDate + 'T00:00:00');
        return (now - d) >= 0 && (now - d) <= 30 * 86400000;
      }
      return true;
    };

    const valid = active.filter(inPeriod);
    const validSaleIds = new Set(valid.map(s => s.id));
    const received = pay
      .filter(p => p.status !== 'cancelled' && (!p.saleId || validSaleIds.has(p.saleId)))
      .reduce((n, p) => n + num(p.amount), 0);
    const salesTotal = valid.reduce((n, s) => n + num(s.total), 0);
    const expenses = exp.filter(e => period === 'all' || (period === 'today' ? e.date === todayDate : true))
      .reduce((n, e) => n + num(e.amount), 0);
    const debt = cus.reduce((n, c) => n + balance(c.id), 0);
    const stockValue = inv.reduce((n, x) => n + num(x.quantity) * num(x.price), 0);

    const productTotals = {};
    valid.forEach(s => (s.items || []).forEach(i => {
      const key = i.productId || i.name || 'Unknown';
      if (!productTotals[key]) productTotals[key] = { name: i.name || 'Unknown', qty: 0, value: 0 };
      productTotals[key].qty += num(i.quantity);
      productTotals[key].value += num(i.subtotal);
    }));

    const topProducts = Object.values(productTotals).sort((a, b) => b.value - a.value).slice(0, 5);

    const methods = {};
    pay.filter(p => p.status !== 'cancelled' && (!p.saleId || validSaleIds.has(p.saleId))).forEach(p => {
      const method = p.method || 'other';
      methods[method] = (methods[method] || 0) + num(p.amount);
    });

    root.innerHTML = `
      <div class="panel">
        <h3>Report Period</h3>
        <button data-period="all">All time</button>
        <button data-period="today">Today</button>
        <button data-period="7">Last 7 days</button>
        <button data-period="30">Last 30 days</button>
      </div>

      <div class="panel">
        <p>Total sales: <b>${money(salesTotal)}</b></p>
        <p>Payments received: <b>${money(received)}</b></p>
        <p>Credit outstanding: <b>${money(debt)}</b></p>
        <p>Expenses: <b>${money(expenses)}</b></p>
        <p>Net cash movement: <b>${money(received - expenses)}</b></p>
        <p>Orders: <b>${valid.length}</b></p>
        <p>Average order: <b>${money(valid.length ? salesTotal / valid.length : 0)}</b></p>
        <p>Current stock value: <b>${money(stockValue)}</b></p>
      </div>

      <div class="panel">
        <h3>Top Products</h3>
        ${topProducts.length ? topProducts.map(x => `<p>${esc(x.name)} — ${x.qty} units — <b>${money(x.value)}</b></p>`).join('') : '<p>No sales in this period.</p>'}
      </div>

      <div class="panel">
        <h3>Payments by Method</h3>
        ${Object.keys(methods).length ? Object.entries(methods).sort((a,b) => b[1]-a[1]).map(([m,v]) => `<p>${esc(m)} — <b>${money(v)}</b></p>`).join('') : '<p>No payments in this period.</p>'}
      </div>
    `;

    $$('[data-period]', root).forEach(b => {
      b.onclick = () => {
        root.dataset.period = b.dataset.period;
        renderReports();
      };
    });
  }

  /* =========================================================
     EXPENSES
     ========================================================= */

  function renderExpenses() {
    const r =
      $('#expenses-content');

    r.innerHTML = `
      <div class="panel">

        <button
          class="primary"
          id="ae"
        >
          + Add Expense
        </button>

        <div id="ef"></div>

      </div>

      <div class="panel">

        ${
          exp.length
            ? exp
                .slice()
                .reverse()
                .map(
                  x => `
                    ${formatDateTime(
                      x.transactionAt ||
                        `${x.date}T00:00:00`
                    )}
                    —
                    ${esc(
                      x.description
                    )}
                    —
                    ${money(
                      x.amount
                    )}
                    <br>
                  `
                )
                .join('')
            : 'No expenses.'
        }

      </div>
    `;

    $('#ae').onclick = () => {
      $('#ef').innerHTML = `
        <form id="exf">

          <input
            id="ed"
            placeholder="Description"
            required
          >

          <br><br>

          <input
            id="ea"
            type="number"
            min="0"
            placeholder="Amount"
            required
          >

          <br><br>

          <input
            id="exd"
            type="date"
            value="${today()}"
            required
          >

          <br><br>

          <input
            id="ext"
            type="time"
            value="${timeNow()}"
            required
          >

          <br><br>

          <button class="primary">
            Save Expense
          </button>

        </form>
      `;

      $('#exf').onsubmit = e => {
        e.preventDefault();

        const date =
          $('#exd').value;

        const time =
          $('#ext').value;

        exp.push({
          id: uid('EXP'),
          description:
            $('#ed').value.trim(),
          amount:
            Number(
              $('#ea').value
            ),
          date,
          time,
          transactionAt:
            transactionTimestamp(
              date,
              time
            )
        });

        save(K.exp, exp);

        renderExpenses();
      };
    };
  }

  /* =========================================================
     SETTINGS / BUSINESS DETAILS
     ========================================================= */

  function renderSettings() {
    const s =
      $('#settings');

    let r =
      $('.freeofis-set', s);

    if (!r) {
      r =
        document.createElement(
          'div'
        );

      r.className =
        'freeofis-set';

      s.appendChild(r);
    }

    r.innerHTML = `
      <div class="panel">

        <h3>
          Seller / Store Information
        </h3>

        <p>
          These details will appear
          on receipts.
        </p>

        <form id="bf">

          <input
            id="bn"
            placeholder="Store / Business name"
            value="${esc(
              biz.name || ''
            )}"
          >

          <br><br>

          <input
            id="ba"
            placeholder="Business address"
            value="${esc(
              biz.address || ''
            )}"
          >

          <br><br>

          <input
            id="bp"
            placeholder="Business phone"
            value="${esc(
              biz.phone || ''
            )}"
          >

          <br><br>

          <input
            id="be"
            type="email"
            placeholder="Business email"
            value="${esc(
              biz.email || ''
            )}"
          >

          <br><br>

          <button
            class="primary"
            type="submit"
          >
            Save Business Information
          </button>

        </form>

      </div>

      <div class="panel">
        <h3>Data Safety</h3>
        <p>Export a complete Free Ofis backup before moving devices or making major changes.</p>
        <button id="exportData">Export Backup</button>
        <button id="importData">Import Backup</button>
        <input id="importFile" type="file" accept="application/json" style="display:none">
        <br><br>
        <button id="resetDemo" type="button">Clear All Free Ofis Data</button>
      </div>
    `;

    $('#exportData').onclick = exportBackup;
    $('#importData').onclick = () => $('#importFile').click();
    $('#importFile').onchange = importBackup;
    $('#resetDemo').onclick = clearAllData;

    $('#bf').onsubmit = e => {
      e.preventDefault();

      biz = {
        name:
          $('#bn').value.trim(),

        address:
          $('#ba').value.trim(),

        phone:
          $('#bp').value.trim(),

        email:
          $('#be').value.trim()
      };

      /*
         Save immediately and verify that the value actually
         reached localStorage.
      */

      save(K.biz, biz);

      const saved =
        load(K.biz, {});

      if (
        saved.name !== biz.name ||
        saved.address !==
          biz.address ||
        saved.phone !==
          biz.phone ||
        saved.email !==
          biz.email
      ) {
        return alert(
          'Business information could not be saved.'
        );
      }

      alert(
        'Business information saved successfully.'
      );

      renderSettings();
    };
  }

  /* =========================================================
     DATA BACKUP / RESTORE
     ========================================================= */

  function exportBackup() {
    const payload = {
      app: 'Free Ofis',
      version: DATA_VERSION,
      exportedAt: localDateTime(),
      data: {
        inventory: inv,
        customers: cus,
        sales,
        payments: pay,
        expenses: exp,
        business: biz
      }
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `freeofis-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        const d = payload?.data || payload;
        if (!d || !Array.isArray(d.inventory) || !Array.isArray(d.customers) || !Array.isArray(d.sales) || !Array.isArray(d.payments) || !Array.isArray(d.expenses)) {
          throw new Error('Invalid Free Ofis backup');
        }

        if (!confirm('Import this backup? Existing Free Ofis data will be replaced by the backup.')) return;

        save(K.inv, d.inventory);
        save(K.cus, d.customers);
        save(K.sales, d.sales);
        save(K.pay, d.payments);
        save(K.exp, d.expenses);
        save(K.biz, d.business || {});
        localStorage.setItem('freeofis_data_version', String(DATA_VERSION));

        alert('Backup imported. Reloading Free Ofis now.');
        location.reload();
      } catch (err) {
        console.error(err);
        alert('This file is not a valid Free Ofis backup.');
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function clearAllData() {
    if (!confirm('This will permanently clear all Free Ofis inventory, customers, sales, payments, expenses and business information from this browser. Continue?')) return;
    if (!confirm('Final confirmation: clear ALL Free Ofis data? Export a backup first if you may need it later.')) return;

    Object.values(K).forEach(key => localStorage.removeItem(key));
    localStorage.removeItem('freeofis_data_version');
    alert('Free Ofis data cleared. Reloading now.');
    location.reload();
  }

  /* =========================================================
     MODAL
     ========================================================= */

  function modal(html) {
    const old =
      $('.freeofis-modal');

    if (old) {
      old.remove();
    }

    const o =
      document.createElement(
        'div'
      );

    o.className =
      'freeofis-modal';

    o.style = `
      position:fixed;
      inset:0;
      background:#0008;
      z-index:9999;
      padding:20px;
      overflow:auto;
    `;

    o.innerHTML = `
      <div
        style="
          background:white;
          max-width:900px;
          margin:40px auto;
          padding:24px;
          border-radius:12px;
        "
      >

        <button
          id="x"
          style="
            float:right;
            padding:8px 12px;
          "
        >
          Close
        </button>

        ${html}

      </div>
    `;

    document.body.appendChild(o);

    $('#x', o).onclick =
      () => o.remove();
  }

  /* =========================================================
     INITIAL RENDER
     ========================================================= */

  renderInv();
  renderSales();
  // Start navigation stack at home (root). Back is hidden here.
  navStack.length = 0;
  navStack.push('home');
  show('home', { replace: true });

});
