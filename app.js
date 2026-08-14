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
    localStorage.setItem(key, JSON.stringify(value));
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

  const money = n =>
    '₦' +
    Number(n || 0).toLocaleString('en-NG', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });

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
        sku: x.sku || ''
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
     REPAIR OLD SALES THAT HAD PAYMENT BUT NO PAYMENT RECORD
     ========================================================= */

  sales.forEach(s => {
    const linked = pay
      .filter(
        p =>
          p.saleId === s.id &&
          p.status !== 'cancelled'
      )
      .reduce((n, p) => n + Number(p.amount || 0), 0);

    const legacyUnlinked = pay.some(
      p =>
        !p.saleId &&
        p.customerId === s.customerId &&
        Number(p.amount || 0) === Number(s.paid || 0) &&
        transactionDate(p.transactionAt || p.date) ===
          transactionDate(s.transactionAt || s.date) &&
        p.status !== 'cancelled'
    );

    if (
      Number(s.paid || 0) > 0 &&
      linked === 0 &&
      !legacyUnlinked
    ) {
      pay.push({
        id: uid('PAY'),
        customerId: s.customerId || null,
        saleId: s.id,
        amount: Number(s.paid),
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
    }
  });

  save(K.inv, inv);
  save(K.cus, cus);
  save(K.sales, sales);
  save(K.pay, pay);
  save(K.exp, exp);
  save(K.biz, biz);

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

  /* =========================================================
     NAVIGATION
     ========================================================= */

  function show(id) {
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

    const renders = {
      business: renderBusiness,
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

  function wire() {
    $$('[data-section]').forEach(x => {
      if (x.dataset.wired) return;

      x.dataset.wired = '1';

      x.onclick = () =>
        show(x.dataset.section);
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
        'sales & records': 'records',
        inventory: 'inventory'
      };

      for (const key in map) {
        if (text.includes(key)) {
          card.dataset.wired = '1';
          card.dataset.section = map[key];
          card.onclick = () => show(map[key]);
          break;
        }
      }
    });
  }

  wire();

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
     Order payments are now validated against the ORDER balance,
     not against the customer's aggregate balance.

     This fixes the previous:
     "Payment could not be recorded."
     problem.
  */

  function addPay(
    cid,
    amount,
    date = today(),
    method = 'cash',
    reference = '',
    saleId = null,
    time = timeNow()
  ) {
    const amt = Number(amount);

    if (!amt || amt <= 0) {
      return false;
    }

    if (saleId) {
      const s = sales.find(x => x.id === saleId);

      if (
        !s ||
        s.status === 'cancelled' ||
        amt > saleBalance(s)
      ) {
        return false;
      }

      if (s.customerId !== cid) {
        return false;
      }
    } else {
      if (!cid || amt > balance(cid)) {
        return false;
      }
    }

    const transactionAt =
      transactionTimestamp(date, time);

    pay.push({
      id: uid('PAY'),
      customerId: cid,
      saleId,
      amount: amt,
      date,
      time,
      transactionAt,
      method,
      reference,
      status: 'completed'
    });

    save(K.pay, pay);

    if (saleId) {
      const s = sales.find(x => x.id === saleId);

      if (s) {
        syncSalePaymentFields(s);
        save(K.sales, sales);
      }
    }

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
      $('#' + a).onclick = () => show(b);
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

    $$('[data-ie]', r).forEach(
      b =>
        (b.onclick = () =>
          invForm(item(b.dataset.ie)))
    );

    $$('[data-id]', r).forEach(
      b =>
        (b.onclick = () => {
          if (
            !confirm(
              'Delete this inventory item?'
            )
          )
            return;

          inv = inv.filter(
            x => x.id !== b.dataset.id
          );

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
          required
          placeholder="Selling price"
          value="${old?.price ?? 0}"
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
          duplicate.price = price;

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
        price,
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

    if (paid > total) {
      return alert(
        'Amount paid cannot exceed the order total.'
      );
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
      amount > current
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

    pay
      .filter(
        p =>
          p.saleId === s.id &&
          p.status !== 'cancelled'
      )
      .forEach(
        p =>
          (p.status = 'cancelled')
      );

    s.items.forEach(i => {
      const p =
        item(i.productId);

      if (p) {
        p.quantity +=
          Number(i.quantity || 0);
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
    const c =
      customer(cid);

    if (!c) {
      return alert(
        'Customer not found.'
      );
    }

    const customerSales =
      sales
        .filter(
          s =>
            s.customerId === cid &&
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

    const customerPayments =
      pay
        .filter(
          p =>
            p.customerId === cid &&
            p.status !== 'cancelled'
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
            onclick="history.back()"
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
      () => show('settings');

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
    const valid =
      sales.filter(
        s =>
          s.status !== 'cancelled'
      );

    const salesTotal =
      valid.reduce(
        (n, s) =>
          n + Number(s.total || 0),
        0
      );

    const received =
      pay.reduce(
        (n, p) =>
          n +
          (
            p.status !== 'cancelled'
              ? Number(
                  p.amount || 0
                )
              : 0
          ),
        0
      );

    const debt =
      cus.reduce(
        (n, c) =>
          n + balance(c.id),
        0
      );

    const expenses =
      exp.reduce(
        (n, e) =>
          n + Number(e.amount || 0),
        0
      );

    $('#reports-content').innerHTML = `
      <div class="panel">

        <p>
          Total sales:
          <b>
            ${money(
              salesTotal
            )}
          </b>
        </p>

        <p>
          Payments received:
          <b>
            ${money(
              received
            )}
          </b>
        </p>

        <p>
          Credit outstanding:
          <b>
            ${money(debt)}
          </b>
        </p>

        <p>
          Expenses:
          <b>
            ${money(
              expenses
            )}
          </b>
        </p>

        <p>
          Net cash movement:
          <b>
            ${money(
              received -
                expenses
            )}
          </b>
        </p>

        <p>
          Orders:
          <b>
            ${valid.length}
          </b>
        </p>

      </div>
    `;
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
    `;

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
  show('home');

});
