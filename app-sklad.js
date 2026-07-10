
// ── BOZORLIK ──
let bozorlikData = [];

function showBozorlikForm(){
  document.getElementById('bozorlik-form-card').classList.remove('hidden');
  // Sklad dan tanlash uchun ro'yxat to'ldirish
  const sel = document.getElementById('bz-sklad-sel');
  sel.innerHTML = '<option value="">— Yoki qo\'lda yozing —</option>';
  skladData.forEach(s => {
    sel.innerHTML += '<option value="'+s.id+'" data-nom="'+s.nom+'" data-birlik="'+s.birlik+'">'+s.nom+' ('+s.hisob_miq+' '+s.birlik+')</option>';
  });
}

function hideBozorlikForm(){
  document.getElementById('bozorlik-form-card').classList.add('hidden');
  document.getElementById('bz-nom').value = '';
  document.getElementById('bz-miq').value = '';
  document.getElementById('bz-izoh').value = '';
  document.getElementById('bz-sklad-sel').value = '';
  document.getElementById('bz-rasm-input').value = '';
  const preview = document.getElementById('bz-rasm-preview');
  if(preview) preview.innerHTML = '📷 Rasm tanlash yoki shu yerga tashlang';
  const rasmWrap = document.getElementById('bz-rasm-wrap');
  if(rasmWrap) rasmWrap.style.display = 'block';
  const kraskaWrap = document.getElementById('bz-kraska-wrap');
  if(kraskaWrap) kraskaWrap.classList.add('hidden');
  ['bz-k-c','bz-k-m','bz-k-y','bz-k-k','bz-k-lc','bz-k-lm','bz-k-w','bz-k-v'].forEach(id => {
    const el = document.getElementById(id);
    if(el) el.checked = false;
  });
}

function updateKraskaName(){
  const checks = ['C','M','Y','K','LC','LM','W','Varnish'];
  const ids = ['bz-k-c','bz-k-m','bz-k-y','bz-k-k','bz-k-lc','bz-k-lm','bz-k-w','bz-k-v'];
  const selected = ids.map((id,i) => document.getElementById(id).checked ? checks[i] : null).filter(Boolean);
  const nomEl = document.getElementById('bz-nom');
  if(selected.length && nomEl){
    nomEl.value = 'Kraska: ' + selected.join(' + ');
  }
}

function bozorlikFromSklad(sel){
  const opt = sel.options[sel.selectedIndex];
  const rasmWrap = document.getElementById('bz-rasm-wrap');
  const kraskaWrap = document.getElementById('bz-kraska-wrap');
  if(opt.value){
    document.getElementById('bz-nom').value = opt.dataset.nom || '';
    document.getElementById('bz-birlik').value = opt.dataset.birlik || 'dona';
    if(rasmWrap) rasmWrap.style.display = 'none';
    // Kraska kategoriyasida kraska selector chiqsin
    const sItem = skladData.find(s => s.id === parseInt(opt.value));
    if(kraskaWrap) kraskaWrap.classList.toggle('hidden', !(sItem && sItem.kategoriya === 'Kraska'));
  } else {
    if(rasmWrap) rasmWrap.style.display = 'block';
    if(kraskaWrap) kraskaWrap.classList.add('hidden');
  }
}

function bozorlikRasmPreview(input){
  const file = input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('bz-rasm-preview');
    if(preview) preview.innerHTML = '<img src="'+e.target.result+'" style="width:100%;max-height:120px;object-fit:cover;border-radius:var(--radius-md)"><p style="margin:4px 0 0;font-size:11px;color:var(--text3)">'+file.name+'</p>';
  };
  reader.readAsDataURL(file);
}

function bozorlikRasmDrop(event){
  const file = event.dataTransfer.files[0];
  if(!file || !file.type.startsWith('image/')) return;
  const input = document.getElementById('bz-rasm-input');
  try { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } catch(e){}
  bozorlikRasmPreview({files: [file]});
}

async function saveBozorlikItem(){
  const nom = document.getElementById('bz-nom').value.trim();
  const miq = parseFloat(document.getElementById('bz-miq').value)||0;
  const birlik = document.getElementById('bz-birlik').value;
  const izoh = document.getElementById('bz-izoh').value.trim();
  const skladSel = document.getElementById('bz-sklad-sel');
  const sklad_id = skladSel.value ? parseInt(skladSel.value) : null;

  if(!nom){ showNotify('Nomi kiriting'); return; }
  if(!miq){ showNotify('Miqdor kiriting'); return; }

  // Rasm olish: sklad dan yoki qo'lda yuklangan
  let rasm_url = null;
  if(sklad_id){
    const sItem = skladData.find(s => s.id === sklad_id);
    if(sItem) rasm_url = sItem.rasm_url;
  } else {
    // Qo'lda yuklangan rasm
    const fileInput = document.getElementById('bz-rasm-input');
    if(fileInput && fileInput.files && fileInput.files.length > 0){
      const file = fileInput.files[0];
      const ext = file.name.split('.').pop().toLowerCase();
      const fileName = 'bozorlik_' + Date.now() + '.' + ext;
      const { data: upData, error: upErr } = await sb.storage
        .from('sklad-rasmlar')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if(!upErr){
        const { data: urlData } = sb.storage.from('sklad-rasmlar').getPublicUrl(fileName);
        rasm_url = urlData.publicUrl;
      }
    }
  }

  const { error } = await sb.from('bozorlik_list').insert({
    sklad_id, nom, birlik, miqdor: miq, izoh, rasm_url,
    status: 'kutilmoqda',
    sana: getSanaVaqt()
  });

  if(error){ showNotify("Xatolik: "+error.message); return; }
  showNotify("Ro'yxatga qo'shildi!");
  hideBozorlikForm();
  await loadBozorlik();
}

