// ═══════════════════════════════════════
// panels/sklad.js — Sklad boshqaruvi
// Depends on: config.js, utils.js, db.js
// ═══════════════════════════════════════

// TODO: sb.from() calls bu faylda db.js service funksiyalariga ko'chirilishi kerak
let skladData   = [];
let skladFilter = '';


// ── SKLAD ──

function canEditSklad(){
  return currentUser && (currentRole === 'owner' || currentUser.email === SKLAD_EDITOR);
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
    await fetch(TG_WEBHOOK, {
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

  const data = await getWarehouse();
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
  const data = await getWarehouse();
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
  if (!currentUser) return;
  const addBtn = document.getElementById('sklad-add-btn');
  if(addBtn) addBtn.classList.toggle('hidden', !canEditSklad());

  const data = await getWarehouse();
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
  const brakErr = (await addWarehouseBrak({...brakData})) ? null : new Error('brak failed');
  if(brakErr){ showNotify('Xatolik: '+brakErr.message); return; }

  // 2. sklad_harakati ga ham rasxod sifatida yozish (miqdor kamaysin)
  const harErr = (await addWarehouseMovement({...harData})) ? null : new Error('harakati failed');
  if(harErr){ showNotify('Xatolik (harakat): '+harErr.message); return; }

  // 3. Xodimning zakazlar tarixiga brak yozish
  // Bugun shu xodimning oxirgi yozuvini topib brak belgilaymiz
  const lastZakaz = AppStore.history.filter(h=>h.user_id===currentUser?.id).slice(0,1);

  if(lastZakaz && lastZakaz.length){
    // Brak ma'lumotini xabar sifatida owner ga yuboramiz
    const ownerEmail = 'ra.ravshan1998@gmail.com';
    await createMessage({...msgData});
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

  const error = (await createWarehouseItem({nom, birlik, kategoriya, miqdor})) ? null : new Error('sklad insert failed');
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
  const error = (await addWarehouseMovement({...movData})) ? null : new Error('movement failed');
  if(error){ showNotify("Xatolik: "+error.message); return; }
  showNotify(tur==="prixod" ? "+ Prixod saqlandi!" : "- Rasxod saqlandi!");
  document.getElementById('sklad-harakat-modal').classList.add('hidden');
  await loadSklad();
  // Kam qolgan bo'lsa guruhga xabar
  setTimeout(checkAfterHarakat, 500);
}

// ── RASM YUKLASH ──
function previewRasm(input){
  const file = input && input.files && input.files[0];
  if(!file) return;
  showRasmPreview(file);
}

function handleRasmDrop(event){
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if(!file || !file.type.startsWith('image/')) return;
  const input = document.getElementById('sk-rasm-input');
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch(e){}
  showRasmPreview(file);
}

function showRasmPreview(file){
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('sk-rasm-preview');
    if(preview) preview.innerHTML = '<img src="'+e.target.result+'" style="width:100%;max-height:150px;object-fit:cover;border-radius:var(--radius-md)"><p style="margin:4px 0 0;font-size:11px;color:var(--text3)">'+file.name+'</p>';
  };
  reader.readAsDataURL(file);
}

function openRasmModal(url){
  const modal = document.createElement('div');
  modal.className = 'sklad-img-modal';
  modal.innerHTML = '<img src="'+url+'" alt="Rasm">';
  modal.onclick = () => document.body.removeChild(modal);
  document.body.appendChild(modal);
}
