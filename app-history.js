
// ── HISTORY ──
async function loadHistory(){
  let q = sb.from('zakazlar').select('*').order('created_at', { ascending: false });
  if(currentRole !== 'owner'){
    q = q.eq('user_id', currentUser.id);
  }
  const { data, error } = await q;
  if(!error) allHistory = data || [];
  renderHistory();
  if(currentRole === 'owner') renderOwnerPanel();
  if(currentRole === 'admin') renderAdminStats();
  if(currentRole === 'ishlab') renderIshlabStats();
  renderDashboard();
}

function setFilter(f, el){
  histFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderHistory();
}

// ── BI DASHBOARD ──
let biRange = 'all';
let biChartMode = 'day';
let biChart = null;

function setBiRange(range, el){
  biRange = range;
  document.querySelectorAll('.bi-range-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderBiDashboard();
}

function setBiChartMode(mode, el){
  biChartMode = mode;
  document.querySelectorAll('#bi-chart-card .bi-range-btn').forEach(b => b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderBiChart();
}

function filterByRange(data){
  const now = new Date();
  return data.filter(h => {
    const d = new Date(h.created_at);
    if(biRange === 'today') return d.toDateString() === now.toDateString();
    if(biRange === 'week'){
      const weekAgo = new Date(now - 7*24*60*60*1000);
      return d >= weekAgo;
    }
    if(biRange === 'month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(biRange === 'year') return d.getFullYear()===now.getFullYear();
    return true;
  });
}

function renderBiDashboard(){
  if(currentRole !== 'owner') return;
  const data = filterByRange(allHistory);
  
  // Show BI elements
  ['bi-kpi-row','bi-chart-card','bi-emp-card','bi-insights-card','bi-owner-controls'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.style.display = id === 'bi-kpi-row' ? 'block' : id === 'bi-owner-controls' ? 'flex' : 'block';
  });

  // KPI Cards
  const totalRev = data.reduce((s,h) => s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)), 0);
  const totalCount = data.length;
  const avgOrder = totalCount > 0 ? Math.round(totalRev/totalCount) : 0;
  const brakSum = data.filter(h=>h.is_brak).reduce((s,h) => s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)), 0);
  const waitSum = data.filter(h=>!h.is_paid&&!h.is_brak).reduce((s,h) => s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)), 0);
  const paidSum = data.filter(h=>h.is_paid).reduce((s,h) => s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)), 0);
  const uniqueEmps = new Set(data.map(h=>h.user_email)).size;
  const dayCount = data.filter(h=>h.shift==='day').length;
  const nightCount = data.filter(h=>h.shift==='night').length;

  const setKpi = (id, val) => { const e=document.getElementById(id); if(e) e.textContent=val; };
  setKpi('bi-kpi-count', totalCount+' ta');
  setKpi('bi-kpi-rev', fmt(totalRev)+" so'm");
  setKpi('bi-kpi-avg', fmt(avgOrder)+" so'm");
  setKpi('bi-kpi-brak', fmt(brakSum)+" so'm");
  setKpi('bi-kpi-wait', fmt(waitSum)+" so'm");
  setKpi('bi-kpi-paid', fmt(paidSum)+" so'm");
  setKpi('bi-kpi-emp', uniqueEmps+' kishi');
  setKpi('bi-kpi-shift', '☀️ '+dayCount+' / 🌙 '+nightCount);

  renderBiChart();
  renderBiEmployees(data);
  renderBiInsights(data);
}

function renderBiChart(){
  if(currentRole !== 'owner') return;
  const data = filterByRange(allHistory);
  
  // Group by period
  const groups = {};
  data.forEach(h => {
    const d = new Date(h.created_at);
    let key;
    if(biChartMode === 'day') key = d.toLocaleDateString('uz-UZ');
    else if(biChartMode === 'week'){
      const week = Math.floor((d - new Date(d.getFullYear(),0,1))/(7*24*60*60*1000));
      key = d.getFullYear()+'-H'+week;
    } else {
      key = d.getFullYear()+'-'+(d.getMonth()+1).toString().padStart(2,'0');
    }
    if(!groups[key]) groups[key] = 0;
    groups[key] += h.type==='admin'?(h.total_daromad||0):(h.total_jami||0);
  });

  const labels = Object.keys(groups).sort().slice(-14);
  const values = labels.map(k => groups[k]||0);

  const ctx = document.getElementById('bi-main-chart');
  if(!ctx) return;

  if(biChart) biChart.destroy();
  biChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59,130,246,.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3B82F6',
        pointRadius: 3,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => fmt(ctx.raw)+" so'm" }
      }},
      scales: {
        x: { grid: { color: 'rgba(148,163,184,.1)' }, ticks: { color: '#94A3B8', font: {size:10} } },
        y: { grid: { color: 'rgba(148,163,184,.1)' }, ticks: { color: '#94A3B8', font:{size:10}, callback: v => fmt(v) } }
      }
    }
  });
}

function renderBiEmployees(data){
  const byEmp = {};
  data.forEach(h => {
    const key = h.user_email;
    const name = h.user_name || key;
    if(!byEmp[key]) byEmp[key] = {name, count:0, rev:0};
    byEmp[key].count++;
    byEmp[key].rev += h.type==='admin'?(h.total_daromad||0):(h.total_jami||0);
  });

  const sorted = Object.values(byEmp).sort((a,b) => b.rev-a.rev);
  const maxRev = sorted[0]?.rev || 1;
  const el = document.getElementById('bi-emp-table');
  if(!el) return;

  if(!sorted.length){ el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:12px 0">Ma\'lumot yo\'q</div>'; return; }

  el.innerHTML = '<div style="display:grid;grid-template-columns:28px 1fr 100px 80px;gap:8px;padding:0 12px 8px;font-size:11px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.04em"><div>#</div><div>Xodim</div><div style="text-align:right">Daromad</div><div style="text-align:right">Zakazlar</div></div>'+
    sorted.map((e,i) => {
      const pct = Math.round((e.rev/maxRev)*100);
      return '<div class="bi-emp-row">'+
        '<div class="bi-emp-rank">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1))+'</div>'+
        '<div><div class="bi-emp-name">'+e.name+'</div><div class="bi-score-bar"><div class="bi-score-fill" style="width:'+pct+'%"></div></div></div>'+
        '<div class="bi-emp-val">'+fmt(e.rev)+" so'm"+'</div>'+
        '<div class="bi-emp-val">'+e.count+' ta</div>'+
      '</div>';
    }).join('');
}

function renderBiInsights(data){
  const el = document.getElementById('bi-insights-list');
  if(!el) return;
  
  const insights = [];
  const totalRev = data.reduce((s,h) => s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)), 0);
  const brakCount = data.filter(h=>h.is_brak).length;
  const paidCount = data.filter(h=>h.is_paid).length;
  const waitCount = data.filter(h=>!h.is_paid&&!h.is_brak).length;
  const dayCount = data.filter(h=>h.shift==='day').length;
  const nightCount = data.filter(h=>h.shift==='night').length;

  if(data.length > 0) insights.push({icon:'📈', text:'Tanlangan davrda jami <b>'+fmt(totalRev)+" so'm</b> tushum bilan <b>"+data.length+"</b> ta zakaz kiritildi.", color:'rgba(34,197,94,.1)'});
  if(brakCount > 0) insights.push({icon:'⚠️', text:'<b>'+brakCount+"</b> ta zakaz brak belgilangan — sifat nazoratiga e'tibor bering.", color:'rgba(239,68,68,.1)'});
  if(paidCount > 0) insights.push({icon:'✅', text:'<b>'+paidCount+"</b> ta zakaz to'landi. To'lanmagan: <b>"+waitCount+" ta</b>.", color:'rgba(59,130,246,.1)'});
  if(dayCount > 0 || nightCount > 0) insights.push({icon:'🕐', text:'Kunduzgi shift: <b>'+dayCount+" ta</b>, tungi shift: <b>"+nightCount+' ta</b> zakaz.', color:'rgba(99,102,241,.1)'});
  
  const avgOrder = data.length > 0 ? Math.round(totalRev/data.length) : 0;
  if(avgOrder > 0) insights.push({icon:'💡', text:"O'rtacha zakaz qiymati: <b>"+fmt(avgOrder)+" so'm</b>.", color:'rgba(245,158,11,.1)'});

  if(!insights.length){ el.innerHTML = '<div style="color:var(--text3);font-size:13px">Tahlil uchun ma\'lumot yetarli emas</div>'; return; }
  el.innerHTML = insights.map(ins =>
    '<div class="bi-insight"><div class="bi-insight-icon" style="background:'+ins.color+'">'+ins.icon+'</div>'+
    '<div class="bi-insight-text">'+ins.text+'</div></div>'
  ).join('');
}