async function loadBozorlik(){
  const { data } = await sb.from('bozorlik_list')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  bozorlikData = data || [];
  renderBozorlik();
}

function renderBozorlik(){
  const el = document.getElementById('bozorlik-list');
  const sendWrap = document.getElementById('bozorlik-send-wrap');
  if(!el) return;

  const active = bozorlikData.filter(b => b.status === 'kutilmoqda');
  const yuborildi = bozorlikData.filter(b => b.status === 'yuborildi');
  const done = bozorlikData.filter(b => b.status !== 'kutilmoqda' && b.status !== 'yuborildi');

  if(!bozorlikData.length){
    el.innerHTML = '<div class="empty-state"><p>Ro\'yxat bo\'sh</p></div>';
    if(sendWrap) sendWrap.classList.add('hidden');
    return;
  }

  if(sendWrap) sendWrap.classList.toggle('hidden', !active.length);
  // Send tugmasini reset qilish (yangi kutilmoqda itemlar bo'lsa)
  const sendBtn = document.getElementById('bz-send-btn');
  if(sendBtn && active.length){
    sendBtn.disabled = false;
    sendBtn.style.opacity = '1';
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Bozorlikka yuborish (Telegram)';
  }

  let html = '';

  if(active.length){
    html += '<div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px">Kutilmoqda ('+active.length+' ta)</div>';
    active.forEach(b => {
      html += '<div class="sklad-card" style="display:flex;gap:12px;align-items:center">'+
        (b.rasm_url ? '<img src="'+b.rasm_url+'" style="width:56px;height:56px;object-fit:cover;border-radius:var(--radius-md);flex-shrink:0">' : '<div style="width:56px;height:56px;background:var(--gray-light);border-radius:var(--radius-md);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px">🛒</div>')+
        '<div style="flex:1">'+
          '<div style="font-size:13px;font-weight:600">'+b.nom+'</div>'+
          '<div style="font-size:12px;color:var(--blue);font-weight:700">'+b.miqdor+' '+b.birlik+'</div>'+
          (b.izoh ? '<div style="font-size:11px;color:var(--text3)">'+b.izoh+'</div>' : '')+
        '</div>'+
        '<button onclick="deleteBozorlikItem('+b.id+')" style="padding:4px 8px;border-radius:var(--radius-sm);border:1px solid var(--red-border);background:var(--red-light);color:var(--red);cursor:pointer;font-size:12px">O\'chir</button>'+
      '</div>';
    });
  }

  if(done.length){
    html += '<div style="font-size:12px;font-weight:700;color:var(--text3);margin:12px 0 8px">Yakunlangan ('+done.length+' ta)</div>';
    done.forEach(b => {
      const color = b.status === 'olindi' ? 'var(--green)' : 'var(--red)';
      const icon = b.status === 'olindi' ? '✅' : '❌';
      html += '<div class="sklad-card" style="display:flex;gap:12px;align-items:center;opacity:0.7">'+
        '<div style="font-size:24px">'+icon+'</div>'+
        '<div style="flex:1">'+
          '<div style="font-size:13px;font-weight:600;color:'+color+'">'+b.nom+'</div>'+
          '<div style="font-size:11px;color:var(--text3)">'+b.miqdor+' '+b.birlik+(b.olgan_kishi?' — '+b.olgan_kishi:'')+'</div>'+
        '</div>'+
      '</div>';
    });
  }

  el.innerHTML = html;
}

async function deleteBozorlikItem(id){
  await sb.from('bozorlik_list').delete().eq('id', id);
  await loadBozorlik();
}

