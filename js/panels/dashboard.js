// panels/dashboard.js
// Depends: config.js, utils.js, db.js, auth.js

// TODO: sb.from() calls bu faylda db.js service funksiyalariga ko'chirilishi kerak
let dbMode = 'oylik', dbChart = null;
let chartMode = 'oylik', daromadChart = null;

AppStore.on('historyChanged', () => {
  const p = document.getElementById('panel-dashboard');
  if (p && p.classList.contains('active')) renderDashboard();
});


// ── PERSONAL DASHBOARD ──

function setDbMode(mode, el){
  dbMode = mode;
  document.querySelectorAll('#panel-dashboard .filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderDashboard();
}

function renderDashboard(){
  if(!currentUser || !allHistory) return;
  renderMyAttendanceWidget();
  // user_id bo'yicha filtrlanadi (email emas) — user_email'da katta/kichik
  // harf yoki bo'shliq farqi bo'lsa ham xato ishlamaslik uchun (2026-07-22
  // aniqlangan zaif joy: eski/noaniq user_email qatorlar jimgina
  // tashlab yuborilishi mumkin edi).
  const myData = allHistory.filter(h => h.user_id === currentUser.id);
  if(!myData.length){
    document.getElementById('db-recent-list').innerHTML = '<div class="empty-state"><p>Hali yozuvlar yoq</p></div>';
    return;
  }

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  // Hisoblash
  let jamiZakaz = 0, sofDaromad = 0, buOy = 0, utganOy = 0, brakSoni = 0;

  myData.forEach(h => {
    const d = new Date(h.created_at);
    const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
    jamiZakaz += (h.type === 'admin' ? (h.total_zakaz||0) : val);
    if(!h.is_paid && !h.is_brak) sofDaromad += val;
    if(d.getMonth() === thisMonth && d.getFullYear() === thisYear) buOy += val;
    if(d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) utganOy += val;
    if(h.is_brak) brakSoni++;
  });

  const osish = utganOy > 0 ? Math.round(((buOy - utganOy) / utganOy) * 100) : (buOy > 0 ? 100 : 0);

  // Stat kartalar
  const el = id => document.getElementById(id);
  el('db-jami').textContent = myData.length + ' ta';
  el('db-daromad').textContent = fmt(sofDaromad) + " so'm";
  el('db-bu-oy').textContent = fmt(buOy) + " so'm";
  el('db-utgan-oy').textContent = fmt(utganOy) + " so'm";
  el('db-osish').textContent = (osish >= 0 ? '+' : '') + osish + '%';
  el('db-osish').style.color = osish >= 0 ? 'var(--green)' : 'var(--red)';
  el('db-brak').textContent = brakSoni + ' ta';

  // Grafik
  renderDbChart(myData, thisMonth, thisYear);

  // KPI progress (faqat sotuvchilar uchun)
  const kpiCard = document.getElementById('db-kpi-card');
  const kpi = getKpi(currentUser.email);
  if(kpi && kpiCard && currentRole === 'admin'){
    kpiCard.classList.remove('hidden');
    
    // Bu oylik summa
    const now2 = new Date();
    const oylikSumma = myData
      .filter(h => { const d=new Date(h.created_at); return d.getMonth()===now2.getMonth()&&d.getFullYear()===now2.getFullYear(); })
      .reduce((s,h)=>s+(h.total_zakaz||h.total_daromad||0), 0);
    
    const pct = Math.min(Math.round((oylikSumma/kpi.maqsad)*100), 100);
    const curBonus = getCurrentBonus(currentUser.email, oylikSumma);
    const nxtBonus = getNextBonus(currentUser.email, oylikSumma);
    
    const el2 = id => document.getElementById(id);
    if(el2('db-kpi-daraja-label')) el2('db-kpi-daraja-label').textContent = DARAJA_LABELS[kpi.daraja] || kpi.daraja;
    if(el2('db-kpi-current')) el2('db-kpi-current').textContent = fmt(oylikSumma)+" so'm";
    if(el2('db-kpi-maqsad')) el2('db-kpi-maqsad').textContent = fmt(kpi.maqsad)+" so'm";
    if(el2('db-kpi-pct')) el2('db-kpi-pct').textContent = pct+'%';
    if(el2('db-kpi-bar')) el2('db-kpi-bar').style.width = pct+'%';
    if(el2('db-kpi-bar')) el2('db-kpi-bar').style.background = pct>=100?'var(--green)':pct>=70?'linear-gradient(90deg,var(--blue),var(--green))':'linear-gradient(90deg,var(--amber),var(--blue))';
    if(el2('db-kpi-fiks')) el2('db-kpi-fiks').textContent = fmt(kpi.fiks)+" so'm";
    
    if(curBonus){
      if(el2('db-kpi-bonus-label')) el2('db-kpi-bonus-label').textContent = curBonus.label;
      if(el2('db-kpi-bonus-sum')) el2('db-kpi-bonus-sum').textContent = fmt(curBonus.bonus)+" so'm";
      const totalDaromad = kpi.fiks + curBonus.bonus;
      if(el2('db-kpi-bonus-info')) el2('db-kpi-bonus-info').querySelector('div:last-child') && (el2('db-kpi-bonus-info').innerHTML = 
        '<div style="font-size:11px;color:var(--text3);margin-bottom:4px">Joriy bonus bosqichi</div>'+
        '<div style="font-size:14px;font-weight:700;color:var(--green)">'+curBonus.label+'</div>'+
        '<div style="font-size:13px;color:var(--text2);margin-top:4px">Fiks: <b>'+fmt(kpi.fiks)+" so'm</b> + Bonus: <b style='color:var(--green)'>"+fmt(curBonus.bonus)+" so'm</b> = <b style='color:var(--blue)'>"+fmt(totalDaromad)+" so'm</b></div>");
    }
    
    if(nxtBonus && el2('db-kpi-next')){
      const qoldi = nxtBonus.min - oylikSumma;
      el2('db-kpi-next').innerHTML = "⬆️ Keyingi bosqich (<b>"+nxtBonus.label+"</b>): yana <b style='color:var(--blue)'>"+fmt(qoldi)+" so'm</b> qoldi → bonus <b>"+fmt(nxtBonus.bonus)+" so'm</b> bo'ladi";
    } else if(!nxtBonus && el2('db-kpi-next')){
      el2('db-kpi-next').innerHTML = "🏆 <b style='color:var(--green)'>Eng yuqori bosqichdasiz!</b>";
    }

    // Jarima tizimini ko'rsatish
    const jarimalar = KPI_JARIMA[kpi.daraja] || [];
    const jarimarEl = el2('db-kpi-jarima-list');
    if(jarimarEl){
      jarimarEl.innerHTML = jarimalar.map(j =>
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;padding:4px 8px;border-radius:var(--radius-sm);background:var(--red-light);border:1px solid var(--red-border);font-size:11px">'+
          '<span style="color:var(--text2);flex:1;margin-right:8px">'+j.sabab+'</span>'+
          '<span style="font-weight:700;color:var(--red);white-space:nowrap">'+fmt(j.miqdor)+" so'm</span>"+
        '</div>'
      ).join('');
    }
  } else if(kpiCard){
    kpiCard.classList.add('hidden');
  }

  // So'nggi 5 ta zakaz
  const recent = [...myData].slice(0, 5);
  const listEl = el('db-recent-list');
  if(!listEl) return;
  listEl.innerHTML = recent.map(h => {
    const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
    const statusColor = h.is_brak ? 'var(--red)' : h.is_paid ? 'var(--green)' : 'var(--amber)';
    const statusText = h.is_brak ? 'Brak' : h.is_paid ? "To'landi" : 'Kutilmoqda';
    const typeLabel = h.type === 'admin' ? '👤' : h.type === 'ishlab' ? '🏭' : '🎨';
    return `<div class="db-recent-item">
      <div>
        <div class="db-recent-label">${typeLabel} ${h.sana || ''}</div>
        <div class="db-recent-date">${h.sana || ''}</div>
      </div>
      <div style="text-align:right">
        <div class="db-recent-sum" style="color:var(--blue)">${fmt(val)} so'm</div>
        <span class="db-recent-status" style="background:${statusColor}22;color:${statusColor}">${statusText}</span>
      </div>
    </div>`;
  }).join('');
  // Avans va hisob (hodimlar uchun)
  if(currentRole !== 'owner'){ loadMyAvans(); if(currentRole==='admin') loadMyHisobTarix(); }
}

async function loadMyAvans(){
  if (!currentUser) return;
  const card = document.getElementById('db-avans-card');
  const list = document.getElementById('db-avans-list');
  if(!card || !list || !currentUser) return;

  const _avansRes = await getAvans(currentUser.email);
  const data = _avansRes, error = null;

  if(error || !data || !data.length){
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  const jami = data.reduce((s, a) => s + (a.summa || 0), 0);

  list.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 12px;border-bottom:1px solid var(--gray-border);margin-bottom:8px">'+
      '<span style="font-size:12px;color:var(--text3)">Jami avans</span>'+
      '<span style="font-size:16px;font-weight:700;color:var(--green)">'+fmt(jami)+" so'm</span>"+
    '</div>'+
    data.map(a => {
      const sana = new Date(a.created_at).toLocaleDateString('uz-UZ');
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-border)">'+
        '<div>'+
          '<div style="font-size:13px;font-weight:600;color:var(--text)">'+fmt(a.summa)+" so'm</div>"+
          '<div style="font-size:11px;color:var(--text3)">'+(a.izoh||'')+'</div>'+
        '</div>'+
        '<div style="font-size:11px;color:var(--text3)">'+sana+'</div>'+
      '</div>';
    }).join('');
}

async function loadMyHisobTarix(){
  if (!currentUser) return;
  if(currentRole !== 'admin') return;
  const card = document.getElementById('db-hisob-card');
  const list = document.getElementById('db-hisob-list');
  if(!card || !list || !currentUser) return;

  const data = await getHisobKitob(currentUser.email);

  if(!data || !data.length){ card.style.display='none'; return; }

  card.style.display = 'block';
  const oxirgi_qarz  = data[0].qarz;
  const jami_berildi = data.reduce((s,h) => s+(h.summa||0), 0);

  const qarzColor = oxirgi_qarz > 0 ? 'var(--red)' : oxirgi_qarz < 0 ? '#6366F1' : 'var(--green)';
  const qarzText  = oxirgi_qarz > 0 ? fmt(oxirgi_qarz)+" so'm qoldi" :
                    oxirgi_qarz < 0 ? fmt(Math.abs(oxirgi_qarz))+" so'm ortiqcha" : 'Hisob yopiq ✅';

  list.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0 12px;border-bottom:1px solid var(--gray-border);margin-bottom:8px">'+
      '<span style="font-size:12px;color:var(--text3)">Holat</span>'+
      '<span style="font-size:15px;font-weight:700;color:'+qarzColor+'">'+qarzText+'</span>'+
    '</div>'+
    data.map(h => {
      const q = h.qarz||0;
      return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gray-border)">'+
        '<div><div style="font-size:12px;font-weight:600">'+fmt(h.summa)+" so'm berildi</div>"+
        '<div style="font-size:11px;color:var(--text3)">'+(h.izoh||'Hisob')+'</div></div>'+
        '<div style="font-weight:700;color:'+(q>0?'var(--red)':q<0?'#6366F1':'var(--green)')+'">'+
          (q>0?'Qarz:'+fmt(q):q<0?'Plus:'+fmt(Math.abs(q)):'✅')+'</div>'+
      '</div>';
    }).join('');
}



