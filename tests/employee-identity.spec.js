// @ts-check
// Employee identity invariants: Oybek linkage, Jorabek→Ulugbek rename continuity,
// distinct Ulugbek identities, production→ishlab role (no admin/owner), no duplicates.
const { test, expect } = require('@playwright/test');

const OYBEK_UUID = '940769f7-89d5-4a95-a067-fd3a44e8200b';
const OYBEK_EMAIL = 'ra.ravshan1998+oybek@gmail.com';
const JORABEK_UUID = '5dab55ac-af76-452d-8bb2-7b10593bc952';
const JORABEK_EMAIL = 'ra.ravshan1998+jorabek@gmail.com';

test.describe('Xodim identity invariantlari', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForLoadState('domcontentloaded'); });

  test('Oybek UUID → email → display name, va production → ishlab (admin/owner EMAS)', async ({ page }) => {
    const r = await page.evaluate(({ uuid, email }) => ({
      uuidToEmail: USER_ID_TO_EMAIL[uuid],
      emailToName: XODIMLAR[email],
      prodRole: CRM_ROLE_TO_ERP_ROLE['production'],
      isOwnerOrAdmin: CRM_ROLE_TO_ERP_ROLE['production'] === 'owner' || CRM_ROLE_TO_ERP_ROLE['production'] === 'admin',
    }), { uuid: OYBEK_UUID, email: OYBEK_EMAIL });
    expect(r.uuidToEmail).toBe(OYBEK_EMAIL);
    expect(r.emailToName).toBe('Oybek');
    expect(r.prodRole).toBe('ishlab');
    expect(r.isOwnerOrAdmin).toBe(false);
  });

  test('Jorabek UUID/history saqlangan; display → "Ulugbek (Ishlab chiqarish)"', async ({ page }) => {
    const r = await page.evaluate(({ uuid, email }) => ({
      uuidToEmail: USER_ID_TO_EMAIL[uuid],
      display: XODIMLAR[email],
    }), { uuid: JORABEK_UUID, email: JORABEK_EMAIL });
    expect(r.uuidToEmail).toBe(JORABEK_EMAIL);     // UUID→email unchanged (history continuity)
    expect(r.display).toBe('Ulugbek (Ishlab chiqarish)');
  });

  test('uchta Ulugbek alohida identity', async ({ page }) => {
    const names = await page.evaluate(() => ({
      prodUlugbek: XODIMLAR['ra.ravshan1998+jorabek@gmail.com'],       // renamed production
      seller: XODIMLAR['ra.ravshan1998+ulugbek@gmail.com'],           // existing seller
      designer: XODIMLAR['ra.ravshan1998+ulugbekdesign@gmail.com'],   // existing designer
    }));
    expect(names.prodUlugbek).toBe('Ulugbek (Ishlab chiqarish)');
    expect(names.seller).toBe('Ulugbek');
    expect(names.designer).toBe('Ulugbek (Dizayner)');
    // all three distinct emails, distinct display names
    expect(new Set(Object.values(names)).size).toBe(3);
  });

  test('duplicate identity yo\'q (har email bir marta, har UUID bir marta)', async ({ page }) => {
    const r = await page.evaluate(() => {
      const emails = Object.values(USER_ID_TO_EMAIL);
      const uuids = Object.keys(USER_ID_TO_EMAIL);
      const oybekCount = emails.filter(e => e === 'ra.ravshan1998+oybek@gmail.com').length;
      return {
        dupEmails: emails.length - new Set(emails).size,
        dupUuids: uuids.length - new Set(uuids).size,
        oybekCount,
      };
    });
    expect(r.dupEmails).toBe(0);   // no email mapped from two UUIDs
    expect(r.dupUuids).toBe(0);
    expect(r.oybekCount).toBe(1);  // Oybek appears exactly once
  });
});
