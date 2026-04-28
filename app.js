// ── DATA ──────────────────────────────────────────────────────
let currentUser = null;
let transactions = [];
try {
  transactions = JSON.parse(localStorage.getItem('ssilog_tx') || '[]');
} catch (e) {
  console.error("Lỗi đọc dữ liệu giao dịch:", e);
  transactions = [];
}
let editingTxId  = null;
const $ = id => document.getElementById(id);

// ── AUTH ──────────────────────────────────────────────────────
function switchTab(tab) {
  const tabLogin = $('tabLogin');
  const tabRegister = $('tabRegister');
  const loginForm = $('loginForm');
  const registerForm = $('registerForm');

  if (tabLogin && tabRegister && loginForm && registerForm) {
    tabLogin.classList.toggle('active', tab === 'login');
    tabRegister.classList.toggle('active', tab === 'register');
    loginForm.style.display = tab === 'login' ? 'block' : 'none';
    registerForm.style.display = tab === 'register' ? 'block' : 'none';
  }
}

function doLogin() {
  const email = $('loginEmail').value.trim();
  const pass  = $('loginPass').value;
  if (!email || !pass) { toast('⚠️ Nhập email và mật khẩu!'); return; }
  
  let users = [];
  try {
    users = JSON.parse(localStorage.getItem('ssilog_users') || '[]');
  } catch (e) { users = []; }

  const u = users.find(x => x.email === email && x.pass === pass);
  if (!u) { toast('❌ Sai email hoặc mật khẩu!'); return; }
  loginSuccess(u);
}

function doRegister() {
  const name  = $('regName').value.trim();
  const email = $('regEmail').value.trim();
  const pass  = $('regPass').value;
  
  if (!name || !email || !pass) { toast('⚠️ Điền đầy đủ thông tin!'); return; }
  if (pass.length < 6) { toast('⚠️ Mật khẩu tối thiểu 6 ký tự!'); return; }
  
  let users = [];
  try {
    users = JSON.parse(localStorage.getItem('ssilog_users') || '[]');
  } catch (e) { users = []; }

  if (users.find(x => x.email === email)) { toast('⚠️ Email đã tồn tại!'); return; }
  
  const u = { id: Date.now().toString(), name, email, pass };
  users.push(u);
  localStorage.setItem('ssilog_users', JSON.stringify(users));
  loginSuccess(u);
}

function doGoogleLogin() {
  const u = { id: 'google_' + Date.now(), name: 'Người dùng Google', email: 'user@gmail.com' };
  loginSuccess(u);
}

function loginSuccess(u) {
  currentUser = u;
  localStorage.setItem('ssilog_session', JSON.stringify(u));
  $('authScreen').style.display = 'none';
  $('appScreen').style.display  = 'flex';
  $('userName').textContent = u.name || u.email;
  
  const key = localStorage.getItem('ssilog_apikey');
  if (key) $('apiKeyInput').value = key;
  
  const model = localStorage.getItem('ssilog_model');
  if (model) $('modelSelect').value = model;
  
  showView('dashboard');
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('ssilog_session');
  $('appScreen').style.display = 'none';
  $('authScreen').style.display = 'flex';
}

// ── VIEWS ─────────────────────────────────────────────────────
function showView(v) {
  const views = ['dashboard', 'transactions', 'analysis', 'data'];
  views.forEach(id => {
    const el = $('view' + id.charAt(0).toUpperCase() + id.slice(1));
    const nav = $('nav' + (id === 'dashboard' ? 'Dash' : id.charAt(0).toUpperCase() + id.slice(1)));
    if (el) el.style.display = (id === v) ? 'block' : 'none';
    if (nav) nav.classList.toggle('active', id === v);
  });
  
  if (v === 'dashboard')    refreshDashboard();
  if (v === 'transactions') renderTxTable();
}