async function sendBozorlikToTelegram(){
  const active = bozorlikData.filter(b => b.status === 'kutilmoqda');
  if(!active.length){ showNotify("Ro'yxat bo'sh"); return; }

  const sendBtn = document.getElementById('bz-send-btn');
  if(sendBtn && sendBtn.disabled) return;
  if(sendBtn){ sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; sendBtn.innerHTML = 'Yuborilmoqda...'; }

  const BOT_TOKEN = '8636816129:AAE-sBNfcLy8e4EXqepHhDfhHG_p6PDZPxU';
  const CHAT_ID = '-4273189072';

  let sentCount = 0;
  for(const item of active){
    const caption = item.nom + '\n' +
      'Kerak: ' + item.miqdor + ' ' + item.birlik +
      (item.izoh ? '\nIzoh: ' + item.izoh : '');

    const keyboard = { inline_keyboard: [[
      { text: '🔍 Qidirayapman', callback_data: 'search_' + item.id }
    ]]};

    try {
      if(item.rasm_url){
        await fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/sendPhoto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, photo: item.rasm_url, caption, reply_markup: keyboard })
        });
      } else {
        await fetch('https://api.telegram.org/bot'+BOT_TOKEN+'/sendMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: CHAT_ID, text: '🛒 ' + caption, reply_markup: keyboard })
        });
      }
      // Statusni yuborildi deb belgilaymiz
      await sb.from('bozorlik_list').update({status:'yuborildi'}).eq('id', item.id);
      sentCount++;
      await new Promise(r => setTimeout(r, 400));
    } catch(e){ console.error(e); }
  }

  if(sendBtn){
    sendBtn.innerHTML = '✅ Yuborildi (' + sentCount + ' ta)';
    sendBtn.style.opacity = '0.5';
  }
  showNotify('✅ ' + sentCount + ' ta mahsulot Telegram ga yuborildi!');
  await loadBozorlik();
}


// ── SKLAD ──
const SKLAD_EDITOR = 'ra.ravshan1998+bayramali@gmail.com';
const TG_BOT_TOKEN = '8636816129:AAE-sBNfcLy8e4EXqepHhDfhHG_p6PDZPxU';
const TG_CHAT_ID = '-4273189072'; // faqat shu qo'sha/o'chira oladi
let skladData = [];
let skladFilter = '';

function canEditSklad(){
  return currentUser && currentUser.email === SKLAD_EDITOR;
}

function showSkladForm(){
  document.getElementById('sklad-form-card').classList.remove('hidden');
}
function hideSkladForm(){
  document.getElementById('sklad-form-card').classList.add('hidden');
  document.getElementById('sk-nom').value='';
  document.getElementById('sk-miq').value='';
  document.getElementById('sk-izoh').value='';
  document.getElementById('sk-kategoriya').value='';
  const skMin = document.getElementById('sk-min'); if(skMin) skMin.value='';
  document.getElementById('sk-rasm-input').value='';
  document.getElementById('sk-rasm-preview').innerHTML =
    '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text3)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
    '<p style="margin:6px 0 0;font-size:12px;color:var(--text3)">Rasm tanlash uchun bosing</p>';
}

function filterSklad(q){
  skladFilter = q.toLowerCase();
  renderSkladList();
}


async function sendTgMessage(text){
  try {
    await fetch('https://api.telegram.org/bot'+TG_BOT_TOKEN+'/sendMessage', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ chat_id: TG_CHAT_ID, text: text })
    });
  } catch(e){ console.log('TG error:', e); }
}

async function checkSkladAndNotify(){
  const today = new Date();
  const todayStr = today.toDateString();
  if(localStorage.getItem('sklad_notif_sent') === todayStr) return;

  const { data } = await sb.from('sklad').select('*, sklad_harakati(id,tur,miqdor)').order('nom');
  if(!data) return;
  const items = data.map(s => {
    const h = s.sklad_harakati || [];
    const p = h.filter(x=>x.tur==='prixod').reduce((a,x)=>a+(x.miqdor||0),0);
    const r = h.filter(x=>x.tur==='rasxod').reduce((a,x)=>a+(x.miqdor||0),0);
    return { ...s, hisob_miq: (s.miqdor||0)+p-r };
  });

  const tugagan = items.filter(s=>(s.hisob_miq||0)<=0);
  const kam = items.filter(s=>{ const m=s.hisob_miq||0; return m>0 && m<=(s.min_miq||5); });
  if(!tugagan.length && !kam.length) return;

  const isFriday = today.getDay() === 5;
  const parts = [];
  parts.push(isFriday ? 'BOZORLIK KUNI — SKLAD' : 'KUNLIK SKLAD HISOBOTI');
  parts.push(today.toLocaleDateString('uz-UZ'));
  parts.push('');

  if(tugagan.length){
    parts.push('TUGAGAN:');
    tugagan.forEach(s => parts.push('  - ' + s.nom + ': 0 ' + s.birlik));
    parts.push('');
  }
  if(kam.length){
    parts.push('KAM QOLGAN:');
    kam.forEach(s => parts.push('  - ' + s.nom + ': ' + (s.hisob_miq||0) + ' ' + s.birlik + ' (min: ' + (s.min_miq||5) + ')'));
  }
  if(isFriday){ parts.push(''); parts.push('Bozorga borishdan oldin sotib oling!'); }

  await sendTgMessage(parts.join('\n'));
  localStorage.setItem('sklad_notif_sent', todayStr);
  showNotify('Guruhga xabar yuborildi!');
}

