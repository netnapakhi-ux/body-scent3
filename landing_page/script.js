/* ==========================================================
   Body Scent — script.js (shared by every page)
   Each section runs only if its elements exist on the page.

   IDs used:
   - product.html : #filter-bar, #product-list
   - order.html   : #orderForm, #customerName, #contact, #items, #total, #note
   - admin.html   : #ordersTable tbody
   ========================================================== */

/* ---------- CONFIG: replace these two values ---------- */
const APPS_SCRIPT_URL = 'APPS_SCRIPT_URL'; // Web app URL ending in /exec
const CSV_URL = 'CSV_URL';                 // Published CSV link of the Google Sheet

document.addEventListener('DOMContentLoaded', () => {
  initProductPage();
  initOrderPage();
  initAdminPage();
});

/* ==========================================================
   1) product.html — product cards + mood filter
   ========================================================== */
const MOODS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'fresh', label: 'Fresh' },
  { key: 'sweet', label: 'Sweet' },
  { key: 'confident', label: 'Confident' },
  { key: 'romance', label: 'Romance' }
];

function initProductPage() {
  const filterBar = document.getElementById('filter-bar');
  const list = document.getElementById('product-list');
  if (!filterBar || !list) return;

  const params = new URLSearchParams(window.location.search);
  const requested = (params.get('mood') || 'all').toLowerCase();
  let currentMood = MOODS.some(m => m.key === requested) ? requested : 'all';
  let products = [];

  // Build filter buttons
  filterBar.innerHTML = '';
  MOODS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'filter-btn';
    btn.dataset.mood = m.key;
    btn.textContent = m.label;
    btn.addEventListener('click', () => {
      currentMood = m.key;
      updateActiveButton();
      render();
      // keep the URL in sync so the filtered view can be shared
      const url = new URL(window.location.href);
      if (m.key === 'all') url.searchParams.delete('mood');
      else url.searchParams.set('mood', m.key);
      history.replaceState(null, '', url);
    });
    filterBar.appendChild(btn);
  });

  function updateActiveButton() {
    filterBar.querySelectorAll('.filter-btn').forEach(b => {
      b.classList.toggle('is-active', b.dataset.mood === currentMood);
    });
  }

  function render() {
    list.innerHTML = '';
    const shown = currentMood === 'all'
      ? products
      : products.filter(p => p.mood === currentMood);

    if (shown.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-center';
      empty.textContent = 'ไม่พบสินค้าในหมวดนี้';
      list.appendChild(empty);
      return;
    }
    shown.forEach(p => list.appendChild(buildProductCard(p)));
  }

  updateActiveButton();

  fetch('products.json')
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(data => {
      products = Array.isArray(data) ? data : [];
      render();
    })
    .catch(error => {
      console.error(error);
      list.innerHTML = '';
      const msg = document.createElement('p');
      msg.className = 'text-center';
      msg.textContent = 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง';
      list.appendChild(msg);
    });
}

function buildProductCard(p) {
  const card = document.createElement('article');
  card.className = 'product-card';
  card.dataset.mood = p.mood;

  const img = document.createElement('img');
  img.className = 'product-card__image';
  img.src = p.image;
  img.alt = p.name;
  img.loading = 'lazy';
  card.appendChild(img);

  const tag = document.createElement('span');
  tag.className = 'mood-tag';
  tag.textContent = p.mood;
  card.appendChild(tag);

  const name = document.createElement('h3');
  name.className = 'product-card__name';
  name.textContent = p.name;
  card.appendChild(name);

  if (p.size) {
    const size = document.createElement('div');
    size.className = 'product-card__meta';
    size.textContent = p.size;
    card.appendChild(size);
  }

  const footer = document.createElement('div');
  footer.className = 'product-card__footer';

  const price = document.createElement('span');
  price.className = 'price';
  price.textContent = formatBaht(p.price);
  footer.appendChild(price);

  // item = name + size (if any), price = number
  const itemName = p.size ? p.name + ' ' + p.size : p.name;
  const buy = document.createElement('a');
  buy.className = 'btn btn--small';
  buy.textContent = 'สั่งซื้อ';
  buy.href = 'order.html?item=' + encodeURIComponent(itemName) +
             '&price=' + encodeURIComponent(p.price);
  footer.appendChild(buy);

  card.appendChild(footer);
  return card;
}

function formatBaht(n) {
  return Number(n).toLocaleString('th-TH') + ' บาท';
}

/* ==========================================================
   2) order.html — prefill from URL + submit to Apps Script
   ========================================================== */
function initOrderPage() {
  const form = document.getElementById('orderForm');
  if (!form) return;

  // --- Prefill item + price from URL parameters ---
  const params = new URLSearchParams(window.location.search);
  const item = params.get('item');
  const price = params.get('price');

  const itemsEl = document.getElementById('items');
  const totalEl = document.getElementById('total');

  if (itemsEl && item) itemsEl.value = item;
  if (totalEl && price) totalEl.value = price; // fills the total field too

  // --- Submit ---
  form.addEventListener('submit', event => {
    event.preventDefault();

    const submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      customerName: valueOf('customerName'),
      contact: valueOf('contact'),
      items: valueOf('items'),
      total: valueOf('total'),
      note: valueOf('note')
    };

    fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
    .then(() => { window.location.href = 'thankyou.html'; })
    .catch(error => {
      console.error(error);
      alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
      if (submitBtn) submitBtn.disabled = false;
    });
  });
}

function valueOf(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

/* ==========================================================
   3) admin.html — read CSV and show newest orders first
   ========================================================== */
function initAdminPage() {
  const tbody = document.querySelector('#ordersTable tbody');
  if (!tbody) return;

  setMessageRow(tbody, 'กำลังโหลดข้อมูล...');

  // add a timestamp so the browser does not serve an old cached copy
  const sep = CSV_URL.includes('?') ? '&' : '?';

  fetch(CSV_URL + sep + '_=' + Date.now(), { cache: 'no-store' })
    .then(res => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.text();
    })
    .then(text => {
      let rows = parseCSV(text);

      // drop empty lines
      rows = rows.filter(r => r.some(cell => cell.trim() !== ''));

      // skip a header row if present (first cell has no digits, a date always does)
      if (rows.length && !/\d/.test(rows[0][0])) rows.shift();

      // Sheet rows are appended in time order, so reversing puts the newest first
      rows.reverse();

      tbody.innerHTML = '';
      if (rows.length === 0) {
        setMessageRow(tbody, 'ยังไม่มีคำสั่งซื้อ');
        return;
      }

      rows.forEach(r => {
        const tr = document.createElement('tr');
        // columns: A date, B name, C contact, D items, E total, F note
        for (let i = 0; i < 6; i++) {
          const td = document.createElement('td');
          td.textContent = r[i] !== undefined ? r[i] : ''; // textContent: safe against injected HTML
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      });
    })
    .catch(error => {
      console.error(error);
      setMessageRow(tbody, 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    });
}

function setMessageRow(tbody, message) {
  tbody.innerHTML = '';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 6;
  td.style.textAlign = 'center';
  td.textContent = message;
  tr.appendChild(td);
  tbody.appendChild(tr);
}

/* ---------- CSV parser (no external library) ----------
   Handles: quoted fields, commas and line breaks inside quotes,
   "" as an escaped quote, CRLF/LF line endings, and a leading BOM. */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  // last field / row if the file does not end with a newline
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