function renderHistory(){
  const el = document.getElementById('history-list');

  // Show/hide owner elements
  const filterRow = document.getElementById('hist-filters');
  if(filterRow) filterRow.style.display = 'none'; // replaced by rp-type-filter

  const rpSearch = document.getElementById('rp-search-area');
  if(rpSearch) rpSearch.style.display = currentRole === 'owner' || currentRole === 'admin' ? 'flex' : 'none';

  const rpStats = document.getElementById('rp-stats-row');

  // Calculate stats
  if(currentRole === 'owner' && rpStats){
    rpStats.style.display = 'block';
    const d = allHistory;
    const totalRev = d.reduce((s,h)=>s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)),0);
    const waitRev = d.filter(h=>!h.is_paid&&!h.is_brak).reduce((s,h)=>s+(h.type==='admin'?(h.total_daromad||0):(h.total_jami||0)),0);
    const brakC = d.filter(h=>h.is_brak).length;
    const paidC = d.filter(h=>h.is_paid).length;
    const avg = d.length>0?Math.round(totalRev/d.length):0;
    const set2 = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    set2('rp-total-count', d.length+' ta');
    set2('rp-total-rev', fmt(totalRev)+" so'm");
    set2('rp-wait-rev', fmt(waitRev)+" so'm");
    set2('rp-brak-count', brakC+' ta');
    set2('rp-paid-count', paidC+' ta');
    set2('rp-avg-rev', fmt(avg)+" so'm");
  } else if(rpStats) {
    rpStats.style.display = 'none';
  }

  // BI Dashboard for owner
  if(currentRole === 'owner') renderBiDashboard();

  rpFilter();
}

let rpCurrentPage = 1;
const RP_PER_PAGE = 20;

