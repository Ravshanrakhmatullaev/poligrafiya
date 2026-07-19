// ═══════════════════════════════════════
// config.js — Barcha konstantalar
// Boshqa fayllar bu fayldan keyin yuklanadi
// ═══════════════════════════════════════

const SUPABASE_URL  = 'https://jxxmbgmbaqausqunfyna.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4eG1iZ21iYXFhdXNxdW5meW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjU2MzUsImV4cCI6MjA5ODMwMTYzNX0.G3bULfygRDeqZxOdBDUop296K60_cWCVLFBCZfXkWPo';
const OWNER_EMAIL   = 'ra.ravshan1998@gmail.com';
const SKLAD_EDITOR  = 'ra.ravshan1998+bayramali@gmail.com';
const ABROR_EMAIL   = 'ra.ravshan1998+abror@gmail.com'; // bonus_50 checkbox faqat Abror uchun
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

const FOIZ = [
  [0,99999,.20],[100000,249999,.15],[250000,499999,.12],
  [500000,999999,.10],[1000000,1999999,.08],[2000000,2999999,.06],
  [3000000,3999999,.055],[4000000,4999999,.05],[5000000,9999999,.04],
  [10000000,29999999,.03],[30000000,49999999,.025],
  [50000000,99999999,.02],[100000000,Infinity,.015],
];

const FL = [
  '100 000 gacha','100 000 – 249 000','250 000 – 499 000',
  '500 000 – 999 000','1 000 000 – 1 999 000','2 000 000 – 2 999 000',
  '3 000 000 – 3 999 000','4 000 000 – 4 999 000','5 000 000 – 9 999 000',
  '10 000 000 – 29 999 000','30 000 000 – 49 999 000',
  '50 000 000 – 99 999 000','100 000 000 +',
];

const KPI_DARAJALAR = {
  boshlangich:  { label: "Boshlang'ich", maqsad: 30000000, fiks: 1500000 },
  tajriba:      { label: "Tajriba oshirgan", maqsad: 45000000, fiks: 1800000 },
  professional: { label: "Professional", maqsad: 60000000, fiks: 1000000 },
};

const KPI_BONUS = {
  professional: [
    { min:0, max:60000000, bonus:0 },
    { min:60000000, max:80000000, bonus:500000 },
    { min:80000000, max:100000000, bonus:1000000 },
    { min:100000000, max:Infinity, bonus:1500000 },
  ]
};

const KPI_JARIMA = [
  { text:"Ish qoidasini buzish", summa:200000 },
  { text:"Mijozga noto'g'ri muomala", summa:300000 },
  { text:"Kech kelish (3+ marta)", summa:150000 },
  { text:"Vazifani bajarmaslik", summa:500000 },
];

const KPI_MUKOFOT = [
  { text:"Eng ko'p yangi mijoz", summa:300000 },
  { text:"10+ ijobiy fikr", summa:200000 },
  { text:"O'tgan oydan +15% sotuv", foiz:0.10 },
];

const DARAJA_LABELS = {
  boshlangich: "Boshlang'ich",
  tajriba: "Tajriba oshirgan",
  professional: "Professional",
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
