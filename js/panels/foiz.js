// ═══════════════════════════════════════
// panels/foiz.js — Foiz jadvali va hisob
// Depends on: config.js, utils.js
// ═══════════════════════════════════════


// ── FOIZ JADVALI ──
// NOTE: getFoiz defined in utils.js
// showPanel('foiz') → app.js setTimeout(renderFoizTable, 50) chaqiradi

function renderFoizTable(){
  const tb=document.getElementById('foiz-tbody');
  if(!tb) return; tb.innerHTML=''; FOIZ.forEach(([,,f],i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${FL[i]}</td><td class="fp">${Math.round(f*100)}%</td>`; tb.appendChild(tr); }); }

function calcFoiz(){ const v=parseInt(document.getElementById('calc-inp').value.replace(/\D/g,''))||0; const f=getFoiz(v); document.getElementById('calc-foiz').textContent=v?Math.round(f*100)+'%':'— %'; document.getElementById('calc-daromad').textContent=v?fmt(Math.round(v*f))+" so'm":'— so\'m'; document.querySelectorAll('#foiz-tbody tr').forEach((tr,i)=>{ const[lo,hi]=FOIZ[i]; tr.className=(v>=lo&&v<=hi)?'hl':''; }); }

// ── ISHLAB CHIQARISH PANELI — birinchi ochilishda prD/uvD/ekoD hali null
// bo'ladi (faqat saveOnly muvaffaqiyatli saqlagandan keyin to'ldiriladi),
// shuning uchun Mahsulot qo'shish/Saqlash tugmalari TypeError berardi ──
function initIshlabPanel(){
  if(prD===null) prD=[{key:'Futbolka DTF (old)',miq:'',brak:'',ex:false}];
  if(uvD===null) uvD=[{nom:'',sig:'',don:''}];
  if(ekoD===null) ekoD=[{nom:'',kv:''}];
  loadHiddenSections();
  renderIshlab();
}

// ── BO'LIMLARNI YASHIRISH/KO'RSATISH ──

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


function addUvRow(){uvD.push({nom:'',sig:'',don:'',brak:''});renderIshlab();}
function delUv(i){uvD.splice(i,1);renderIshlab();}
function addEkoRow(){ekoD.push({nom:'',kv:'',brak:''});renderIshlab();}
function delEko(i){ekoD.splice(i,1);renderIshlab();}
function addProdRow(){prD.push({key:Object.keys(PR)[0],miq:'',ex:false});renderIshlab();}
function delProd(i){prD.splice(i,1);renderIshlab();}
function addAdminRow(){if(!Array.isArray(adD))adD=[];adD.push({nom:'',sum:'',bonus_50:false});renderAdmin();}
function delAdmin(i){adD.splice(i,1);renderAdmin();}

function numInput(el,cb){ el.addEventListener('keydown',e=>{if(e.key==='Enter')el.blur();}); el.addEventListener('blur',()=>cb(el.value)); }

function delIcon(fn){ return `<button class="icon-btn" onclick="${fn}" title="O'chirish"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>`; }
