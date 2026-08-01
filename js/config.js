// ═══════════════════════════════════════
// config.js — Barcha konstantalar
// Boshqa fayllar bu fayldan keyin yuklanadi
// ═══════════════════════════════════════

const SUPABASE_URL  = 'https://jxxmbgmbaqausqunfyna.supabase.co';
// 2026-07 kalit migratsiyasi: eski legacy anon JWT o'rniga yangi
// publishable kalit (sb_publishable_...) — funksional jihatdan bir xil
// (public/xavfsiz, RLS haqiqiy chegara), lekin legacy JWT chiqarilishidan
// mustaqil. Migratsiya hisoboti: ads-uz-crm repo,
// SECRET_ROTATION_2026-07-20.md va SECRET_ROTATION_2026-07-23.md.
const SUPABASE_KEY  = 'sb_publishable_FEqgX7REH1r-cJPfQK8a5w_-5V_-RYG';
const OWNER_EMAIL   = 'ra.ravshan1998@gmail.com';
const SKLAD_EDITOR  = 'ra.ravshan1998+bayramali@gmail.com';
const ABROR_EMAIL   = 'ra.ravshan1998+abror@gmail.com';
const RASHIDULLOH_EMAIL = 'ra.ravshan1998+rashidulloh@gmail.com';
// bonus_50 ("+50%" / "Jarayoni bilan") checkbox faqat quyidagi xodimlarga.
// Yagona ruxsat ro'yxati — email bo'yicha barqaror identifikatsiya
// (canUseBonus50, utils.js). Yangi xodim qo'shish = shu ro'yxatga email qo'shish.
const BONUS50_EMAILS = [ABROR_EMAIL, RASHIDULLOH_EMAIL];
// TG_BOT_TOKEN frontendda saqlanmaydi!
// Telegram webhook: vercel endpoint orqali
const TG_WEBHOOK    = 'https://adsuz-sklad-jaqpmu8qr-adsuz1.vercel.app/api/webhook';

// CRM workflow integratsiyasi — hech qanday secret shu yerda yo'q. Har bir
// so'rov joriy foydalanuvchining o'z Supabase sessiyasi (access_token) bilan
// autentifikatsiya qilinadi (sendCrmWorkflowTransition, js/db.js).
const CRM_WORKFLOW_API_URL = 'https://ads-uz-crm.vercel.app/api/integrations/erp/user/workflow/transition';

// Bozorlik Telegram bildirishnomasi — xuddi shu naqsh: bot token bu yerda
// yo'q, faqat server (CRM Vercel) tomonda. Joriy foydalanuvchining o'z
// Supabase sessiyasi bilan autentifikatsiya qilinadi (sendBozorlikToTelegram,
// js/panels/bozorlik.js). Yakuniy hardening sprint — avval BOT_TOKEN/CHAT_ID
// shu faylda ochiq yozilgan edi.
const ERP_TELEGRAM_NOTIFY_URL = 'https://ads-uz-crm.vercel.app/api/integrations/erp/telegram-notify';

// ROL MANBAI — crm_profiles.role (Supabase), auth.uid() bo'yicha.
// Yakuniy hardening sprint, Phase 2: avval shu yerda email->role hardcoded
// map bo'lgan (har bir yangi/o'zgargan xodim uchun kod deploy talab qilardi,
// unlisted email esa xatolik bilan emas — jim ravishda 'admin'ga tushardi).
// Endi resolveCurrentRole() (js/auth.js) currentUser.id bo'yicha
// crm_profiles.role'ni o'qiydi va shu mapga solishtiradi.
const CRM_ROLE_TO_ERP_ROLE = {
  director: 'owner',
  manager: 'admin',
  designer: 'dizayner',
  production: 'ishlab',
};

// VAQTINCHALIK FALLBACK — faqat crm_profiles'da umuman qatori yo'q
// foydalanuvchilar uchun (crm_profiles.role'da 'uvdtf' degan qiymat yo'q —
// UV DTF CRM xodimi emas, tashqi sherik). Bu yerga YANGI xodim qo'shilmasin:
// haqiqiy xodim uchun to'g'ri yo'l — crm_profiles'da qator yaratish
// (PRODUCTION_RUNBOOK.md, "Yangi xodim qo'shish").
const LEGACY_ROLE_FALLBACK = {
  'adsuzuvdtf@gmail.com': 'uvdtf',
};