// ── SIDEBAR ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sidebarToggle = $('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => $('appSidebar').classList.toggle('off'));
  }
  
  const themeBtn = $('themeBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  
  const modelSelect = $('modelSelect');
  if (modelSelect) {
    modelSelect.addEventListener('change', () => localStorage.setItem('ssilog_model', modelSelect.value));
  }

  // Khởi tạo app
  const sess = localStorage.getItem('ssilog_session');
  if (sess) {
    try { loginSuccess(JSON.parse(sess)); } catch (e) { console.error("Lỗi session:", e); }
  } else {
    const txDate = $('txDate');
    if (txDate) txDate.value = new Date().toISOString().slice(0, 10);
  }
});

function saveApiKey() { 
  const key = $('apiKeyInput').value.trim();
  localStorage.setItem('ssilog_apikey', key); 
  toast('✅ Đã lưu API Key!'); 
}

// ── THEME ─────────────────────────────────────────────────────
function toggleTheme() {
  document.body.classList.toggle('dark');
  const themeBtn = $('themeBtn');
  if (themeBtn) {
    themeBtn.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
  }
  localStorage.setItem('ssilog_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

if (localStorage.getItem('ssilog_theme') === 'dark') {
  document.body.classList.add('dark');
}

// ── HELPERS ───────────────────────────────────────────────────
const fmtVND = n => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
function saveTxs() { localStorage.setItem('ssilog_tx', JSON.stringify(transactions)); }
function toast(msg, dur = 2500) {
  const t = $('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), dur);
  }
}
function autoH(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'; }

// ── DASHBOARD ─────────────────────────────────────────────────
let pnlChartInst = null, allocChartInst = null;

function refreshDashboard() {
  const closed = transactions.filter(t => t.type === 'SELL');
  
  const holdings = {};
  transactions.forEach(t => {
    if (!holdings[t.stock]) holdings[t.stock] = { qty: 0, cost: 0, curPrice: 0 };
    const h = holdings[t.stock];
    if (t.type === 'BUY') {
      h.cost = (h.cost * h.qty + t.price * t.qty) / (h.qty + t.qty || 1);
      h.qty += t.qty;
      h.curPrice = t.currentPrice || t.price;
    } else {
      h.qty -= t.qty;
    }
    if (t.currentPrice) h.curPrice = t.currentPrice;
  });
  
  Object.keys(holdings).forEach(s => { if (holdings[s].qty <= 0) delete holdings[s]; });

  const totalCost = Object.values(holdings).reduce((a, h) => a + h.cost * h.qty, 0);
  const totalCur  = Object.values(holdings).reduce((a, h) => a + h.curPrice * h.qty, 0);
  const pnl       = totalCur - totalCost;
  const pnlPct    = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  const wins = closed.filter(t => {
    const relBuys = transactions.filter(b => b.type === 'BUY' && b.stock === t.stock);
    if (!relBuys.length) return false;
    const avgBuy = relBuys.reduce((a, b) => a + b.price, 0) / relBuys.length;
    return t.price > avgBuy;
  });
  
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;

  if ($('metTotalCost')) $('metTotalCost').textContent = fmtVND(totalCost);
  if ($('metCurrentVal')) $('metCurrentVal').textContent = fmtVND(totalCur);
  
  const pnlEl = $('metPnL');
  if (pnlEl) {
    pnlEl.textContent = fmtVND(pnl);
    pnlEl.className = 'metric-val ' + (pnl >= 0 ? 'pos' : 'neg');
  }
  
  const pctEl = $('metPnLPct');
  if (pctEl) {
    pctEl.textContent = fmtPct(pnlPct);
    pctEl.className = 'metric-val ' + (pnl >= 0 ? 'pos' : 'neg');
  }
  
  if ($('metWins')) $('metWins').textContent = wins.length + '/' + closed.length;
  if ($('metWinRate')) $('metWinRate').textContent = winRate.toFixed(1) + '%';

  // Holdings table
  const hBody = $('holdingsBody');
  const hList = $('holdingsList');
  const stocks = Object.keys(holdings);
  
  if (hBody) {
    if (!stocks.length) {
      hBody.innerHTML = '<tr><td colspan="7" class="empty-row">Chưa có vị thế mở</td></tr>';
      if (hList) hList.innerHTML = '<p class="empty-hint">Chưa có cổ phiếu</p>';
    } else {
      hBody.innerHTML = stocks.map(s => {
        const h = holdings[s], val = h.curPrice * h.qty, p = (h.curPrice - h.cost) * h.qty, pct = h.cost > 0 ? (h.curPrice / h.cost - 1) * 100 : 0;
        return `<tr><td><strong>${s}</strong></td><td>${h.qty.toLocaleString()}</td><td>${fmtVND(h.cost)}</td><td>${fmtVND(h.curPrice)}</td><td>${fmtVND(val)}</td><td><span style="color:${p >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtVND(p)}</span></td><td style="color:${pct >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtPct(pct)}</td></tr>`;
      }).join('');
      
      if (hList) {
        hList.innerHTML = stocks.map(s => {
          const h = holdings[s], pct = h.cost > 0 ? (h.curPrice / h.cost - 1) * 100 : 0;
          return `<div class="holding-chip"><span class="stock">${s}</span><span class="${pct >= 0 ? 'pnl-pos' : 'pnl-neg'}">${fmtPct(pct)}</span></div>`;
        }).join('');
      }
    }
  }

  drawCharts(holdings, transactions);
}

function drawCharts(holdings, txs) {
  if (typeof Chart === 'undefined') return;
  
  const pnlCtx = $('pnlChart');
  const sorted = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  if (pnlChartInst) pnlChartInst.destroy();
  if (pnlCtx && sorted.length) {
    $('pnlEmpty').style.display = 'none';
    pnlCtx.style.display = 'block';
    let cum = 0;
    const labels = [], data = [];
    sorted.forEach(t => {
      cum += (t.type === 'SELL' ? 1 : -1) * t.price * t.qty - (t.fee || 0);
      labels.push(t.date);
      data.push(+cum.toFixed(0));
    });
    pnlChartInst = new Chart(pnlCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'P&L tích lũy', data, borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,.1)', fill: true, tension: .3, pointRadius: 3 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v) + '₫' } } } }
    });
  } else if (pnlCtx) {
    $('pnlEmpty').style.display = 'block';
    pnlCtx.style.display = 'none';
  }

  const allocCtx = $('allocChart');
  if (allocChartInst) allocChartInst.destroy();
  const stocks = Object.keys(holdings);
  
  if (allocCtx && stocks.length) {
    $('allocEmpty').style.display = 'none';
    allocCtx.style.display = 'block';
    const vals = stocks.map(s => holdings[s].curPrice * holdings[s].qty);
    const colors = ['#1a56db', '#cc0000', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777'];
    allocChartInst = new Chart(allocCtx, {
      type: 'doughnut',
      data: {
        labels: stocks,
        datasets: [{ data: vals, backgroundColor: colors.slice(0, stocks.length), borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
  } else if (allocCtx) {
    $('allocEmpty').style.display = 'block';
    allocCtx.style.display = 'none';
  }
}

// ── TRANSACTIONS ──────────────────────────────────────────────
function openAddTx() {
  editingTxId = null;
  const title = $('txModalTitle');
  if (title) title.textContent = 'Thêm giao dịch mới';
  $('txDate').value = new Date().toISOString().slice(0, 10);
  $('txStock').value = $('txType').value = $('txNote').value = '';
  $('txQty').value = $('txPrice').value = $('txFee').value = '';
  $('txCurrentPrice').value = '';
  $('txFee').value = 0;
  $('txModal').style.display = 'flex';
}

function closeTxModal() { $('txModal').style.display = 'none'; }

function saveTx() {
  const date  = $('txDate').value;
  const stock = $('txStock').value.trim().toUpperCase();
  const type  = $('txType').value;
  const qty   = parseInt($('txQty').value);
  const price = parseFloat($('txPrice').value);
  const fee   = parseFloat($('txFee').value) || 0;
  const curP  = parseFloat($('txCurrentPrice').value) || 0;
  const note  = $('txNote').value.trim();
  
  if (!date || !stock || !qty || !price) { toast('⚠️ Điền đầy đủ các trường bắt buộc!'); return; }
  
  if (editingTxId) {
    const idx = transactions.findIndex(t => t.id === editingTxId);
    if (idx >= 0) transactions[idx] = { id: editingTxId, date, stock, type, qty, price, fee, currentPrice: curP, note };
  } else {
    transactions.push({ id: Date.now().toString(), date, stock, type, qty, price, fee, currentPrice: curP, note });
  }
  saveTxs(); closeTxModal(); renderTxTable(); toast('✅ Đã lưu giao dịch!');
}

function editTx(id) {
  const t = transactions.find(x => x.id === id);
  if (!t) return;
  editingTxId = id;
  const title = $('txModalTitle');
  if (title) title.textContent = 'Sửa giao dịch';
  $('txDate').value = t.date; $('txStock').value = t.stock; $('txType').value = t.type;
  $('txQty').value = t.qty; $('txPrice').value = t.price; $('txFee').value = t.fee || 0;
  $('txCurrentPrice').value = t.currentPrice || ''; $('txNote').value = t.note || '';
  $('txModal').style.display = 'flex';
}

function deleteTx(id) {
  if (!confirm('Xóa giao dịch này?')) return;
  transactions = transactions.filter(t => t.id !== id);
  saveTxs(); renderTxTable(); toast('🗑️ Đã xóa!');
}

function renderTxTable() {
  const filterStockInput = $('filterStock');
  const filterTypeInput = $('filterType');
  const filterFromInput = $('filterFrom');
  const filterToInput = $('filterTo');
  
  const filterStock = filterStockInput ? filterStockInput.value.trim().toUpperCase() : '';
  const filterType  = filterTypeInput ? filterTypeInput.value : '';
  const filterFrom  = filterFromInput ? filterFromInput.value : '';
  const filterTo    = filterToInput ? filterToInput.value : '';
  
  let list = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (filterStock) list = list.filter(t => t.stock.includes(filterStock));
  if (filterType)  list = list.filter(t => t.type === filterType);
  if (filterFrom)  list = list.filter(t => t.date >= filterFrom);
  if (filterTo)    list = list.filter(t => t.date <= filterTo);
  
  const body = $('txBody');
  if (body) {
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="9" class="empty-row">Không có giao dịch nào.</td></tr>';
      return;
    }
    body.innerHTML = list.map(t => {
      const total = t.price * t.qty + (t.type === 'BUY' ? 1 : -1) * (t.fee || 0);
      return `<tr>
        <td>${t.date}</td><td><strong>${t.stock}</strong></td>
        <td><span class="badge badge-${t.type.toLowerCase()}">${t.type === 'BUY' ? 'Mua' : 'Bán'}</span></td>
        <td>${t.qty.toLocaleString()}</td><td>${fmtVND(t.price)}</td>
        <td>${fmtVND(t.fee || 0)}</td><td>${fmtVND(total)}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis" title="${t.note || ''}">${t.note || '—'}</td>
        <td class="tx-actions"><button onclick="editTx('${t.id}')">✏️</button><button onclick="deleteTx('${t.id}')">🗑️</button></td>
      </tr>`;
    }).join('');
  }
}

// ── AI CHAT ───────────────────────────────────────────────────
function getApiKey() { return ($('apiKeyInput').value || localStorage.getItem('ssilog_apikey') || '').trim(); }
function getModel()  { return $('modelSelect').value; }

function buildContext() {
  if (!transactions.length) return 'Chưa có giao dịch nào.';
  const lines = transactions.slice(-50).map(t => `${t.date} | ${t.stock} | ${t.type === 'BUY' ? 'MUA' : 'BÁN'} | SL:${t.qty} | Giá:${t.price} | Phí:${t.fee || 0} | ${t.note || ''}`);
  return 'DỮ LIỆU GIAO DỊCH:\n' + lines.join('\n');
}

const SYS_PROMPT = `Bạn là chuyên gia phân tích chứng khoán Việt Nam với hơn 10 năm kinh nghiệm tại HoSE/HNX.
Bạn đang phân tích nhật ký giao dịch cá nhân của nhà đầu tư.
Luôn trả lời bằng tiếng Việt, rõ ràng, có cấu trúc. Sử dụng bảng và bullet points khi phù hợp.
Tập trung vào: entry/exit analysis, risk management, tâm lý giao dịch, win rate, R:R ratio.`;

function chatKeyDown(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }

async function sendChat() {
  const chatInput = $('chatInput');
  const input = chatInput.value.trim();
  if (!input) return;
  if (!getApiKey()) { toast('⚠️ Nhập API Key trong sidebar!'); return; }
  
  appendChatMsg('user', input);
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  const typId = appendTyping();
  const fullPrompt = buildContext() + '\n\nCÂU HỎI: ' + input;
  const reply = await callGemini(fullPrompt);
  removeTyping(typId);
  appendChatMsg('model', reply);
}

window.askAI = async function(btn) {
  const q = btn.textContent.replace(/^.{2}/, '').trim();
  const chatInput = $('chatInput');
  if (chatInput) chatInput.value = q;
  sendChat();
};

async function runQuickAnalysis(type) {
  if (!getApiKey()) { toast('⚠️ Nhập API Key trong sidebar!'); return; }
  const prompts = {
    portfolio: 'Phân tích toàn bộ danh mục giao dịch của tôi. Đưa ra nhận xét về hiệu quả đầu tư, cổ phiếu tốt nhất/tệ nhất, và đề xuất cải thiện.',
    psychology: 'Phân tích tâm lý giao dịch của tôi dựa trên lịch sử. Tìm các pattern hành vi (cut loss muộn, FOMO, over-trade...) và đưa ra lời khuyên.',
    risk: 'Đánh giá rủi ro hiện tại của danh mục. Tính concentration risk, drawdown tiềm năng, và đề xuất phòng thủ.',
    daily: 'Phân tích các giao dịch gần đây nhất. Đánh giá chất lượng entry/exit và bài học rút ra.',
  };
  
  const panel = $('aiResult');
  const content = $('aiResultContent');
  if (panel) panel.style.display = 'block';
  if (content) content.innerHTML = '<div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  
  const result = await callGemini(buildContext() + '\n\nYÊU CẦU: ' + prompts[type]);
  if (content) content.innerHTML = parseMd(result);
}

async function callGemini(prompt) {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: SYS_PROMPT }] }, generationConfig: { temperature: 0.7, maxOutputTokens: 4096 } })
    });
    if (!res.ok) {
      const e = await res.json();
      return '❌ Lỗi API: ' + (e.error?.message || res.status);
    }
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(Không có phản hồi)';
  } catch (e) { return '❌ Lỗi kết nối: ' + e.message; }
}

