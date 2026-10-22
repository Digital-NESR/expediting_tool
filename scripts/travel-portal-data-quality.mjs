#!/usr/bin/env node
/**
 * Data-quality sweep of the Travel Portal feed, for the provider.
 *
 *   node --env-file=.env scripts/travel-portal-data-quality.mjs out.json
 *   python scripts/travel-portal-data-quality-workbook.py out.json "report.xlsx"
 *
 * Reads travel_portal with the POSTGRES_* credentials, which is the chain `db-travel-portal.ts`
 * uses. The database belongs to the travel provider and is marked `readOnly` in the migration
 * manifest; nothing here writes.
 *
 * Every check returns the offending ROWS, not a count: the point is to hand over something that
 * can be worked through, not a number somebody has to reproduce before they can start. Checks
 * that come back clean are kept and reported as clean -- "we looked and it was fine" is worth
 * as much to the reader as a finding, and it says what was examined.
 *
 * `Channel` is on almost every sheet because it is usually the first question: BTO was booked
 * in the portal and OFF was arranged offline and entered afterwards, so a gap on an OFF row is
 * often expected and the same gap on a BTO row is a defect.
 *
 * DATES ARE CAST TO TEXT IN SQL, every one of them. A Postgres DATE handed to node's pg driver
 * becomes a JS Date at LOCAL midnight and then serialises to UTC, so 2026-04-21 reached the
 * first build of the workbook as 2026-04-20. Every date was a day early and nothing said so.
 *
 * No passport numbers, dates of birth or mobile numbers are reproduced anywhere.
 */
import fs from 'node:fs';
import pg from 'pg';

const outPath = process.argv[2];
const CHANNEL = `CASE WHEN LEFT(b.code, 3) = 'BTO' THEN 'BTO (portal)'
                     WHEN LEFT(b.code, 3) = 'OFF' THEN 'OFF (offline)'
                     ELSE 'Other' END`;

