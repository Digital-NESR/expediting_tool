/*
 * Where the help pages fetch their training material from.
 *
 * These were compiled-in string constants spread across three pages, and all but
 * one of them point at a single employee's personal OneDrive
 * (…/personal/mfarhan1_nesr_com/…). When that account is deprovisioned every one
 * of those videos goes dark, and today the only fix is a code change and a
 * redeploy. Reading them from the environment, with the current links as
 * defaults, means an operator can re-point them the moment the files move —
 * nothing changes until one is set.
 *
 * The RFx supplier guide already sits on a shared site library
 * (…/sites/digitalstudio/…) and is the shape the others should end up in.
 *
 * NEXT_PUBLIC_ is required, not incidental: these pages are client components
 * and the help pages are public, so the values must reach the browser bundle and
 * none of them is a secret. Next inlines them at build time, so a change needs a
 * rebuild rather than a restart.
 *
 * SharePoint embed URLs must be the "Embed" form (…/_layouts/15/embed.aspx?UniqueId=…),
 * taken from Share > Embed in Stream. A plain share link (…/:v:/g/personal/…) is
 * served with frame-blocking headers and renders as an empty box.
 */

/** TI-TE walkthrough, shown on both the public and the in-app TI-TE help pages. */
export const TITE_TRAINING_VIDEO_EMBED_URL =
  process.env.NEXT_PUBLIC_HELP_TITE_TRAINING_VIDEO_EMBED_URL ??
  'https://nesrcorp-my.sharepoint.com/personal/mfarhan1_nesr_com/_layouts/15/embed.aspx?UniqueId=6d6aa2cc-81db-4eb1-aec6-24014ef1aa7f&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create';

/**
 * TI-TE training PDF, both previewed inline and offered as a download. The
 * default is served from /public; an absolute URL works just as well.
 */
export const TITE_TRAINING_DOC_URL =
  process.env.NEXT_PUBLIC_HELP_TITE_TRAINING_DOC_URL ?? '/help/documentation.pdf';

/** RFx Officer full walkthrough, played inline. */
export const RFX_FULL_GUIDE_VIDEO_EMBED_URL =
  process.env.NEXT_PUBLIC_HELP_RFX_FULL_GUIDE_VIDEO_EMBED_URL ??
  'https://nesrcorp-my.sharepoint.com/personal/mfarhan1_nesr_com/_layouts/15/embed.aspx?UniqueId=793971d1-3475-4c69-8c1f-382878b94142&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create';

/**
 * The "open in SharePoint" fallback beneath the full walkthrough. This one is
 * the plain share link on purpose — it opens the full Stream page rather than
 * being framed.
 */
export const RFX_FULL_GUIDE_VIDEO_SHARE_URL =
  process.env.NEXT_PUBLIC_HELP_RFX_FULL_GUIDE_VIDEO_SHARE_URL ??
  'https://nesrcorp-my.sharepoint.com/:v:/g/personal/mfarhan1_nesr_com/IQDRcTl5dTRpTIwfOCh4uUFCAUJ0EWXTUU_V7YUUqBI1ocY';

/** Supplier-facing RFx guide (RFx officer - Supplier Guide.mp4), played inline. */
export const RFX_SUPPLIER_GUIDE_VIDEO_EMBED_URL =
  process.env.NEXT_PUBLIC_HELP_RFX_SUPPLIER_GUIDE_VIDEO_EMBED_URL ??
  'https://nesrcorp.sharepoint.com/sites/digitalstudio/_layouts/15/embed.aspx?UniqueId=6c8641fa-4747-460f-9b0a-1eeb7cff1d68&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create';