async function checkAfterHarakat(){
  const { data } = await sb.from('sklad').select('*, sklad_harakati(id,tur,miqdor)').order('nom');
  if(!data) return;
  const items = data.map(s => {
    const h = s.sklad_harakati || [];
    const p = h.filter(x=>x.tur==='prixod').reduce((a,x)=>a+(x.miqdor||0),0);
    const r = h.filter(x=>x.tur==='rasxod').reduce((a,x)=>a+(x.miqdor||0),0);
    return { ...s, hisob_miq: (s.miqdor||0)+p-r };
  });
  const tugagan = items.filter(s=>(s.hisob_miq||0)<=0);
  const kam = items.filter(s=>{ const m=s.hisob_miq||0; return m>0 && m<=(s.min_miq||5); });
  if(!tugagan.length && !kam.length) return;
  const parts = ['SKLAD OGOHLANTIRISH', new Date().toLocaleDateString('uz-UZ'), ''];
  if(tugagan.length){ parts.push('QOLMADI:'); tugagan.forEach(s=>parts.push('  - '+s.nom+': 0 '+s.birlik)); parts.push(''); }
  if(kam.length){ parts.push('KAM QOLDI:'); kam.forEach(s=>parts.push('  - '+s.nom+': '+(s.hisob_miq||0)+' '+s.birlik+' (min: '+(s.min_miq||5)+')')); }
  await sendTgMessage(parts.join('\n'));
}

async function loadSklad(){
  // Tugmani rolga qarab ko'rsat/yashir
  const addBtn = document.getElementById('sklad-add-btn');
  if(addBtn) addBtn.classList.toggle('hidden', !canEditSklad());

  const { data } = await sb.from('sklad').select('*, sklad_harakati(id,tur,miqdor,sabab,user_name,sana,created_at)').order('nom');
  if(data){
    // Calculate actual quantity from harakati
    skladData = data.map(s => {
      const harakati = s.sklad_harakati || [];
      const prixod = harakati.filter(h=>h.tur==='prixod').reduce((sum,h)=>sum+(h.miqdor||0),0);
      const rasxod = harakati.filter(h=>h.tur==='rasxod').reduce((sum,h)=>sum+(h.miqdor||0),0);
      return { ...s, hisob_miq: (s.miqdor||0) + prixod - rasxod, harakati };
    });
    renderSkladList();
  }
}

