# Ishlab chiqarish xodimlari — provisioning runbook

> Bu runbook PRIVILEGED qadamlarni tavsiflaydi. Ular **bu branchda BAJARILMAGAN**.
> Production DB / Supabase Auth mutatsiyasi faqat Owner tomonidan, aniq ruxsat bilan
> amalga oshiriladi. Service-role kalit hech qachon frontend kodda yoki logda bo'lmaydi.

## 1. Jorabek → "Ulugbek (Ishlab chiqarish)" (display-only — BAJARILDI)
- Faqat `js/config.js` `XODIMLAR` dagi **display-name** o'zgardi:
  `ra.ravshan1998+jorabek@gmail.com` → `"Ulugbek (Ishlab chiqarish)"`.
- Auth email/UUID (`+jorabek`, `5dab55ac-af76-452d-8bb2-7b10593bc952`) va barcha tarixiy
  yozuvlar (`zakazlar.user_email = +jorabek`, davomat `user_id = 5dab55ac...`) **O'ZGARMADI**.
- Bu shaxs mavjud `+ulugbek` ('Ulugbek') va `+ulugbekdesign` ('Ulugbek (Dizayner)')dan BOSHQA.
- DB migration yoki data update **kerak emas** (faqat frontend display).

## 2. Oybek — yangi ishlab chiqarish xodimi (PRIVILEGED — BAJARILMAGAN)
Display-name (`XODIMLAR['ra.ravshan1998+oybek@gmail.com'] = 'Oybek'`) bu branchda qo'shildi.
Qolgan qadamlar Owner tomonidan bajariladi (idempotent):

1. **Supabase Auth user** (agar mavjud bo'lmasa):
   - Email: `ra.ravshan1998+oybek@gmail.com`
   - Parol: `OYBEK_INITIAL_PASSWORD` environment qiymatidan (kodda/logda/testda YO'Q).
   - Supabase Dashboard → Authentication → Add user (yoki admin API). Service-role kalit faqat server tomonda.
2. **crm_profiles** (haqiqiy Auth UUID bilan):
   ```sql
   insert into public.crm_profiles (id, full_name, role)
   values ('<OYBEK_AUTH_UUID>', 'Oybek', 'production')
   on conflict (id) do update set role = excluded.role, full_name = excluded.full_name;
   ```
   - `role` qiymati AYNAN mavjud `'production'` (yangi rol ixtiro qilinmaydi; `CRM_ROLE_TO_ERP_ROLE.production = 'ishlab'`).
3. **ERP frontend map** (haqiqiy UUID kelgach, kichik additive config o'zgarishi):
   ```js
   // js/config.js — USER_ID_TO_EMAIL
   '<OYBEK_AUTH_UUID>': 'ra.ravshan1998+oybek@gmail.com',
   ```
   (Davomat paneli UUID→email mappingiga tayanadi; shusiz davomat Oybekni ko'rsatmaydi.)

**Idempotentlik:** har qadam `if not exists` / `on conflict` bilan; qayta ishga tushirish xavfsiz.
**Rollback:** `delete from public.crm_profiles where id = '<OYBEK_AUTH_UUID>';` + Auth userni Dashboarddan ban/delete + config.js map qatorini olib tashlash. Bu Oybekning kirishini bloklaydi; boshqa foydalanuvchiga ta'sir qilmaydi.

## 3. Nega hozir bajarilmadi
- Haqiqiy Auth UUID faqat Owner userni yaratgandan keyin ma'lum bo'ladi (soxta UUID hardcode qilinmaydi).
- Production DB mutatsiyasi bu task doirasida aniq ruxsat etilmagan.
- Parol env orqali beriladi; hech qachon commit/log/test chiqishida bo'lmaydi.
