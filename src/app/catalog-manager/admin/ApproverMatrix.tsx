/*
 * The country approver matrix lives in the platform admin panel, at /admin → Catalog Repo →
 * Country Approvers, alongside the access queue it is part of -- naming someone here grants them
 * that country, so the two belong on the same screen.
 *
 * This re-export keeps the tool's own admin tab (and the Overview card that links to it) pointing
 * at that one implementation rather than a second copy that would drift from it.
 */
export { default } from '@/app/admin/CatalogApproverMatrixClient';
