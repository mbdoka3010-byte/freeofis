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

    document.querySelectorAll('.nav').forEach(function (nav) {
      nav.classList.toggle('active', nav.dataset.section === name);
    });

    title.textContent = titles[name] || 'Your workspace';
  }

  controls.forEach(function (control) {
    control.addEventListener('click', function () {
      show(control.dataset.section);
    });
  });

  show('home');
});
