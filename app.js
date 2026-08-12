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

const inventory = JSON.parse(
    localStorage.getItem('freeofis_inventory') || '[]'
);

inventory.push(item);

localStorage.setItem(
    'freeofis_inventory',
    JSON.stringify(inventory)
);

alert('Item saved successfully.');

form.remove();

renderInventory();         });
      });
    }
  });
renderRecords();
function renderInventory() {
  const inventorySection = document.getElementById('inventory');
  if (!inventorySection) return;

  const inventory = JSON.parse(
    localStorage.getItem('freeofis_inventory') || '[]'
  );

  if (inventory.length === 0) return;

  const empty = inventorySection.querySelector('.empty');
  if (empty) empty.remove();
let addButton = inventorySection.querySelector('.add-inventory-btn');

if (!addButton) {
  addButton = document.createElement('button');
  addButton.className = 'add-inventory-btn';
  addButton.textContent = '+ Add Inventory Item';
  addButton.style.cssText = 'padding:12px 18px;margin:16px 0;background:#111827;color:white;border:none;border-radius:8px;cursor:pointer;font-size:16px;';

  inventorySection.appendChild(addButton);

  addButton.addEventListener('click', function () {
    if (inventorySection.querySelector('.inventory-form')) return;

    const form = document.createElement('form');
    form.className = 'inventory-form';
    form.style.cssText = 'padding:16px;margin:12px 0;border:1px solid #ddd;border-radius:8px;';

    form.innerHTML = `
      <label>Item Name</label><br>
      <input id="inventory-name" type="text" placeholder="e.g. Boubou" required style="padding:10px;width:90%;margin:6px 0 12px;"><br>

      <label>Quantity</label><br>
      <input id="inventory-quantity" type="number" placeholder="e.g. 10" required style="padding:10px;width:90%;margin:6px 0 12px;"><br>

      <label>Price</label><br>
      <input id="inventory-price" type="number" placeholder="e.g. 7000" required style="padding:10px;width:90%;margin:6px 0 12px;"><br>

      <button type="submit" style="padding:10px 16px;background:#111827;color:white;border:none;border-radius:6px;cursor:pointer;">
        Save Item
      </button>
    `;

    inventorySection.insertBefore(form, addButton);

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      const item = {
        name: document.getElementById('inventory-name').value,
        quantity: document.getElementById('inventory-quantity').value,
        price: document.getElementById('inventory-price').value
      };

      const inventory = JSON.parse(
        localStorage.getItem('freeofis_inventory') || '[]'
      );

      inventory.push(item);

      localStorage.setItem(
        'freeofis_inventory',
        JSON.stringify(inventory)
      );

      alert('Item saved successfully.');

      form.remove();
      renderInventory();
    });
  });
}
const totalStockValue = inventory.reduce(function(total, item) {
    return total + (Number(item.quantity) || 0) * (Number(item.price) || 0);
}, 0);

let summary = inventorySection.querySelector('.inventory-summary');

if (!summary) {
    summary = document.createElement('div');
    summary.className = 'inventory-summary';
    inventorySection.insertBefore(summary, inventorySection.querySelector('#inventory-list'));
}

summary.innerHTML = `
    <div style="padding:16px;margin:12px 0;border:1px solid #ddd;border-radius:10px;background:#f5f5f5;">
        <strong>Total Stock Value</strong><br>
        ₦${totalStockValue.toLocaleString()}
    </div>
`;
 
  let list = document.getElementById('inventory-list');

  if (!list) {
    list = document.createElement('div');
    list.id = 'inventory-list';
    inventorySection.appendChild(list);
  }

 list.innerHTML = inventory.map(function(item, index) {
    return `
        <div style="padding:16px;margin-top:12px;border:1px solid #ddd;border-radius:10px;">
            <strong>${item.name || ''}</strong><br>
            Quantity: ${item.quantity || 0}<br>
            Price: ₦${item.price || 0}<br>
            <small>Item #${index + 1}</small><br><br>

            <button type="button"
                class="edit-inventory-btn"
                data-index="${index}"
                style="padding:8px 12px;margin-right:8px;background:#111827;color:white;border:none;border-radius:6px;cursor:pointer;">
                Edit
            </button>

            <button type="button"
                class="delete-inventory-btn"
                data-index="${index}"
                style="padding:8px 12px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;">
                Delete
            </button>
        </div>
    `;
}).join('');

list.querySelectorAll('.edit-inventory-btn').forEach(function(button) {
    button.addEventListener('click', function() {
        const index = Number(this.dataset.index);
        const item = inventory[index];

        const name = prompt('Item name:', item.name || '');
        if (name === null) return;

        const quantity = prompt('Quantity:', item.quantity || 0);
        if (quantity === null) return;

        const price = prompt('Price:', item.price || 0);
        if (price === null) return;

        inventory[index] = {
            name: name,
            quantity: quantity,
            price: price
        };

        localStorage.setItem(
            'freeofis_inventory',
            JSON.stringify(inventory)
        );

        renderInventory();
    });
});

list.querySelectorAll('.delete-inventory-btn').forEach(function(button) {
    button.addEventListener('click', function() {
        const index = Number(this.dataset.index);

        if (!confirm('Delete this inventory item?')) return;

        inventory.splice(index, 1);

        localStorage.setItem(
            'freeofis_inventory',
            JSON.stringify(inventory)
        );

        renderInventory();
    });
});
}

renderInventory();
  show('home');
});
