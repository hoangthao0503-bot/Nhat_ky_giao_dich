// ── CONFIG ────────────────────────────────────────────────────
// DÁN API KEY CỦA BẠN VÀO GIỮA DẤU NGOẶC KÉP DƯỚI ĐÂY ĐỂ DÙNG NGAY
const DEFAULT_API_KEY = "AIzaSyA45PZwVEbo4GYDIdSs2rt-BBBgJZRPL04"; 

// ── DATA ──────────────────────────────────────────────────────
let currentUser = null;
let transactions = [];
try {
  transactions = JSON.parse(localStorage.getItem('ssilog_tx') || '[]');
} catch (e) { transactions = []; }
let editingTxId  = null;
const $ = id => document.getElementById(id);

// ── AUTH ──────────────────────────────────────────────────────
function switchTab(tab) {
  const tL = $('tabLogin'), tR = $('tabRegister'), fL = $('loginForm'), fR = $('registerForm');
  if (tL && tR && fL && fR) {
    tL.classList.toggle('active', tab==='login');
    tR.classList.toggle('active', tab==='register');
    fL.style.display = tab==='login'?'block':'none';
    fR.style.display = tab==='register'?'block':'none';
  }
}

function doLogin() {
  const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
  if (!email || !pass) { toast('⚠️ Nhập email và mật khẩu!'); return; }
  let users = []; try { users = JSON.parse(localStorage.getItem('ssilog_users') || '[]'); } catch(e){}
  const u = users.find(x => x.email === email && x.pass === pass);
  if (!u) { toast('❌ Sai email hoặc mật khẩu!'); return; }
  loginSuccess(u);
}

function doRegister() {
  const name = $('regName').value.trim(), email = $('regEmail').value.trim(), pass = $('regPass').value;
  if (!name || !email || !pass) { toast('⚠️ Điền đầy đủ thông tin!'); return; }
  if (pass.length < 6) { toast('⚠️ Mật khẩu tối thiểu 6 ký tự!'); return; }
  let users = []; try { users = JSON.parse(localStorage.getItem('ssilog_users') || '[]'); } catch(e){}
  if (users.find(x => x.email === email)) { toast('⚠️ Email đã tồn tại!'); return; }
  const u = { id: Date.now().toString(), name, email, pass };
  users.push(u); localStorage.setItem('ssilog_users', JSON.stringify(users));
  loginSuccess(u);
}

function doGoogleLogin() { loginSuccess({ id: 'g_'+Date.now(), name: 'Người dùng Google', email: 'user@gmail.com' }); }

function loginSuccess(u) {
  currentUser = u; localStorage.setItem('ssilog_session', JSON.stringify(u));
  $('authScreen').style.display = 'none'; $('appScreen').style.display = 'flex';
  $('userName').textContent = u.name || u.email;
  const key = localStorage.getItem('ssilog_apikey');
  if (key && $('apiKeyInput')) $('apiKeyInput').value = key;
  const model = localStorage.getItem('ssilog_model') || 'gemini-1.5-flash';
  if ($('modelSelect')) $('modelSelect').value = model;
  updateAiStatus(!!getApiKey());
  showView('dashboard');
}

function doLogout() { currentUser=null; localStorage.removeItem('ssilog_session'); $('appScreen').style.display='none'; $('authScreen').style.display='flex'; }

// ── VIEWS ─────────────────────────────────────────────────────
function showView(v) {
  ['dashboard', 'transactions', 'analysis', 'data'].forEach(id => {
    const el = $('view' + id.charAt(0).toUpperCase() + id.slice(1));
    const nav = $('nav' + (id==='dashboard'?'Dash':id.charAt(0).toUpperCase()+id.slice(1)));
    if (el) el.style.display = (id === v) ? 'block' : 'none';
    if (nav) nav.classList.toggle('active', id === v);
  });
  if (v === 'dashboard') refreshDashboard();
  if (v === 'transactions') renderTxTable();
}

// ── SIDEBAR & INIT ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const sbT = $('sidebarToggle'); if(sbT) sbT.onclick = () => $('appSidebar').classList.toggle('off');
  const mS = $('modelSelect'); if(mS) mS.onchange = () => localStorage.setItem('ssilog_model', mS.value);

  const sess = localStorage.getItem('ssilog_session');
  if (sess) { try { loginSuccess(JSON.parse(sess)); } catch(e){} }
  else { if($('txDate')) $('txDate').value = new Date().toISOString().slice(0, 10); }
  updateAiStatus(!!getApiKey());
});

