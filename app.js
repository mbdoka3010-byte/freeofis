document.addEventListener('DOMContentLoaded', function () {
  const sections = document.querySelectorAll('.section');
  const controls = document.querySelectorAll('[data-section]');
  const title = document.getElementById('title');

  const titles = {
    home: 'Your workspace',
    records: 'Records',
    inventory: 'Inventory',
    media: 'Media',
    documents: 'Documents',
    tools: 'AI Tools',
    settings: 'Settings',
    help: 'Help'
  };

  function show(name) {
    sections.forEach(function (section) {
      section.classList.toggle('show', section.id === name);
    });

    controls.forEach(function (control) {
      control.classList.toggle('active', control.dataset.section === name);
    });

    if (title) {
      title.textContent = titles[name] || 'Your workspace';
    }
  }

  controls.forEach(function (control) {
    control.addEventListener('click', function () {
      show(control.dataset.section);
    });
  });

  document.querySelectorAll('button, a').forEach(function (button) {
    if (button.textContent.trim().toLowerCase().includes('add first record')) {
      button.addEventListener('click', function () {
        const recordsSection = document.getElementById('records');

        if (!recordsSection) return;

        if (document.getElementById('record-form')) {
          return;
        }

        const form = document.createElement('form');
        form.id = 'record-form';
        form.style.marginTop = '20px';

        form.innerHTML = `
          <h3>Add Record</h3>

          <label>Type</label><br>
          <select id="record-type" required>
            <option value="Sale">Sale</option>
            <option value="Expense">Expense</option>
            <option value="Debt">Debt</option>
            <option value="Other">Other</option>
          </select>
          <br><br>

          <label>Amount</label><br>
          <input id="record-amount" type="number" placeholder="Enter amount" required>
          <br><br>

          <label>Description</label><br>
          <input id="record-description" type="text" placeholder="What is this record about?" required>
          <br><br>

          <label>Date</label><br>
          <input id="record-date" type="date" required>
          <br><br>

          <button type="submit">Save Record</button>
        `;

        recordsSection.appendChild(form);

        document.getElementById('record-date').value =
          new Date().toISOString().split('T')[0];

        form.addEventListener('submit', function (event) {
          event.preventDefault();

          const record = {
            type: document.getElementById('record-type').value,
            amount: document.getElementById('record-amount').value,
            description: document.getElementById('record-description').value,
            date: document.getElementById('record-date').value
          };

          const records =
            JSON.parse(localStorage.getItem('freeofis_records') || '[]');

          records.push(record);

          localStorage.setItem(
            'freeofis_records',
            JSON.stringify(records)
          );

          alert('Record saved successfully.');
renderRecords();
          form.remove();
        });
      });
    }
  });
function renderRecords() {
  const section = document.getElementById('records');
  if (!section) return;

  const records = JSON.parse(
    localStorage.getItem('freeofis_records') || '[]'
  );

  let display = document.getElementById('records-display');

  if (!display) {
    display = document.createElement('div');
    display.id = 'records-display';
    section.appendChild(display);
  }

  if (records.length === 0) {
    display.innerHTML = '';
    return;
  }

  display.innerHTML = `
    <h3>Saved Records</h3>
    <div>
      ${records.map((record, index) => `
        <div style="border:1px solid #ddd;padding:12px;margin:10px 0;border-radius:8px;">
          <strong>${record.type || 'Record'}</strong><br>
          Amount: ₦${Number(record.amount || 0).toLocaleString()}<br>
          Description: ${record.description || ''}<br>
          Date: ${record.date || ''}<br>
          <small>Record #${index + 1}</small>
        </div>
      `).join('')}
    </div>
  `;
}

controls.forEach(function(control) {
  control.addEventListener('click', function() {
    if (control.dataset.section === 'records') {
      setTimeout(renderRecords, 50);
    }
  });
});
  document.querySelectorAll('button').forEach(function(button) {
    if (button.textContent.trim().toLowerCase() === 'add item') {
      button.addEventListener('click', function() {
        const inventorySection = document.getElementById('inventory');

        if (!inventorySection) return;

        if (document.getElementById('inventory-form')) {
          return;
        }

        const form = document.createElement('form');
        form.id = 'inventory-form';
        form.style.marginTop = '20px';

        form.innerHTML = `
          <h3>Add Item</h3>

          <label>Item name</label><br>
          <input id="inventory-name" type="text" placeholder="Enter item name" required>
          <br><br>

          <label>Quantity</label><br>
          <input id="inventory-quantity" type="number" placeholder="Enter quantity" required>
          <br><br>

          <label>Price</label><br>
          <input id="inventory-price" type="number" placeholder="Enter price" required>
          <br><br>

          <button type="submit">Save Item</button>
        `;

        inventorySection.appendChild(form);

        form.addEventListener('submit', function(event) {
          event.preventDefault();

          const item = {
            name: document.getElementById('inventory-name').value,
            quantity: document.getElementById('inventory-quantity').value,
            price: document.getElementById('inventory-price').value
          };

          const inventory =
            JSON.parse(localStorage.getItem('freeofis_inventory') || '[]');

          inventory.push(item);

          localStorage.setItem(
            'freeofis_inventory',
            JSON.stringify(inventory)
          );

          alert('Item saved successfully.');

          form.remove();
        });
      });
    }
  });
renderRecords();

  show('home');
});