function renderSkladList(){
  const el = document.getElementById('sklad-list');
  if(!el) return;
  const filtered = skladFilter
    ? skladData.filter(s => s.nom.toLowerCase().includes(skladFilter) || (s.kategoriya||'').toLowerCase().includes(skladFilter))
    : skladData;

  if(!filtered.length){
    el.innerHTML = skladFilter
      ? '<div class="empty-state"><p>Topilmadi: "'+skladFilter+'"</p></div>'
      : '<div class="empty-state"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><p>Sklad bosh</p></div>';
    return;
  }

  el.innerHTML = '';

  const KAT_ORDER = ['Beyjik','Futbolka','Finka','Kepka','Kraska','Materiallar','Boshqa',''];
  const KAT_ICONS = {'Beyjik':'🏅','Futbolka':'👕','Finka':'👟','Kepka':'🧢','Kraska':'🎨','Materiallar':'📦','Boshqa':'📋','':'📋'};
  const groups = {};
  filtered.forEach(s => {
    const kat = s.kategoriya || '';
    if(!groups[kat]) groups[kat] = [];
    groups[kat].push(s);
  });

  Object.keys(groups).forEach(kat => {
    if(!KAT_ORDER.includes(kat)) KAT_ORDER.push(kat);
  });

  // Load open state from sessionStorage
  const getOpen = kat => {
    try { return sessionStorage.getItem('sklad_kat_'+kat) !== 'closed'; } catch(e){ return true; }
  };

  KAT_ORDER.forEach(kat => {
    if(!groups[kat] || !groups[kat].length) return;

    const isOpen = getOpen(kat);
    const katWrap = document.createElement('div');
    katWrap.style.cssText = 'margin-bottom:8px';

    // Accordion header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--white);border-radius:var(--radius-md);border:1.5px solid var(--gray-border);cursor:pointer;user-select:none;transition:var(--transition-base);color:var(--text)';
    header.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px">' +
        '<span style="font-size:18px">'+(KAT_ICONS[kat]||'📋')+'</span>' +
        '<span style="font-size:13px;font-weight:700;color:var(--text)">'+(kat||'Kategoriyasiz')+'</span>' +
        '<span style="font-size:11px;color:var(--text3);background:var(--gray-light);padding:1px 8px;border-radius:20px">'+groups[kat].length+' ta</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        // Count warnings
        (groups[kat].filter(s=>(s.hisob_miq||0)<=0).length ? '<span style="font-size:11px;color:#fff;background:var(--red);padding:1px 8px;border-radius:20px">'+groups[kat].filter(s=>(s.hisob_miq||0)<=0).length+' qolmadi</span>' : '') +
        (groups[kat].filter(s=>{ const m=s.hisob_miq||0; return m>0&&m<=(s.min_miq||5); }).length ? '<span style="font-size:11px;color:var(--red);background:var(--red-light);padding:1px 8px;border-radius:20px">'+groups[kat].filter(s=>{ const m=s.hisob_miq||0; return m>0&&m<=(s.min_miq||5); }).length+' kam</span>' : '') +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" style="transition:transform .2s;transform:'+(isOpen?'rotate(180deg)':'rotate(0deg)')+'"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</div>';

    // Items container
    const itemsDiv = document.createElement('div');
    itemsDiv.style.cssText = 'margin-top:6px;' + (isOpen ? '' : 'display:none');

    header.onclick = () => {
      const nowOpen = itemsDiv.style.display === 'none';
      itemsDiv.style.display = nowOpen ? 'block' : 'none';
      const arrow = header.querySelector('svg');
      if(arrow) arrow.style.transform = nowOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      try { sessionStorage.setItem('sklad_kat_'+kat, nowOpen ? 'open' : 'closed'); } catch(e){}
    };

    katWrap.appendChild(header);
    katWrap.appendChild(itemsDiv);
    el.appendChild(katWrap);

    groups[kat].forEach(s => {
      const miq = s.hisob_miq || 0;
      const minMiq = s.min_miq || 5;
      const isLow = miq > 0 && miq <= minMiq;
      const isEmpty = miq <= 0;
      const card = document.createElement('div');
      card.className = 'sklad-card' + (isEmpty?' sklad-empty':isLow?' sklad-warning':'');
      card.style.color = 'var(--text)';

      const harakatiHtml = (s.harakati||[]).slice(0,5).map(h =>
        '<div class="sklad-log-item">' +
        '<span class="avans-chip '+(h.tur==="prixod"?"berildi":"kutilmoqda")+'" style="'+(h.tur==="rasxod"?"background:var(--red-light);color:var(--red)":"")+'">'+
        (h.tur==="prixod"?"+ Prixod":"- Rasxod")+'</span>'+
        '<span style="font-weight:600">'+h.miqdor+' '+s.birlik+'</span>'+
        '<span style="color:var(--text3)">'+(h.sabab||'')+'</span>'+
        '<span style="color:var(--text3)">'+(h.sana||'').split(' ').slice(0,2).join(' ')+'</span>'+
        '</div>'
      ).join('');

      card.innerHTML =
        (s.rasm_url ? '<div class="sklad-img-wrap" data-url="'+s.rasm_url+'" onclick="openRasmModal(this.dataset.url)"><img class="sklad-img" src="'+s.rasm_url+'" alt="'+s.nom+'"></div>' : '') +
        '<div class="sklad-top">' +
          '<div>' +
            '<div class="sklad-nom">'+s.nom+(isEmpty?' <span style="color:#fff;font-size:11px;background:var(--red);padding:1px 6px;border-radius:4px">QOLMADI</span>':isLow?' <span style="color:var(--red);font-size:11px">KAM QOLDI</span>':'')+'</div>' +
            (s.izoh ? '<div style="font-size:12px;color:var(--text3);margin-top:2px">'+s.izoh+'</div>' : '') +
          '</div>' +
          '<div style="text-align:right">' +
            '<div class="sklad-miq" style="color:'+(isEmpty?'#c00000':isLow?'var(--red)':'var(--blue)')+'">'+fmt(miq)+'<span class="sklad-birlik">'+s.birlik+'</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="sklad-actions">' +
          (canEditSklad() ?
            '<button class="prixod-btn" data-id="'+s.id+'" data-nom="'+s.nom+'" data-birlik="'+s.birlik+'" onclick="openHarakatEl(this,\'prixod\')">+ Prixod</button>' +
            '<button class="rasxod-btn" data-id="'+s.id+'" data-nom="'+s.nom+'" data-birlik="'+s.birlik+'" onclick="openHarakatEl(this,\'rasxod\')">- Rasxod</button>'
          : '') +
          '<button class="sklad-hist-btn" onclick="toggleSkladLog(this)">Tarix</button>' +
          (currentRole === 'owner' || (currentUser && currentUser.email === SKLAD_EDITOR) ?
            '<button class="rasxod-btn" style="background:var(--amber-light);color:var(--amber);border-color:var(--amber-border)" data-id="'+s.id+'" data-nom="'+s.nom+'" onclick="openSkladBrak(this)">Brak</button>'
          : '') +
        '</div>' +
        '<div class="sklad-log">'+(harakatiHtml || '<div style="font-size:12px;color:var(--text3);padding:6px 0">Harakat yoq</div>')+'</div>';

      itemsDiv.appendChild(card);
    });
  });
}


function toggleSkladLog(btn){
  const log = btn.parentElement.nextElementSibling;
  if(log) log.classList.toggle('show');
}