function rpFilter(){
  const search = (document.getElementById('rp-search')?.value||'').toLowerCase();
  const statusF = document.getElementById('rp-status-filter')?.value || 'all';
  const dateF = document.getElementById('rp-date-filter')?.value || 'all';
  const now = new Date();

  let list = allHistory.filter(h => {
    // status filter
    if(statusF === 'wait' && (h.is_paid||h.is_brak)) return false;
    if(statusF === 'paid' && !h.is_paid) return false;
    if(statusF === 'brak' && !h.is_brak) return false;
    // date filter
    if(dateF !== 'all'){
      const d = new Date(h.created_at);
      if(dateF==='today' && d.toDateString()!==now.toDateString()) return false;
      if(dateF==='week' && (now-d)>7*24*60*60*1000) return false;
      if(dateF==='month' && (d.getMonth()!==now.getMonth()||d.getFullYear()!==now.getFullYear())) return false;
    }
    // search
    if(search){
      const name = (h.user_name||'').toLowerCase();
      const sana = (h.sana||'').toLowerCase();
      const items = JSON.stringify(h.data||'').toLowerCase();
      if(!name.includes(search) && !sana.includes(search) && !items.includes(search)) return false;
    }
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(list.length/RP_PER_PAGE);
  rpCurrentPage = Math.min(rpCurrentPage, Math.max(1, totalPages));
  const pageList = list.slice((rpCurrentPage-1)*RP_PER_PAGE, rpCurrentPage*RP_PER_PAGE);

  renderHistoryCards(pageList, search);
  renderRpPagination(totalPages, list.length);
}

function renderRpPagination(totalPages, total){
  const el = document.getElementById('rp-pagination');
  if(!el) return;
  if(totalPages <= 1){ el.style.display='none'; return; }
  el.style.display='flex';
  let html = '';
  for(let i=1;i<=totalPages;i++){
    html += '<button class="rp-page-btn'+(i===rpCurrentPage?' active':'')+'" onclick="rpGoPage('+i+')">'+(totalPages>10?
      (i===1||i===totalPages||Math.abs(i-rpCurrentPage)<=1?i:(Math.abs(i-rpCurrentPage)===2?'…':null)):i)+'</button>';
  }
  el.innerHTML = html;
}

function rpGoPage(p){ rpCurrentPage=p; rpFilter(); window.scrollTo(0,0); }

function highlightText(text, query){
  if(!query) return text;
  const re = new RegExp('('+query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')', 'gi');
  return text.replace(re, '<mark class="rp-highlight">$1</mark>');
}

function renderHistoryCards(list, searchQuery=''){
  const el = document.getElementById('history-list');
  if(!list.length){
    el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Yozuvlar topilmadi</p></div>';
    return;
  }
  el.innerHTML = '';
  list.forEach(h => {
    const d = h.data || {};
    const isAdmin = h.type === 'admin';
    const isDiz = h.type === 'dizayner';
    const name = h.user_name || (h.user_email?(h.user_email.split('+')[1]||'').split('@')[0]:'') || '—';
    const sana = h.sana || new Date(h.created_at).toLocaleDateString('uz-UZ');
    const isPaid = !!h.is_paid;
    const isBrak = !!h.is_brak;
    const total = isAdmin?(h.total_daromad||0):(h.total_jami||0);

    const isMine = currentUser && h.user_id === currentUser.id;
    const daysAgo = (Date.now()-new Date(h.created_at).getTime())/(1000*60*60*24);
    const canEdit = currentRole==='owner'||(isMine&&daysAgo<7);
    const canDel = currentRole==='owner'||(isMine&&daysAgo<7);

    // Type badge
    const typeBadge = isAdmin?'<span class="rp-badge admin">👤 Admin</span>':isDiz?'<span class="rp-badge dizayner">🎨 Dizayner</span>':'<span class="rp-badge ishlab">🏭 Ishlab</span>';
    const statusBadge = isBrak?'<span class="rp-badge brak">⚠️ Brak</span>':isPaid?'<span class="rp-badge paid">✅ Mijoz to\'ladi</span>':'<span class="rp-badge wait">⏳ Mijoz kutilmoqda</span>';
    const shiftBadge = '';

    // Items
    let items = [];
    if(isAdmin && d.rows){
      items = d.rows.filter(r=>r.nom||(parseInt(r.sum)||0)).map(r=>{
        const s=parseInt(r.sum)||0; const f=getFoiz(s); const profit=Math.round(s*f);
        return {name:r.nom, qty:'—', brak:'', price:fmt(s)+" so'm", extra: Math.round(f*100)+'% → '+fmt(profit)+" so'm"};
      });
    } else if(!isAdmin && !isDiz) {
      const prod = (d.prodRows||[]).filter(r=>parseInt(r.miq)>0).map(r=>{
        const m=parseInt(r.miq)||0; const brak=parseInt(r.brak)||0;
        const np=gUN(r.key,m); const j=m*np;
        return {name:r.key, qty:m+' '+(PR[r.key]?PR[r.key].u:'dona'), brak:brak>0?brak+' brak':'', price:fmt(j)+" so'm"};
      });
      const uv = (d.uvRows||[]).filter(r=>parseInt(r.sig)>0).map(r=>{
        const{jami}=calcUv(parseInt(r.sig),parseInt(r.don));
        return {name:'UV: '+(r.nom||'mahsulot'), qty:r.don+' dona', brak:'', price:fmt(jami)+" so'm"};
      });
      const eko = (d.ekoRows||[]).filter(r=>parseFloat(r.kv)>0).map(r=>{
        const{jami}=calcEko(parseFloat(r.kv));
        return {name:'Eko: '+(r.nom||'mahsulot'), qty:r.kv+' kv.m', brak:'', price:fmt(jami)+" so'm"};
      });
      items = [...prod,...uv,...eko];
    } else if(isDiz && d.rows) {
      items = d.rows.filter(r=>r.nom||(parseInt(r.sum)||0)).map(r=>({
        name:r.nom||'—', qty:'—', brak:'', price:fmt(parseInt(r.sum)||0)+" so'm"
      }));
    }

    const SHOW_LIMIT = 5;
    const hasMore = items.length > SHOW_LIMIT;
    const cardId = 'rpc-'+h.id;

    // Split long product names into main + subtitle
    function splitName(name){
      // Check for parentheses: "Rangli printer (old+orqa, 1-500ta)" -> main + sub
      const match = name.match(/^([^(]+)\(([^)]+)\)(.*)$/);
      if(match) return {main: match[1].trim(), sub: match[2].trim()+(match[3]?match[3].trim():'')};
      // Check for dash separator
      const dashIdx = name.indexOf(' — ');
      if(dashIdx>0) return {main: name.slice(0,dashIdx), sub: name.slice(dashIdx+3)};
      return {main: name, sub: ''};
    }

    const itemsHtml = (showAll) => {
      const shown = showAll ? items : items.slice(0, SHOW_LIMIT);
      if(!shown.length) return '<div style="padding:12px 24px;font-size:13px;color:var(--text3)">—</div>';
      return '<div class="rp-items-header"><div>Mahsulot</div><div>Miqdor</div><div>Brak</div><div>Summa</div></div>'+
        shown.map(it => {
          const nm = splitName(it.name);
          const brakZero = !it.brak || it.brak === '0 brak' || it.brak === '';
          return '<div class="rp-item-row">'+
            '<div class="rp-item-name">'+
              '<div class="rp-item-name-main">'+highlightText(nm.main, searchQuery)+'</div>'+
              (nm.sub?'<div class="rp-item-name-sub">'+nm.sub+'</div>':'')+
              (it.extra?'<div class="rp-item-name-sub">'+it.extra+'</div>':'')+
            '</div>'+
            '<div class="rp-item-qty">'+it.qty+'</div>'+
            '<div class="rp-item-brak-val '+(brakZero?'zero':'pos')+'">'+(brakZero?'—':it.brak)+'</div>'+
            '<div class="rp-item-price">'+it.price+'</div>'+
          '</div>';
        }).join('');
    };

    // Owner actions
    let ownerActionsHtml = '';
    if(currentRole==='owner' && !isAdmin){
      ownerActionsHtml = '<div class="rp-card-owner-actions">'+
        '<button class="rp-action-btn'+(isPaid?' primary':'')+'" onclick="togglePaid('+h.id+','+(!isPaid)+')">'+(isPaid?"✅ To'landi":"✅ To'landi")+'</button>'+
        '<button class="rp-action-btn'+(isBrak?' danger':'')+'" onclick="toggleBrak('+h.id+','+(!isBrak)+')">'+(isBrak?'⚠️ Brak':'⚠️ Brak')+'</button>'+
      '</div>';
    } else if(currentRole==='owner' && isAdmin){
      ownerActionsHtml = '<div class="rp-card-owner-actions">'+
        '<button class="rp-action-btn'+(isPaid?' primary':'')+'" onclick="togglePaid('+h.id+','+(!isPaid)+')">'+(isPaid?"✅ To'landi":"Mijoz to'ladi deb belgilash")+'</button>'+
      '</div>';
    }

    const div = document.createElement('div');
    div.className = 'rp-card';
    if(isBrak) div.style.borderLeft = '3px solid #EF4444';

    div.innerHTML =
      '<div class="rp-card-top">'+
        '<div class="rp-card-meta">'+
          typeBadge + statusBadge + shiftBadge +
          (currentRole==='owner'?'<span class="rp-card-name">'+name+'</span>':'')+
        '</div>'+
        '<div class="rp-card-right">'+
          '<span class="rp-card-date">'+sana+'</span>'+
          (canEdit?'<button class="rp-action-btn" onclick="editHistoryItem('+h.id+')" title="Tahrirlash"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>':'')+
          (canDel?'<button class="rp-action-btn danger" onclick="deleteHistoryItemCountdown('+h.id+',this)" title="Ochirish"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>':'')+
        '</div>'+
      '</div>'+
      '<div id="'+cardId+'-items">'+itemsHtml(false)+'</div>'+
      (hasMore?'<button class="rp-show-more" id="'+cardId+'-more" onclick="rpToggleMore(this.dataset.id)" data-id="'+cardId+'">↓ Ko\'proq ko\'rsatish ('+items.length+' ta)</button>':'')+
      '<div class="rp-card-footer">'+
        '<div>'+
          '<div class="rp-total-label">Jami summa</div>'+
          '<div class="rp-total">'+fmt(total)+" so'm</div>"+
        '</div>'+
        ownerActionsHtml+
      '</div>';

    div._itemsHtml = itemsHtml;
    div._showAll = false;
    div._cardId = cardId;
    div._items = items;
    div._hasMore = hasMore;
    el.appendChild(div);
  });

  // Fade out highlights after 2s
  if(searchQuery){
    setTimeout(() => {
      document.querySelectorAll('.rp-highlight').forEach(el2 => el2.classList.add('fade'));
    }, 2000);
  }
}

function rpToggleMore(elOrId){
  const cardId = typeof elOrId === "string" ? elOrId : elOrId.dataset.id;
  const card = document.querySelector('[id="'+cardId+'-items"]')?.parentElement;
  if(!card) return;
  card._showAll = !card._showAll;
  const itemsEl = document.getElementById(cardId+'-items');
  const btn = document.getElementById(cardId+'-more');
  if(itemsEl) itemsEl.innerHTML = card._itemsHtml(card._showAll);
  if(btn) btn.textContent = card._showAll ? '\u2191 Kamroq' : '\u2193 Ko\u02bcproq ('+card._items.length+' ta)';
}


async function togglePaid(id, val){
  await sb.from('zakazlar').update({ is_paid: val }).eq('id', id);
  showNotify(val ? "✅ To'landi deb belgilandi" : "Belgisi olib tashlandi");
  await loadHistory();
  if(currentRole === 'admin') renderAdminStats();
  if(currentRole === 'ishlab') renderIshlabStats();
  renderDashboard();
}

let editingHistoryId = null;
let editingHistoryData = null;

function editHistoryItem(id){
  const h = allHistory.find(x => x.id === id);
  if(!h){ showNotify('Yozuv topilmadi'); return; }
  editingHistoryId = id;
  editingHistoryData = JSON.parse(JSON.stringify(h.data || {}));

  const modal = document.getElementById('edit-history-modal');
  const content = document.getElementById('edit-modal-content');

  let html = '';
  if(h.type === 'admin'){
    const rows = editingHistoryData.rows || [];
    html = '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Zakaz summalarini tahrirlang:</div>';
    rows.forEach((r, i) => {
      html += `<div style="display:grid;grid-template-columns:1fr 120px;gap:8px;margin-bottom:8px">
        <input type="text" value="${r.nom||''}" oninput="editingHistoryData.rows[${i}].nom=this.value" placeholder="Mahsulot nomi">
        <input type="text" inputmode="numeric" value="${r.sum||''}" oninput="editingHistoryData.rows[${i}].sum=this.value" placeholder="Summa" style="text-align:right">
      </div>`;
    });
  } else if(h.type === 'ishlab'){
    const prodRows = editingHistoryData.prodRows || [];
    html = '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Mahsulot miqdorlarini tahrirlang:</div>';
    prodRows.forEach((r, i) => {
      html += `<div style="display:grid;grid-template-columns:1fr 80px 80px;gap:8px;margin-bottom:8px">
        <div style="font-size:12px;padding:8px;background:var(--gray-light);border-radius:var(--radius-sm)">${r.key}</div>
        <input type="text" inputmode="numeric" value="${r.miq||''}" oninput="editingHistoryData.prodRows[${i}].miq=this.value" placeholder="Miqdor" style="text-align:center">
        <input type="text" inputmode="numeric" value="${r.brak||''}" oninput="editingHistoryData.prodRows[${i}].brak=this.value" placeholder="Brak" style="text-align:center;border-color:var(--red-border)">
      </div>`;
    });
    if((editingHistoryData.uvRows||[]).length){
      html += '<div style="font-size:12px;color:var(--text3);margin:10px 0 6px">UV pechat:</div>';
      (editingHistoryData.uvRows||[]).forEach((r,i) => {
        html += `<div style="display:grid;grid-template-columns:1fr 70px 70px;gap:8px;margin-bottom:8px">
          <input type="text" value="${r.nom||''}" oninput="editingHistoryData.uvRows[${i}].nom=this.value" placeholder="Nomi">
          <input type="text" inputmode="numeric" value="${r.sig||''}" oninput="editingHistoryData.uvRows[${i}].sig=this.value" placeholder="Sig'im" style="text-align:center">
          <input type="text" inputmode="numeric" value="${r.don||''}" oninput="editingHistoryData.uvRows[${i}].don=this.value" placeholder="Dona" style="text-align:center">
        </div>`;
      });
    }
  } else if(h.type === 'dizayner'){
    const rows = editingHistoryData.rows || [];
    html = '<div style="font-size:12px;color:var(--text3);margin-bottom:10px">Dizayn ishlarini tahrirlang:</div>';
    rows.forEach((r, i) => {
      html += `<div style="display:grid;grid-template-columns:1fr 100px;gap:8px;margin-bottom:8px">
        <input type="text" value="${r.nom||''}" oninput="editingHistoryData.rows[${i}].nom=this.value" placeholder="Ish nomi">
        <input type="text" inputmode="numeric" value="${r.summa||''}" oninput="editingHistoryData.rows[${i}].summa=this.value" placeholder="Summa" style="text-align:right">
      </div>`;
    });
  }

  content.innerHTML = html;
  modal.classList.remove('hidden');
}

async function saveEditedHistory(){
  if(!editingHistoryId){ return; }

  // Qayta hisoblaymiz
  let total_zakaz=0, total_daromad=0, total_jami=0;
  const d = editingHistoryData;
  const h = allHistory.find(x => x.id === editingHistoryId);

  if(h.type === 'admin'){
    (d.rows||[]).forEach(r=>{ const s=parseInt(r.sum)||0; total_zakaz+=s; total_daromad+=Math.round(s*getFoiz(s)); });
  } else if(h.type === 'ishlab'){
    (d.prodRows||[]).forEach(r=>{ const m=parseInt(r.miq)||0; const np=gUN(r.key,m); total_jami+=m*np; });
    (d.uvRows||[]).forEach(r=>{ const{jami}=calcUv(parseInt(r.sig),parseInt(r.don)); total_jami+=jami; });
    (d.ekoRows||[]).forEach(r=>{ const{jami}=calcEko(parseFloat(r.kv)); total_jami+=jami; });
  } else if(h.type === 'dizayner'){
    (d.rows||[]).forEach(r=>{ total_jami+=parseInt(r.summa)||0; });
  }

  const updateData = { data: d };
  if(h.type === 'admin'){ updateData.total_zakaz=total_zakaz; updateData.total_daromad=total_daromad; }
  else { updateData.total_jami=total_jami; }

  const { error } = await sb.from('zakazlar').update(updateData).eq('id', editingHistoryId);
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }

  showNotify('✅ Yozuv yangilandi!');
  document.getElementById('edit-history-modal').classList.add('hidden');
  editingHistoryId = null;
  await loadHistory();
}

let deleteCountdownTimer = null;
let deleteCountdownId = null;

function deleteHistoryItemCountdown(id, btnEl){
  // Agar allaqachon countdown ketayotgan bo'lsa - bekor qilish
  if(deleteCountdownId === id){
    clearInterval(deleteCountdownTimer);
    deleteCountdownId = null;
    btnEl.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
    btnEl.style.background = '';
    btnEl.style.color = '';
    btnEl.title = "O'chirish";
    showNotify('Bekor qilindi');
    return;
  }

  // Boshqa countdown ketayotgan bo'lsa - to'xtatamiz
  if(deleteCountdownTimer) clearInterval(deleteCountdownTimer);

  deleteCountdownId = id;
  let count = 5;

  // Tugmani countdown holatiga o'tkazamiz
  btnEl.style.background = 'var(--red)';
  btnEl.style.color = '#fff';
  btnEl.style.minWidth = '36px';
  btnEl.title = 'Bekor qilish uchun bosing';
  btnEl.textContent = count;

  deleteCountdownTimer = setInterval(async () => {
    count--;
    if(count <= 0){
      clearInterval(deleteCountdownTimer);
      deleteCountdownTimer = null;
      deleteCountdownId = null;
      // O'chirish
      await deleteHistoryItem(id);
    } else {
      if(btnEl && btnEl.isConnected){
        btnEl.textContent = count;
      } else {
        clearInterval(deleteCountdownTimer);
        deleteCountdownTimer = null;
        deleteCountdownId = null;
      }
    }
  }, 1000);
}

async function deleteHistoryItem(id){
  if(!confirm("Bu yozuvni rostdan ham o'chirmoqchimisiz?")) return;
  await sb.from('zakazlar').delete().eq('id', id);
  showNotify("🗑️ Yozuv o'chirildi");
  await loadHistory();
}

async function toggleBrak(id, val){
  await sb.from('zakazlar').update({ is_brak: val }).eq('id', id);
  showNotify(val ? '⚠️ Brak deb belgilandi' : 'Brak belgisi olib tashlandi');
  await loadHistory();
}

function renderOwnerPanel(){
  const byUser = {};
  allHistory.forEach(h => {
    const key = h.user_email;
    if(!byUser[key]) byUser[key] = { name: h.user_name || (h.user_email ? (h.user_email.split('+')[1] || '').split('@')[0] : '') || (h.user_email ? h.user_email.split('@')[0] : ''), email: h.user_email, zakaz:0, daromad:0, qoldiq:0, count:0 };
    if(h.type==='admin'){
      byUser[key].zakaz += h.total_zakaz||0;
      byUser[key].daromad += h.total_daromad||0;
      if(!h.is_paid && !h.is_brak) byUser[key].qoldiq += h.total_daromad||0;
    } else if(h.type==='ishlab'){
      byUser[key].zakaz += h.total_jami||0;
      if(!h.is_paid && !h.is_brak) byUser[key].qoldiq += h.total_jami||0;
    }
    byUser[key].count++;
  });
  const colors=[{bg:'#eff6ff',clr:'#1d4ed8'},{bg:'#f0fdf4',clr:'#15803d'},{bg:'#faf5ff',clr:'#6d28d9'},{bg:'#fffbeb',clr:'#92400e'},{bg:'#fef2f2',clr:'#dc2626'}];
  const el = document.getElementById('owner-list'); el.innerHTML='';
  let owZ=0, owT=0, owQ=0, owC=0;
  Object.entries(byUser).forEach(([email,u],i)=>{
    const c=colors[i%colors.length]; owZ+=u.zakaz; owT+=u.daromad; owQ+=u.qoldiq; owC+=u.count;
    const safeId = email.replace(/[^a-z0-9]/gi,'_');
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '4px';
    wrap.innerHTML = `<div class="owner-row" style="cursor:pointer;margin-bottom:0" onclick="toggleOwnerDetail('${safeId}')">
      <div class="av" style="background:${c.bg};color:${c.clr}">${(u.name||'?')[0].toUpperCase()}</div>
      <div style="font-size:13px;font-weight:600">${u.name}</div>
      <div style="font-size:13px;text-align:right">${fmt(u.zakaz)} so'm</div>
      <div style="font-size:13px;font-weight:700;text-align:right;color:${u.qoldiq>0?'var(--red)':c.clr}">${fmt(u.qoldiq)} so'm</div>
    </div>
    <div class="hidden" id="owner-detail-${safeId}" style="padding:10px 14px;background:var(--gray-light);border-radius:0 0 10px 10px;margin-top:-2px">
      <div class="give-avans-row">
        <input type="text" inputmode="numeric" placeholder="Avans summa" id="give_avans_${safeId}">
        <button class="hisob-btn amber" onclick="event.stopPropagation();giveAvans('${email}','${u.name}')">💰 Avans berish</button>
      </div>
      <div class="give-avans-row" style="margin-top:8px">
        <input type="text" inputmode="numeric" placeholder="Hisob summasi" id="hisob_sum_${safeId}">
        <input type="text" placeholder="Izoh (ixtiyoriy)" id="hisob_izoh_${safeId}" style="flex:1">
        <button class="hisob-btn green" onclick="event.stopPropagation();berHisob('${email}','${u.name}','${safeId}')">✅ Hisob berish</button>
      </div>
      <div id="avans-list-${safeId}" style="margin-top:8px"></div>
      <div id="hisob-list-${safeId}" style="margin-top:4px"></div>
    </div>`;
    el.appendChild(wrap);
  });
  if(!Object.keys(byUser).length) el.innerHTML='<div class="empty-state" style="padding:24px"><p>Hali ma\'lumot yo\'q</p></div>';
  document.getElementById('ow-zakaz').textContent = fmt(owZ)+" so'm";
  document.getElementById('ow-tolov').textContent = fmt(owQ)+" so'm";
  document.getElementById('ow-soni').textContent  = owC+' ta';
  
  // Shift statistikasi
  const today = new Date().toDateString();
  const dayCount = allHistory.filter(h=>h.shift==='day').length;
  const nightCount = allHistory.filter(h=>h.shift==='night').length;
  const todayCount = allHistory.filter(h=>new Date(h.created_at).toDateString()===today).length;
  const dayEl = document.getElementById('ow-day');
  const nightEl = document.getElementById('ow-night');
  const bugunEl = document.getElementById('ow-bugun');
  if(dayEl) dayEl.textContent = dayCount+' ta';
  if(nightEl) nightEl.textContent = nightCount+' ta';
  if(bugunEl) bugunEl.textContent = todayCount+' ta';
  
  renderOwnerStats();
  renderChart();
}

async function toggleOwnerDetail(safeId){
  const detail = document.getElementById('owner-detail-'+safeId);
  if(!detail) return;
  const wasHidden = detail.classList.contains('hidden');
  detail.classList.toggle('hidden');
  if(wasHidden){
    // Avanslarni yuklash
    const email = Object.keys(XODIMLAR).find(e => e.replace(/[^a-z0-9]/gi,'_') === safeId);
    if(!email) return;
    const { data: avanslar } = await sb.from('avanslar').select('*').eq('user_email', email).order('created_at',{ascending:false}).limit(10);
    const listEl = document.getElementById('avans-list-'+safeId);
    if(!listEl) return;
    if(!avanslar || !avanslar.length){ listEl.innerHTML = "<div style=\"font-size:12px;color:var(--text3)\">Avanslar yo'q</div>"; return; }
    listEl.innerHTML = avanslar.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--white);border-radius:var(--radius-sm);margin-bottom:4px;font-size:12px">
        <span>💰 ${fmt(a.summa)} so'm ${a.sabab?'— '+a.sabab:''}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text3)">${new Date(a.created_at).toLocaleDateString('uz-UZ')}</span>
          <button onclick="event.stopPropagation();deleteAvans(${a.id},'${safeId}')" style="background:none;border:1px solid var(--red-border);color:var(--red);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer">🗑</button>
        </div>
      </div>`).join('');

    // Hisob tarixi
    await loadHisobTarix(email, safeId);
  }
}

// ── AVANS O'CHIRISH ──
async function deleteAvans(id, safeId){
  showConfirm('Avansni o\'chirish', 'Bu avansni o\'chirishni tasdiqlaysizmi?', async () => {
    const { error } = await sb.from('avanslar').delete().eq('id', id);
    if(error){ showNotify('❌ Xatolik: '+error.message); return; }
    showNotify('✅ Avans o\'chirildi');
    // Reload avans list
    const email = Object.keys(XODIMLAR).find(e => e.replace(/[^a-z0-9]/gi,'_') === safeId);
    if(!email) return;
    const { data } = await sb.from('avanslar').select('*').eq('user_email', email).order('created_at',{ascending:false}).limit(10);
    const listEl = document.getElementById('avans-list-'+safeId);
    if(!listEl) return;
    if(!data || !data.length){ listEl.innerHTML = "<div style=\"font-size:12px;color:var(--text3)\">Avanslar yo'q</div>"; return; }
    listEl.innerHTML = data.map(a => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--white);border-radius:var(--radius-sm);margin-bottom:4px;font-size:12px">
        <span>💰 ${fmt(a.summa)} so'm ${a.sabab?'— '+a.sabab:''}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text3)">${new Date(a.created_at).toLocaleDateString('uz-UZ')}</span>
          <button onclick="event.stopPropagation();deleteAvans(${a.id},'${safeId}')" style="background:none;border:1px solid var(--red-border);color:var(--red);border-radius:4px;padding:2px 6px;font-size:11px;cursor:pointer">🗑</button>
        </div>
      </div>`).join('');
  });
}

