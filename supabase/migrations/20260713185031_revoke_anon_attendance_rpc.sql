-- ═══════════════════════════════════════
-- DAVOMAT MODULI — anon rolidan RPC EXECUTE huquqini olib tashlash
--
-- Audit paytida aniqlandi: oldingi migratsiyalarda "revoke execute on
-- function ... from public" yozilgan edi, lekin Supabase loyihalarida
-- yangi funksiyalarga standart holda "anon" roliga TO'G'RIDAN-TO'G'RI
-- (PUBLIC orqali emas) EXECUTE huquqi avtomatik beriladi. Shu sababli
-- "from public" revoke'i anon'ga ta'sir qilmagan — information_schema
-- orqali tasdiqlandi: barcha 6 ta attendance_* funksiyada anon EXECUTE
-- huquqiga ega edi.
--
-- Amaliy xavf past edi (har bir funksiya ichida auth.uid()/
-- is_attendance_staff() tekshiruvi bor, anon chaqiruv baribir rad
-- etiladi) — lekin rejalashtirilgan himoya qatlami ishlamayotgan edi.
--
-- Bu migratsiya FAQAT ruxsatlarni tuzatadi. SECURITY DEFINER,
-- auth.uid() tekshiruvlari, funksiya tanasi — hech biriga tegilmadi.
-- authenticated roliga grant o'zgarishsiz qoladi.
-- ═══════════════════════════════════════

revoke execute on function public.attendance_scan(uuid) from anon;
revoke execute on function public.attendance_resolve(uuid, text, text, text) from anon;
revoke execute on function public.attendance_approve(uuid, text) from anon;
revoke execute on function public.attendance_reject(uuid, text) from anon;
revoke execute on function public.attendance_manual_edit(uuid, timestamptz, timestamptz, text) from anon;
revoke execute on function public.attendance_delete(uuid, text) from anon;
