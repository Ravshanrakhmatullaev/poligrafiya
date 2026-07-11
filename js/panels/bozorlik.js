// ═══════════════════════════════════════
// panels/bozorlik.js — Bozorlik ro'yxati  
// Depends on: config.js, utils.js, db.js
// ═══════════════════════════════════════

let bozorlikData = [];

// TG orqali yuborish
async function bozorlikTgYuborish(text) {
  return sendTgViaWebhook(text);
}


// ── BOZORLIK ──

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

  const error = await createShoppingItem({
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
  if (!currentUser) return;
  bozorlikData = await getShoppingList();
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
  await deleteShoppingItem(id);
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
      await updateShoppingItem(item.id, {status:'yuborildi'});
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