function renderDbChart(myData, thisMonth, thisYear){
  const canvas = document.getElementById('db-chart');
  if(!canvas || typeof Chart === 'undefined') return;

  let labels = [], data = [];

  if(dbMode === 'oylik'){
    // Bu yilning har oyi
    const monthly = Array(12).fill(0);
    myData.forEach(h => {
      const d = new Date(h.created_at);
      if(d.getFullYear() === thisYear){
        const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
        monthly[d.getMonth()] += val;
      }
    });
    labels = OY_NOMI;
    data = monthly;

  } else if(dbMode === 'haftalik'){
    // So'nggi 8 hafta
    const weeks = {};
    myData.forEach(h => {
      const d = new Date(h.created_at);
      const weekNum = Math.floor((new Date() - d) / (7*24*60*60*1000));
      if(weekNum < 8){
        if(!weeks[weekNum]) weeks[weekNum] = 0;
        const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
        weeks[weekNum] += val;
      }
    });
    labels = Array.from({length:8},(_,i) => i===0?'Bu hafta':(i+' hafta oldin')).reverse();
    data = Array.from({length:8},(_,i)=>weeks[7-i]||0);

  } else {

    const yearly = {};
    myData.forEach(h => {
      const y = new Date(h.created_at).getFullYear();
      if(!yearly[y]) yearly[y] = 0;
      const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
      yearly[y] += val;
    });
    const years = Object.keys(yearly).sort();
    labels = years;
    data = years.map(y => yearly[y]);
  }

  if(dbChart) dbChart.destroy();

  // Gradient
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(37,99,235,0.3)');
  gradient.addColorStop(1, 'rgba(37,99,235,0.02)');

  dbChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: "Daromad",
        data,
        borderColor: '#2563eb',
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        pointBorderColor: '#2563eb',
        pointBorderWidth: 2,
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          titleColor: '#94a3b8',
          bodyColor: '#fff',
          callbacks: {
            label: ctx => fmt(ctx.parsed.y) + " so'm"
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { callback: v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : v >= 1000 ? (v/1000).toFixed(0)+'K' : v }
        },
        x: {
          grid: { display: false }
        }
      }
    }
  });
}


