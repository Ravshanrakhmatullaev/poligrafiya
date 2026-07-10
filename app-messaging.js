
// ── XABARLAR ──
// ── KPI DARAJALAR ──
const KPI_DARAJALAR = {
  'ra.ravshan1998+umidjon@gmail.com':    { daraja: 'boshlangich',  maqsad: 30000000, fiks: 1500000 },
  'ra.ravshan1998+ulugbek@gmail.com':    { daraja: 'boshlangich',  maqsad: 30000000, fiks: 1500000 },
  'ra.ravshan1998+mohlaroy@gmail.com':   { daraja: 'boshlangich',  maqsad: 30000000, fiks: 1500000 },
  'ra.ravshan1998+rashidulloh@gmail.com':{ daraja: 'tajriba',      maqsad: 45000000, fiks: 1800000 },
  'ra.ravshan1998+abror@gmail.com':      { daraja: 'professional', maqsad: 60000000, fiks: 1000000 },
};

// Bonus jadvallar
const KPI_BONUS = {
  boshlangich: [
    { min: 0,        max: 14999999,  bonus: 0,       label: 'Minimal natija' },
    { min: 15000000, max: 24999999,  bonus: 300000,  label: "Boshlang'ich rag'bat" },
    { min: 25000000, max: 29999999,  bonus: 500000,  label: 'Rejaga yaqin' },
    { min: 30000000, max: 39999999,  bonus: 800000,  label: 'Reja bajarilgan' },
    { min: 40000000, max: 59999999,  bonus: 1200000, label: 'Yuqori natija' },
    { min: 60000000, max: Infinity,  bonus: 1500000, label: "A'lo darajadagi natija" },
  ],
  tajriba: [
    { min: 0,        max: 24999999,  bonus: 0,       label: 'Minimal natija' },
    { min: 25000000, max: 39999999,  bonus: 400000,  label: "Rag'bat darajasi" },
    { min: 40000000, max: 49999999,  bonus: 800000,  label: 'Barqaror natija' },
    { min: 50000000, max: 69999999,  bonus: 1200000, label: 'Reja bajarilgan' },
    { min: 70000000, max: 89999999,  bonus: 1800000, label: 'Yuqori daraja' },
    { min: 90000000, max: Infinity,  bonus: 2500000, label: 'Professionalga tayyor' },
  ],
  professional: [
    { min: 0,        max: 29999999,  bonus: 0,       label: 'Minimal natija' },
    { min: 30000000, max: 44999999,  bonus: 200000,  label: '40+ bitimga yaqinlashish' },
    { min: 45000000, max: 59999999,  bonus: 400000,  label: "Qayta buyurtma ulushi 60%" },
    { min: 60000000, max: 79999999,  bonus: 700000,  label: 'Reja bajarilgan' },
    { min: 80000000, max: 99999999,  bonus: 1000000, label: 'Kross/apsell 20%' },
    { min: 100000000, max: Infinity, bonus: 1500000, label: 'Elita daraja' },
  ],
};

const DARAJA_LABELS = {
  boshlangich: "🥉 Boshlang'ich",
  tajriba: '🥈 Tajriba oshirgan',
  professional: '🥇 Professional',
};

// Jarima tizimi (uch daraja uchun bir xil asosiy jarimalar)
const KPI_JARIMA = {
  boshlangich: [
    { sabab: "Oxirgi xabar mijozni bo'lsa yoki yozilgan xabarga javob berilmay qolib ketgan bo'lsa", miqdor: -100000 },
    { sabab: "3 kun davomida yangi mijoz bilan aloqa qilinmagan", miqdor: -100000 },
    { sabab: "Buyurtmani kechiktirgan yoki noto'g'ri ma'lumot bergan", miqdor: -200000 },
    { sabab: "Mijoz shikoyati (yozma tarzda tushgan)", miqdor: -300000 },
    { sabab: "Yolg'on narx yoki va'da bergan", miqdor: -400000 },
  ],
  tajriba: [
    { sabab: "3 kun davomida yangi mijoz bilan aloqa qilinmagan", miqdor: -100000 },
    { sabab: "Buyurtmani kechiktirgan yoki noto'g'ri ma'lumot bergan", miqdor: -200000 },
    { sabab: "Mijoz shikoyati (rasmiy)", miqdor: -300000 },
    { sabab: "Qasddan noto'g'ri narx yoki soxta ma'lumot bergan", miqdor: -500000 },
  ],
  professional: [
    { sabab: "2 kun davomida mavjud mijozlar bilan rejalangan aloqa qilinmagan", miqdor: -150000 },
    { sabab: "Buyurtma yoki yetkazib berishda kechikish (aybi sotuvchida)", miqdor: -300000 },
    { sabab: "Mijoz shikoyati (rasmiy)", miqdor: -400000 },
    { sabab: "Noto'g'ri narx yoki noto'g'ri va'da bergan", miqdor: -600000 },
  ],
};