function openSkladBrak(el){
  const id = parseInt(el.dataset.id);
  const nom = el.dataset.nom;
  document.getElementById('sb-sklad-id').value = id;
  document.getElementById('sb-nom-show').textContent = nom;
  document.getElementById('sb-miq').value = '';
  document.getElementById('sb-sabab').value = '';

  // Xodimlar ro'yxatini to'ldirish
  const sel = document.getElementById('sb-xodim');
  sel.innerHTML = '<option value="">Tanlang...</option>';
  Object.entries(XODIMLAR).forEach(([email, name]) => {
    if(email !== 'ra.ravshan1998@gmail.com'){
      sel.innerHTML += '<option value="'+email+'">'+name+'</option>';
    }
  });

  document.getElementById('sklad-brak-modal').classList.remove('hidden');
}

async function saveSkladBrak(){
  const id = parseInt(document.getElementById('sb-sklad-id').value);
  const xodimEmail = document.getElementById('sb-xodim').value;
  const miqdor = parseFloat(document.getElementById('sb-miq').value)||0;
  const sabab = document.getElementById('sb-sabab').value.trim();

  if(!xodimEmail){ showNotify('Xodimni tanlang'); return; }
  if(!miqdor){ showNotify('Miqdor kiriting'); return; }

  const xodimNom = XODIMLAR[xodimEmail] || xodimEmail;
  const sanaV = getSanaVaqt();

  // 1. sklad_brak jadvaliga yozish
  const { error: brakErr } = await sb.from('sklad_brak').insert({
    sklad_id: id,
    user_email: xodimEmail,
    user_name: xodimNom,
    miqdor,
    sabab,
    sana: sanaV,
  });
  if(brakErr){ showNotify('Xatolik: '+brakErr.message); return; }

  // 2. sklad_harakati ga ham rasxod sifatida yozish (miqdor kamaysin)
  const { error: harErr } = await sb.from('sklad_harakati').insert({
    sklad_id: id,
    tur: 'rasxod',
    miqdor,
    sabab: 'BRAK: '+(sabab||xodimNom),
    user_email: xodimEmail,
    user_name: xodimNom,
    sana: sanaV,
  });
  if(harErr){ showNotify('Xatolik (harakat): '+harErr.message); return; }

  // 3. Xodimning zakazlar tarixiga brak yozish
  // Bugun shu xodimning oxirgi yozuvini topib brak belgilaymiz
  const { data: lastZakaz } = await sb.from('zakazlar')
    .select('id')
    .eq('user_email', xodimEmail)
    .eq('type', 'ishlab')
    .order('created_at', { ascending: false })
    .limit(1);

  if(lastZakaz && lastZakaz.length){
    // Brak ma'lumotini xabar sifatida owner ga yuboramiz
    const ownerEmail = 'ra.ravshan1998@gmail.com';
    await sb.from('xabarlar').insert({
      from_id: currentUser.id,
      from_email: currentUser.email,
      from_name: 'Tizim',
      to_email: ownerEmail,
      to_name: 'Ravshan (Owner)',
      text: 'SKLAD BRAK: '+xodimNom+' — '+(document.getElementById('sb-nom-show').textContent)+' dan '+miqdor+' ta brak qildi.\nSabab: '+(sabab||'Ko\'rsatilmagan'),
      o_qildi: false,
      sana: sanaV,
    });
  }

  showNotify('Brak saqlandi: '+miqdor+' ta — '+xodimNom);
  document.getElementById('sklad-brak-modal').classList.add('hidden');
  await loadSklad();
  setTimeout(checkAfterHarakat, 500);
}

function openHarakatEl(el, tur){
  const id = parseInt(el.dataset.id);
  const nom = el.dataset.nom;
  const birlik = el.dataset.birlik;
  openHarakat(id, tur, nom, birlik);
}

function openHarakat(id, tur, nom, birlik){
  document.getElementById('sh-sklad-id').value = id;
  document.getElementById('sh-tur').value = tur;
  document.getElementById('sh-title').textContent = tur === 'prixod' ? '+ Prixod kiritish' : '- Rasxod kiritish';
  document.getElementById('sh-nom-show').textContent = nom + ' (' + birlik + ')';
  document.getElementById('sh-miq').value = '';
  document.getElementById('sh-sabab').value = '';
  const btn = document.getElementById('sh-save-btn');
  btn.style.background = tur === 'prixod' ? 'var(--green)' : 'var(--red)';
  document.getElementById('sklad-harakat-modal').classList.remove('hidden');
}