// ── GRAFIK ──

function setChartMode(mode, el){
  chartMode = mode;
  document.querySelectorAll('#panel-owner .filter-btn').forEach(b=>b.classList.remove('active'));
  if(el) el.classList.add('active');
  renderChart();
}

function renderChart(){
  const canvas = document.getElementById('daromad-chart');
  if(!canvas || typeof Chart === 'undefined') return;
  
  let labels = [], data = [];
  
  if(chartMode === 'oylik'){
    const year = 2026;
    const monthlyTotals = Array(12).fill(0);
    allHistory.forEach(h => {
      const d = new Date(h.created_at);
      if(d.getFullYear() === year){
        const m = d.getMonth();
        if(h.type === 'admin') monthlyTotals[m] += h.total_daromad || 0;
        else monthlyTotals[m] += h.total_jami || 0;
      }
    });
    labels = OY_NOMLARI;
    data = monthlyTotals;
  } else {
    // yillik
    const yearlyTotals = {};
    allHistory.forEach(h => {
      const d = new Date(h.created_at);
      const y = d.getFullYear();
      if(!yearlyTotals[y]) yearlyTotals[y] = 0;
      if(h.type === 'admin') yearlyTotals[y] += h.total_daromad || 0;
      else yearlyTotals[y] += h.total_jami || 0;
    });
    const years = Object.keys(yearlyTotals).sort();
    labels = years;
    data = years.map(y => yearlyTotals[y]);
  }
  
  if(daromadChart) daromadChart.destroy();
  
  daromadChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Daromad',
        data: data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb',
        pointHoverRadius: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => fmt(ctx.parsed.y) + " so'm"
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => fmt(v)
          }
        }
      }
    }
  });
}