function appendChatMsg(role, text) {
  const msgs = $('chatMsgs');
  if (msgs) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.innerHTML = `<div class="chat-av ${role}">${role === 'user' ? '👤' : '🤖'}</div><div class="chat-msg-body"><div class="chat-msg-role ${role}">${role === 'user' ? 'Bạn' : 'Gemini AI'}</div><div class="chat-msg-text">${role === 'model' ? parseMd(text) : escHtml(text)}</div></div>`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    
    const w = msgs.querySelector('.ai-welcome');
    if (w) w.style.display = 'none';
  }
}

let typCnt = 0;
function appendTyping() {
  const id = 'typ' + (++typCnt);
  const msgs = $('chatMsgs');
  if (msgs) {
    const d = document.createElement('div');
    d.className = 'chat-msg model';
    d.id = id;
    d.innerHTML = '<div class="chat-av model">🤖</div><div class="chat-msg-body"><div class="chat-msg-role model">Gemini AI</div><div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
  }
  return id;
}

function removeTyping(id) {
  const e = $(id);
  if (e) e.remove();
}

// ── MARKDOWN ──────────────────────────────────────────────────
function escHtml(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function parseMd(t) {
  let h = escHtml(t)
    .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^[\*\-] (.+)$/gm, '<li>$1</li>').replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>');
  h = h.replace(/(<li>.*?<\/li>)+/gs, m => `<ul>${m}</ul>`);
  return `<p>${h}</p>`;
}

