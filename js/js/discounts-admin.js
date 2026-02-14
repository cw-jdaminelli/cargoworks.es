(function(){
  const PASSWORD_HASH = '6ee04ecb6d43368382eba2d295cde6f4c46435093c636a74607f828c74639cf4';
  const DATA_URL = '../data/discounts.json';
  const sessionKey = 'cwDiscountsAdminUnlocked';

  const gate = document.getElementById('discountsGate');
  const gateInput = document.getElementById('discountsGateInput');
  const gateButton = document.getElementById('discountsGateButton');
  const gateStatus = document.getElementById('discountsGateStatus');

  const tableBody = document.querySelector('#discountsTable tbody');
  const addRowBtn = document.getElementById('discountsAddRow');
  const exportBtn = document.getElementById('discountsExport');
  const importBtn = document.getElementById('discountsImport');
  const importInput = document.getElementById('discountsImportFile');
  const statusEl = document.getElementById('discountsStatus');

  function setStatus(msg){ if (statusEl) statusEl.textContent = msg || ''; }

  async function sha256Hex(text){
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function unlockGate(){
    if (gate) gate.classList.add('hidden');
    try { sessionStorage.setItem(sessionKey, '1'); } catch(_) {}
  }

  async function handleGate(){
    try {
      const value = (gateInput && gateInput.value || '').trim();
      if (!value) { if (gateStatus) gateStatus.textContent = 'Enter a password.'; return; }
      const hash = await sha256Hex(value);
      if (hash !== PASSWORD_HASH) {
        if (gateStatus) gateStatus.textContent = 'Incorrect password.';
        return;
      }
      if (gateStatus) gateStatus.textContent = '';
      unlockGate();
    } catch(_) {
      if (gateStatus) gateStatus.textContent = 'Could not verify password.';
    }
  }

  function cell(text, col){
    const td = document.createElement('td');
    td.contentEditable = 'true';
    td.dataset.col = col;
    td.textContent = text == null ? '' : String(text);
    return td;
  }

  function checkboxCell(checked){
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!checked;
    input.dataset.col = 'active';
    td.appendChild(input);
    return td;
  }

  function deleteCell(){
    const td = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'discounts-delete';
    btn.textContent = 'Delete';
    btn.addEventListener('click', function(){
      const row = td.parentElement;
      if (row) row.remove();
    });
    td.appendChild(btn);
    return td;
  }

  function addRow(item){
    if (!tableBody) return;
    const row = document.createElement('tr');
    row.appendChild(cell(item && item.code, 'code'));
    row.appendChild(cell(item && item.type, 'type'));
    row.appendChild(cell(item && item.amount, 'amount'));
    row.appendChild(cell(item && item.minOrder, 'minOrder'));
    row.appendChild(cell(item && item.start, 'start'));
    row.appendChild(cell(item && item.end, 'end'));
    row.appendChild(cell(item && item.maxUses, 'maxUses'));
    row.appendChild(checkboxCell(item && item.active));
    row.appendChild(cell(item && item.notes, 'notes'));
    row.appendChild(deleteCell());
    tableBody.appendChild(row);
  }

  function readTable(){
    const rows = Array.from(tableBody ? tableBody.querySelectorAll('tr') : []);
    return rows.map(row => {
      const data = {};
      const tds = Array.from(row.querySelectorAll('td'));
      tds.forEach(td => {
        const col = td.dataset.col;
        if (!col) return;
        if (col === 'active') {
          const cb = td.querySelector('input[type="checkbox"]');
          data.active = !!(cb && cb.checked);
          return;
        }
        data[col] = (td.textContent || '').trim();
      });
      return {
        code: data.code || '',
        type: data.type || 'percent',
        amount: Number(data.amount || 0) || 0,
        minOrder: Number(data.minOrder || 0) || 0,
        start: data.start || '',
        end: data.end || '',
        maxUses: Number(data.maxUses || 0) || 0,
        active: !!data.active,
        notes: data.notes || ''
      };
    }).filter(item => item.code);
  }

  function downloadJson(json){
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discounts.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadDiscounts(){
    try {
      const res = await fetch(DATA_URL + '?v=' + Date.now());
      if (!res.ok) throw new Error('Fetch failed');
      const json = await res.json();
      const codes = Array.isArray(json.codes) ? json.codes : [];
      if (tableBody) tableBody.innerHTML = '';
      codes.forEach(addRow);
      if (!codes.length) addRow({ code: '', type: 'percent', amount: 0, minOrder: 0, start: '', end: '', maxUses: 0, active: true, notes: '' });
      setStatus('Loaded ' + codes.length + ' code(s).');
    } catch(_) {
      setStatus('Could not load discounts.json.');
      if (tableBody && !tableBody.children.length) {
        addRow({ code: '', type: 'percent', amount: 0, minOrder: 0, start: '', end: '', maxUses: 0, active: true, notes: '' });
      }
    }
  }

  function handleExport(){
    const json = {
      version: new Date().toISOString().slice(0, 10),
      codes: readTable()
    };
    downloadJson(json);
    setStatus('Exported JSON.');
  }

  function handleImport(){
    if (importInput) importInput.click();
  }

  function handleFileChange(){
    const file = importInput && importInput.files && importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(){
      try {
        const json = JSON.parse(reader.result);
        const codes = Array.isArray(json.codes) ? json.codes : [];
        if (tableBody) tableBody.innerHTML = '';
        codes.forEach(addRow);
        setStatus('Imported ' + codes.length + ' code(s).');
      } catch(_) {
        setStatus('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  }

  if (gateButton) gateButton.addEventListener('click', handleGate);
  if (gateInput) gateInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') { e.preventDefault(); handleGate(); }
  });

  if (addRowBtn) addRowBtn.addEventListener('click', function(){ addRow({}); });
  if (exportBtn) exportBtn.addEventListener('click', handleExport);
  if (importBtn) importBtn.addEventListener('click', handleImport);
  if (importInput) importInput.addEventListener('change', handleFileChange);

  (function init(){
    try {
      if (sessionStorage.getItem(sessionKey) === '1') {
        unlockGate();
      }
    } catch(_) {}
    loadDiscounts();
  })();
})();