const XODIMLAR = {
  'ra.ravshan1998@gmail.com':              'Ravshan (Owner)',
  'ra.ravshan1998+bayramali@gmail.com':    'Bayramali',
  'ra.ravshan1998+umar@gmail.com':         'Umar',
  'ra.ravshan1998+parvina@gmail.com':      'Parvina',
  'ra.ravshan1998+mohlaroy@gmail.com':     'Mohlaroy',
  'ra.ravshan1998+abror@gmail.com':        'Abror',
  'ra.ravshan1998+umidjon@gmail.com':      'Umidjon',
  'ra.ravshan1998+ulugbek@gmail.com':      'Ulugbek',
  'ra.ravshan1998+zuhriddin@gmail.com':    'Zuhriddin',
  'ra.ravshan1998+jorabek@gmail.com':      'Jorabek',
  'ra.ravshan1998+rashidulloh@gmail.com':  'Rashidulloh',
  'ra.ravshan1998+ulugbekdesign@gmail.com':'Ulugbek (Dizayner)',
  'ra.ravshan1998+begzodbek@gmail.com':    'Begzodbek',
  'ra.ravshan1998+gaybulloh@gmail.com':    'Gaybulloh',
  'adsuzuvdtf@gmail.com':                  'UV DTF Sherik',
};

const ROLE_LABELS = {
  owner: 'Owner', admin: 'Admin', ishlab: 'Ishlab chiqarish',
  dizayner: 'Dizayner', uvdtf: 'UV DTF',
};

// Davomat paneli uchun: user_id -> email (XODIMLAR email bo'yicha indekslangan)
const USER_ID_TO_EMAIL = {
  '2a4548d6-8f63-4473-acce-b6b49710ff8f': 'ra.ravshan1998@gmail.com',
  '4322b1ec-8266-47f0-8e10-15177750b12b': 'ra.ravshan1998+bayramali@gmail.com',
  'd7ebd326-e725-49d4-ba21-75b42725f17b': 'ra.ravshan1998+umar@gmail.com',
  '36724f68-e282-498f-a49f-e92a25ab23b8': 'ra.ravshan1998+parvina@gmail.com',
  'f611587a-eee6-43f6-b246-a88e8a7de10e': 'ra.ravshan1998+mohlaroy@gmail.com',
  'e7ee02e7-0139-462d-8682-f6603d323d1e': 'ra.ravshan1998+abror@gmail.com',
  '6451a1db-666c-4194-848d-fb94636693db': 'ra.ravshan1998+umidjon@gmail.com',
  'b81c0acd-6d7d-4866-8461-394591950bfe': 'ra.ravshan1998+ulugbek@gmail.com',
  '5d170c9b-b524-45a9-bab1-8a6a7f62f903': 'ra.ravshan1998+zuhriddin@gmail.com',
  '5dab55ac-af76-452d-8bb2-7b10593bc952': 'ra.ravshan1998+jorabek@gmail.com',
  '916e5a5b-431e-48dc-9a7c-ba7bc9d45740': 'ra.ravshan1998+rashidulloh@gmail.com',
  '9d23bc5f-1489-4400-b35f-899b99f0f3d2': 'ra.ravshan1998+ulugbekdesign@gmail.com',
  '9333ea8d-06c4-44c4-8e92-54d9f915b250': 'ra.ravshan1998+begzodbek@gmail.com',
  'e3e134df-7d35-4b63-8fb7-6fef9a9598ac': 'ra.ravshan1998+gaybulloh@gmail.com',
  'a8b50ac0-79f9-4af5-8598-ef84f026fe7a': 'adsuzuvdtf@gmail.com',
};

// Dizayner komissiya foizi bosqichlari — [min, max, decimal ko'paytiruvchi].
// har bir yuqori chegara keyingi bosqich pastki chegarasidan roppa-rosa 1 ga
// kichik — bo'shliq yoki ustma-ust tushish yo'q (getDesignerRate ni tekshiring,
// utils.js). Yuqori 4 ta bosqich va chegaralar 2026-07-20 da tuzatildi — eski
// qiymatlar (0.03/0.025/0.02/0.015) noto'g'ri edi.
const FOIZ = [
  [0,99000,.20],[99001,249000,.15],[249001,499000,.12],
  [499001,999000,.10],[999001,1999000,.08],[1999001,2999000,.06],
  [2999001,3999000,.055],[3999001,4999000,.05],[4999001,9999000,.04],
  [9999001,29999000,.035],[29999001,49999000,.033],
  [49999001,99999999,.032],[100000000,Infinity,.03],
];