// ── DATA ──────────────────────────────────────────────────────
function exportJSON() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(transactions, null, 2)], { type: 'application/json' }));
  a.download = 'ssilog-backup-' + Date.now() + '.json'; a.click(); toast('⬇️ Đã xuất JSON!');
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      transactions = [...transactions, ...data];
      saveTxs();
      toast('✅ Import thành công ' + data.length + ' GD!');
    } catch (err) { toast('❌ File JSON không hợp lệ!'); }
  };
  r.readAsText(file);
  e.target.value = '';
}

function exportCSV() {
  const rows = [['Ngày', 'Mã CP', 'Loại', 'Số lượng', 'Giá', 'Phí', 'Ghi chú'], ...transactions.map(t => [t.date, t.stock, t.type, t.qty, t.price, t.fee || 0, t.note || ''])];
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv' }));
  a.download = 'ssilog-' + Date.now() + '.csv'; a.click(); toast('⬇️ Đã xuất CSV!');
}

function importCSV(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    const lines = ev.target.result.split('\n').slice(1);
    let cnt = 0;
    lines.forEach(line => {
      const cols = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
      if (cols.length >= 5 && cols[0] && cols[1]) {
        transactions.push({ id: Date.now().toString() + Math.random(), date: cols[0], stock: cols[1].toUpperCase(), type: cols[2] === 'BUY' ? 'BUY' : 'SELL', qty: parseInt(cols[3]) || 0, price: parseFloat(cols[4]) || 0, fee: parseFloat(cols[5]) || 0, note: cols[6] || '' });
        cnt++;
      }
    });
    saveTxs();
    renderTxTable();
    toast('✅ Import ' + cnt + ' giao dịch!');
  };
  r.readAsText(file, 'UTF-8');
  e.target.value = '';
}

function clearAllData() {
  if (!confirm('⚠️ Xóa TOÀN BỘ dữ liệu? Hành động không thể hoàn tác!')) return;
  transactions = [];
  saveTxs();
  toast('🗑️ Đã xóa tất cả!');
  renderTxTable();
}

// ── EXPOSE GLOBAL ─────────────────────────────────────────────
window.switchTab = switchTab;
window.doLogin = doLogin;
window.doRegister = doRegister;
window.doGoogleLogin = doGoogleLogin;
window.doLogout = doLogout;
window.showView = showView;
window.saveApiKey = saveApiKey;
window.toggleTheme = toggleTheme;
window.openAddTx = openAddTx;
window.closeTxModal = closeTxModal;
window.saveTx = saveTx;
window.editTx = editTx;
window.deleteTx = deleteTx;
window.renderTxTable = renderTxTable;
window.sendChat = sendChat;
window.chatKeyDown = chatKeyDown;
window.runQuickAnalysis = runQuickAnalysis;
window.exportJSON = exportJSON;
window.importJSON = importJSON;
window.exportCSV = exportCSV;
window.importCSV = importCSV;
window.clearAllData = clearAllData;
window.autoH = autoH;
