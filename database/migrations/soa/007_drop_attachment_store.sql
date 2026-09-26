-- Drop the attachment store added in 006.
--
-- It was built for an admin upload form. The format turned out to be fixed, so the workbook is
-- versioned in the repository at assets/soa/soa-format.xlsx and stamped per vendor at send time:
-- changing what a supplier is asked to fill in is now a reviewed change rather than an upload
-- nobody can diff. Nothing ever wrote to this table, and leaving an empty one behind only invites
-- somebody to wire it up again.
DROP TABLE IF EXISTS soa_attachments;
