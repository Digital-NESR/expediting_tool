-- ============================================================================
-- A placeholder price for every catalogued model in every country, so the WIP
-- keeps working while the real cost sheet is being compiled.
--
-- This restores, as data, exactly what PLACEHOLDER_UNIT_PRICE_USD used to do in
-- code — $100 for everything — with one difference that is the whole point of
-- moving it: every seeded row is stamped `updated_by = 'seed:placeholder'`, so
-- a figure nobody has reviewed is distinguishable from one an admin actually
-- keyed. The Devices tab counts them and says so, which the constant could
-- never do: a hundred dollars reaching SAP looked exactly like a real price.
--
-- NOT EXISTS rather than a blanket insert: a price an admin has already set
-- outranks the placeholder and must survive this. Saving over a seeded row
-- replaces updated_by with the admin's address, so a reviewed price stops being
-- counted as a placeholder by the act of saving it.
--
-- The exceptional model is excluded — it is priced by rule at a nominal dollar
-- (see fixedUnitPriceUsd), never from this table, and a row for it would be
-- read by nobody.
--
-- Countries are listed literally because COUNTRY_OPTIONS lives in TypeScript
-- and nothing in the database knows it. A model added to the catalogue after
-- this migration gets no placeholder and must be priced properly — which is
-- the right default once the sheet exists.
-- ============================================================================

-- Wrapped because laptop_device_catalog is created by ensureLaptopSchema() at
-- runtime rather than by a migration, so on a database that has never run the
-- app it does not exist yet and a bare INSERT ... SELECT would fail to parse
-- and take the whole build down with it. A seed that finds nothing to seed
-- should do nothing, not stop a deploy.
DO $$
BEGIN
  IF to_regclass('public.laptop_device_catalog') IS NULL THEN
    RAISE NOTICE 'laptop_device_catalog does not exist yet - no prices seeded.';
    RETURN;
  END IF;

  INSERT INTO laptop_device_prices (model, country, unit_price_usd, updated_by)
  SELECT d.model, c.country, 100, 'seed:placeholder'
    FROM (
      SELECT DISTINCT TRIM(model) AS model
        FROM laptop_device_catalog
       WHERE active = TRUE
         AND TRIM(model) <> ''
         AND LOWER(TRIM(model)) <> LOWER('Other (Exceptional case only)')
    ) AS d
    CROSS JOIN (
      VALUES
        ('Saudi Arabia'), ('Abu Dhabi'), ('HQ Dubai'), ('Qatar'),
        ('Kuwait'), ('Oman'), ('Bahrain'), ('Egypt'),
        ('Algeria'), ('Iraq'), ('Libya'), ('Yemen'),
        ('Chad'), ('India'), ('Indonesia'), ('Other')
    ) AS c(country)
   WHERE NOT EXISTS (
     SELECT 1
       FROM laptop_device_prices p
      WHERE LOWER(TRIM(p.model)) = LOWER(d.model)
        AND LOWER(TRIM(p.country)) = LOWER(c.country)
   );
END $$;