// Qo'shimcha mukofotlar
const KPI_MUKOFOT = [
  { sabab: "Oy davomida eng ko'p yangi mijoz olib kelgan", miqdor: 300000 },
  { sabab: "10 ta va undan ortiq ijobiy fikr olgan", miqdor: 200000 },
  { sabab: "O'tgan oydan 15% yuqori sotuv qilgan", miqdor: "10% qo'shimcha bonus" },
];

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

const XODIMLAR = {
  'ra.ravshan1998@gmail.com': 'Ravshan (Owner)',
  'ra.ravshan1998+bayramali@gmail.com': 'Bayramali',
  'ra.ravshan1998+umar@gmail.com': 'Umar',
  'ra.ravshan1998+parvina@gmail.com': 'Parvina',
  'ra.ravshan1998+mohlaroy@gmail.com': 'Mohlaroy',
  'ra.ravshan1998+abror@gmail.com': 'Abror',
  'ra.ravshan1998+umidjon@gmail.com': 'Umidjon',
  'ra.ravshan1998+ulugbek@gmail.com': 'Ulugbek',
  'ra.ravshan1998+zuhriddin@gmail.com': 'Zuhriddin',
  'ra.ravshan1998+jorabek@gmail.com': 'Jorabek',
  'adsuzuvdtf@gmail.com': 'UV DTF Sherik',
  'ra.ravshan1998+rashidulloh@gmail.com': 'Rashidulloh',
  'ra.ravshan1998+ulugbekdesign@gmail.com': 'Ulugbek (Dizayn)',
  'ra.ravshan1998+begzodbek@gmail.com': 'Begzodbek',
  'ra.ravshan1998+gaybulloh@gmail.com': 'Gaybulloh',
};

let allMessages = [];

function getName(email){ return XODIMLAR[email] || email.split('+')[1]?.split('@')[0] || email.split('@')[0]; }

function showSendMsg(){
  const card = document.getElementById('send-msg-card');
  card.classList.remove('hidden');
  
  // Fill receiver dropdown
  const sel = document.getElementById('msg-receiver');
  sel.innerHTML = '<option value="">Tanlang...</option>';
  
  if(currentRole === 'owner'){
    // Owner hammaga yoza oladi
    Object.entries(XODIMLAR).forEach(([email, name]) => {
      if(email !== currentUser.email){
        sel.innerHTML += `<option value="${email}">${name}</option>`;
      }
    });
    document.getElementById('receiver-group').classList.remove('hidden');
  } else {
    // Xodimlar faqat ownerga yozadi
    sel.innerHTML = `<option value="ra.ravshan1998@gmail.com">Ravshan (Owner)</option>`;
    document.getElementById('receiver-group').classList.add('hidden');
  }
}

function hideSendMsg(){
  document.getElementById('send-msg-card').classList.add('hidden');
  document.getElementById('msg-text').value = '';
}

async function sendMsg(){
  const toEmail = currentRole === 'owner' 
    ? document.getElementById('msg-receiver').value 
    : 'ra.ravshan1998@gmail.com';
  const text = document.getElementById('msg-text').value.trim();
  
  if(!toEmail){ showNotify('Kimga yuborishni tanlang'); return; }
  if(!text){ showNotify('Xabar yozing'); return; }
  
  const fromName = getName(currentUser.email);
  const toName = getName(toEmail);
  
  const { error } = await sb.from('xabarlar').insert({
    from_id: currentUser.id,
    from_email: currentUser.email,
    from_name: fromName,
    to_email: toEmail,
    to_name: toName,
    text: text,
    o_qildi: false,
    created_at: new Date().toISOString(),
    sana: getSanaVaqt(),
  });
  
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }
  showNotify('✅ Xabar yuborildi!');
  hideSendMsg();
  await loadMessages();
}

