/**
 * What a chip on the chain should say about itself.
 *
 * The chain draws sixteen tools as near-identical pills, and until now that was a lie: four
 * of them need a per-user access request, two are admin-preview, five open a portal the
 * reader may not have an account on. Every one looked exactly like Laptop Procurement, which
 * anybody can open. On an admin-only view that was a wart. As the page everyone lands on it
 * is a trap -- you click ShipWaves and a modal tells you something the diagram could have
 * told you before you moved the mouse.
 *
 * So: one pure function, taking the same two inputs the card grid uses (`statusOf` from the
 * session, and whether this person is an administrator) and returning the single fact the
 * chip needs. Both surfaces read the same rule, so they cannot drift into disagreeing about
 * who may open what -- which is the failure mode that matters, because the grid's answer is
 * the one the access modals actually enforce.
 */

import { maturityOf, type ToolDef, type ToolStatus } from '../tools';

export type ChipState =
  /** Open it and it opens. */
  | 'open'
  /** A separate portal, or access this person has not asked for yet. */
  | 'locked'
  /** Asked for, not yet decided. */
  | 'pending'
  /** Asked for and refused; the card offers a reapply route. */
  | 'denied'
  /** Not shipped. Admins can preview it; nobody else can open it at all. */
  | 'coming-soon';

const DENIED: ToolStatus[] = ['denied', 'revoked', 'rejected'];

export function chipStateOf(tool: ToolDef, status: ToolStatus, isAdmin: boolean): ChipState {
  /* Maturity first: a tool that does not exist yet cannot be open, pending or refused, and
     saying "Coming Soon" is more use than saying "locked". */
  if (maturityOf(tool) === 'coming-soon') return isAdmin ? 'open' : 'coming-soon';

  switch (tool.access.kind) {
    case 'always':
      /* Open to every signed-in user. A `lock` badge on one of these means a separate portal
         with its own sign-in -- the app cannot know whether this person has an account, so
         it says "separate portal" rather than guessing. */
      return tool.badge.kind === 'lock' ? 'locked' : 'open';
    case 'adminPreview':
      return isAdmin ? 'open' : 'coming-soon';
    case 'status':
      if (isAdmin || status === 'approved') return 'open';
      if (status === 'pending') return 'pending';
      return DENIED.includes(status) ? 'denied' : 'locked';
  }
}

/** Whether a click will actually open the tool, rather than raise a modal or do nothing. */
export function chipOpens(state: ChipState): boolean {
  return state === 'open';
}

/** One short phrase per state, for the hover card and the accessible name. */
export const CHIP_STATE_LABEL: Record<ChipState, string> = {
  open: 'Open',
  locked: 'Access required',
  pending: 'Request pending',
  denied: 'Access declined',
  'coming-soon': 'Coming soon',
};