function saveApiKey() { 
  const key = $('apiKeyInput')?.value.trim();
  if (key !== undefined) {
    localStorage.setItem('ssilog_apikey', key); 
    updateAiStatus(!!getApiKey());
    toast('✅ Đã lưu cấu hình AI!'); 
  }
}

function updateAiStatus(connected) {
  const st = $('aiStatus');
  if (st) {
    st.textContent = connected ? '🟢 Đã kết nối AI' : '🔴 Chưa kết nối';
    st.className = 'ai-status-tag ' + (connected ? 'green' : 'red');
  }
}

// ── HELPERS ───────────────────────────────────────────────────
const fmtVND = n => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫';
const fmtPct = n => (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
const saveTxs = () => localStorage.setItem('ssilog_tx', JSON.stringify(transactions));
function toast(msg, dur = 2500) { const t = $('toast'); if(t){ t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), dur); } }
function autoH(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,150)+'px'; }

// ── DASHBOARD ─────────────────────────────────────────────────
let pnlChartInst = null, allocChartInst = null;
function refreshDashboard() {
  const closed = transactions.filter(t => t.type === 'SELL');
  const holdings = {};
  transactions.forEach(t => {
    if (!holdings[t.stock]) holdings[t.stock] = { qty: 0, cost: 0, curPrice: 0 };
    const h = holdings[t.stock];
    if (t.type === 'BUY') { h.cost = (h.cost * h.qty + t.price * t.qty) / (h.qty + t.qty || 1); h.qty += t.qty; h.curPrice = t.currentPrice || t.price; }
    else { h.qty -= t.qty; }
    if (t.currentPrice) h.curPrice = t.currentPrice;
  });
  Object.keys(holdings).forEach(s => { if (holdings[s].qty <= 0) delete holdings[s]; });
  const tCost = Object.values(holdings).reduce((a, h) => a + h.cost * h.qty, 0), tCur = Object.values(holdings).reduce((a, h) => a + h.curPrice * h.qty, 0);
  const pnl = tCur-tCost, pnlPct = tCost > 0 ? (pnl/tCost)*100 : 0;
  const wins = closed.filter(t => {
    const relB = transactions.filter(b => b.type==='BUY' && b.stock===t.stock);
    return relB.length ? t.price > (relB.reduce((a,b)=>a+b.price,0)/relB.length) : false;
  });
  if($('metTotalCost')) $('metTotalCost').textContent = fmtVND(tCost);
  if($('metCurrentVal')) $('metCurrentVal').textContent = fmtVND(tCur);
  if($('metPnL')) { $('metPnL').textContent = fmtVND(pnl); $('metPnL').className = 'metric-val '+(pnl>=0?'pos':'neg'); }
  if($('metPnLPct')) { $('metPnLPct').textContent = fmtPct(pnlPct); $('metPnLPct').className = 'metric-val '+(pnl>=0?'pos':'neg'); }
  if($('metWins')) $('metWins').textContent = wins.length + '/' + closed.length;
  if($('metWinRate')) $('metWinRate').textContent = (closed.length ? (wins.length/closed.length)*100 : 0).toFixed(1) + '%';
  const hBody = $('holdingsBody'), hList = $('holdingsList'), stocks = Object.keys(holdings);
  if (hBody) {
    if (!stocks.length) { hBody.innerHTML = '<tr><td colspan="7" class="empty-row">Chưa có vị thế mở</td></tr>'; if(hList) hList.innerHTML='<p class="empty-hint">Trống</p>'; }
    else {
      hBody.innerHTML = stocks.map(s => {
        const h=holdings[s], v=h.curPrice*h.qty, p=(h.curPrice-h.cost)*h.qty, pct=h.cost>0?(h.curPrice/h.cost-1)*100:0;
        return `<tr><td><strong>${s}</strong></td><td>${h.qty.toLocaleString()}</td><td>${fmtVND(h.cost)}</td><td>${fmtVND(h.curPrice)}</td><td>${fmtVND(v)}</td><td><span style="color:${p>=0?'var(--green)':'var(--red)'}">${fmtVND(p)}</span></td><td style="color:${pct>=0?'var(--green)':'var(--red)'}">${fmtPct(pct)}</td></tr>`;
      }).join('');
      if(hList) hList.innerHTML = stocks.map(s => `<div class="holding-chip"><span>${s}</span><span class="${(holdings[s].curPrice>=holdings[s].cost)?'pnl-pos':'pnl-neg'}">${fmtPct((holdings[s].cost>0?(holdings[s].curPrice/holdings[s].cost-1)*100:0))}</span></div>`).join('');
    }
  }
  drawCharts(holdings, transactions);
}

