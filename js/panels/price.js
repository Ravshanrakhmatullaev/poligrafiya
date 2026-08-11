// PRICE — ichki mahsulot katalogi va yagona narx manbasi.
// Kalkulyatorlar hozircha o'zgartirilmaydi. Keyin ular pricing_quote RPC yoki
// pricing_source_key orqali aynan shu manbaga ulanadi.

const PRICE_CATEGORIES = [
  'Poligrafiya', 'Suvenir', 'Kiyim', 'Keng format', 'UV / DTF',
  'Stendlar', 'Ofis mahsulotlari', 'Bayroqlar', 'Paketlar',
  'Beyjik', 'Tashqi reklama', 'Boshqa'
];

const PRICE_MODE_LABELS = {
  fixed: 'Bitta narx',
  quantity_tier: 'Miqdor tarifi',
  area: 'm² bo\'yicha',
  linear_meter: 'Pogon metr',
  calculator: 'Kalkulyator manbasi',
  manual: 'Individual narx',
};

const PRICE_UNIT_LABELS = {
  dona: 'dona', m2: 'm²', pogon_metr: 'pogon metr',
  varaq: 'varaq', komplekt: 'komplekt', xizmat: 'xizmat'
};

const PRICE_CATEGORY_ICONS = {
  'Poligrafiya': '▤', 'Suvenir': '◆', 'Kiyim': '♙', 'Keng format': '▰',
  'UV / DTF': '✦', 'Stendlar': '▥', 'Ofis mahsulotlari': '▦',
  'Bayroqlar': '⚑', 'Paketlar': '▣', 'Beyjik': '◈',
  'Tashqi reklama': '▱', 'Boshqa': '◇'
};

const priceState = {
  loaded: false,
  loading: false,
  products: [],
  favoriteIds: new Set(),
  category: 'all',
  selectedId: null,
  lastQuote: null,
};

function priceCanEdit(){
  return currentRole === 'owner' || currentRole === 'admin';
}