async function loadMessages(){
  try {
    const { data, error } = await sb.from('xabarlar')
      .select('*')
      .or(`from_email.eq.${currentUser.email},to_email.eq.${currentUser.email}`)
      .order('created_at', { ascending: false });
    
    if(!error) allMessages = data || [];
    
    // Count unread
    const unread = allMessages.filter(m => m.to_email === currentUser.email && !m.o_qildi).length;
    const bellBadge = document.getElementById('bell-count');
    const navBadge = document.getElementById('nav-bell-count');
    
    if(bellBadge){
      bellBadge.textContent = unread;
      unread > 0 ? bellBadge.classList.remove('hidden') : bellBadge.classList.add('hidden');
    }
    if(navBadge){
      navBadge.textContent = unread;
      unread > 0 ? navBadge.classList.remove('hidden') : navBadge.classList.add('hidden');
    }
    
    renderMessages();
  } catch(e){ console.log('Messages error:', e); }
}

async function markRead(id){
  await sb.from('xabarlar').update({ o_qildi: true }).eq('id', id);
  await loadMessages();
}

async function msgAction(id, type){
  const updates = { o_qildi: true };
  if(type === 'qabul') updates.qabul_qilindi = true;
  if(type === 'tolov') updates.tolov_qilindi = true;
  
  await sb.from('xabarlar').update(updates).eq('id', id);
  showNotify(type === 'qabul' ? '✅ Qabul qilindi!' : '💰 Tolov qilindi!');
  await loadMessages();
}

function renderMessages(){
  const el = document.getElementById('xabarlar-list');
  if(!el) return;
  
  if(!allMessages.length){
    el.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg><p>Xabarlar mavjud emas</p></div>';
    return;
  }
  
  el.innerHTML = '';
  allMessages.forEach(m => {
    const isInbox = m.to_email === currentUser.email;
    const isUnread = isInbox && !m.o_qildi;
    const div = document.createElement('div');
    div.className = 'msg-item' + (isUnread ? ' unread' : '');
    div.innerHTML = `
      <div class="msg-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="msg-direction ${isInbox ? 'inbox' : 'sent'}">${isInbox ? '📩 Kelgan' : '📤 Yuborilgan'}</span>
          <span class="msg-from">${isInbox ? m.from_name : m.to_name}</span>
        </div>
        <span class="msg-time">${m.sana || ''}</span>
      </div>
      <div class="msg-body">${m.text}</div>
      ${isUnread ? `<button class="read-btn" onclick="markRead(${m.id})">Oqildi deb belgilash ✓</button>` : ''}`;
    el.appendChild(div);
  });
}

// ── GRAFIK ──
let chartMode = 'oylik';
let daromadChart = null;
const OY_NOMLARI = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];

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