function drawCharts(holdings, txs) {
  if (typeof Chart === 'undefined') return;
  const pCtx = $('pnlChart'), sorted = [...txs].sort((a,b)=>new Date(a.date)-new Date(b.date));
  if (pnlChartInst) pnlChartInst.destroy();
  if (pCtx && sorted.length) {
    $('pnlEmpty').style.display='none'; pCtx.style.display='block';
    let cum=0; const labels=[], data=[]; sorted.forEach(t=>{ cum+=(t.type==='SELL'?1:-1)*t.price*t.qty-(t.fee||0); labels.push(t.date); data.push(+cum.toFixed(0)); });
    pnlChartInst = new Chart(pCtx, { type:'line', data:{ labels, datasets:[{ label:'P&L', data, borderColor:'#1a56db', backgroundColor:'rgba(26,86,219,.1)', fill:true, tension:.3 }] }, options:{ responsive:true, plugins:{legend:{display:false}} } });
  }
  const aCtx = $('allocChart'); if (allocChartInst) allocChartInst.destroy();
  const stocks = Object.keys(holdings);
  if (aCtx && stocks.length) {
    $('allocEmpty').style.display='none'; aCtx.style.display='block';
    const vals = stocks.map(s=>holdings[s].curPrice*holdings[s].qty);
    allocChartInst = new Chart(aCtx, { type:'doughnut', data:{ labels:stocks, datasets:[{ data:vals, backgroundColor:['#1a56db','#cc0000','#16a34a','#d97706','#7c3aed'] }] }, options:{ responsive:true, plugins:{legend:{position:'bottom'}} } });
  }
}

// ── TRANSACTIONS ──────────────────────────────────────────────
function openAddTx() { editingTxId=null; if($('txModalTitle')) $('txModalTitle').textContent='Thêm GD'; $('txDate').value=new Date().toISOString().slice(0,10); $('txStock').value=$('txType').value=$('txNote').value=$('txQty').value=$('txPrice').value=$('txFee').value=$('txCurrentPrice').value=''; $('txFee').value=0; $('txModal').style.display='flex'; }
function closeTxModal() { $('txModal').style.display='none'; }
function calculateFee() {
  const qty = parseInt($('txQty')?.value || 0);
  const price = parseFloat($('txPrice')?.value || 0) * 1000;
  const fee = Math.round(qty * price * 0.0015);
  const feeInput = $('txFee');
  if (feeInput) feeInput.value = fee;
}