async function saveSkladItem(){
  const nom = document.getElementById('sk-nom').value.trim();
  if(!nom){ showNotify("Nomi kiritilmagan"); return; }
  const birlik = document.getElementById('sk-birlik').value;
  const kategoriya = document.getElementById('sk-kategoriya').value;
  const miqdor = parseFloat(document.getElementById('sk-miq').value)||0;
  const min_miq = parseFloat(document.getElementById('sk-min').value)||5;
  const izoh = document.getElementById('sk-izoh').value.trim();

  const btn = document.getElementById('sk-save-btn');
  if(btn){ btn.disabled=true; btn.textContent='Saqlanmoqda...'; }

  let rasm_url = null;
  const fileInput = document.getElementById('sk-rasm-input');

  if(fileInput && fileInput.files && fileInput.files.length > 0){
    const file = fileInput.files[0];
    const ext = file.name.split('.').pop().toLowerCase();
    const fileName = 'sklad_' + Date.now() + '.' + ext;

    const { data: upData, error: upErr } = await sb.storage
      .from('sklad-rasmlar')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });

    if(upErr){
      showNotify("Rasm yuklanmadi: " + upErr.message);
      if(btn){ btn.disabled=false; btn.textContent='Saqlash'; }
      return;
    }

    const { data: urlData } = sb.storage.from('sklad-rasmlar').getPublicUrl(fileName);
    rasm_url = urlData.publicUrl;
  }

  const { error } = await sb.from('sklad').insert({ nom, birlik, kategoriya, miqdor, min_miq, izoh, rasm_url });
  if(btn){ btn.disabled=false; btn.textContent='Saqlash'; }
  if(error){ showNotify("Xatolik: "+error.message); return; }
  showNotify("Mahsulot qo'shildi!");
  hideSkladForm();
  await loadSklad();
}

async function saveSkladHarakat(){
  const id = parseInt(document.getElementById('sh-sklad-id').value);
  const tur = document.getElementById('sh-tur').value;
  const miqdor = parseFloat(document.getElementById('sh-miq').value)||0;
  const sabab = document.getElementById('sh-sabab').value.trim();

  if(!miqdor){ showNotify("Miqdor kiritilmagan"); return; }

  const name = currentUser.email.split('+')[1] ? currentUser.email.split('+')[1].split('@')[0] : currentUser.email.split('@')[0];
  const { error } = await sb.from('sklad_harakati').insert({
    sklad_id: id, tur, miqdor, sabab,
    user_email: currentUser.email,
    user_name: name,
    sana: getSanaVaqt(),
  });
  if(error){ showNotify("Xatolik: "+error.message); return; }
  showNotify(tur==="prixod" ? "+ Prixod saqlandi!" : "- Rasxod saqlandi!");
  document.getElementById('sklad-harakat-modal').classList.add('hidden');
  await loadSklad();
  // Kam qolgan bo'lsa guruhga xabar
  setTimeout(checkAfterHarakat, 500);
}

// ── STOPWATCH ──
let swMain = {running:false, elapsed:0, start:null};
let swMainInterval = null;

// Taymerni saqlash/yuklash
function saveTimers(){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    const snapshot = {};
    Object.keys(dizTimers).forEach(i => {
      const t = dizTimers[i];
      snapshot[i] = { elapsed: t.running ? t.elapsed + (Date.now()-t.start) : t.elapsed };
    });
    localStorage.setItem('dizTimers_'+userId, JSON.stringify(snapshot));
  } catch(e){}
}

function loadTimers(){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    const saved = localStorage.getItem('dizTimers_'+userId);
    if(saved){
      const snap = JSON.parse(saved);
      Object.keys(snap).forEach(i => {
        dizTimers[i] = { running:false, elapsed: snap[i].elapsed||0, start:null };
      });
    }
  } catch(e){}
}

// Panel holatini saqlash
function saveCurrentPanel(id){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    sessionStorage.setItem('lastPanel_'+userId, id);
  } catch(e){}
}

function saveLastPanel(id){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    sessionStorage.setItem('lastPanel_'+userId, id);
  } catch(e){}
}

function getLastPanel(def){
  try {
    const userId = currentUser ? currentUser.id : 'guest';
    return sessionStorage.getItem('lastPanel_'+userId) || def;
  } catch(e){ return def; }
}

function swToggle(){
  const btn = document.getElementById('sw-btn');
  if(swMain.running){
    swMain.elapsed += Date.now() - swMain.start;
    swMain.running = false;
    clearInterval(swMainInterval);
    if(btn) btn.textContent = 'Boshlash';
  } else {
    swMain.start = Date.now();
    swMain.running = true;
    swMainInterval = setInterval(swMainUpdate, 50);
    if(btn) btn.textContent = "To\'xtatish";
  }
}

function swMainUpdate(){
  const ms = swMain.elapsed + (swMain.running ? Date.now() - swMain.start : 0);
  const totalSec = Math.floor(ms/1000);
  const hh = String(Math.floor(totalSec/3600)).padStart(2,'0');
  const mm = String(Math.floor((totalSec%3600)/60)).padStart(2,'0');
  const ss = String(totalSec%60).padStart(2,'0');
  const msDisp = String(ms%1000).padStart(3,'0');
  const price = Math.round((ms/3600000)*100000);
  const d=document.getElementById('sw-display');
  const m=document.getElementById('sw-ms');
  const p=document.getElementById('sw-price');
  if(d) d.textContent=hh+':'+mm+':'+ss;
  if(m) m.textContent='.'+msDisp;
  if(p) p.textContent=fmt(price)+" so\'m";
}

