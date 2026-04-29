// ── CONFIG ────────────────────────────────────────────────────
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
  if (key && $('apiKeyInput')) {
    if (key.startsWith('AIza')) $('apiKeyInput').value = key;
  }
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
    if (key === '' || key.startsWith('AIza')) {
      localStorage.setItem('ssilog_apikey', key); 
      updateAiStatus(!!getApiKey());
      toast('✅ Đã lưu cấu hình AI!'); 
    } else {
      toast('⚠️ API Key không hợp lệ!');
    }
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

// ── DASHBOARD & ANALYTICS ─────────────────────────────────────
let pnlChartInst = null, allocChartInst = null, riskChartInst = null;
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

  calculateRiskMetrics(transactions);

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

function calculateRiskMetrics(txs) {
  if (txs.length < 3) return;
  const sorted = [...txs].sort((a,b)=>new Date(a.date)-new Date(b.date));
  let cum = 0, peak = 0, maxDD = 0, returns = [];
  sorted.forEach(t => {
    const prev = cum;
    cum += (t.type==='SELL'?1:-1)*t.price*t.qty-(t.fee||0);
    if (prev !== 0) returns.push((cum-prev)/Math.abs(prev));
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? (cum - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  });
  const avgRet = returns.length ? returns.reduce((a,b)=>a+b,0)/returns.length : 0;
  const stdDev = returns.length ? Math.sqrt(returns.map(x=>Math.pow(x-avgRet,2)).reduce((a,b)=>a+b,0)/returns.length) : 0;
  const sharpe = stdDev > 0 ? (avgRet / stdDev) * Math.sqrt(252) : 0;
  const beta = 0.8 + (stdDev * 10);
  if($('metMaxDD')) $('metMaxDD').textContent = (maxDD * 100).toFixed(1) + '%';
  if($('metSharpe')) {
    $('metSharpe').textContent = sharpe.toFixed(2);
    $('hintSharpe').textContent = sharpe > 2 ? 'Rất tốt' : (sharpe > 1 ? 'Tốt' : 'Trung bình');
  }
  if($('metBeta')) {
    $('metBeta').textContent = beta.toFixed(2);
    $('hintBeta').textContent = beta > 1.2 ? 'Biến động cao' : (beta < 0.8 ? 'Phòng thủ' : 'Thị trường');
  }
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
  const rCtx = $('riskChart'); if (riskChartInst) riskChartInst.destroy();
  if (rCtx && sorted.length >= 5) {
    $('riskEmpty').style.display='none'; rCtx.style.display='block';
    let cum=0; const labels=[], myData=[], mktData=[]; 
    sorted.forEach((t, i)=>{ 
      cum += (t.type==='SELL'?1:-1)*t.price*t.qty; 
      labels.push(t.date); 
      myData.push(cum);
      mktData.push(myData[0] * Math.pow(1.0003, i));
    });
    riskChartInst = new Chart(rCtx, { 
      type:'line', 
      data:{ 
        labels, 
        datasets:[
          { label:'Danh mục của tôi', data:myData, borderColor:'#1a56db', tension:.3 },
          { label:'VN-INDEX (Giả lập)', data:mktData, borderColor:'#94a3b8', borderDash:[5,5], tension:.3 }
        ] 
      }, 
      options:{ responsive:true, plugins:{legend:{position:'top'}} } 
    });
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

// ── AI ENGINE (STREAMING OPTIMIZED) ────────────────────────────
function getApiKey() { 
  const inputK = ($('apiKeyInput')?.value || '').trim();
  const savedK = (localStorage.getItem('ssilog_apikey') || '').trim();
  return (inputK.startsWith('AIza') ? inputK : (savedK.startsWith('AIza') ? savedK : DEFAULT_API_KEY)); 
}

// CHỈ DẪN HỆ THỐNG MỚI - NGẮN GỌN & SÚC TÍCH
const SYS_PROMPT = `Bạn là trợ lý phân tích tâm lý chứng khoán. Hãy trả lời ngắn gọn, súc tích, đi thẳng vào vấn đề trong tối đa 3 câu. Sử dụng bullet points nếu cần thiết.`;

// KỸ THUẬT STREAMING (PHẢN HỒI TỨC THỜI)
async function callGeminiStream(p, onChunk, onDone, onError) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${getApiKey()}`;
  try {
    const res = await fetch(url, { 
      method:'POST', headers:{'Content-Type':'application/json'}, 
      body:JSON.stringify({ contents:[{ parts:[{text:p}] }] }) 
    });
    
    if(!res.ok) { onError('Lỗi kết nối AI'); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while(true) {
      const { done, value } = await reader.read();
      if(done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for(const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.substring(6));
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) onChunk(text);
          } catch(e) {}
        }
      }
    }
    onDone();
  } catch(e){ onError('Lỗi hệ thống AI'); }
}

// ── FLOATING CHAT WIDGET LOGIC ────────────────────────────────
function toggleChatPanel() { $('cw-panel').classList.toggle('open'); }

async function sendCwMsg() {
  const inp = $('cw-textarea-input'), txt = inp.value.trim(); if(!txt)return;
  inp.value = ''; appendCwMsg('user', txt);
  const tid = appendCwTyping();
  
  let fullText = '';
  const bub = createCwStreamBubble(); // Tạo bubble rỗng cho streaming
  
  const ctx = transactions.length ? `\n\nDM: ${transactions.slice(-10).map(t=>`${t.stock} ${t.type}`).join(',')}` : '';
  
  callGeminiStream(`${SYS_PROMPT}${ctx}\n\nHỎI: ${txt}`, 
    (chunk) => {
      removeCwTyping(tid); // Xóa typing ngay khi có chunk đầu tiên
      fullText += chunk;
      bub.textContent = fullText;
      bub.parentElement.parentElement.scrollTop = bub.parentElement.parentElement.scrollHeight;
    },
    () => { bub.classList.remove('streaming'); },
    (err) => { removeCwTyping(tid); appendCwMsg('bot', '❌ ' + err); }
  );
}

function createCwStreamBubble() {
  const list = $('cw-msgs-list');
  const d = document.createElement('div');
  d.className = 'cw-bubble cw-msg-bot streaming';
  list.appendChild(d);
  return d;
}

function appendCwMsg(role, text) {
  const list = $('cw-msgs-list');
  const d = document.createElement('div');
  d.className = `cw-bubble cw-msg-${role}`;
  d.textContent = text;
  list.appendChild(d);
  list.scrollTop = list.scrollHeight;
}

function appendCwTyping() {
  const id = 't'+Date.now(), list = $('cw-msgs-list');
  const d = document.createElement('div');
  d.id = id; d.className = 'cw-bubble cw-msg-bot';
  d.innerHTML = '<div class="dots-wrap"><div class="dot-bounce"></div><div class="dot-bounce"></div><div class="dot-bounce"></div></div>';
  list.appendChild(d); list.scrollTop = list.scrollHeight;
  return id;
}
function removeCwTyping(id) { const e=$(id); if(e) e.remove(); }
function cwKeyDown(e) { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCwMsg(); } }

// ── MAIN CHAT VIEW (SYNC WITH STREAMING) ───────────────────────
async function sendChat() {
  const inp = $('chatInput'), txt = inp.value.trim(); if(!txt)return;
  appendChatMsg('user', txt); inp.value=''; inp.style.height='auto';
  const tid = appendTyping();
  
  let fullText = '';
  const bub = createStreamBubble(); 
  
  const ctx = transactions.length ? `\n\nDM: ${transactions.slice(-10).map(t=>`${t.stock} ${t.type}`).join(',')}` : '';
  
  callGeminiStream(`${SYS_PROMPT}${ctx}\n\nHỎI: ${txt}`, 
    (chunk) => {
      removeTyping(tid);
      fullText += chunk;
      bub.innerHTML = parseMd(fullText);
      bub.parentElement.parentElement.scrollTop = bub.parentElement.parentElement.scrollHeight;
    },
    () => { bub.classList.remove('streaming'); },
    (err) => { removeTyping(tid); appendChatMsg('model', '❌ ' + err); }
  );
}

function createStreamBubble() {
  const msgs = $('chatMsgs');
  const d=document.createElement('div'); d.className='chat-msg model'; 
  d.innerHTML=`<div class="chat-av model">🤖</div><div class="chat-av-body"><div class="chat-msg-text bubble bot streaming"></div></div>`;
  msgs.appendChild(d);
  return d.querySelector('.chat-msg-text');
}

function appendChatMsg(role, text) {
  const msgs = $('chatMsgs'); if(msgs){
    const d=document.createElement('div'); d.className='chat-msg '+role; d.innerHTML=`<div class="chat-av ${role}">${role==='user'?'👤':'🤖'}</div><div class="chat-av-body"><div class="chat-msg-text">${parseMd(text)}</div></div>`;
    msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; const w=msgs.querySelector('.ai-welcome'); if(w) w.style.display='none';
  }
}
function appendTyping() { const id='t'+Date.now(), msgs=$('chatMsgs'); const d=document.createElement('div'); d.id=id; d.className='chat-msg model'; d.innerHTML='<div class="chat-av model">🤖</div><div class="dots-wrap"><div class="dot-bounce"></div><div class="dot-bounce"></div><div class="dot-bounce"></div></div>'; msgs.appendChild(d); msgs.scrollTop=msgs.scrollHeight; return id; }
function removeTyping(id) { const e=$(id); if(e) e.remove(); }
function parseMd(t) { return t.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>'); }

// ── GLOBAL ────────────────────────────────────────────────────
Object.assign(window, { switchTab, doLogin, doRegister, doGoogleLogin, doLogout, showView, saveApiKey, openAddTx, closeTxModal, saveTx, editTx, deleteTx, renderTxTable, sendChat, exportJSON, importJSON, exportCSV, clearAllData, calculateFee, toggleChatPanel, sendCwMsg, cwKeyDown, askAI: (b)=> { $('chatInput').value=b.textContent; sendChat(); } });
function chatKeyDown(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); } }
window.chatKeyDown = chatKeyDown;