const CHECKS = [
  {
    key: 'test_bookings',
    tab: 'Test bookings',
    title: '1. Test bookings still in the live data',
    severity: 'Critical',
    question:
      "Bookings whose cost centre is an all-nines placeholder (C999999999, C999999997) or whose company is 'Satguru Test'. These were made to exercise the portal, not to fly anyone.",
    soWhat:
      'They are counted as real travel everywhere: 15 bookings, AED 34,008 of which USD 9,260 is converted, 6 travellers, 7 flight segments, 8 legs, 21 cheapest-fare rows, 6 policy violations, 7 savings rows, 5 approver rows and 7 fare rules. Three of the six policy violations in the whole feed belong to test trips, so the compliance rate is measured partly against bookings nobody took.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code",
             b."employeeName" AS "Traveller", b."createdUserName" AS "Booked by",
             b."costCenter" AS "Cost centre", b."companyName" AS "Company",
             b."bookingStatus" AS "Status",
             b."departureAirportCode" AS "From", b."arrivalAirportCode" AS "To",
             b."departureDate"::text AS "Departure",
             to_char(b."creationDate", 'YYYY-MM-DD HH24:MI') AS "Created",
             b.currency AS "Currency", b."totalAmount" AS "Total (local)",
             b."totalAmountUSD" AS "Total (USD)",
             (SELECT COUNT(*) FROM travellers x WHERE x.code = b.code) AS "Traveller rows",
             (SELECT COUNT(*) FROM flightsegments x WHERE x.code = b.code) AS "Segment rows",
             (SELECT COUNT(*) FROM flightsegmentlegs x WHERE x.code = b.code) AS "Leg rows",
             (SELECT COUNT(*) FROM cheapestflightsegments x WHERE x.code = b.code) AS "Cheapest-fare rows",
             (SELECT COUNT(*) FROM policyviolations x WHERE x.code = b.code) AS "Policy violation rows",
             (SELECT COUNT(*) FROM savings_analysis x WHERE x.code = b.code) AS "Savings rows",
             (SELECT COUNT(*) FROM approvers x WHERE x.code = b.code) AS "Approver rows",
             (SELECT COUNT(*) FROM farerules x WHERE x.code = b.code) AS "Fare rule rows",
             CASE
               WHEN b."costCenter" ~ '^C9{6,}[0-9]*$' AND b."companyName" ILIKE '%test%'
                 THEN 'All-nines cost centre AND a test company'
               WHEN b."costCenter" ~ '^C9{6,}[0-9]*$' THEN 'All-nines cost centre'
               ELSE 'Company name says test'
             END AS "Why it is flagged"
        FROM bookings b
       WHERE b."costCenter" ~ '^C9{6,}[0-9]*$'
          OR b."companyName" ILIKE '%test%'
       ORDER BY b."employeeName", b."creationDate"`,
  },
  {
    key: 'nbsp_padding',
    tab: 'Invisible padding',
    title: '2. Segment padded with non-breaking spaces',
    severity: 'Critical',
    question:
      "Every `segment` value is padded out to exactly 20 characters with U+00A0, the non-breaking space -- not the ordinary space. 221 of 237 bookings carry it. It is not only trailing: in a two-word segment the space BETWEEN the words is a non-breaking space as well, so 'SUPPLY CHAIN' contains no ordinary space at all.",
    soWhat:
      "TRIM() does not remove U+00A0, so code that cleans the value still ends up with 'CEMENTING' followed by eleven invisible characters. It will not match 'CEMENTING' from any other system, it groups as its own value, and on screen it looks identical to the clean one. This was found only by measuring the string: length('CEMENTING           ') is 20 and length(TRIM(...)) is also 20.",
    sql: `
      SELECT segment AS "Value as stored",
             LENGTH(segment) AS "Characters",
             LENGTH(REPLACE(segment, CHR(160), '')) AS "Characters once U+00A0 is removed",
             TRIM(REPLACE(segment, CHR(160), ' ')) AS "What it should be",
             LENGTH(segment) - LENGTH(REPLACE(segment, CHR(160), '')) AS "Non-breaking spaces",
             COUNT(*) AS "Bookings"
        FROM bookings
       WHERE segment ~ CHR(160)
       GROUP BY 1, 2, 3, 4, 5
       ORDER BY 6 DESC, 1`,
  },
  {
    key: 'usd_missing',
    tab: 'USD amount missing',
    title: '3. USD amount missing',
    severity: 'Critical',
    question:
      'Bookings that carry a local-currency amount but whose totalAmountUSD is zero or NULL. Nothing is unpriced -- the money is there in AED -- it simply never got converted.',
    soWhat:
      'Every USD figure anyone reads is short by this much. The feed reports $122,110 of travel; these 90 bookings hold a further AED 361,057, roughly $98,000, which is invisible in every total, chart and per-traveller average.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code",
             b."bookingStatus" AS "Status", b.currency AS "Currency",
             b."totalAmount" AS "Total (local)", b."totalAmountUSD" AS "Total (USD)",
             ROUND(b."totalAmount" / 3.6725, 2) AS "Would be (USD at 3.6725)",
             b."employeeName" AS "Traveller", b."companyName" AS "Company",
             b."departureAirportCode" AS "From", b."arrivalAirportCode" AS "To",
             b."departureDate"::text AS "Departure", b."creationDate"::date::text AS "Created"
        FROM bookings b
       WHERE COALESCE(b."totalAmountUSD", 0) = 0
         AND COALESCE(b."totalAmount", 0) > 0
       ORDER BY b."totalAmount" DESC`,
  },
  {
    key: 'orphan_rows',
    tab: 'Orphan rows',
    title: '4. Rows attached to no booking',
    severity: 'Critical',
    question:
      'Child rows whose `code` is NULL, or names a booking that does not exist. They belong to a trip nobody can identify.',
    soWhat:
      'These rows can never be joined to anything. 62 flight segments and 62 legs describe journeys that cannot be attributed to a booking, and 37 traveller records name people whose trip is unknown.',
    sql: `
      WITH child AS (
        SELECT 'flightsegments' AS t, code FROM flightsegments
        UNION ALL SELECT 'flightsegmentlegs', code FROM flightsegmentlegs
        UNION ALL SELECT 'cheapestflightsegments', code FROM cheapestflightsegments
        UNION ALL SELECT 'travellers', code FROM travellers
        UNION ALL SELECT 'policyviolations', code FROM policyviolations
        UNION ALL SELECT 'savings_analysis', code FROM savings_analysis
        UNION ALL SELECT 'farerules', code FROM farerules
        UNION ALL SELECT 'approvers', code FROM approvers
      )
      SELECT c.t AS "Table",
             CASE WHEN c.code IS NULL THEN '(NULL -- no booking code at all)' ELSE c.code END AS "Booking code",
             COUNT(*) AS "Orphan rows",
             CASE WHEN c.code IS NULL THEN 'The column is empty'
                  ELSE 'Names a booking that is not in the bookings table' END AS "Problem"
        FROM child c
        LEFT JOIN bookings b ON b.code = c.code
       WHERE c.code IS NULL OR b.code IS NULL
       GROUP BY 1, 2, 4
       ORDER BY 3 DESC, 1`,
  },
  {
    key: 'bto_no_segments',
    tab: 'No itinerary',
    title: '5. Bookings with no itinerary',
    severity: 'High',
    question:
      'Bookings made IN the portal that carry no row in flightsegments, so there is no record of which flights were taken.',
    soWhat:
      'An offline booking with no itinerary is expected -- it was arranged by email. A portal booking with none is not: the portal issued the ticket, so it had the flights. 82 of 159 portal bookings are missing theirs, and with them goes any route, carrier or duration analysis.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code",
             b."bookingStatus" AS "Status", b."travelType" AS "Travel type",
             b.direction AS "Direction",
             b."departureAirportCode" AS "From", b."arrivalAirportCode" AS "To",
             b."departureDate"::text AS "Departure", b."totalAmountUSD" AS "Total (USD)",
             b."totalAmount" AS "Total (local)", b.currency AS "Currency",
             b."employeeName" AS "Traveller", b."companyName" AS "Company"
        FROM bookings b
       WHERE NOT EXISTS (SELECT 1 FROM flightsegments s WHERE s.code = b.code)
       ORDER BY ${CHANNEL}, b."creationDate"`,
  },
  {
    key: 'bto_no_approvers',
    tab: 'No approval trail',
    title: '6. Approved with no approval trail',
    severity: 'High',
    question:
      'Bookings whose status is Approved but which carry no row in `approvers`, so there is no record of who approved them.',
    soWhat:
      'All 78 offline bookings have none, which follows -- they were approved outside the portal. 87 of 159 PORTAL bookings also have none, and those were approved inside it. The approval happened; the record of it did not survive.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code",
             b."bookingStatus" AS "Booking status",
             b."departureDate"::text AS "Departure",
             b."totalAmountUSD" AS "Total (USD)", b."totalAmount" AS "Total (local)",
             b.currency AS "Currency",
             b."employeeName" AS "Traveller", b."companyName" AS "Company",
             b."createdUserName" AS "Booked by"
        FROM bookings b
       WHERE NOT EXISTS (SELECT 1 FROM approvers a WHERE a.code = b.code)
       ORDER BY ${CHANNEL}, b."totalAmountUSD" DESC NULLS LAST`,
  },
  {
    key: 'departed_before_booked',
    tab: 'Departed before booked',
    title: '7. Departure before the booking exists',
    severity: 'High',
    question:
      'The departure date is earlier than the date the booking was created. Either the trip was entered after it happened, or one of the two dates is wrong.',
    soWhat:
      'Any lead-time or advance-booking figure counts these as negative days. The portal has its own advance-booking check and flags none of them, so nothing in the system currently notices.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code",
             b."employeeName" AS "Traveller",
             to_char(b."creationDate", 'YYYY-MM-DD HH24:MI') AS "Created", b."departureDate"::text AS "Departure",
             (b."departureDate" - b."creationDate"::date) AS "Days between (negative)",
             b."bookingStatus" AS "Status", b."travelType" AS "Travel type",
             b."departureAirportCode" AS "From", b."arrivalAirportCode" AS "To",
             b."totalAmountUSD" AS "Total (USD)"
        FROM bookings b
       WHERE b."departureDate" IS NOT NULL AND b."creationDate" IS NOT NULL
         AND b."departureDate" < b."creationDate"::date
       ORDER BY (b."departureDate" - b."creationDate"::date)`,
  },
  {
    key: 'leg_times',
    tab: 'Legs with no times',
    title: '8. Flight legs with no times',
    severity: 'High',
    question: 'Legs missing a departure or arrival time, or arriving before they depart.',
    soWhat:
      'These are what every duration, connection time and overnight-travel figure is built from. A leg with no times contributes nothing and is silently skipped.',
    sql: `
      SELECT COALESCE(l.code, '(no booking code)') AS "Booking code",
             l.id AS "Leg id", l."legOrder" AS "Leg order",
             COALESCE(NULLIF(TRIM(l.origin), ''), '(blank)') AS "From",
             COALESCE(NULLIF(TRIM(l.destination), ''), '(blank)') AS "To",
             l.carrier AS "Carrier", l."flightNumber" AS "Flight",
             to_char(l."departureDateTime", 'YYYY-MM-DD HH24:MI') AS "Departs", to_char(l."arrivalDateTime", 'YYYY-MM-DD HH24:MI') AS "Arrives",
             CASE
               WHEN l."departureDateTime" IS NULL AND l."arrivalDateTime" IS NULL THEN 'No times at all'
               WHEN l."departureDateTime" IS NULL THEN 'No departure time'
               WHEN l."arrivalDateTime" IS NULL THEN 'No arrival time'
               ELSE 'Arrives before it departs'
             END AS "Problem"
        FROM flightsegmentlegs l
       WHERE l."departureDateTime" IS NULL OR l."arrivalDateTime" IS NULL
          OR l."arrivalDateTime" < l."departureDateTime"
       ORDER BY "Problem", l.code NULLS FIRST, l."legOrder"`,
  },
  {
    key: 'segment_price_gaps',
    tab: 'Segments with no price',
    title: '9. Flight segments with no price',
    severity: 'Medium',
    question:
      'Segments carrying no finalPrice, a price of zero, or no currency to read the price in.',
    soWhat:
      'Every portal segment has a price; the gaps are all on offline and orphaned rows. A segment without a price cannot be compared against the cheapest alternative, which is how a missed saving is found.',
    sql: `
      SELECT COALESCE(s.code, '(no booking code)') AS "Booking code",
             s.id AS "Segment id", s.direction AS "Direction",
             s.origin AS "From", s.destination AS "To",
             s."platingCarrierName" AS "Carrier",
             COALESCE(NULLIF(TRIM(s.currency), ''), '(blank)') AS "Currency",
             s."finalPrice" AS "Final price",
             CASE
               WHEN s."finalPrice" IS NULL THEN 'No price at all'
               WHEN s."finalPrice" = 0 THEN 'Price is zero'
               ELSE 'Has a price but no currency'
             END AS "Problem"
        FROM flightsegments s
       WHERE s."finalPrice" IS NULL OR s."finalPrice" = 0
          OR COALESCE(TRIM(s.currency), '') = ''
       ORDER BY "Problem", s.code NULLS FIRST, s.id`,
  },
  {
    key: 'savings_coverage',
    tab: 'No fare comparison',
    title: '10. No cheapest-fare comparison',
    severity: 'Medium',
    question:
      'Bookings that have flight segments but no alternatives in `cheapestflightsegments`, so the chosen fare has nothing to be compared against.',
    soWhat:
      'No savings figure can be produced for these, and they cannot be shown as compliant or non-compliant on fare choice. They are absent from the savings report rather than passing it.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code",
             b."bookingStatus" AS "Status", COUNT(s.id) AS "Segments recorded",
             b."totalAmountUSD" AS "Total (USD)", b."totalAmount" AS "Total (local)",
             b.currency AS "Currency",
             b."departureAirportCode" AS "From", b."arrivalAirportCode" AS "To",
             b."departureDate"::text AS "Departure", b."companyName" AS "Company"
        FROM bookings b
        JOIN flightsegments s ON s.code = b.code
       WHERE NOT EXISTS (SELECT 1 FROM cheapestflightsegments c WHERE c.code = b.code)
       GROUP BY b.code, b."bookingStatus", b."totalAmountUSD", b."totalAmount", b.currency,
                b."departureAirportCode", b."arrivalAirportCode", b."departureDate", b."companyName"
       ORDER BY b."totalAmountUSD" DESC NULLS LAST`,
  },
  {
    key: 'price_components',
    tab: 'Price breakdown zero',
    title: '11. Price components are all zero',
    severity: 'Medium',
    question:
      'A final price is present, but base fare, tax, service charge and discount add up to something else -- almost always zero.',
    soWhat:
      'The breakdown is what lets anybody separate the fare from the fees, or see what the agency charged. Where the components are zero there is a total and no way to see what it is made of.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code", b.currency AS "Currency",
             b."finalBaseFare" AS "Base fare", b."finalTaxFee" AS "Tax and fees",
             b."finalServiceCharge" AS "Service charge", b."finalDiscount" AS "Discount",
             b."finalPrice" AS "Final price",
             ROUND(COALESCE(b."finalBaseFare",0) + COALESCE(b."finalTaxFee",0)
                   + COALESCE(b."finalServiceCharge",0) - COALESCE(b."finalDiscount",0), 2) AS "Components add to",
             ROUND(b."finalPrice" - (COALESCE(b."finalBaseFare",0) + COALESCE(b."finalTaxFee",0)
                   + COALESCE(b."finalServiceCharge",0) - COALESCE(b."finalDiscount",0)), 2) AS "Unexplained"
        FROM bookings b
       WHERE b."finalPrice" IS NOT NULL
         AND ABS(b."finalPrice" - (COALESCE(b."finalBaseFare",0) + COALESCE(b."finalTaxFee",0)
             + COALESCE(b."finalServiceCharge",0) - COALESCE(b."finalDiscount",0))) > 1
       ORDER BY ABS(b."finalPrice" - (COALESCE(b."finalBaseFare",0) + COALESCE(b."finalTaxFee",0)
             + COALESCE(b."finalServiceCharge",0) - COALESCE(b."finalDiscount",0))) DESC`,
  },
  {
    key: 'return_one_leg',
    tab: 'Return with one leg',
    title: '12. Return trips with one leg',
    severity: 'Medium',
    question: 'Direction says the trip comes back, and only one flight segment is recorded.',
    soWhat:
      'The journey home is missing from the data. Plotted on a map or counted as flights, these read as one-way trips.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code", b.direction AS "Direction",
             COUNT(s.id) AS "Segments recorded",
             b."departureAirportCode" AS "From", b."arrivalAirportCode" AS "To",
             b."departureDate"::text AS "Departure", b."returnDate"::text AS "Return date",
             b."employeeName" AS "Traveller", b."totalAmountUSD" AS "Total (USD)"
        FROM bookings b
        JOIN flightsegments s ON s.code = b.code
       WHERE LOWER(COALESCE(b.direction, '')) IN ('return', 'roundtrip')
       GROUP BY b.code, b.direction, b."departureAirportCode", b."arrivalAirportCode",
                b."departureDate", b."returnDate", b."employeeName", b."totalAmountUSD"
      HAVING COUNT(s.id) < 2
       ORDER BY b.code`,
  },
  {
    key: 'return_dates',
    tab: 'Return dates',
    title: '13. Return date problems',
    severity: 'Medium',
    question: 'A return trip with no return date, or one that returns on or before it departs.',
    soWhat:
      'Trip length cannot be computed, and a trip that returns before it leaves will produce a negative duration wherever one is calculated.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code", b.direction AS "Direction",
             b."departureDate"::text AS "Departure", b."returnDate"::text AS "Return",
             CASE
               WHEN b."returnDate" IS NULL THEN 'Return trip with no return date'
               WHEN b."returnDate" < b."departureDate" THEN 'Returns before it departs'
               ELSE 'Returns the same day it departs'
             END AS "Problem",
             b."employeeName" AS "Traveller", b."totalAmountUSD" AS "Total (USD)"
        FROM bookings b
       WHERE LOWER(COALESCE(b.direction, '')) IN ('return', 'roundtrip')
         AND (b."returnDate" IS NULL OR b."returnDate" <= b."departureDate")
       ORDER BY "Problem", b.code`,
  },
  {
    key: 'traveller_gaps',
    tab: 'Traveller fields',
    title: '14. Traveller records missing fields',
    severity: 'Medium',
    question:
      'Traveller rows with no email, no employee id or no ticket number. Passport details are checked too and are complete -- no passport NUMBERS are reproduced here.',
    soWhat:
      '179 of 194 traveller rows carry no employee id, so a traveller cannot reliably be matched to the staff directory; 90 carry no email, so nothing can be sent to them directly.',
    sql: `
      SELECT COALESCE(t.code, '(no booking code)') AS "Booking code",
             TRIM(COALESCE(t."firstName",'') || ' ' || COALESCE(t."lastName",'')) AS "Traveller",
             CASE WHEN COALESCE(TRIM(t."employeeId"), '') = '' THEN 'Missing' ELSE t."employeeId" END AS "Employee id",
             CASE WHEN COALESCE(TRIM(t.email), '') = '' THEN 'Missing' ELSE 'Present' END AS "Email",
             CASE WHEN COALESCE(TRIM(t."ticketNumber"), '') = '' THEN 'Missing' ELSE t."ticketNumber" END AS "Ticket number",
             CASE WHEN COALESCE(TRIM(t."passportNumber"), '') = '' THEN 'Missing' ELSE 'Present' END AS "Passport on file",
             t."travellerType" AS "Traveller type",
             ARRAY_TO_STRING(ARRAY_REMOVE(ARRAY[
               CASE WHEN COALESCE(TRIM(t."employeeId"), '') = '' THEN 'employee id' END,
               CASE WHEN COALESCE(TRIM(t.email), '') = '' THEN 'email' END,
               CASE WHEN COALESCE(TRIM(t."ticketNumber"), '') = '' THEN 'ticket number' END
             ], NULL), ', ') AS "What is missing"
        FROM travellers t
       WHERE COALESCE(TRIM(t."employeeId"), '') = ''
          OR COALESCE(TRIM(t.email), '') = ''
          OR COALESCE(TRIM(t."ticketNumber"), '') = ''
       ORDER BY t.code NULLS FIRST`,
  },
  {
    key: 'missing_attribution',
    tab: 'Cost attribution',
    title: '15. Missing cost attribution',
    severity: 'Medium',
    question:
      'Bookings missing a cost centre, company code, segment or employee id -- the fields the spend is charged against.',
    soWhat:
      'A blank cost centre or company code cannot be mapped to a country, so the trip drops out of every country report rather than appearing under the wrong one.',
    sql: `
      SELECT ${CHANNEL} AS "Channel", b.code AS "Booking code", b."employeeName" AS "Traveller",
             COALESCE(NULLIF(TRIM(b."costCenter"), ''), '(blank)') AS "Cost centre",
             COALESCE(NULLIF(TRIM(b."companyCode"), ''), '(blank)') AS "Company code",
             COALESCE(NULLIF(TRIM(b."companyName"), ''), '(blank)') AS "Company name",
             COALESCE(NULLIF(TRIM(b.segment), ''), '(blank)') AS "Segment",
             COALESCE(NULLIF(TRIM(b."employeeId"), ''), '(blank)') AS "Employee id",
             b."totalAmountUSD" AS "Total (USD)", b."totalAmount" AS "Total (local)",
             b."departureDate"::text AS "Departure"
        FROM bookings b
       WHERE COALESCE(TRIM(b."costCenter"), '') = ''
          OR COALESCE(TRIM(b."companyCode"), '') = ''
          OR COALESCE(TRIM(b.segment), '') = ''
          OR COALESCE(TRIM(b."employeeId"), '') = ''
       ORDER BY b."totalAmount" DESC NULLS LAST`,
  },
  {
    key: 'blank_airport_codes',
    tab: 'Airport codes',
    title: '16. Airport codes blank or not 3 letters',
    severity: 'Medium',
    question:
      'Every IATA airport code is three letters. Anything else cannot be looked up, mapped or grouped.',
    soWhat:
      'A leg with a blank origin and destination is a flight between nowhere and nowhere. It is dropped from every map and every route count.',
    sql: `
      WITH codes AS (
        SELECT 'bookings.departureAirportCode' AS f, "departureAirportCode" AS code FROM bookings
        UNION ALL SELECT 'bookings.arrivalAirportCode', "arrivalAirportCode" FROM bookings
        UNION ALL SELECT 'flightsegments.origin', origin FROM flightsegments
        UNION ALL SELECT 'flightsegments.destination', destination FROM flightsegments
        UNION ALL SELECT 'flightsegmentlegs.origin', origin FROM flightsegmentlegs
        UNION ALL SELECT 'flightsegmentlegs.destination', destination FROM flightsegmentlegs
      )
      SELECT f AS "Column",
             CASE WHEN code IS NULL THEN '(NULL)' ELSE '[' || code || ']' END AS "Value, in brackets",
             COUNT(*) AS "Rows",
             CASE WHEN code IS NULL THEN 'Empty' ELSE 'Not a three-letter code' END AS "Problem"
        FROM codes
       WHERE code IS NULL OR TRIM(code) !~ '^[A-Za-z]{3}$'
       GROUP BY 1, 2, 4
       ORDER BY 3 DESC, 1`,
  },
  {
    key: 'employee_identity',
    tab: 'Employee id vs name',
    title: '17. Employee id and name disagree',
    severity: 'Low',
    question:
      'One employee id carrying more than one spelling of a name, or one name appearing under more than one id.',
    soWhat:
      'The traveller directory counts one person as two, and splits their trips between them.',
    sql: `
      WITH pairs AS (
        SELECT TRIM("employeeId") AS emp_id, TRIM("employeeName") AS emp_name, COUNT(*) AS n
          FROM bookings
         WHERE COALESCE(TRIM("employeeId"), '') <> '' AND COALESCE(TRIM("employeeName"), '') <> ''
         GROUP BY 1, 2
      )
      SELECT p.emp_id AS "Employee id", p.emp_name AS "Name as spelled", p.n AS "Bookings",
             CASE
               WHEN (SELECT COUNT(DISTINCT o.emp_name) FROM pairs o WHERE o.emp_id = p.emp_id) > 1
                 THEN 'This id carries more than one name'
               ELSE 'This name appears under more than one id'
             END AS "Problem",
             (SELECT string_agg(DISTINCT o.emp_name, ' / ') FROM pairs o
               WHERE o.emp_id = p.emp_id AND o.emp_name <> p.emp_name) AS "Other names on this id",
             (SELECT string_agg(DISTINCT o.emp_id, ' / ') FROM pairs o
               WHERE UPPER(o.emp_name) = UPPER(p.emp_name) AND o.emp_id <> p.emp_id) AS "Other ids with this name"
        FROM pairs p
       WHERE (SELECT COUNT(DISTINCT o.emp_name) FROM pairs o WHERE o.emp_id = p.emp_id) > 1
          OR (SELECT COUNT(DISTINCT o.emp_id) FROM pairs o WHERE UPPER(o.emp_name) = UPPER(p.emp_name)) > 1
       ORDER BY p.emp_id, p.emp_name`,
  },
  {
    key: 'duplicate_travellers',
    tab: 'Duplicate travellers',
    title: '18. Duplicate traveller rows',
    severity: 'Low',
    question: 'The same person recorded more than once against one booking.',
    soWhat: 'Any per-traveller count reads high by the number of duplicates.',
    sql: `
      SELECT COALESCE(code, '(no booking code)') AS "Booking code",
             TRIM(COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')) AS "Traveller",
             COALESCE(NULLIF(TRIM("employeeId"), ''), '(blank)') AS "Employee id",
             COUNT(*) AS "Rows for this person on this booking",
             string_agg(DISTINCT COALESCE(NULLIF(TRIM("ticketNumber"), ''), '(no ticket)'), ', ') AS "Ticket numbers"
        FROM travellers
       GROUP BY 1, 2, 3
      HAVING COUNT(*) > 1
       ORDER BY 4 DESC, 1`,
  },
  {
    key: 'padded_text',
    tab: 'Padded text',
    title: '19. Padded text values',
    severity: 'Low',
    question:
      'Values carrying leading or trailing whitespace, or differing from another value only by case or padding.',
    soWhat:
      'Each spelling becomes its own row in any grouped report, so one company appears twice and its spend is split between the two.',
    sql: `
      WITH vals AS (
        SELECT 'companyName' AS f, "companyName" AS raw FROM bookings WHERE "companyName" IS NOT NULL
        UNION ALL SELECT 'segment', segment FROM bookings WHERE segment IS NOT NULL
        UNION ALL SELECT 'costCenter', "costCenter" FROM bookings WHERE "costCenter" IS NOT NULL
        UNION ALL SELECT 'travelType', "travelType" FROM bookings WHERE "travelType" IS NOT NULL
        UNION ALL SELECT 'cabinClass', "cabinClass" FROM bookings WHERE "cabinClass" IS NOT NULL
        UNION ALL SELECT 'bookingStatus', "bookingStatus" FROM bookings WHERE "bookingStatus" IS NOT NULL
        UNION ALL SELECT 'direction', direction FROM bookings WHERE direction IS NOT NULL
        UNION ALL SELECT 'companyCode', "companyCode" FROM bookings WHERE "companyCode" IS NOT NULL
      ),
      counted AS (SELECT f, raw, COUNT(*) AS n FROM vals GROUP BY 1, 2)
      SELECT c.f AS "Column",
             '[' || c.raw || ']' AS "Value, in brackets so padding shows",
             c.n AS "Bookings",
             CASE WHEN c.raw <> TRIM(c.raw) THEN 'Leading or trailing whitespace'
                  ELSE 'Differs from another value only by case' END AS "Problem",
             (SELECT string_agg('[' || o.raw || ']', '  /  ') FROM counted o
               WHERE o.f = c.f AND LOWER(TRIM(o.raw)) = LOWER(TRIM(c.raw)) AND o.raw <> c.raw) AS "Collides with"
        FROM counted c
       WHERE c.raw <> TRIM(c.raw)
          OR EXISTS (SELECT 1 FROM counted o
                      WHERE o.f = c.f AND LOWER(TRIM(o.raw)) = LOWER(TRIM(c.raw)) AND o.raw <> c.raw)
       ORDER BY 1, 2`,
  },
  {
    key: 'route_mismatch',
    tab: 'Route check (clean)',
    title: '20. Header route vs segments',
    severity: 'Clean',
    question:
      'Checked: does the origin and destination on the booking header agree with the first flight segment?',
    soWhat: 'No disagreements found. Nothing to fix here.',
    sql: `
      WITH ends AS (
        SELECT s.code,
               (ARRAY_AGG(s.origin ORDER BY
                  CASE WHEN LOWER(COALESCE(s.direction,'')) = 'outbound' THEN 0 ELSE 1 END, s.id))[1] AS o,
               (ARRAY_AGG(s.destination ORDER BY
                  CASE WHEN LOWER(COALESCE(s.direction,'')) = 'outbound' THEN 0 ELSE 1 END, s.id))[1] AS d
          FROM flightsegments s WHERE s.code IS NOT NULL GROUP BY s.code
      )
      SELECT b.code AS "Booking code",
             b."departureAirportCode" AS "Header from", e.o AS "Segment from",
             b."arrivalAirportCode" AS "Header to", e.d AS "Segment to"
        FROM bookings b JOIN ends e ON e.code = b.code
       WHERE UPPER(TRIM(COALESCE(b."departureAirportCode", ''))) <> UPPER(TRIM(COALESCE(e.o, '')))
          OR UPPER(TRIM(COALESCE(b."arrivalAirportCode", ''))) <> UPPER(TRIM(COALESCE(e.d, '')))
       ORDER BY b.code`,
  },
  {
    key: 'passport_completeness',
    tab: 'Passports (clean)',
    title: '21. Passport details',
    severity: 'Clean',
    question:
      'Checked: every traveller row for a missing passport number, a missing expiry date, or an expiry falling before the travel date.',
    soWhat:
      'All 194 traveller rows carry a passport number and an expiry date, and none expires before the trip. Nothing to fix here.',
    sql: `
      SELECT t.code AS "Booking code",
             TRIM(COALESCE(t."firstName",'') || ' ' || COALESCE(t."lastName",'')) AS "Traveller",
             CASE WHEN COALESCE(TRIM(t."passportNumber"), '') = '' THEN 'Missing' ELSE 'Present' END AS "Passport number",
             t."passportExpiryDate"::text AS "Expires", b."departureDate"::text AS "Departure"
        FROM travellers t
        LEFT JOIN bookings b ON b.code = t.code
       WHERE COALESCE(TRIM(t."passportNumber"), '') = ''
          OR t."passportExpiryDate" IS NULL
          OR (b."departureDate" IS NOT NULL AND t."passportExpiryDate" < b."departureDate")
       ORDER BY t.code`,
  },
];

(async () => {
  const pool = new pg.Pool({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT || 5432),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: 'travel_portal',
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 3,
  });

  const totals = (
    await pool.query(`
      SELECT (SELECT COUNT(*) FROM bookings) AS bookings,
             (SELECT COUNT(*) FROM bookings WHERE LEFT(code,3)='BTO') AS bto,
             (SELECT COUNT(*) FROM bookings WHERE LEFT(code,3)='OFF') AS off,
             (SELECT COUNT(*) FROM travellers) AS travellers,
             (SELECT COUNT(*) FROM flightsegments) AS segments,
             (SELECT COUNT(*) FROM flightsegmentlegs) AS legs,
             (SELECT COUNT(*) FROM cheapestflightsegments) AS cheapest,
             (SELECT COUNT(*) FROM policyviolations) AS violations,
             (SELECT COUNT(*) FROM savings_analysis) AS savings,
             (SELECT COUNT(*) FROM approvers) AS approvers,
             (SELECT MIN("creationDate")::date::text FROM bookings) AS first_booking,
             (SELECT MAX("creationDate")::date::text FROM bookings) AS last_booking,
             (SELECT ROUND(SUM("totalAmountUSD"))::text FROM bookings) AS total_usd,
             (SELECT ROUND(SUM("totalAmount"))::text FROM bookings) AS total_local,
             (SELECT ROUND(SUM("totalAmount"))::text FROM bookings WHERE COALESCE("totalAmountUSD",0)=0) AS unconverted_local`)
  ).rows[0];

  const results = [];
  for (const check of CHECKS) {
    try {
      const { rows, fields } = await pool.query(check.sql);
      results.push({ ...check, columns: fields.map((f) => f.name), rows, count: rows.length });
      console.log(`${check.key}: ${rows.length}`);
    } catch (err) {
      results.push({ ...check, error: err.message, rows: [], columns: [], count: 0 });
      console.error(`${check.key}: FAILED ${err.message}`);
    }
  }

  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), totals, results }, null, 2),
    'utf8',
  );
  console.log('wrote', outPath);
  await pool.end();
})();