function priceEsc(value){
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function priceSafeImage(url){
  try {
    const parsed = new URL(String(url || ''));
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch (_) { return ''; }
}

function priceMoney(value, currency = 'UZS'){
  const amount = Number(value || 0);
  return new Intl.NumberFormat('uz-UZ', { maximumFractionDigits: currency === 'UZS' ? 0 : 2 }).format(amount) +
    (currency === 'USD' ? ' USD' : " so'm");
}

function priceDate(value, withTime = false){
  if(!value) return '—';
  const date = new Date(value);
  if(Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('uz-UZ', {
    day:'2-digit', month:'short', year:'numeric',
    ...(withTime ? { hour:'2-digit', minute:'2-digit' } : {})
  }).format(date);
}

function priceProductById(id){
  return priceState.products.find(product => Number(product.id) === Number(id));
}

function priceSortedTiers(product){
  return [...(product.pricing_price_tiers || [])]
    .filter(tier => tier.is_active !== false)
    .sort((a,b) => Number(a.min_value) - Number(b.min_value));
}

function priceLowest(product){
  const tiers = priceSortedTiers(product);
  if(tiers.length) return Number(tiers[0].unit_price || 0);
  return Number(product.base_price || 0);
}

function priceDisplay(product){
  if(product.pricing_mode === 'calculator') return '<span>Kalkulyatorda</span>';
  if(product.pricing_mode === 'manual') return '<span>Individual narx</span>';
  const lowest = priceLowest(product);
  if(!lowest) return '<span>Narx kiritilmagan</span>';
  const suffix = product.pricing_mode === 'area' ? '/m²' :
    product.pricing_mode === 'linear_meter' ? '/p.m' :
    product.pricing_mode === 'fixed' ? '' : ' dan';
  return priceMoney(lowest, product.currency) + '<small>' + suffix + '</small>';
}

async function initPricePanel(){
  const addBtn = document.getElementById('price-add-btn');
  if(addBtn) addBtn.classList.toggle('hidden', !priceCanEdit());
  priceFillCategoryOptions();
  if(!priceState.loaded && !priceState.loading) await loadPriceCatalog();
  else renderPriceCatalog();
}

async function loadPriceCatalog(force = false){
  if(priceState.loading) return;
  if(priceState.loaded && !force){ renderPriceCatalog(); return; }
  priceState.loading = true;
  priceSetState('Katalog yuklanmoqda...');
  try {
    const productQuery = sb.from('pricing_products')
      .select('*, pricing_price_tiers(*)')
      .order('updated_at', { ascending:false })
      .limit(1000);
    const favoriteQuery = currentUser
      ? sb.from('pricing_favorites').select('product_id').eq('user_id', currentUser.id)
      : Promise.resolve({ data:[], error:null });
    const [productsResult, favoritesResult] = await Promise.all([productQuery, favoriteQuery]);
    if(productsResult.error) throw productsResult.error;
    if(favoritesResult.error) throw favoritesResult.error;
    priceState.products = productsResult.data || [];
    priceState.favoriteIds = new Set((favoritesResult.data || []).map(row => Number(row.product_id)));
    priceState.loaded = true;
    renderPriceCatalog();
  } catch(error){
    console.error('[PRICE load]', error);
    const missing = error && (error.code === '42P01' || error.code === 'PGRST205' || /pricing_products/i.test(error.message || ''));
    priceSetState(
      '<div class="price-state-content"><div class="price-state-icon">' + (missing ? '⌁' : '⚠') + '</div>'+
      '<h3>' + (missing ? 'PRICE bazasi hali ulanmagan' : 'Katalog yuklanmadi') + '</h3>'+
      '<p>' + (missing
        ? 'Yangi migration Supabase’ga qo‘llangach katalog ishlaydi. Mavjud ERP funksiyalari o‘z holicha davom etadi.'
        : priceEsc(error.message || 'Tarmoq yoki ruxsat xatosi')) + '</p>'+
      '<button class="price-btn price-btn-secondary" type="button" onclick="loadPriceCatalog(true)">Qayta urinish</button></div>', true
    );
  } finally { priceState.loading = false; }
}

function priceSetState(content, html = false){
  const state = document.getElementById('price-catalog-state');
  const grid = document.getElementById('price-grid');
  if(!state || !grid) return;
  state.classList.remove('hidden');
  grid.classList.add('hidden');
  if(html) state.innerHTML = content; else state.textContent = content;
}

function priceFillCategoryOptions(){
  const datalist = document.getElementById('price-category-options');
  if(!datalist) return;
  const categories = [...new Set([...PRICE_CATEGORIES, ...priceState.products.map(p => p.category).filter(Boolean)])]
    .sort((a,b) => a.localeCompare(b, 'uz'));
  datalist.innerHTML = categories.map(category => '<option value="'+priceEsc(category)+'"></option>').join('');
}

function priceApplyFilters(){
  renderPriceCatalog();
}

function setPriceCategory(category){
  priceState.category = category;
  renderPriceCatalog();
}

function priceFilteredProducts(){
  const search = (document.getElementById('price-search')?.value || '').trim().toLocaleLowerCase('uz');
  const status = document.getElementById('price-status-filter')?.value || 'active';
  const sort = document.getElementById('price-sort')?.value || 'updated';
  const list = priceState.products.filter(product => {
    if(status === 'favorites' && !priceState.favoriteIds.has(Number(product.id))) return false;
    if(status !== 'all' && status !== 'favorites' && product.status !== status) return false;
    if(status === 'favorites' && product.status !== 'active') return false;
    if(priceState.category !== 'all' && product.category !== priceState.category) return false;
    if(search){
      const haystack = [product.name, product.sku, product.category, product.description, ...(product.tags || []), ...(product.aliases || [])]
        .filter(Boolean).join(' ').toLocaleLowerCase('uz');
      if(!haystack.includes(search)) return false;
    }
    return true;
  });
  if(sort === 'name') list.sort((a,b) => a.name.localeCompare(b.name, 'uz'));
  else if(sort === 'price') list.sort((a,b) => priceLowest(a) - priceLowest(b));
  else list.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
  return list;
}

function renderPriceCatalog(){
  if(!priceState.loaded) return;
  priceFillCategoryOptions();
  const grid = document.getElementById('price-grid');
  const state = document.getElementById('price-catalog-state');
  const strip = document.getElementById('price-category-strip');
  if(!grid || !state || !strip) return;

  const active = priceState.products.filter(p => p.status === 'active');
  const categories = [...new Set(active.map(p => p.category).filter(Boolean))].sort((a,b) => a.localeCompare(b, 'uz'));
  document.getElementById('price-stat-active').textContent = active.length;
  document.getElementById('price-stat-categories').textContent = categories.length;
  document.getElementById('price-stat-updated').textContent = priceState.products.length ? priceDate(priceState.products[0].updated_at) : '—';
  strip.innerHTML = ['all', ...categories].map(category =>
    '<button type="button" class="price-category-chip '+(priceState.category===category?'active':'')+'" onclick="setPriceCategory('+JSON.stringify(category).replaceAll('"','&quot;')+')">'+
    (category === 'all' ? 'Barchasi' : priceEsc(category))+'</button>'
  ).join('');

  const list = priceFilteredProducts();
  if(!list.length){
    const hasAny = priceState.products.length > 0;
    priceSetState('<div class="price-state-content"><div class="price-state-icon">'+(hasAny?'⌕':'◇')+'</div><h3>'+
      (hasAny ? 'Mos mahsulot topilmadi' : 'PRICE katalog hozircha bo‘sh')+'</h3><p>'+
      (hasAny ? 'Qidiruv yoki filtrni o‘zgartirib ko‘ring.' :
        (priceCanEdit() ? 'Birinchi mahsulotni qo‘shib, Telegram price kanalini bosqichma-bosqich almashtirishni boshlang.' : 'Owner yoki admin mahsulot qo‘shgach shu yerda ko‘rinadi.'))+
      '</p>'+(priceCanEdit()&&!hasAny?'<button class="price-btn price-btn-primary" type="button" onclick="openPriceEditor()">+ Birinchi mahsulot</button>':'')+'</div>', true);
    return;
  }

  state.classList.add('hidden');
  grid.classList.remove('hidden');
  grid.innerHTML = list.map(priceCardHtml).join('');
}

function priceCardHtml(product){
  const image = priceSafeImage(product.image_url);
  const icon = PRICE_CATEGORY_ICONS[product.category] || '◇';
  const statusLabel = product.status === 'archived' ? 'Arxiv' : product.status === 'draft' ? 'Qoralama' : 'Faol';
  const tags = (product.tags || []).slice(0,3).map(tag => '<span class="price-tag">#'+priceEsc(tag)+'</span>').join('');
  return '<article class="price-card" onclick="openPriceDetail('+Number(product.id)+')">'+
    '<div class="price-card-media">'+(image?'<img src="'+priceEsc(image)+'" alt="'+priceEsc(product.name)+'" loading="lazy">':'<div class="price-card-placeholder">'+icon+'</div>')+
    '<span class="price-card-status">'+priceEsc(statusLabel)+'</span>'+
    '<button type="button" class="price-favorite '+(priceState.favoriteIds.has(Number(product.id))?'active':'')+'" onclick="togglePriceFavorite(event,'+Number(product.id)+')" aria-label="Sevimlilarga qo‘shish">'+(priceState.favoriteIds.has(Number(product.id))?'★':'☆')+'</button></div>'+
    '<div class="price-card-body"><div class="price-card-category">'+priceEsc(product.category)+'</div><h3>'+priceEsc(product.name)+'</h3>'+
    '<p class="price-card-summary">'+priceEsc(product.description || 'Qisqa tavsif kiritilmagan')+'</p>'+
    '<div class="price-card-price">'+priceDisplay(product)+'</div>'+
    (tags?'<div class="price-tags">'+tags+'</div>':'')+
    '<div class="price-card-meta"><span>'+priceEsc(PRICE_MODE_LABELS[product.pricing_mode] || product.pricing_mode)+'</span><span>'+priceDate(product.updated_at)+'</span></div></div></article>';
}

async function togglePriceFavorite(event, productId){
  event?.stopPropagation();
  if(!currentUser) return;
  const isFavorite = priceState.favoriteIds.has(Number(productId));
  try {
    const result = isFavorite
      ? await sb.from('pricing_favorites').delete().eq('user_id', currentUser.id).eq('product_id', productId)
      : await sb.from('pricing_favorites').insert({ user_id:currentUser.id, product_id:productId });
    if(result.error) throw result.error;
    if(isFavorite) priceState.favoriteIds.delete(Number(productId));
    else priceState.favoriteIds.add(Number(productId));
    renderPriceCatalog();
  } catch(error){
    console.error('[PRICE favorite]', error);
    showNotify('Sevimlilar saqlanmadi', 'warning');
  }
}

function openPriceDetail(productId){
  const product = priceProductById(productId);
  if(!product) return;
  priceState.selectedId = Number(productId);
  priceState.lastQuote = null;
  const modal = document.getElementById('price-detail-modal');
  const content = document.getElementById('price-detail-content');
  if(!modal || !content) return;
  const tiers = priceSortedTiers(product);
  const image = priceSafeImage(product.image_url);
  const unit = PRICE_UNIT_LABELS[product.unit] || product.unit;
  const quoteInputs = priceQuoteInputs(product);
  content.innerHTML =
    '<div class="price-detail-head"><div class="price-detail-image">'+(image?'<img src="'+priceEsc(image)+'" alt="'+priceEsc(product.name)+'">':'<div class="price-card-placeholder">'+(PRICE_CATEGORY_ICONS[product.category]||'◇')+'</div>')+'</div>'+
    '<div><div class="price-detail-title-row"><div><div class="price-card-category">'+priceEsc(product.category)+'</div><h2 id="price-detail-title">'+priceEsc(product.name)+'</h2></div></div>'+
    '<p class="price-detail-description">'+priceEsc(product.description || 'Tavsif kiritilmagan.')+'</p>'+
    '<div class="price-tags">'+(product.tags||[]).map(tag=>'<span class="price-tag">#'+priceEsc(tag)+'</span>').join('')+'</div>'+
    '<div class="price-detail-facts"><div class="price-detail-fact">Narxlash rejimi<b>'+priceEsc(PRICE_MODE_LABELS[product.pricing_mode]||product.pricing_mode)+'</b></div><div class="price-detail-fact">Minimum<b>'+priceEsc(product.min_quantity)+' '+priceEsc(unit)+'</b></div><div class="price-detail-fact">Tayyorlash<b>'+priceEsc(product.production_time||'—')+'</b></div><div class="price-detail-fact">Oxirgi yangilanish<b>'+priceDate(product.updated_at)+'</b></div></div></div></div>'+
    (tiers.length?'<section class="price-detail-section"><h3>Narx jadvali</h3>'+priceTierTable(tiers, product.currency, unit)+'</section>':'')+
    '<section class="price-detail-section"><h3>Narxni hisoblash</h3>'+quoteInputs+'<div id="price-quote-result"></div></section>'+
    (product.customer_note?'<section class="price-detail-section"><h3>Mijoz uchun izoh</h3><p class="price-detail-description">'+priceEsc(product.customer_note)+'</p></section>':'')+
    '<section class="price-detail-section"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Narx tarixi</h3><span style="font-size:10px;color:var(--ink-3)">Avtomatik audit</span></div><div id="price-history-list" class="price-history-list"><div style="font-size:11px;color:var(--ink-3)">Yuklanmoqda...</div></div></section>'+
    '<div class="price-detail-actions"><button class="price-btn price-btn-primary" type="button" onclick="copyPriceCustomerSummary()">Mijozga nusxa olish</button>'+
    '<button class="price-btn price-btn-secondary" type="button" onclick="togglePriceFavorite(event,'+Number(product.id)+')">'+(priceState.favoriteIds.has(Number(product.id))?'★ Sevimlilarda':'☆ Sevimlilarga')+'</button>'+
    (priceCanEdit()?'<button class="price-btn price-btn-secondary" type="button" onclick="openPriceEditor('+Number(product.id)+')">Tahrirlash</button><button class="price-btn price-btn-secondary price-danger" type="button" onclick="togglePriceArchive('+Number(product.id)+')">'+(product.status==='archived'?'Faollashtirish':'Arxivga olish')+'</button>':'')+'</div>';
  modal.classList.remove('hidden');
  loadPriceHistory(product.id);
}

function closePriceDetail(){
  document.getElementById('price-detail-modal')?.classList.add('hidden');
  priceState.selectedId = null;
  priceState.lastQuote = null;
}

function priceTierTable(tiers, currency, unit){
  return '<div style="overflow:auto"><table class="price-tier-table"><thead><tr><th>Oraliq</th><th>Birlik narxi</th><th>Setup</th><th>Izoh</th></tr></thead><tbody>'+tiers.map(tier => {
    const range = Number(tier.min_value)+' – '+(tier.max_value == null ? '∞' : Number(tier.max_value))+' '+unit;
    return '<tr><td>'+priceEsc(range)+'</td><td><b>'+priceMoney(tier.unit_price,currency)+'</b></td><td>'+priceMoney(tier.setup_price,currency)+'</td><td>'+priceEsc(tier.label||'—')+'</td></tr>';
  }).join('')+'</tbody></table></div>';
}

function priceQuoteInputs(product){
  if(product.pricing_mode === 'calculator') return '<div class="price-catalog-state" style="min-height:100px">Bu mahsulot <b style="margin:0 4px">'+priceEsc(product.pricing_source_key)+'</b> kalkulyator manbasiga ulanadi. PRICE ichida ikkinchi narx saqlanmaydi.</div>';
  if(product.pricing_mode === 'manual') return '<div class="price-catalog-state" style="min-height:100px">Bu mahsulot uchun o‘lcham va talablar aniqlangach individual narx beriladi.</div>';
  const extra = product.pricing_mode === 'area'
    ? '<label class="price-quote-field"><span>Eni (m)</span><input id="price-quote-width" type="number" min="0.01" step="0.01" value="1"></label><label class="price-quote-field"><span>Bo‘yi (m)</span><input id="price-quote-height" type="number" min="0.01" step="0.01" value="1"></label>'
    : product.pricing_mode === 'linear_meter'
      ? '<label class="price-quote-field"><span>Uzunlik (m)</span><input id="price-quote-length" type="number" min="0.01" step="0.01" value="1"></label>'
      : '';
  return '<div class="price-quote-box"><label class="price-quote-field"><span>Miqdor</span><input id="price-quote-quantity" type="number" min="'+priceEsc(product.min_quantity)+'" step="1" value="'+priceEsc(product.min_quantity)+'"></label>'+extra+'<button class="price-btn price-btn-primary" type="button" onclick="calculatePriceQuote()">Hisoblash</button></div>';
}

async function calculatePriceQuote(){
  const product = priceProductById(priceState.selectedId);
  if(!product) return;
  const quantity = Number(document.getElementById('price-quote-quantity')?.value || 0);
  const width = Number(document.getElementById('price-quote-width')?.value || 0);
  const height = Number(document.getElementById('price-quote-height')?.value || 0);
  const length = Number(document.getElementById('price-quote-length')?.value || 0);
  const target = document.getElementById('price-quote-result');
  if(!target) return;
  if(quantity < Number(product.min_quantity || 1)){
    target.innerHTML = '<div class="price-form-error">Minimum miqdor: '+priceEsc(product.min_quantity)+'</div>';
    return;
  }
  target.innerHTML = '<div class="price-quote-result">Hisoblanmoqda...</div>';
  try {
    const { data, error } = await sb.rpc('pricing_quote', {
      p_product_id:product.id,
      p_quantity:quantity,
      p_area_m2:product.pricing_mode === 'area' ? width * height : null,
      p_length_m:product.pricing_mode === 'linear_meter' ? length : null,
    });
    if(error) throw error;
    priceState.lastQuote = data;
    if(!data?.available){
      target.innerHTML = '<div class="price-quote-result"><div class="price-detail-description">'+priceEsc(data?.message || 'Tasdiqlangan narx topilmadi')+'</div></div>';
      return;
    }
    target.innerHTML = '<div class="price-quote-result"><div class="price-quote-total">'+priceMoney(data.total,data.currency)+'</div><div class="price-quote-breakdown">'+
      priceEsc(data.basis)+' '+priceEsc(priceQuoteBasisLabel(product))+' × '+priceMoney(data.unit_price,data.currency)+
      (Number(data.setup_price)>0?' + setup '+priceMoney(data.setup_price,data.currency):'')+
      (data.tier_label?' · '+priceEsc(data.tier_label):'')+'</div></div>';
  } catch(error){
    console.error('[PRICE quote]', error);
    priceState.lastQuote = null;
    target.innerHTML = '<div class="price-form-error">'+priceEsc(error.message || 'Narx hisoblanmadi')+'</div>';
  }
}

function priceQuoteBasisLabel(product){
  if(product.pricing_mode === 'area') return 'm²';
  if(product.pricing_mode === 'linear_meter') return 'pogon metr';
  return PRICE_UNIT_LABELS[product.unit] || product.unit;
}

async function copyPriceCustomerSummary(){
  const product = priceProductById(priceState.selectedId);
  if(!product) return;
  const quote = priceState.lastQuote;
  const lines = [product.name];
  if(quote?.available){
    if(product.pricing_mode === 'area') lines.push('Jami maydon: '+quote.basis+' m²');
    else if(product.pricing_mode === 'linear_meter') lines.push('Jami uzunlik: '+quote.basis+' pogon metr');
    else lines.push('Miqdor: '+quote.quantity+' '+(PRICE_UNIT_LABELS[product.unit]||product.unit));
    lines.push('Birlik narxi: '+priceMoney(quote.unit_price,quote.currency));
    if(Number(quote.setup_price)>0) lines.push('Qo‘shimcha/setup: '+priceMoney(quote.setup_price,quote.currency));
    lines.push('Jami: '+priceMoney(quote.total,quote.currency));
  } else {
    const shown = priceDisplay(product).replace(/<[^>]+>/g,'');
    lines.push('Narx: '+shown);
  }
  if(product.production_time) lines.push('Tayyorlash: '+product.production_time);
  if(product.customer_note) lines.push(product.customer_note);
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showNotify('Mijoz uchun narx nusxalandi');
  } catch(_) { showNotify('Nusxa olish ishlamadi', 'warning'); }
}

async function loadPriceHistory(productId){
  const target = document.getElementById('price-history-list');
  if(!target) return;
  try {
    const { data, error } = await sb.from('pricing_price_history').select('*')
      .eq('product_id', productId).order('changed_at', { ascending:false }).limit(20);
    if(error) throw error;
    if(Number(priceState.selectedId) !== Number(productId)) return;
    if(!data?.length){ target.innerHTML = '<div style="font-size:11px;color:var(--ink-3)">Tarix hali yo‘q.</div>'; return; }
    target.innerHTML = data.map(item => '<div class="price-history-row"><time>'+priceDate(item.changed_at,true)+'</time><span>'+priceEsc(priceHistorySummary(item))+'<small>'+priceEsc(item.changed_by_name || 'Noma\'lum foydalanuvchi')+'</small></span><b>'+priceEsc(item.action)+'</b></div>').join('');
  } catch(error){
    target.innerHTML = '<div style="font-size:11px;color:var(--ink-3)">Tarix yuklanmadi.</div>';
  }
}

function priceHistorySummary(item){
  if(item.action === 'insert') return item.entity_type === 'tier' ? 'Yangi tarif qo‘shildi' : 'Mahsulot yaratildi';
  if(item.action === 'delete') return item.entity_type === 'tier' ? 'Tarif olib tashlandi' : 'Mahsulot o‘chirildi';
  if(item.entity_type === 'tier_set'){
    return 'Tariflar: '+priceTierSnapshot(item.old_data)+' → '+priceTierSnapshot(item.new_data);
  }
  if(item.entity_type === 'tier'){
    const row = item.new_data || item.old_data || {};
    return 'Tarif '+row.min_value+'–'+(row.max_value ?? '∞')+': '+priceMoney(row.unit_price, priceProductById(item.product_id)?.currency);
  }
  const oldData = item.old_data || {};
  const newData = item.new_data || {};
  const changes = [];
  if(oldData.base_price !== newData.base_price) changes.push('narx '+priceMoney(oldData.base_price,newData.currency)+' → '+priceMoney(newData.base_price,newData.currency));
  if(oldData.status !== newData.status) changes.push('holat '+(oldData.status||'—')+' → '+(newData.status||'—'));
  if(oldData.pricing_mode !== newData.pricing_mode) changes.push('rejim '+(oldData.pricing_mode||'—')+' → '+(newData.pricing_mode||'—'));
  return changes.join('; ') || (item.action === 'insert' ? 'Mahsulot yaratildi' : item.action === 'delete' ? 'Mahsulot o‘chirildi' : 'Mahsulot yangilandi');
}

function priceTierSnapshot(rows){
  if(!Array.isArray(rows) || !rows.length) return 'yo‘q';
  return rows.map(row => {
    const range = Number(row.min_value)+'–'+(row.max_value == null ? '∞' : Number(row.max_value));
    return range+': '+priceMoney(row.unit_price, priceProductById(priceState.selectedId)?.currency);
  }).join(', ');
}

function openPriceEditor(productId){
  if(!priceCanEdit()){ showNotify('Faqat owner yoki admin tahrirlay oladi', 'warning'); return; }
  const product = productId ? priceProductById(productId) : null;
  closePriceDetail();
  const modal = document.getElementById('price-editor-modal');
  document.getElementById('price-editor-title').textContent = product ? 'Mahsulotni tahrirlash' : 'Mahsulot qo‘shish';
  document.getElementById('price-edit-id').value = product?.id || '';
  document.getElementById('price-edit-name').value = product?.name || '';
  document.getElementById('price-edit-category').value = product?.category || '';
  document.getElementById('price-edit-sku').value = product?.sku || '';
  document.getElementById('price-edit-unit').value = product?.unit || 'dona';
  document.getElementById('price-edit-mode').value = product?.pricing_mode || 'fixed';
  document.getElementById('price-edit-base-price').value = product?.base_price || 0;
  document.getElementById('price-edit-min').value = product?.min_quantity || 1;
  document.getElementById('price-edit-production').value = product?.production_time || '';
  document.getElementById('price-edit-status').value = product?.status || 'active';
  document.getElementById('price-edit-tags').value = (product?.tags || []).join(', ');
  document.getElementById('price-edit-aliases').value = (product?.aliases || []).join(', ');
  document.getElementById('price-edit-image').value = product?.image_url || '';
  document.getElementById('price-edit-description').value = product?.description || '';
  document.getElementById('price-edit-customer-note').value = product?.customer_note || '';
  document.getElementById('price-edit-source-key').value = product?.pricing_source_key || '';
  document.getElementById('price-form-error').classList.add('hidden');
  const rows = document.getElementById('price-tier-rows');
  rows.innerHTML = '';
  priceSortedTiers(product || {}).forEach(tier => addPriceTierRow(tier));
  priceEditorModeChanged();
  modal?.classList.remove('hidden');
}

function closePriceEditor(){
  document.getElementById('price-editor-modal')?.classList.add('hidden');
}

function priceEditorModeChanged(){
  const mode = document.getElementById('price-edit-mode')?.value;
  document.getElementById('price-source-key-field')?.classList.toggle('hidden', mode !== 'calculator');
  document.getElementById('price-tier-editor')?.classList.toggle('hidden', mode !== 'quantity_tier' && mode !== 'area' && mode !== 'linear_meter');
  const base = document.getElementById('price-edit-base-price');
  if(base) base.disabled = mode === 'calculator' || mode === 'manual' || mode === 'quantity_tier';
}

function addPriceTierRow(tier = {}){
  const rows = document.getElementById('price-tier-rows');
  if(!rows) return;
  const row = document.createElement('div');
  row.className = 'price-tier-row';
  row.innerHTML = '<input class="price-tier-min" type="number" min="0.001" step="0.001" placeholder="Min" value="'+priceEsc(tier.min_value ?? '')+'" aria-label="Minimum">'+
    '<input class="price-tier-max" type="number" min="0.001" step="0.001" placeholder="Max / bo‘sh" value="'+priceEsc(tier.max_value ?? '')+'" aria-label="Maksimum">'+
    '<input class="price-tier-price" type="number" min="0" step="0.01" placeholder="Birlik narxi" value="'+priceEsc(tier.unit_price ?? '')+'" aria-label="Birlik narxi">'+
    '<input class="price-tier-setup" type="number" min="0" step="0.01" placeholder="Setup" value="'+priceEsc(tier.setup_price ?? 0)+'" aria-label="Setup narxi">'+
    '<input class="price-tier-label" maxlength="80" placeholder="Izoh" value="'+priceEsc(tier.label ?? '')+'" aria-label="Tarif izohi">'+
    '<button class="price-tier-remove" type="button" onclick="this.parentElement.remove()" aria-label="Tarifni o‘chirish">×</button>';
  rows.appendChild(row);
}

function priceCollectTiers(){
  return [...document.querySelectorAll('#price-tier-rows .price-tier-row')].map((row,index) => ({
    min_value:Number(row.querySelector('.price-tier-min').value),
    max_value:row.querySelector('.price-tier-max').value === '' ? null : Number(row.querySelector('.price-tier-max').value),
    unit_price:Number(row.querySelector('.price-tier-price').value),
    setup_price:Number(row.querySelector('.price-tier-setup').value || 0),
    label:row.querySelector('.price-tier-label').value.trim(),
    sort_order:index,
  })).sort((a,b) => a.min_value - b.min_value);
}

function priceValidateTiers(tiers){
  for(let i=0;i<tiers.length;i++){
    const tier = tiers[i];
    if(!Number.isFinite(tier.min_value) || tier.min_value <= 0) return 'Har bir tarif uchun minimum 0 dan katta bo‘lsin.';
    if(!Number.isFinite(tier.unit_price) || tier.unit_price < 0) return 'Har bir tarif uchun narx kiriting.';
    if(tier.max_value !== null && tier.max_value < tier.min_value) return 'Tarif maksimumi minimumdan kichik bo‘lishi mumkin emas.';
    if(i>0 && (tiers[i-1].max_value === null || tiers[i-1].max_value >= tier.min_value)) return 'Tarif oraliqlari bir xil miqdorni qamrab olmoqda.';
  }
  return '';
}

async function savePriceProduct(event){
  event.preventDefault();
  if(!priceCanEdit()) return;
  const mode = document.getElementById('price-edit-mode').value;
  const collectedTiers = priceCollectTiers();
  const tierMode = mode === 'quantity_tier' || mode === 'area' || mode === 'linear_meter';
  const tiers = tierMode ? collectedTiers : [];
  const errorBox = document.getElementById('price-form-error');
  const showError = message => { errorBox.textContent = message; errorBox.classList.remove('hidden'); };
  if(mode === 'quantity_tier' && !tiers.length){ showError('Miqdor tarifi uchun kamida bitta tarif kiriting.'); return; }
  const tierError = priceValidateTiers(tiers);
  if(tierError){ showError(tierError); return; }
  const sourceKey = document.getElementById('price-edit-source-key').value.trim();
  if(mode === 'calculator' && !sourceKey){ showError('Kalkulyator source key kiriting.'); return; }
  const product = {
    id:document.getElementById('price-edit-id').value || undefined,
    name:document.getElementById('price-edit-name').value.trim(),
    category:document.getElementById('price-edit-category').value.trim(),
    sku:document.getElementById('price-edit-sku').value.trim(),
    unit:document.getElementById('price-edit-unit').value,
    pricing_mode:mode,
    currency:'UZS',
    base_price:(mode === 'calculator' || mode === 'manual' || mode === 'quantity_tier') ? 0 : Number(document.getElementById('price-edit-base-price').value || 0),
    min_quantity:Number(document.getElementById('price-edit-min').value || 1),
    production_time:document.getElementById('price-edit-production').value.trim(),
    status:document.getElementById('price-edit-status').value,
    tags:document.getElementById('price-edit-tags').value.split(',').map(tag=>tag.trim()).filter(Boolean),
    aliases:document.getElementById('price-edit-aliases').value.split(',').map(alias=>alias.trim()).filter(Boolean),
    image_url:document.getElementById('price-edit-image').value.trim(),
    description:document.getElementById('price-edit-description').value.trim(),
    customer_note:document.getElementById('price-edit-customer-note').value.trim(),
    pricing_source_key:mode === 'calculator' ? sourceKey : '',
  };
  const btn = document.getElementById('price-save-btn');
  btn.disabled = true; btn.textContent = 'Saqlanmoqda...'; errorBox.classList.add('hidden');
  try {
    const { error } = await sb.rpc('pricing_save_product', { p_product:product, p_tiers:tiers });
    if(error) throw error;
    closePriceEditor();
    await loadPriceCatalog(true);
    showNotify('PRICE mahsuloti saqlandi');
  } catch(error){
    console.error('[PRICE save]', error);
    showError(error.message || 'Mahsulot saqlanmadi');
  } finally { btn.disabled = false; btn.textContent = 'Saqlash'; }
}

async function togglePriceArchive(productId){
  const product = priceProductById(productId);
  if(!product || !priceCanEdit()) return;
  const archive = product.status !== 'archived';
  if(!confirm(archive ? 'Mahsulotni arxivga olasizmi?' : 'Mahsulotni yana faollashtirasizmi?')) return;
  try {
    const { error } = await sb.rpc('pricing_set_archived', { p_product_id:product.id, p_archived:archive });
    if(error) throw error;
    closePriceDetail();
    await loadPriceCatalog(true);
    showNotify(archive ? 'Mahsulot arxivga olindi' : 'Mahsulot faollashtirildi');
  } catch(error){
    console.error('[PRICE archive]', error);
    showNotify(error.message || 'Holat o‘zgarmadi', 'warning');
  }
}