function saveTx() {
  const date=$('txDate').value, stock=$('txStock').value.trim().toUpperCase(), type=$('txType').value, qty=parseInt($('txQty').value), price=parseFloat($('txPrice').value) * 1000, fee=parseFloat($('txFee').value)||0, curP=(parseFloat($('txCurrentPrice').value)||0) * 1000, note=$('txNote').value.trim();
  if(!date||!stock||!qty||!price){ toast('⚠️ Thiếu thông tin!'); return; }
  if(editingTxId){ const idx=transactions.findIndex(t=>t.id===editingTxId); if(idx>=0) transactions[idx]={id:editingTxId,date,stock,type,qty,price,fee,currentPrice:curP,note}; }
  else { transactions.push({id:Date.now().toString(),date,stock,type,qty,price,fee,currentPrice:curP,note}); }
  saveTxs(); closeTxModal(); renderTxTable(); toast('✅ Đã lưu!');
}
function editTx(id) {
  const t = transactions.find(x=>x.id===id); if(!t)return; editingTxId=id; if($('txModalTitle')) $('txModalTitle').textContent='Sửa GD';
  $('txDate').value=t.date; $('txStock').value=t.stock; $('txType').value=t.type; $('txQty').value=t.qty; $('txPrice').value=t.price / 1000; $('txFee').value=t.fee||0; $('txCurrentPrice').value=t.currentPrice ? t.currentPrice / 1000 : ''; $('txNote').value=t.note||''; $('txModal').style.display='flex';
}
function deleteTx(id) { if(confirm('Xóa?')){ transactions=transactions.filter(t=>t.id!==id); saveTxs(); renderTxTable(); toast('🗑️ Đã xóa!'); } }
function renderTxTable() {
  const fS=$('filterStock')?.value.trim().toUpperCase(), fT=$('filterType')?.value, fF=$('filterFrom')?.value, fTo=$('filterTo')?.value;
  let list = [...transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(fS) list=list.filter(t=>t.stock.includes(fS)); if(fT) list=list.filter(t=>t.type===fT); if(fF) list=list.filter(t=>t.date>=fF); if(fTo) list=list.filter(t=>t.date<=fTo);
  const body = $('txBody'); if(body){
    if(!list.length){ body.innerHTML='<tr><td colspan="9" class="empty-row">Trống</td></tr>'; return; }
    body.innerHTML = list.map(t=>`<tr><td>${t.date}</td><td><strong>${t.stock}</strong></td><td><span class="badge badge-${t.type.toLowerCase()}">${t.type==='BUY'?'Mua':'Bán'}</span></td><td>${t.qty}</td><td>${fmtVND(t.price)}</td><td>${fmtVND(t.fee||0)}</td><td>${fmtVND(t.price*t.qty+(t.type==='BUY'?1:-1)*(t.fee||0))}</td><td title="${t.note||''}">${t.note||'—'}</td><td class="tx-actions"><button onclick="editTx('${t.id}')">✏️</button><button onclick="deleteTx('${t.id}')">🗑️</button></td></tr>`).join('');
  }
}

// ── AI CHAT ───────────────────────────────────────────────────
function getApiKey() { return ($('apiKeyInput')?.value || localStorage.getItem('ssilog_apikey') || DEFAULT_API_KEY).trim(); }
function getModel() { return $('modelSelect')?.value || 'gemini-1.5-flash'; }

const SYS_PROMPT = `Bạn là Trợ lý SSI LOG chuyên gia chứng khoán VN. Hướng dẫn dùng web: Dashboard (Tổng quan), Transactions (Thêm/Sửa/Xóa/Import), Data (Cài đặt API/Backup).`;

async function sendChat() {
  const inp = $('chatInput'), txt = inp.value.trim(); if(!txt)return; if(!getApiKey()){ toast('⚠️ Thiếu API Key!'); return; }
  appendChatMsg('user', txt); inp.value=''; inp.style.height='auto';
  const tid = appendTyping(); 
  const fullPrompt = `${SYS_PROMPT}\n\nDỮ LIỆU GIAO DỊCH HIỆN TẠI:\n${transactions.slice(-30).map(t=>`${t.date}|${t.stock}|${t.type}|${t.qty}|${t.price}`).join('\n')}\n\nCÂU HỎI NGƯỜI DÙNG: ${txt}`;
  const reply = await callGemini(fullPrompt); 
  removeTyping(tid); appendChatMsg('model', reply);
}

async function callGemini(p) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${getModel()}:generateContent?key=${getApiKey()}`;
  try {
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ contents:[{role:'user',parts:[{text:p}]}], generationConfig:{temperature:0.7} }) });
    if(!res.ok) return '❌ Lỗi API: ' + (await res.json()).error?.message;
    return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text || '...';
  } catch(e){ return '❌ Lỗi kết nối AI'; }
}

function appendChatMsg(role, text) {
  const msgs = $('chatMsgs'); if(msgs){
    const d=document.createElement('div'); d.className='chat-msg '+role; d.innerHTML=`<div class="chat-av ${role}">${role==='user'?'👤':'🤖'}</div><div class="chat-msg-body"><div class="chat-msg-text">${parseMd(text)}</div></div>`;
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; const w=msgs.querySelector('.ai-welcome'); if(w) w.style.display='none';
  }
}
function appendTyping() { const id='t'+Date.now(), msgs=$('chatMsgs'); const d=document.createElement('div'); d.id=id; d.className='chat-msg model'; d.innerHTML='<div class="chat-av model">🤖</div><div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>'; msgs.appendChild(d); return id; }
function removeTyping(id) { const e=$(id); if(e) e.remove(); }
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function parseMd(t) { return escHtml(t).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>'); }

// ── DATA ──────────────────────────────────────────────────────
function exportJSON(){ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(transactions)],{type:'application/json'})); a.download='ssi.json'; a.click(); }
function importJSON(e){ const f=e.target.files[0]; if(!f)return; const r=new FileReader(); r.onload=ev=>{ transactions=JSON.parse(ev.target.result); saveTxs(); renderTxTable(); }; r.readAsText(f); }
function exportCSV(){ const csv=transactions.map(t=>[t.date,t.stock,t.type,t.qty,t.price].join(',')).join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='ssi.csv'; a.click(); }
function clearAllData(){ if(confirm('Xóa hết?')){ transactions=[]; saveTxs(); renderTxTable(); } }

// ── GLOBAL ────────────────────────────────────────────────────
Object.assign(window, { switchTab, doLogin, doRegister, doGoogleLogin, doLogout, showView, saveApiKey, openAddTx, closeTxModal, saveTx, editTx, deleteTx, renderTxTable, sendChat, exportJSON, importJSON, exportCSV, clearAllData, calculateFee, askAI: (b)=> { $('chatInput').value=b.textContent; sendChat(); } });