// ── HISOB BERISH ──
async function berHisob(email, name, safeId){
  const summaEl = document.getElementById('hisob_sum_'+safeId);
  const izohEl  = document.getElementById('hisob_izoh_'+safeId);
  const summa   = parseInt(summaEl.value)||0;
  const izoh    = izohEl.value.trim();
  if(!summa){ showNotify('Summa kiriting'); return; }

  // Hisoblash: ushbu hodimning umumiy hisobi
  const userData = allHistory.filter(h => h.user_email === email);
  const jami = userData.reduce((s,h) => {
    if(h.type==='admin') return s + (h.total_daromad||0);
    return s + (h.total_jami||0);
  }, 0);

  // Oldingi to'langan hisoblarni olish
  const { data: oldHisoblar } = await sb.from('hisob_kitob')
    .select('summa').eq('admin_email', email);
  const oldingiTolangan = (oldHisoblar||[]).reduce((s,h) => s+(h.summa||0), 0);

  const joriyHisob = jami - oldingiTolangan;
  const qarz = joriyHisob - summa;

  const { error } = await sb.from('hisob_kitob').insert({
    admin_email:   email,
    admin_name:    name,
    summa,
    jami_hisob:    joriyHisob,
    qarz:          qarz > 0 ? qarz : 0,
    izoh:          izoh || 'Oylik hisob-kitob',
    sana:          getSanaVaqt(),
    created_at:    new Date().toISOString(),
  });

  if(error){ showNotify('❌ Xatolik: '+error.message); return; }
  showNotify('✅ Hisob berildi! Qarz: '+fmt(Math.max(0,qarz))+" so'm");
  summaEl.value = '';
  izohEl.value = '';
  await loadHisobTarix(email, safeId);
}

