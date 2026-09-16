/* ─── The schema guard for Laptop Procurement.

   This file used to hold every CREATE TABLE and ALTER TABLE the tool runs, behind six
   hand-rolled `let xEnsured: Promise<void> | null` memos that re-ran the DDL on the first
   request every serverless instance served.

   That DDL now lives in database/migrations/laptop-procurement/001_baseline.sql, applied once
   at deploy by `npm run migrate`. What is left here is the assertion that it was: one cheap,
   process-memoised row lookup that turns "nobody ran the migrations" into one clear sentence
   instead of a confusing column-does-not-exist error deep inside a feature.

   There were six functions here, one per group of DDL — approver-matrix columns, the
   permissions role constraint, the delegation table, the reference index, the decision columns,
   the access-request table — and a caller picked whichever one guarded the columns it was about
   to touch. That distinction only meant something while each ran its own statements. A caller
   now needs one thing: that the migrations ran. So there is one function. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { requireSchema } from '@/lib/db/schema-version';

/** Assert that the laptop-procurement database has had its migrations applied. */
export function ensureLaptopSchema(): Promise<void> {
  return requireSchema(laptopProcurementPool, 'laptop-procurement', '001_baseline');
}
