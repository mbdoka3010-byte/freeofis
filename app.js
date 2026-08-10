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

          form.remove();
        });
      });
    }
  });

  show('home');
});