async function loadHisobTarix(email, safeId){
  const { data } = await sb.from('hisob_kitob')
    .select('*')
    .eq('admin_email', email)
    .order('created_at', { ascending: false })
    .limit(6);

  const el = document.getElementById('hisob-list-'+safeId);
  if(!el) return;

  if(!data || !data.length){
    el.innerHTML = '';
    return;
  }

  const jami_berildi = data.reduce((s,h) => s+(h.summa||0), 0);
  const oxirgi_qarz  = data[0].qarz || 0;

  el.innerHTML =
    `<div style="margin-top:8px;padding:8px 10px;background:rgba(34,197,94,.08);border:1px solid var(--green-border);border-radius:var(--radius-md)">
      <div style="font-size:11px;color:var(--text3);margin-bottom:4px">📊 Hisob tarixi</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px">
        <span>Jami berildi:</span><span style="font-weight:700;color:var(--green)">${fmt(jami_berildi)} so'm</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:12px">
        <span>Joriy qarz:</span><span style="font-weight:700;color:${oxirgi_qarz>0?'var(--red)':'var(--green)'}">
          ${oxirgi_qarz>0?fmt(oxirgi_qarz)+' so\'m':'Qarz yo\'q ✅'}
        </span>
      </div>
    </div>`+
    data.map(h =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;font-size:11px;color:var(--text3);border-bottom:1px solid var(--gray-border)">
        <span>${h.izoh||'Hisob-kitob'}</span>
        <span style="font-weight:600;color:var(--text)">${fmt(h.summa)} so'm</span>
        <span>${h.sana||''}</span>
      </div>`
    ).join('');
}

// ── SAVE ──
function getSanaVaqt(){
  const now = new Date();
  const kunlar = ['Yakshanba','Dushanba','Seshanba','Chorshanba','Payshanba','Juma','Shanba'];
  const kun = kunlar[now.getDay()];
  const sana = now.toLocaleDateString('uz-UZ');
  const vaqt = now.toLocaleTimeString('uz-UZ', {hour:'2-digit', minute:'2-digit'});
  return `${kun} ${sana} ${vaqt}`;
}

let isSaving = false;

async function saveOnly(type){
  if(isSaving){ showNotify('Saqlanmoqda, kuting...'); return; }
  isSaving = true;

  const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
  let data={}, totalZakaz=0, totalDaromad=0, totalJami=0;

  if(type==='admin'){
    const rows = adD.filter(r=>r.nom||(parseInt(r.sum)||0));
    if(!rows.length){ showNotify('Hech narsa kiritilmagan'); isSaving=false; return; }
    rows.forEach(r=>{ const s=parseInt(r.sum)||0; const f=getFoiz(s); totalZakaz+=s; totalDaromad+=Math.round(s*f); });
    data = { rows };
  } else {
    const prodRows = prD.filter(r=>parseInt(r.miq)>0);
    const uvRows   = uvD.filter(r=>parseInt(r.sig)>0&&parseInt(r.don)>0);
    const ekoRows  = ekoD.filter(r=>parseFloat(r.kv)>0);
    if(!prodRows.length&&!uvRows.length&&!ekoRows.length){ showNotify('Hech narsa kiritilmagan'); isSaving=false; return; }
    prodRows.forEach(r=>{ const m=parseInt(r.miq)||0; const np=gUN(r.key,m)+(r.ex&&PR[r.key]&&PR[r.key].extra?200:0); totalJami+=m*np; });
    uvRows.forEach(r=>{ const {jami}=calcUv(parseInt(r.sig),parseInt(r.don)); totalJami+=jami; });
    ekoRows.forEach(r=>{ const {jami}=calcEko(parseFloat(r.kv)); totalJami+=jami; });
    const brakRows = prodRows.filter(r=>parseInt(r.brak)>0);
    data = { prodRows, uvRows, ekoRows, brakRows };
  }

  const sanaVaqt = getSanaVaqt();
  const row = {
    user_id: currentUser.id,
    user_email: currentUser.email,
    user_name: name,
    type,
    data,
    total_zakaz: totalZakaz,
    total_daromad: totalDaromad,
    total_jami: totalJami,
    sana: sanaVaqt,
    shift: getCurrentShift(),
  };

  const { error } = await sb.from('zakazlar').insert(row);
  isSaving = false;
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }

  showNotify('✅ Saqlandi! — '+sanaVaqt+'. Tarixda ko\'rishingiz mumkin.');

  // Avval tarixni yangilab, keyin formani tozalamiz
  await loadHistory();

  // Formani tozalash
  if(type==='admin'){
    adD = [{nom:'',sum:''},{nom:'',sum:''},{nom:'',sum:''}];
    renderAdmin();
  } else if(type==='dizayner'){
    dizD = [{nom:'', summa:'', tolovchi:'offis', tolov:null, kontakt:''}];
    renderDizayner();
  } else {
    prD = [{key:'Futbolka DTF (old)',miq:'',brak:'',ex:false}];
    uvD = [{nom:'',sig:'',don:''}];
    ekoD = [{nom:'',kv:''}];
    renderIshlab();
  }
}

async function sendWeekly(type){
  // Oxirgi 7 kunlik yozuvlarni yig'ib Telegram ga yuboradi
  const user = currentUser;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data, error } = await sb.from('zakazlar')
    .select('*')
    .eq('user_id', user.id)
    .eq('type', type)
    .order('created_at', { ascending: true });

  if(error || !data || !data.length){
    showNotify('Haftalik yozuvlar topilmadi');
    return;
  }

  const name = user.email.split('+')[1] ? user.email.split('+')[1].split('@')[0] : user.email.split('@')[0];
  let lines = [];

  if(type === 'admin'){
    lines.push(`👤 Admin: ${name}`);
    lines.push(`📅 Haftalik hisobot`);
    lines.push('');
    let totalZ=0, totalD=0;
    data.forEach(h => {
      lines.push(`📌 ${h.sana}`);
      (h.data.rows||[]).filter(r=>r.nom||(parseInt(r.sum)||0)).forEach((r,i) => {
        const s=parseInt(r.sum)||0;
        const f=getFoiz(s);
        const d=Math.round(s*f);
        totalZ+=s; totalD+=d;
        lines.push(`  ${i+1}. ${r.nom}: ${fmt(s)} so'm → ${Math.round(f*100)}% → ${fmt(d)} so'm`);
      });
      lines.push('');
    });
    lines.push(`💰 Jami zakaz: ${fmt(totalZ)} so'm`);
    lines.push(`✅ Sof daromad: ${fmt(totalD)} so'm`);
  } else {
    lines.push(`🏭 Xodim: ${name}`);
    lines.push(`📅 Haftalik hisobot`);
    lines.push('');
    let totalJ=0;
    data.forEach(h => {
      lines.push(`📌 ${h.sana}`);
      (h.data.prodRows||[]).filter(r=>parseInt(r.miq)>0).forEach((r,i) => {
        const m=parseInt(r.miq)||0;
        const brak=parseInt(r.brak)||0;
        const np=gUN(r.key,m)+(r.ex&&PR[r.key]&&PR[r.key].extra?200:0);
        const j=m*np; totalJ+=j;
        const brakTxt = brak > 0 ? ` | ⚠️ ${brak} ta BRAK` : '';
        lines.push(`  ${i+1}. ${r.key}: ${m} ${PR[r.key]?PR[r.key].u:'dona'} × ${fmt(np)} = ${fmt(j)} so'm${brakTxt}`);
      });
      (h.data.uvRows||[]).filter(r=>parseInt(r.sig)>0).forEach((r,i) => {
        const{ls,np,jami}=calcUv(parseInt(r.sig),parseInt(r.don));
        totalJ+=jami;
        lines.push(`  UV: ${r.nom||'mahsulot'}: ${r.don} dona → ${ls} list × ${fmt(np)} = ${fmt(jami)} so'm`);
      });
      lines.push('');
    });
    lines.push(`💰 Jami: ${fmt(totalJ)} so'm`);
  }

  const msg = lines.join('\n');

  // Telegram t.me/share has ~4096 char limit
  // Truncate if needed
  const MAX = 4000;
  const truncated = msg.length > MAX ? msg.slice(0, MAX) + '\n...\n(qisqartirildi)' : msg;
  
  window.open('https://t.me/share/url?url=%20&text='+encodeURIComponent(truncated),'_blank');
}