// ── AVANS ──
function showAvansForm(){
  document.getElementById('avans-modal').classList.remove('hidden');
  document.getElementById('avans-summa').value = '';
  document.getElementById('avans-sabab').value = '';
}
function hideAvansForm(){
  document.getElementById('avans-modal').classList.add('hidden');
}
async function submitAvans(){
  const summa = parseInt(document.getElementById('avans-summa').value) || 0;
  const sabab = document.getElementById('avans-sabab').value.trim();
  if(!summa){ showNotify('Summa kiriting'); return; }
  if(!sabab){ showNotify('Sababini yozing'); return; }
  
  const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
  const now = new Date();
  
  const { error } = await sb.from('avanslar').insert({
    user_email: currentUser.email,
    user_name: name,
    summa: summa,
    sabab: sabab,
    status: 'kutilmoqda',
    oy: now.getMonth()+1,
    yil: now.getFullYear(),
    sana: getSanaVaqt(),
  });
  
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }

  // Xabarlar jadvaliga ham yoz (owner ko'rsin)
  const ownerEmail = 'ra.ravshan1998@gmail.com';
  const xatText = `💰 Avans so'rovi\n👤 ${name}\n💵 ${fmt(summa)} so'm\n📝 ${sabab}`;
  await sb.from('xabarlar').insert({
    from_id: currentUser.id,
    from_email: currentUser.email,
    from_name: name,
    to_email: ownerEmail,
    to_name: 'Ravshan (Owner)',
    text: xatText,
    o_qildi: false,
    sana: getSanaVaqt(),
  });

  showNotify("✅ Avans so'rovi yuborildi!");
  hideAvansForm();
  await loadMessages();
  
  // Telegram orqali ham yuborish
  const msg = "💰 AVANS SO'ROVI\n👤 " + name + "\n💵 " + fmt(summa) + " so'm\n📝 " + sabab + "\n📅 " + getSanaVaqt();
  window.open('https://t.me/share/url?url=%20&text='+encodeURIComponent(msg),'_blank');
}

async function giveAvans(email, name){
  const inputEl = document.getElementById('give_avans_'+email.replace(/[^a-z0-9]/gi,'_'));
  const summa = parseInt(inputEl.value) || 0;
  if(!summa){ showNotify('Summa kiriting'); return; }
  
  const now = new Date();
  const { error } = await sb.from('avanslar').insert({
    user_email: email,
    user_name: name,
    summa: summa,
    sabab: 'Owner tomonidan berildi',
    status: 'berildi',
    oy: now.getMonth()+1,
    yil: now.getFullYear(),
    sana: getSanaVaqt(),
  });
  
  if(error){ showNotify('❌ Xatolik: '+error.message); return; }
  showNotify("✅ Avans berildi: "+fmt(summa)+" so'm");
  inputEl.value = '';
  renderOwnerPanel();
}

async function approveAvans(id){
  // Avans ma'lumotlarini olamiz
  const { data: avans } = await sb.from('avanslar').select('*').eq('id', id).single();
  
  await sb.from('avanslar').update({status:'berildi'}).eq('id', id);
  
  // Xodimga xabar yuboramiz
  if(avans){
    const ownerName = 'Ravshan (Owner)';
    await sb.from('xabarlar').insert({
      from_id: currentUser.id,
      from_email: currentUser.email,
      from_name: ownerName,
      to_email: avans.user_email,
      to_name: avans.user_name,
      text: 'Avans so\'rovingiz tasdiqlandi!\nSumma: '+fmt(avans.summa)+" so'm\nSabab: "+(avans.sabab||''),
      o_qildi: false,
      sana: getSanaVaqt(),
    });
  }
  
  showNotify('✅ Avans berildi va xodimga xabar yuborildi!');
  renderOwnerPanel();
}

// ── HISOBLAR ──
const ROLE_LABELS = {
  'owner': 'Owner', 'admin': 'Admin', 'ishlab': 'Ishlab chiqarish', 'dizayner': 'Dizayner'
};


async function setTolov(email, oy, yil, field, val){
  const { data: existing } = await sb.from('tolovlar').select('id').eq('user_email',email).eq('oy',oy).eq('yil',yil);
  if(existing && existing.length){
    await sb.from('tolovlar').update({[field]:val}).eq('user_email',email).eq('oy',oy).eq('yil',yil);
  } else {
    await sb.from('tolovlar').insert({user_email:email,oy,yil,[field]:val});
  }
  showNotify(val ? '✅ Belgilandi!' : 'Bekor qilindi');
  renderOwnerPanel();
}

async function saveIzoh(email, oy, yil, izoh){
  const { data: existing } = await sb.from('tolovlar').select('id').eq('user_email',email).eq('oy',oy).eq('yil',yil);
  if(existing && existing.length){
    await sb.from('tolovlar').update({izoh}).eq('user_email',email).eq('oy',oy).eq('yil',yil);
  } else {
    await sb.from('tolovlar').insert({user_email:email,oy,yil,izoh});
  }
  showNotify('💬 Izoh saqlandi!');
  renderOwnerPanel();
}