function renderOwnerStats(){
  let umumiyDaromad = 0;
  allHistory.forEach(h => {
    if(h.type === 'admin') umumiyDaromad += h.total_daromad || 0;
    else umumiyDaromad += h.total_jami || 0;
  });
  
  // Sof foyda taxminiy = umumiy daromad (chunki hozircha xarajat alohida hisoblanmaydi)
  const sofFoyda = umumiyDaromad;
  
  // O'sish hisoblash - shu oy vs o'tgan oy
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  let thisMonthTotal = 0, lastMonthTotal = 0;
  
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
  
  allHistory.forEach(h => {
    const d = new Date(h.created_at);
    const val = h.type === 'admin' ? (h.total_daromad||0) : (h.total_jami||0);
    if(d.getMonth() === thisMonth && d.getFullYear() === thisYear) thisMonthTotal += val;
    if(d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) lastMonthTotal += val;
  });
  
  let osishPct = 0;
  if(lastMonthTotal > 0){
    osishPct = Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100);
  } else if(thisMonthTotal > 0){
    osishPct = 100;
  }
  
  const umumiyEl = document.getElementById('ow-umumiy-daromad');
  const sofEl = document.getElementById('ow-sof-foyda');
  const osishEl = document.getElementById('ow-osish');
  
  if(umumiyEl) umumiyEl.textContent = fmt(umumiyDaromad) + " so'm";
  if(sofEl) sofEl.textContent = fmt(sofFoyda) + " so'm";
  if(osishEl){
    osishEl.textContent = (osishPct >= 0 ? '+' : '') + osishPct + '%';
    osishEl.style.color = osishPct >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

// ── KPI DARAJALAR ──
// Bonus jadvallar
// Jarima tizimi (uch daraja uchun bir xil asosiy jarimalar)
// Qo'shimcha mukofotlar
function getKpi(email){ return KPI_DARAJALAR[email] || null; }

function getCurrentBonus(email, summa){
  const kpi = getKpi(email);
  if(!kpi) return null;
  const jadval = KPI_BONUS[kpi.daraja] || [];
  for(let i = jadval.length-1; i >= 0; i--){
    if(summa >= jadval[i].min) return jadval[i];
  }
  return jadval[0];
}

function getNextBonus(email, summa){
  const kpi = getKpi(email);
  if(!kpi) return null;
  const jadval = KPI_BONUS[kpi.daraja] || [];
  for(let i = 0; i < jadval.length; i++){
    if(summa < jadval[i].min) return jadval[i];
  }
  return null;
}



let allMessages = [];

function getName(email){ return XODIMLAR[email] || email.split('+')[1]?.split('@')[0] || email.split('@')[0]; }

function hideSendMsg(){
  document.getElementById('send-msg-card').classList.add('hidden');
  document.getElementById('msg-text').value = '';
}

async function msgAction(id, type){
  const updates = { o_qildi: true };
  if(type === 'qabul') updates.qabul_qilindi = true;
  if(type === 'tolov') updates.tolov_qilindi = true;

  await markMessageRead(id);
  showNotify(type === 'qabul' ? '✅ Qabul qilindi!' : '💰 Tolov qilindi!');
  await loadMessages();
}

// ── DAVOMAT: bugungi holat kichik vidjeti ──
async function renderMyAttendanceWidget(){
  const widget = document.getElementById('db-attendance-widget');
  if(!widget || !currentUser) return;
  try{
    const today = (typeof dvTodayStr === 'function') ? dvTodayStr() : new Date().toISOString().slice(0,10);
    const rows = await getMyDavomat(today, today);
    const row = rows[0];
    widget.classList.remove('hidden');
    const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('uz-UZ', {hour:'2-digit',minute:'2-digit'}) : '—';
    const statusLabels = (typeof DV_STATUS_LABELS !== 'undefined') ? DV_STATUS_LABELS : {};

    document.getElementById('db-att-status').textContent = row ? (statusLabels[row.status] || row.status) : "Yozuv yo'q";
    document.getElementById('db-att-checkin').textContent = row ? fmtTime(row.check_in) : '—';
    document.getElementById('db-att-checkout').textContent = row ? fmtTime(row.check_out) : '—';
    document.getElementById('db-att-worked').textContent = (row && row.worked_minutes != null) ? (Math.round(row.worked_minutes/6)/10) + ' soat' : '—';
    document.getElementById('db-att-late').textContent = (row && row.late_minutes != null) ? row.late_minutes + ' daq' : '—';
  } catch(e){ console.error('[renderMyAttendanceWidget]', e); }
}