async function copyWeekly(type){
  const user = currentUser;
  const { data, error } = await sb.from('zakazlar')
    .select('*')
    .eq('user_id', user.id)
    .eq('type', type)
    .order('created_at', { ascending: true });

  if(error || !data || !data.length){
    showNotify('Haftalik yozuvlar topilmadi');
    return;
  }

  const name = user.email.split('+')[1] ? user.email.split('+')[1].split('@')[0] : user.email.split('@')[0];
  let lines2 = [];

  if(type === 'admin'){
    lines2.push('Admin: ' + name);
    lines2.push('Haftalik hisobot');
    lines2.push('');
    let totalZ=0, totalD=0;
    data.forEach(h => {
      lines2.push(h.sana || '');
      (h.data.rows||[]).filter(r=>r.nom||(parseInt(r.sum)||0)).forEach((r,i) => {
        const s=parseInt(r.sum)||0;
        const f=getFoiz(s);
        const d=Math.round(s*f);
        totalZ+=s; totalD+=d;
        lines2.push('  '+(i+1)+'. '+r.nom+': '+fmt(s)+" so'm "+Math.round(f*100)+'% '+fmt(d)+" so'm");
      });
      lines2.push('');
    });
    lines2.push('Jami zakaz: '+fmt(totalZ)+" so'm");
    lines2.push('Sof daromad: '+fmt(totalD)+" so'm");
  } else {
    lines2.push('Xodim: ' + name);
    lines2.push('Haftalik hisobot');
    lines2.push('');
    let totalJ=0;
    data.forEach(h => {
      lines2.push(h.sana || '');
      (h.data.prodRows||[]).filter(r=>parseInt(r.miq)>0).forEach((r,i) => {
        const m=parseInt(r.miq)||0;
        const brak=parseInt(r.brak)||0;
        const np=gUN(r.key,m)+(r.ex&&PR[r.key]&&PR[r.key].extra?200:0);
        const j=m*np; totalJ+=j;
        const brakTxt = brak > 0 ? ' | BRAK: '+brak+' ta' : '';
        lines2.push('  '+(i+1)+'. '+r.key+': '+m+' '+(PR[r.key]?PR[r.key].u:'dona')+' = '+fmt(j)+" so'm"+brakTxt);
      });
      (h.data.uvRows||[]).filter(r=>parseInt(r.sig)>0).forEach(r => {
        const{ls,np,jami}=calcUv(parseInt(r.sig),parseInt(r.don));
        totalJ+=jami;
        lines2.push('  UV: '+(r.nom||'mahsulot')+': '+r.don+' dona '+ls+' list = '+fmt(jami)+" so'm");
      });
      (h.data.ekoRows||[]).filter(r=>parseFloat(r.kv)>0).forEach(r => {
        const{narx,jami}=calcEko(parseFloat(r.kv));
        totalJ+=jami;
        lines2.push('  Eko: '+(r.nom||'mahsulot')+': '+r.kv+' kv.m = '+fmt(jami)+" so'm");
      });
      lines2.push('');
    });
    lines2.push('Jami: '+fmt(totalJ)+" so'm");
  }

  const msg = lines2.join('\n');
  navigator.clipboard.writeText(msg)
    .then(()=>showNotify('Nusxa olindi! Telegramga qo\'lda joylashtiring.'))
    .catch(()=>showNotify('Nusxa olishda xato'));
}

