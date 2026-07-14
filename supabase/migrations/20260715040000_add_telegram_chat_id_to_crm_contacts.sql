-- ═══════════════════════════════════════
-- CRM SCHEMA COMPATIBILITY FIX — add crm_contacts.telegram_chat_id
-- (DESIGN DRAFT — NOT APPLIED)
--
-- Closes a pre-existing schema-drift gap found during CRM repo analysis:
-- D:\AdsUZ\ads-uz-crm's own `lib/schema.sql` never defined this column, but
-- app code (app/api/loyalty/route.ts, app/api/telegram/register/route.ts,
-- app/api/payments/route.ts, app/api/orders/stage/route.ts) has always read
-- and written it on `contacts`/`crm_contacts`. Additive only — does not
-- touch any ERP object, does not alter any other crm_* column, does not
-- change RLS (see rationale below).
--
-- TYPE DECISION: text, not bigint.
--   - Postgres bigint numerically covers Telegram's full chat_id range
--     (including negative supergroup/channel IDs) without overflow, so
--     bigint would be technically sufficient.
--   - But every single call site in the CRM codebase treats this value as
--     a string, with zero exceptions:
--       * app/api/loyalty/route.ts:11 — the external Loyalty bot's own
--         documented webhook payload is `{ chat_id: "123456789", ... }`
--         (a JSON string literal, not a number).
--       * lib/loyalty.ts:9 — `getLoyaltyCard(chatId: string)`.
--       * app/api/loyalty/route.ts:70 / app/api/telegram/register/route.ts
--         — chat_id is read via `URLSearchParams.get()` / JSON body
--         destructuring and passed straight into `.eq('telegram_chat_id',
--         chat_id)` — never `Number(...)`/`parseInt(...)`'d anywhere.
--     Matching the already-established, code-verified contract (text) is
--     lower-risk than introducing an implicit string->bigint cast at every
--     PostgREST call site for a value that is never actually treated as a
--     number by any caller.
--   - Also consistent with ERP's own convention: `profiles.telegram_id`
--     (poligrafiya) is `text`, not a numeric type, for the same identifier
--     family.
--
-- NULLABLE: yes — most existing contacts (created via the CRM's manual
-- lead-entry flow) will never have a Telegram chat; only ones that came
-- through /start on the Loyalty bot get one.
--
-- UNIQUE INDEX: NOT added in this migration, decision explained below.
-- ═══════════════════════════════════════

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'crm_contacts' and column_name = 'telegram_chat_id'
  ) then
    raise exception 'add_telegram_chat_id_to_crm_contacts: column already exists — aborting';
  end if;
end;
$$;

alter table crm_contacts add column telegram_chat_id text;

-- Plain (non-unique) index — both existing lookup call sites filter by
-- exact equality on this column (app/api/loyalty/route.ts:79,
-- app/api/telegram/register/route.ts:21), so an index is worth having
-- regardless of the uniqueness decision below.
create index idx_crm_contacts_telegram_chat_id on crm_contacts (telegram_chat_id)
  where telegram_chat_id is not null;

-- ── UNIQUE INDEX DECISION: not applied ──
-- The requirement was conditional: add a partial unique index only if it's
-- CLEAR that one chat_id can never legitimately belong to more than one
-- contact row. That is not clear from the current app code:
--   - app/api/loyalty/route.ts's POST handler looks up an existing contact
--     by PHONE first, and only falls back to INSERT-ing a new contact row
--     if no phone match is found — it never checks "does another contact
--     already have this chat_id" before writing it. A customer who
--     previously registered under a different/incorrect phone number, then
--     later messages the Loyalty bot again, could end up with the same
--     chat_id written onto two different contact rows.
--   - Neither app/api/loyalty/route.ts nor app/api/telegram/register/route.ts
--     wraps its INSERT/UPDATE in a try/catch for a unique_violation — a
--     hard constraint added here would turn a currently-silent (if
--     imperfect) upsert path into a hard 500 for that customer, with no
--     app-side handling.
-- Recommendation: revisit once the CRM app itself is updated to check
-- "does this chat_id already belong to a different contact" before
-- writing (Phase 2 CRM code work, not part of this schema-only fix), or
-- once the business explicitly confirms the 1:1 assumption always holds
-- in practice. Adding the constraint later is a trivial, low-risk
-- follow-up migration; removing one that turns out to be wrong under
-- production data is not.
--
-- No RLS change: crm_contacts' RLS policies (crm_contacts_select/insert/
-- update, from the Phase 1 consolidation migration) are row-scoped via
-- is_crm_user(), not column-scoped — adding a nullable column does not
-- require any policy change, confirmed by inspection of
-- 20260715030000_adsuz_crm_workflow_consolidation_phase1.sql.