const FL = [
  '99 000 gacha','99 001 – 249 000','249 001 – 499 000',
  '499 001 – 999 000','999 001 – 1 999 000','1 999 001 – 2 999 000',
  '2 999 001 – 3 999 000','3 999 001 – 4 999 000','4 999 001 – 9 999 000',
  '9 999 001 – 29 999 000','29 999 001 – 49 999 000',
  '49 999 001 – 99 999 000','100 000 000 +',
];

// Xodim -> daraja tayinlanishi (email bo'yicha). getKpi(email) shu jadvaldan
// {daraja, maqsad, fiks} qaytaradi (utils.js). Ro'yxatda yo'q sotuvchida KPI
// kartasi ko'rsatilmaydi. Manba: oldingi ishlaydigan KPI konfiguratsiyasi.
const KPI_DARAJALAR = {
  'ra.ravshan1998+umidjon@gmail.com':    { daraja: 'boshlangich',  maqsad: 30000000, fiks: 1500000 },
  'ra.ravshan1998+ulugbek@gmail.com':    { daraja: 'boshlangich',  maqsad: 30000000, fiks: 1500000 },
  'ra.ravshan1998+mohlaroy@gmail.com':   { daraja: 'boshlangich',  maqsad: 30000000, fiks: 1500000 },
  'ra.ravshan1998+rashidulloh@gmail.com':{ daraja: 'tajriba',      maqsad: 45000000, fiks: 1800000 },
  'ra.ravshan1998+abror@gmail.com':      { daraja: 'professional', maqsad: 60000000, fiks: 1000000 },
};

// Har daraja uchun oylik sotuv -> bonus bosqichlari. getCurrentBonus/getNextBonus
// (utils.js) shu jadvaldan foydalanadi. min = shu bosqichga kirish chegarasi.
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
    { min: 45000000, max: 59999999,  bonus: 400000,  label: 'Qayta buyurtma ulushi 60%' },
    { min: 60000000, max: 79999999,  bonus: 700000,  label: 'Reja bajarilgan' },
    { min: 80000000, max: 99999999,  bonus: 1000000, label: 'Kross/apsell 20%' },
    { min: 100000000, max: Infinity, bonus: 1500000, label: 'Elita daraja' },
  ],
};

// Jarima tizimi — daraja bo'yicha. dashboard KPI_JARIMA[daraja] dan {sabab, miqdor} o'qiydi.
const KPI_JARIMA = {
  boshlangich: [
    { sabab: "Oxirgi xabar mijozniki bo'lsa yoki xabarga javob berilmay qolib ketsa", miqdor: -100000 },
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

const KPI_MUKOFOT = [
  { text:"Eng ko'p yangi mijoz", summa:300000 },
  { text:"10+ ijobiy fikr", summa:200000 },
  { text:"O'tgan oydan +15% sotuv", foiz:0.10 },
];

const DARAJA_LABELS = {
  boshlangich: "🥉 Boshlang'ich",
  tajriba: '🥈 Tajriba oshirgan',
  professional: '🥇 Professional',
};

const QOLDA_KEY = '__qolda__';
const OY_NOMLARI = ['Yan','Fev','Mar','Apr','May','Iyun','Iyul','Avg','Sen','Okt','Noy','Dek'];
const OY_NOMI   = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

const ISH_FORMAT = {
  '44x31': {eni:44, boyi:31, bolinish:4},
  '35x50': {eni:35, boyi:50, bolinish:4},
};
const PECHAT_NARX = {
  '1+0':  {base:170000, extra:70000},
  '4+0':  {base:170000, extra:70000},
  '1+1s': {base:240000, extra:140000},
  '4+4s': {base:240000, extra:140000},
  '1+1c': {base:340000, extra:140000},
  '4+4c': {base:340000, extra:140000},
};