async function copyWeeklyDizayner(){
  const user = currentUser;
  const name = user.email.split('+')[1] ? user.email.split('+')[1].split('@')[0] : user.email.split('@')[0];
  const { data, error } = await sb.from('zakazlar').select('*').eq('user_id', user.id).eq('type','dizayner').order('created_at',{ascending:true});
  if(error||!data||!data.length){ showNotify('Haftalik yozuvlar topilmadi'); return; }
  let lines3 = ['Dizayner: '+name,'Haftalik hisobot',''];
  let totalJ=0, totalT=0, totalTM=0;
  data.forEach(h=>{
    lines3.push(h.sana||'');
    (h.data.rows||[]).forEach((r,i)=>{
      const s=parseInt(r.summa)||0; totalJ+=s;
      const tolovStatus = r.tolov===true?"To'landi":r.tolov===false?"To'lanmadi":'Belgilanmagan';
      const tolovchi = r.tolovchi==='mijoz'?'Mijoz'+(r.kontakt?' ('+r.kontakt+')':''):'Offis';
      if(r.tolov===true) totalT+=s; else if(r.tolov===false) totalTM+=s;
      lines3.push('  '+(i+1)+'. '+r.nom+': '+fmt(s)+" so'm | "+tolovchi+' | '+tolovStatus);
    });
    lines3.push('');
  });
  lines3.push("Jami: "+fmt(totalJ)+" so'm");
  lines3.push("To'landi: "+fmt(totalT)+" so'm");
  lines3.push("To'lanmadi: "+fmt(totalTM)+" so'm");
  const msg = lines3.join('\n');
  navigator.clipboard.writeText(msg)
    .then(()=>showNotify("Nusxa olindi! Telegramga qo'lda joylashtiring."))
    .catch(()=>showNotify('Nusxa olishda xato'));
}


async function saveAndSend(type){
  if(isSaving){ showNotify('Saqlanmoqda, kuting...'); return; }
  isSaving = true;

  const name = ((currentUser.email.split('+')[1] || '').split('@')[0]) || currentUser.email.split('@')[0];
  let data={}, totalZakaz=0, totalDaromad=0, totalJami=0;

  if(type==='admin'){
    const rows = adD.filter(r=>r.nom||(parseInt(r.sum)||0));
    if(!rows.length){ showNotify('Hech narsa kiritilmagan'); isSaving=false; return; }
    rows.forEach(r=>{ const s=parseInt(r.sum)||0; const f=getFoiz(s); totalZakaz+=s; totalDaromad+=Math.round(s*f); });
    data = { rows };
  } else {
    const prodRows = prD.filter(r=>parseInt(r.miq)>0);
    const uvRows   = uvD.filter(r=>parseInt(r.sig)>0&&parseInt(r.don)>0);
    const ekoRows  = ekoD.filter(r=>parseFloat(r.kv)>0);
    if(!prodRows.length&&!uvRows.length&&!ekoRows.length){ showNotify('Hech narsa kiritilmagan'); isSaving=false; return; }
    prodRows.forEach(r=>{ const m=parseInt(r.miq)||0; const np=gUN(r.key,m)+(r.ex && PR[r.key] && PR[r.key].extra?200:0); totalJami+=m*np; });
    uvRows.forEach(r=>{ const {jami}=calcUv(parseInt(r.sig),parseInt(r.don)); totalJami+=jami; });
    ekoRows.forEach(r=>{ const {jami}=calcEko(parseFloat(r.kv)); totalJami+=jami; });
    const brakRows = prodRows.filter(r=>parseInt(r.brak)>0);
    data = { prodRows, uvRows, ekoRows, brakRows };
  }

  const sanaVaqt2 = getSanaVaqt();
  const row = {
    user_id: currentUser.id,
    user_email: currentUser.email,
    user_name: name,
    type,
    data,
    total_zakaz: totalZakaz,
    total_daromad: totalDaromad,
    total_jami: totalJami,
    sana: sanaVaqt2,
  };

  const { error } = await sb.from('zakazlar').insert(row);
  isSaving = false;
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }

  showNotify('✅ Saqlandi! — '+sanaVaqt2);

  // Telegram xabarini formani tozalashdan oldin tayyorlash
  const msg = type==='admin' ? buildAdminMsg() : buildIshlabMsg();

  // Avval tarixni yangilab, keyin formani tozalamiz
  await loadHistory();

  // Formani tozalash
  if(type==='admin'){
    adD = [{nom:'',sum:''},{nom:'',sum:''},{nom:'',sum:''}];
    renderAdmin();
  } else {
    prD = [{key:'Futbolka DTF (old)',miq:'',brak:'',ex:false}];
    uvD = [{nom:'',sig:'',don:''}];
    ekoD = [{nom:'',kv:''}];
    renderIshlab();
  }

  window.open('https://t.me/share/url?url=%20&text='+encodeURIComponent(msg),'_blank');
}

// ── FOIZ ──
const FOIZ=[[0,99999,.20],[100000,249999,.15],[250000,499999,.12],[500000,999999,.10],[1000000,1999999,.08],[2000000,2999999,.06],[3000000,3999999,.055],[4000000,4999999,.05],[5000000,9999999,.04],[10000000,29999999,.035],[30000000,49999999,.033],[50000000,99999999,.032],[100000000,Infinity,.03]];
function getFoiz(s){ for(const[a,b,f]of FOIZ)if(s>=a&&s<=b)return f; return .03; }
function uvNarx(n){ return n<=5?40000:n<=10?25000:20000; }

function calcUv(sig, don){
  if(!sig||!don||sig<=0||don<=0) return {ls:0, lsReal:0, lsFull:0, lsFrac:0, np:0, jami:0};
  
  const fullLists = Math.floor(don / sig); // to'liq listlar
  const remainder = don % sig;             // qolgan dona
  
  let frac = 0;
  if(remainder > 0){
    const pct = remainder / sig;
    if(pct <= 0.125)    frac = 0.2;
    else if(pct <= 0.5) frac = 0.5;
    else                frac = 1.0;
  }
  
  const lsReal = fullLists + frac;
  const totalListsForPrice = Math.ceil(lsReal); // narx bosqichi uchun
  const npPerList = uvNarx(totalListsForPrice);
  
  // Har bir qism alohida narx
  const jamiToliq = fullLists * npPerList;
  let jamiFrac = 0;
  if(frac === 0.2)      jamiFrac = 20000;
  else if(frac === 0.5) jamiFrac = 30000;
  else if(frac === 1.0) jamiFrac = npPerList;
  
  const jami = jamiToliq + jamiFrac;
  return {ls: lsReal, lsReal, lsFull: fullLists, lsFrac: frac, np: npPerList, jami};
}

