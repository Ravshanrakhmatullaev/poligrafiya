// ═══════════════════════════════════════
// config.js — Barcha konstantalar
// Boshqa fayllar bu fayldan keyin yuklanadi
// ═══════════════════════════════════════

const SUPABASE_URL  = 'https://jxxmbgmbaqausqunfyna.supabase.co';
const SUPABASE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4eG1iZ21iYXFhdXNxdW5meW5hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MjU2MzUsImV4cCI6MjA5ODMwMTYzNX0.G3bULfygRDeqZxOdBDUop296K60_cWCVLFBCZfXkWPo';
const OWNER_EMAIL   = 'ra.ravshan1998@gmail.com';
const SKLAD_EDITOR  = 'ra.ravshan1998+bayramali@gmail.com';
// TG_BOT_TOKEN frontendda saqlanmaydi!
// Telegram webhook: vercel endpoint orqali
const TG_WEBHOOK    = 'https://adsuz-sklad-jaqpmu8qr-adsuz1.vercel.app/api/webhook';

const ROLES = {
  'ra.ravshan1998@gmail.com':              'owner',
  'ra.ravshan1998+bayramali@gmail.com':    'ishlab',
  'ra.ravshan1998+umar@gmail.com':         'ishlab',
  'ra.ravshan1998+parvina@gmail.com':      'ishlab',
  'ra.ravshan1998+mohlaroy@gmail.com':     'admin',
  'ra.ravshan1998+abror@gmail.com':        'admin',
  'ra.ravshan1998+umidjon@gmail.com':      'admin',
  'ra.ravshan1998+ulugbek@gmail.com':      'admin',
  'ra.ravshan1998+zuhriddin@gmail.com':    'ishlab',
  'ra.ravshan1998+jorabek@gmail.com':      'ishlab',
  'ra.ravshan1998+rashidulloh@gmail.com':  'admin',
  'ra.ravshan1998+ulugbekdesign@gmail.com':'dizayner',
  'ra.ravshan1998+begzodbek@gmail.com':    'dizayner',
  'ra.ravshan1998+gaybulloh@gmail.com':    'dizayner',
  'adsuzuvdtf@gmail.com':                  'uvdtf',
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

const ISH_FORMAT = { '44x31': {w:44,h:31}, '35x50': {w:35,h:50} };
const PECHAT_NARX = {
  '1+0': n=>n*300, '4+0': n=>n*500,
  '1+1s': n=>n*600, '4+4s': n=>n*900,
  '1+1c': n=>n*700, '4+4c': n=>n*1100,
};
