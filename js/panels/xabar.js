// ═══════════════════════════════════════
// panels/xabar.js — Xabarlar
// Depends on: config.js, utils.js, db.js
// ═══════════════════════════════════════

// allMessages AppStore orqali boshqariladi
// loadMessages → db.js da


async function loadMessages() {
  if (!currentUser) return;
  try {
    if (!currentUser) return;
    const data = await getMessages(currentUser.id, currentRole);
    return data;
  } catch (e) {
    console.error('[loadMessages]', e);
  }
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


async function sendMsg(){
  const toEmail = currentRole === 'owner' 
    ? document.getElementById('msg-receiver').value 
    : 'ra.ravshan1998@gmail.com';
  const text = document.getElementById('msg-text').value.trim();
  
  if(!toEmail){ showNotify('Kimga yuborishni tanlang'); return; }
  if(!text){ showNotify('Xabar yozing'); return; }
  
  const fromName = getName(currentUser.email);
  const toName = getName(toEmail);
  
  const error = await createMessage({
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


async function markRead(id){
  await markMessageRead(id);
  await loadMessages();
}


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