function ekoNarx(kv){ if(kv<=10)return 5000; if(kv<=50)return 4000; if(kv<=100)return 3700; return 3500; }
function calcEko(kv){ if(!kv||kv<=0)return{narx:0,jami:0}; const narx=ekoNarx(kv); return{narx,jami:Math.round(kv*narx)}; }

const PR={
  'Futbolka DTF (old)':{u:'dona',cat:'termopress',t:[[1,100,2000],[101,500,2500],[501,Infinity,2000]]},
  'Futbolka DTF (old+orqa)':{u:'dona',cat:'termopress',t:[[1,100,3000],[101,500,2500],[501,Infinity,2000]]},
  'Finka (old)':{u:'dona',cat:'termopress',t:[[1,100,4000],[101,500,3000],[501,Infinity,2500]]},
  'Finka (old+orqa)':{u:'dona',cat:'termopress',t:[[1,100,5000],[101,500,4000],[501,Infinity,3500]]},
  'Futbolka Vinil (old)':{u:'dona',cat:'termopress',note:'Vinil kesish+tozalash bilan.',t:[[1,100,4000],[101,500,3000],[501,Infinity,2500]]},
  'Futbolka Vinil (old+orqa)':{u:'dona',cat:'termopress',t:[[1,100,8000],[101,500,6000],[501,Infinity,5000]]},
  'Lenta press':{u:'metr',cat:'termopress',t:[[1,10,1500],[11,50,1200],[51,100,1000],[101,200,900],[201,500,800],[501,Infinity,700]]},
  'Kepka DTF':{u:'dona',cat:'termopress',t:[[1,10,2000],[11,20,1500],[21,100,1000],[101,500,900],[501,Infinity,800]]},
  'Lenta aparat pechat (Godex)':{u:'metr',cat:'boshqa',t:[[0,50,1000],[51,200,800],[201,500,500],[501,1000,400]]},

  'Konturniy (pechat+kesish)':{u:'metr',cat:'ekosalvent',t:[[1,10,20000],[11,20,15000],[21,40,12000],[41,100,10000]]},

  'Rangli printer (old+orqa, 1-500ta)':{u:'dona',cat:'printer',t:[[1,500,500],[501,Infinity,400]]},
  'Rangli printer (old, 1-500ta)':{u:'dona',cat:'printer',t:[[1,500,300],[501,Infinity,250]]},
  'Bloknot ichi (80gr qog\'oz)':{u:'dona',cat:'printer',t:[[1,Infinity,100]]},

  'Roll-up ustanovka':{u:'dona',cat:'boshqa',t:[[1,10,20000],[11,30,15000],[31,Infinity,12000]]},
  'UF Ruchka':{u:'dona',cat:'boshqa',t:[[1,50,500],[51,500,400],[501,1000,350],[1001,Infinity,300]]},
  'Pauk rezka':{u:'dona',cat:'boshqa',t:[[1,5,15000],[6,10,12000],[11,20,10000],[21,50,9000],[51,Infinity,8000]]},
  'Znachok yasash':{u:'dona',cat:'boshqa',t:[[1,10,2000],[11,30,1500],[31,50,1000],[51,100,800]]},
  'Beyjik yasash/tikish':{u:'dona',cat:'boshqa',note:'2 tomonli bo\'lsa +200 so\'m/dona',extra:1,t:[[1,50,1000],[51,100,800],[101,500,700],[501,Infinity,600]]},
  'Krujka sublimatsiya':{u:'dona',cat:'printer',t:[[1,10,3000],[11,30,2500],[31,100,2000],[101,Infinity,1500]]},
  'Sifra pechat':{u:'dona',cat:'printer',t:[[1,10,1500],[11,50,1000],[51,Infinity,800]]},
  'Bloknot zborka':{u:'dona',cat:'printer',fixed:2000,t:[[1,Infinity,2000]]},
};

const CATEGORIES = {
  'termopress': {label: '🔥 Termopress', color: 'var(--red)'},
  'ekosalvent': {label: '🖨️ Ekosalvent', color: 'var(--amber)'},
  'printer': {label: '🖨️ Printer', color: 'var(--blue)'},
  'boshqa': {label: '📦 Boshqa', color: 'var(--purple)'},
  'qolda': {label: '✏️ Qo\'lda kiritish', color: 'var(--gray)'},
};

const QOLDA_KEY = '__qolda__';
function gUN(key,m){ const p=PR[key]; if(!p||m<=0)return 0; if(p.fixed) return p.fixed; for(const[lo,hi,n]of p.t)if(m>=lo&&m<=hi)return n; return p.t[p.t.length-1][2]; }

// ── BO'LIMLARNI YASHIRISH/KO'RSATISH ──
let hiddenSections = [];

function loadHiddenSections(){
  try {
    const key = 'hidden_sections_' + (currentUser ? currentUser.id : '');
    const saved = sessionStorage.getItem(key);
    hiddenSections = saved ? JSON.parse(saved) : [];
  } catch(e){ hiddenSections = []; }
  applyHiddenSections();
}

function saveHiddenSections(){
  const key = 'hidden_sections_' + (currentUser ? currentUser.id : '');
  sessionStorage.setItem(key, JSON.stringify(hiddenSections));
}

function hideCard(id, label){
  if(!hiddenSections.find(h=>h.id===id)){
    hiddenSections.push({id, label});
    saveHiddenSections();
    applyHiddenSections();
    showNotify(label + ' bolimi yashirildi');
  }
}

function showCard(id){
  hiddenSections = hiddenSections.filter(h=>h.id!==id);
  saveHiddenSections();
  applyHiddenSections();
}

function applyHiddenSections(){
  ['prod','uv','eko'].forEach(id=>{
    const card = document.getElementById('card-'+id);
    if(!card) return;
    const isHidden = hiddenSections.find(h=>h.id===id);
    card.classList.toggle('hidden', !!isHidden);
  });
  
  const bar = document.getElementById('hidden-sections-bar');
  const list = document.getElementById('hidden-sections-list');
  if(bar && list){
    if(hiddenSections.length){
      bar.classList.remove('hidden');
      list.innerHTML = hiddenSections.map(h=>`<span class="restore-chip" onclick="showCard('${h.id}')">↺ ${h.label}</span>`).join('');
    } else {
      bar.classList.add('hidden');
    }
  }
}

let uvD=[{nom:'',sig:'',don:'',brak:''}];
let ekoD=[{nom:'',kv:'',brak:''}];
let dizTimers = {};
let swRowIntervals = {};
let prD=[{key:'Futbolka DTF (old)',miq:'',brak:'',ex:false,qolda_nom:'',qolda_narx:'',qolda_birlik:'dona'}];
let adD=[{nom:'',sum:''},{nom:'',sum:''},{nom:'',sum:''}];

function addUvRow(){uvD.push({nom:'',sig:'',don:'',brak:''});renderIshlab();}
function delUv(i){uvD.splice(i,1);renderIshlab();}
function addEkoRow(){ekoD.push({nom:'',kv:'',brak:''});renderIshlab();}
function delEko(i){ekoD.splice(i,1);renderIshlab();}
function addProdRow(){prD.push({key:Object.keys(PR)[0],miq:'',ex:false});renderIshlab();}
function delProd(i){prD.splice(i,1);renderIshlab();}
function addAdminRow(){adD.push({nom:'',sum:''});renderAdmin();}
function delAdmin(i){adD.splice(i,1);renderAdmin();}

function numInput(el,cb){ el.addEventListener('keydown',e=>{if(e.key==='Enter')el.blur();}); el.addEventListener('blur',()=>cb(el.value)); }

function delIcon(fn){ return `<button class="icon-btn" onclick="${fn}" title="O'chirish"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`; }