function swReset(){
  swMain={running:false,elapsed:0,start:null};
  clearInterval(swMainInterval);
  const d=document.getElementById('sw-display');
  const m=document.getElementById('sw-ms');
  const p=document.getElementById('sw-price');
  const b=document.getElementById('sw-btn');
  if(d) d.textContent='00:00:00';
  if(m) m.textContent='.000';
  if(p) p.textContent="0 so\'m";
  if(b) b.textContent='Boshlash';
}

function swCopy(){
  const ms=swMain.elapsed+(swMain.running?Date.now()-swMain.start:0);
  const ts=Math.floor(ms/1000);
  const t=String(Math.floor(ts/3600)).padStart(2,'0')+':'+String(Math.floor((ts%3600)/60)).padStart(2,'0')+':'+String(ts%60).padStart(2,'0');
  const pr=Math.round((ms/3600000)*100000);
  navigator.clipboard.writeText("Vaqt: "+t+"\nNarx: "+fmt(pr)+" so\'m").then(()=>showNotify('Nusxa olindi!')).catch(()=>showNotify('Xato'));
}

function swRowToggle(i){
  if(!dizTimers[i]) dizTimers[i]={running:false,elapsed:0,start:null};
  const t=dizTimers[i];
  if(t.running){
    t.elapsed+=Date.now()-t.start;
    t.running=false;
    clearInterval(swRowIntervals[i]);
    delete swRowIntervals[i];
  } else {
    t.start=Date.now();
    t.running=true;
    swRowIntervals[i]=setInterval(()=>swRowUpdate(i),200);
  }
  saveTimers();
  renderDizayner();
}

function swRowReset(i){
  if(swRowIntervals[i]){clearInterval(swRowIntervals[i]);delete swRowIntervals[i];}
  dizTimers[i]={running:false,elapsed:0,start:null};
  saveTimers();
  renderDizayner();
}

function swRowReset(i){
  if(swRowIntervals[i]){clearInterval(swRowIntervals[i]);delete swRowIntervals[i];}
  dizTimers[i]={running:false,elapsed:0,start:null};
  saveTimers();
  renderDizayner();
}

function swRowUpdate(i){
  const t=dizTimers[i];
  if(!t||!t.running) return;
  const ms=t.elapsed+(Date.now()-t.start);
  const ts=Math.floor(ms/1000);
  const hh=String(Math.floor(ts/3600)).padStart(2,'0');
  const mm=String(Math.floor((ts%3600)/60)).padStart(2,'0');
  const ss=String(ts%60).padStart(2,'0');
  const pr=Math.round((ms/3600000)*100000);
  const el=document.getElementById('sw-mini-'+i);
  if(el){
    const te=el.querySelector('.sw-mini-time');
    const pe=el.querySelector('.sw-mini-price');
    if(te) te.textContent=hh+':'+mm+':'+ss;
    if(pe) pe.textContent=fmt(pr)+" so\'m";
  }
}

// ── TASDIQ XATI ──
function showTasdiqXat(i){
  const r=dizD[i]||{};
  const nom=r.nom||'Dizayn ishi';
  const summa=r.summa?fmt(parseInt(r.summa))+" so\'m":'—';
  const kontakt=r.kontakt||'—';
  const sana=getSanaVaqt();
  const dizaynAdi=document.getElementById('user-name-chip')?document.getElementById('user-name-chip').textContent:'Dizayner';
  const xat="DIZAYN TASDIQLOV XATI\n"+"─".repeat(30)+"\n"+
    "Mahsulot: "+nom+"\n"+
    "Dizayner: "+dizaynAdi+"\n"+
    "Sana: "+sana+"\n"+
    "Narx: "+summa+"\n"+
    "Mijoz kontakt: "+kontakt+"\n"+
    "─".repeat(30)+"\n"+
    "Hurmatli mijoz, sizning buyurtmangiz tayyor.\n"+
    "Iltimos, dizayn faylini ko\'rib chiqing va tasdiqlovingizni bildiring.\n\n"+
    "Tasdiqlash uchun javob yozing yoki qo\'ng\'iroq qiling.\n\n"+
    "Eslatma: Tasdiqlashdan keyin o\'zgartirishlar qilinmaydi.\n"+
    "─".repeat(30)+"\n"+
    "Ads uz Poligrafiya";
  const modal=document.getElementById('tasdiq-modal');
  const textEl=document.getElementById('tasdiq-text');
  if(modal&&textEl){textEl.value=xat;modal.classList.remove('hidden');}
}

function copyTasdiqXat(){
  const t=document.getElementById('tasdiq-text');
  if(!t) return;
  navigator.clipboard.writeText(t.value).then(()=>showNotify('Tasdiq xati nusxa olindi!')).catch(()=>{t.select();document.execCommand('copy');showNotify('Nusxa olindi!');});
}
