// panels/kalk_engines.js — Orakal va DTF (tekstil) uchun SOF hisob funksiyalari.
// DOM ga bog'liq emas -> alohida test qilinadi. Bu fayl hali index.html ga
// ULANMAGAN (regressiya yo'q); UI ulanishi keyingi bosqichda.
// MUHIM: bu DTF — UV DTF EMAS. UV DTF mantig'iga tegilmaydi.

// ============================================================================
// SIG'IM
// ============================================================================
function sigimNumber(value) {
  if (typeof value === 'string') value = value.trim().replace(',', '.');
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function sigimDirection(materialWidth, materialHeight, pieceWidth, pieceHeight, gap) {
  const columns = gap === 0
    ? Math.floor(materialWidth / pieceWidth)
    : Math.floor((materialWidth + gap) / (pieceWidth + gap));
  const rows = gap === 0
    ? Math.floor(materialHeight / pieceHeight)
    : Math.floor((materialHeight + gap) / (pieceHeight + gap));
  return {
    columns,
    rows,
    total: columns * rows,
    usedWidth: columns > 0 ? columns * pieceWidth + (columns - 1) * gap : 0,
    usedHeight: rows > 0 ? rows * pieceHeight + (rows - 1) * gap : 0,
  };
}

// piece = material ichiga joylanadigan bitta tayyor mahsulot;
// material = mavjud list/rulonning umumiy tashqi o'lchami.
function calculateSigim(input) {
  input = input || {};
  const pieceWidth = sigimNumber(input.pieceWidth);
  const pieceHeight = sigimNumber(input.pieceHeight);
  const materialWidth = sigimNumber(input.materialWidth);
  const materialHeight = sigimNumber(input.materialHeight);
  const gap = input.withGap ? 0.5 : 0;
  const values = [pieceWidth, pieceHeight, materialWidth, materialHeight];

  if (values.some(Number.isNaN)) return { ok: false, error: 'invalid' };
  if (values.some(value => value <= 0)) return { ok: false, error: 'non_positive' };

  const normal = sigimDirection(materialWidth, materialHeight, pieceWidth, pieceHeight, gap);
  const rotated = sigimDirection(materialWidth, materialHeight, pieceHeight, pieceWidth, gap);
  const bestOrientation = normal.total >= rotated.total ? 'normal' : 'rotated';
  const best = bestOrientation === 'normal' ? normal : rotated;
  return {
    ok: true, pieceWidth, pieceHeight, materialWidth, materialHeight, gap,
    normal, rotated, best, bestTotal: best.total, bestOrientation,
    noFit: best.total === 0,
  };
}

// ============================================================================
// ORAKAL
// ============================================================================
// Rulonlar: fizik eni / xavfsiz (pechat qilinadigan) eni. 2 sm — chekka zaxira.
const ORAKAL_ROLLS = [
  { physical: 107, safe: 105 },
  { physical: 127, safe: 125 },
  { physical: 152, safe: 150 },
];
const ORAKAL_OVERLAP = 2; // sm — HAR CHOKDA o'rnatish uchun ustma-ust (panel eniga qo'shiladi)

// Sotuv narxi (m² bo'yicha). "up to 1 m²" = <=1. Setkalik = tarif + 10000/m².
function orakalTierRate(areaM2) {
  if (areaM2 <= 1)   return 100000;
  if (areaM2 <= 5)   return 50000;
  if (areaM2 <= 10)  return 40000;
  if (areaM2 <= 20)  return 35000;
  if (areaM2 <= 30)  return 30000;
  if (areaM2 <= 50)  return 28000;
  if (areaM2 <= 100) return 27000;
  return 26000; // 100+ m²
}

// `w` kenglikni xavfsiz eni S ichida qamrash uchun kerakli panel soni.
// Har chokda 2 sm overlap -> jami bosilgan kenglik = w + 2*(N-1). Har panel <= S.
function orakalPanels(w, S) {
  if (w <= S) return { panels: 1, panelW: w, totalPrintedW: w };
  // N ta panel: (w + 2*(N-1))/N <= S  ->  N >= (w-2)/(S-2)
  const N = Math.ceil((w - ORAKAL_OVERLAP) / (S - ORAKAL_OVERLAP));
  const totalPrintedW = w + ORAKAL_OVERLAP * (N - 1);
  const panelW = totalPrintedW / N; // teng taqsimot (har panel <= S bo'lishi tekshiriladi)
  if (panelW > S + 1e-9) return null;
  return { panels: N, panelW, totalPrintedW };
}

// Bitta rulon + orientatsiya uchun joylashuv. acrossDim — rulon eni bo'ylab,
// alongDim — rulon uzunligi bo'ylab. Nusxalar rulon eniga sig'sa yonma-yon
// joylashadi (samarali joylashtirish), aks holda uzunlik bo'ylab teriladi.
function orakalLayout(roll, acrossDim, alongDim, qty) {
  const S = roll.safe;
  const pen = orakalPanels(acrossDim, S);
  if (!pen) return null;
  const perRow = Math.max(1, Math.floor(S / pen.panelW));   // rulon eniga sig'adigan panel soni
  const totalPanels = pen.panels * qty;
  const rowsAlong = Math.ceil(totalPanels / perRow);
  const rollLengthCm = rowsAlong * alongDim;                 // har qator = alongDim uzunlik
  const materialAreaM2 = (S / 100) * (rollLengthCm / 100);   // sarflangan material (rulon eni × uzunlik)
  return { roll, S, panels: pen.panels, panelW: pen.panelW, totalPrintedW: pen.totalPrintedW,
           perRow, rowsAlong, rollLengthCm, materialAreaM2 };
}

// Asosiy Orakal hisobi. finishedW/finishedH — tayyor o'lcham (sm), qty — soni,
// type — 'oddiy' | 'setkalik'. Rulon+orientatsiya eng KAM material maydoni
// bo'yicha tanlanadi (eng keng rulon default EMAS).
function calculateOrakal(inp) {
  inp = inp || {};
  const finishedW = Number(inp.finishedW) || 0;
  const finishedH = Number(inp.finishedH) || 0;
  const qty = Math.max(1, Math.floor(Number(inp.qty) || 1));
  const type = inp.type === 'setkalik' ? 'setkalik' : 'oddiy';
  if (!finishedW || !finishedH) return { ok: false, error: 'empty' };

  let best = null, bestRot = false;
  for (const roll of ORAKAL_ROLLS) {
    const cand = [[orakalLayout(roll, finishedW, finishedH, qty), false],
                  [orakalLayout(roll, finishedH, finishedW, qty), true]];
    for (const [lay, rot] of cand) {
      if (!lay) continue;
      if (!best || lay.materialAreaM2 < best.materialAreaM2) { best = lay; bestRot = rot; }
    }
  }
  if (!best) return { ok: false, error: 'no_fit', message: "Hech qaysi rulonga sig'madi" };

  const finishedAreaM2 = (finishedW / 100) * (finishedH / 100) * qty;
  // BILLABLE (sotuv) maydon = TAYYOR MIJOZ MAYDONI (finishedW*finishedH*qty).
  // 2 sm overlap, panel/rulon isrofi, xavfsiz-chekka yo'qotish -> faqat MATERIAL
  // SARFI (ishlab chiqarish rejasi), mijoz sotuv maydonini OSHIRMAYDI.
  // Tarif ham tayyor sotuv maydoni bo'yicha tanlanadi (material bo'yicha EMAS).
  const billableAreaM2 = finishedAreaM2;
  let rate = orakalTierRate(billableAreaM2);
  if (type === 'setkalik') rate += 10000; // Setkalik: (tegishli Oddiy tarif + 10000) × tayyor maydon
  const total = Math.round(billableAreaM2 * rate);

  return {
    ok: true, type, rotated: bestRot,
    rollPhysical: best.roll.physical, rollSafe: best.S,
    panels: best.panels, panelW: +best.panelW.toFixed(2), overlap: ORAKAL_OVERLAP,
    totalPrintedW: +best.totalPrintedW.toFixed(2),
    perRow: best.perRow, rowsAlong: best.rowsAlong,
    rollLengthCm: +best.rollLengthCm.toFixed(2), rollLengthM: +(best.rollLengthCm / 100).toFixed(4),
    materialAreaM2: +best.materialAreaM2.toFixed(4),
    finishedAreaM2: +finishedAreaM2.toFixed(4),
    billableAreaM2: +billableAreaM2.toFixed(4),
    rate, total,
  };
}

// ============================================================================
// DTF (tekstil transfer) — UV DTF EMAS
// ============================================================================
// Rulon eni 58 sm. Qo'shnilar orasida MAJBURIY 0.5 sm oraliq (o'chirib bo'lmaydi).
// Oxirgi qatordan keyin qo'shimcha oraliq YO'Q.
const DTF_ROLL_W = 58, DTF_GAP = 0.5;

// Bir orientatsiya uchun joylashuv. pieceAcross — 58 rulon bo'ylab, pieceAlong — uzunlik bo'ylab.
function dtfPack(pieceAcross, pieceAlong, qty) {
  if (pieceAcross > DTF_ROLL_W) return null; // enига sig'maydi
  const across = Math.floor((DTF_ROLL_W + DTF_GAP) / (pieceAcross + DTF_GAP));
  if (across < 1) return null;
  const rows = Math.ceil(qty / across);
  const length = rows * pieceAlong + (rows - 1) * DTF_GAP;   // qatorlar orasida 0.5, oxirida yo'q
  // Haqiqiy joylashuv izi (eng to'liq qatordagi dona soni bo'yicha) — kichik
  // partiyalarda butun rulon eni emas, faqat egallangan kenglik hisoblanadi.
  const pcsInWidestRow = Math.min(across, qty);
  const usedWidth = Math.min(DTF_ROLL_W, pcsInWidestRow * pieceAcross + (pcsInWidestRow - 1) * DTF_GAP);
  return { across, rows, length, usedWidth };
}

// Asosiy DTF hisobi. Ikkala orientatsiya sinaladi; eng qisqa rulon uzunligi tanlanadi.
// Narx: uzunlik <= 0.5 m -> haqiqiy maydon × 150000/m²; > 0.5 m -> pogon metr × 100000.
function calculateDtf(inp) {
  inp = inp || {};
  const width = Number(inp.width) || 0;
  const height = Number(inp.height) || 0;
  const qty = Math.max(0, Math.floor(Number(inp.qty) || 0));
  if (!width || !height || !qty) return { ok: false, error: 'empty' };

  const a = dtfPack(width, height, qty);   // to'g'ri: eni rulon bo'ylab
  const b = dtfPack(height, width, qty);   // aylantirilgan
  if (!a && !b) return { ok: false, error: 'both_exceed_width', message: "Mahsulot 58 cm ga sig'maydi" };
  const best = (!b || (a && a.length <= b.length)) ? a : b;
  const rotated = best === b;

  const lengthM = best.length / 100;
  const usedAreaM2 = (best.usedWidth / 100) * lengthM; // haqiqiy joylashuv izi (bounding box)
  let mode, rate, total;
  if (lengthM <= 0.5) { mode = 'm²'; rate = 150000; total = Math.round(usedAreaM2 * rate); }
  else                { mode = 'pogon metr'; rate = 100000; total = Math.round(lengthM * rate); }

  return {
    ok: true, rotated, rollWidth: DTF_ROLL_W, gap: DTF_GAP,
    across: best.across, rows: best.rows,
    lengthCm: +best.length.toFixed(2), lengthM: +lengthM.toFixed(4),
    usedWidthCm: +best.usedWidth.toFixed(2), usedAreaM2: +usedAreaM2.toFixed(4),
    mode, rate, total,
  };
}

// Node/test uchun eksport (brauzerda global funksiyalar sifatida qoladi).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { calculateSigim, calculateOrakal, calculateDtf, orakalTierRate, orakalPanels, dtfPack, ORAKAL_ROLLS };
}
