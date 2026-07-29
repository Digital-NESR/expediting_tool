// One-time default content for the Learning Hub. Inserted by ensureLearningHubSchema()
// the first time the tables are empty (see src/app/actions/learning-hub.ts) — there is no
// separate script to run, so the tool is populated the first time it connects to a fresh DB.
//
// The Supply Chain track carries real, substantive lesson content. SAP and NESR Supply Chain
// are intentionally light placeholders meant to be replaced/expanded from the admin CMS.

export interface SeedLesson {
  title: string;
  body: string;
  videoUrl?: string;
  duration_minutes: number;
}

export interface SeedModule {
  title: string;
  resourceLabel?: string;
  resourceUrl?: string;
  lessons: SeedLesson[];
}

export interface SeedCourse {
  title: string;
  description: string;
  status: 'draft' | 'published';
  modules: SeedModule[];
}

export interface SeedTrack {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  courses: SeedCourse[];
}

export const SEED_TRACKS: SeedTrack[] = [
  /* ───────────────────────────── Supply Chain (real content) ───────────────────────────── */
  {
    key: 'supply_chain',
    name: 'Supply Chain',
    description: 'Core supply chain fundamentals — procurement, inventory, logistics, contracts, and supplier management.',
    icon: 'boxes',
    color: '#307c4c',
    courses: [
      {
        title: 'Supply Chain Fundamentals',
        description: 'A foundational course covering the five pillars of supply chain management, built for anyone who touches sourcing, materials, logistics, contracts, or suppliers.',
        status: 'published',
        modules: [
          {
            title: 'Procurement & Sourcing',
            lessons: [
              {
                title: 'What Is Procurement?',
                duration_minutes: 12,
                body: `Procurement is the set of activities an organization uses to acquire the goods and services it needs to operate — everything from raw materials and equipment to professional services and software licenses. It is easy to confuse procurement with purchasing, but the two are not the same thing. Purchasing is the transactional act of placing and paying for an order. Procurement is the broader discipline that surrounds it: identifying what is needed, deciding how to source it, selecting and qualifying suppliers, negotiating terms, managing the contract, and evaluating performance after delivery.

A useful way to think about procurement is as a bridge between the business and the supply market. On one side sit internal stakeholders — engineering, operations, finance — who have a requirement. On the other side sits a market of suppliers with different capabilities, prices, and risk profiles. Procurement's job is to translate the internal requirement into a specification the market can respond to, and then to translate the market's response back into a decision the business can act on with confidence.

Good procurement creates value in three distinct ways. First, cost: negotiating favorable pricing and payment terms, and avoiding demand that was never really necessary. Second, risk reduction: qualifying suppliers so the organization is not surprised by a quality failure, a compliance gap, or a supplier that cannot deliver on time. Third, continuity: making sure the business has what it needs, when it needs it, without introducing single points of failure. A procurement function that only focuses on unit price while ignoring the other two is optimizing for the wrong outcome.

Procurement typically splits into direct and indirect spend. Direct procurement covers materials and services that go directly into what the company sells or delivers — for an oilfield services company, this might be tubulars, valves, or specialized equipment. Indirect procurement covers everything that keeps the business running but is not part of the end product — IT hardware, office supplies, facilities services, professional services. The two require different approaches: direct spend usually demands tighter specifications, quality assurance, and supply continuity planning, while indirect spend is often about consolidating demand and simplifying the buying process.`,
              },
              {
                title: 'The Sourcing Process: From Need to Supplier',
                duration_minutes: 14,
                body: `Sourcing is the structured process an organization follows to move from "we need something" to "we have a supplier under contract." While every company's process looks slightly different, most follow a recognizable sequence: identify the need, define the requirement, research the supply market, solicit and evaluate offers, negotiate, and award.

It starts with demand. A requirement can originate from a project plan, a maintenance schedule, an engineering bill of materials, or simply a stock level dropping below a reorder point. Whatever the trigger, the first job of sourcing is to turn a vague need ("we need pumps") into a specification precise enough that suppliers can quote against it consistently — technical specifications, quantities, delivery locations, required certifications, and service-level expectations.

Once the requirement is defined, the sourcing team researches the supply market: who can realistically supply this, what does the competitive landscape look like, and is there an existing qualified supplier or does this require a new search? This research shapes the sourcing method. A well-understood, lower-risk purchase might go straight to a Request for Quotation (RFQ) with a shortlist of pre-qualified suppliers. A complex or strategic requirement — a new equipment platform, a multi-year services contract — usually warrants a full Request for Proposal (RFP), where suppliers are evaluated not just on price but on technical approach, capability, and risk.

Evaluation should be structured before the offers arrive, not after. A scoring model that weights price, technical compliance, delivery lead time, and supplier risk keeps the decision defensible and prevents the evaluation from quietly collapsing into "who was cheapest." Negotiation follows evaluation — not just on unit price, but on payment terms, warranty, liability caps, and delivery commitments. The sourcing process ends with an award and a contract or purchase order, but it is not truly finished until the first delivery is measured against what was promised.`,
              },
              {
                title: 'Strategic Sourcing vs. Tactical Purchasing',
                duration_minutes: 10,
                body: `Not every purchase deserves the same amount of process. A useful lens for deciding how much rigor to apply is the distinction between strategic sourcing and tactical purchasing.

Tactical purchasing covers routine, lower-risk, lower-value transactions: replenishing consumables, reordering a known part from an approved supplier, or placing a small services order against an existing rate. The goal here is speed and low transaction cost — the organization already knows what it wants and who it will buy from, so the emphasis is on frictionless execution rather than fresh negotiation.

Strategic sourcing applies to purchases that are higher value, higher risk, or strategically important — a new equipment category, a supplier that will be depended on for years, or spend large enough that a percentage point of savings is material. These deserve real market analysis, competitive bidding, cross-functional evaluation (engineering, quality, finance, and procurement all have a voice), and a negotiation built on leverage rather than habit.

A common tool for deciding which lane a purchase falls into is the Kraljic matrix, which segments spend along two axes: profit impact (how much this category affects cost or revenue) and supply risk (how many suppliers can provide it, and how easily). Items that are both high-impact and high-risk — often called "strategic" items — deserve the most sourcing attention and the closest supplier partnership. Items that are low-impact and low-risk — "routine" or "non-critical" items — should be handled with the least process overhead: catalogs, purchasing cards, or automated reordering. Misclassifying a routine item as strategic wastes organizational effort; misclassifying a strategic item as routine creates real exposure. Getting this segmentation right is one of the highest-leverage decisions a sourcing team makes.`,
              },
            ],
          },
          {
            title: 'Inventory & Materials Management',
            lessons: [
              {
                title: 'Why Inventory Management Matters',
                duration_minutes: 11,
                body: `Inventory is money sitting on a shelf. Every unit held in stock ties up working capital, consumes storage space, carries a risk of damage or obsolescence, and needs to be counted, insured, and managed. At the same time, not having the right inventory in the right place at the right time can stop a rig, delay a project, or lose a customer. Inventory management is the discipline of resolving that tension deliberately rather than by accident.

The core trade-off is between two kinds of cost. Holding costs include capital tied up, warehousing, insurance, and the risk of obsolescence or damage — these rise the more inventory you carry. Shortage costs include expedited freight, production downtime, missed service levels, and lost business — these rise the less inventory you carry (or the less well it is positioned). Good inventory management does not try to eliminate one at the expense of the other; it finds the point where the combined cost is lowest for a given item, given how critical and how predictable its demand is.

Not all inventory deserves the same attention. A common technique is ABC analysis, which ranks items by their value contribution: "A" items are typically the roughly 20% of items that account for 70–80% of inventory value or usage, "B" items are a mid-tier, and "C" items are the large number of low-value items that make up the long tail. A items justify tight control — frequent review, accurate forecasting, safety stock calculated deliberately. C items are usually better served by simple, low-effort rules (e.g., a fixed reorder point) because the cost of managing them tightly would exceed the value at stake.

A second, complementary lens is criticality — independent of dollar value, how badly does the business suffer if this item is unavailable when needed? A low-value seal or gasket that stops a piece of critical equipment may need the same disciplined stocking as a high-value item, precisely because its unavailability cost is disproportionate to its purchase price. Combining value (ABC) and criticality gives a much more realistic picture of what actually deserves inventory investment.`,
              },
              {
                title: 'Inventory Control Models: EOQ, Safety Stock, Reorder Point',
                duration_minutes: 15,
                body: `Once an item is deemed worth actively managing, three connected questions need answers: how much should we order at a time, how much of a buffer should we hold against uncertainty, and at what stock level should we trigger a new order?

The first question — how much to order — is often addressed with the Economic Order Quantity (EOQ) model. EOQ balances two competing costs: ordering cost (the fixed cost incurred each time an order is placed, regardless of size — processing, receiving, inspection) and holding cost (the cost of carrying each unit in stock for a period, usually expressed as a percentage of unit value). Order too often in small quantities and ordering costs pile up; order too rarely in large quantities and holding costs pile up. EOQ finds the order quantity that minimizes the sum of the two. While the classic formula assumes constant, known demand — rarely perfectly true in practice — it remains a useful starting point and a way to sanity-check whether current ordering patterns are wildly out of line with the underlying economics.

The second question — how much buffer to hold — is answered by safety stock. Safety stock exists to absorb the two sources of uncertainty that determine whether you run out: variability in demand during the replenishment lead time, and variability in the lead time itself. The more unpredictable either one is, and the more costly a stockout would be, the larger the safety stock needs to be to hold a given service level (the probability of not stocking out before the next delivery arrives). This is why a critical item from an unreliable, long-lead-time supplier needs meaningfully more safety stock than a similar-value item from a reliable, short-lead-time one — the risk profile, not just the value, drives the buffer.

The third question — when to trigger a new order — is the reorder point: the stock level at which a new order should be placed so that it arrives before the safety stock is fully consumed. It is calculated from expected demand during the lead time, plus the safety stock. Together, EOQ, safety stock, and reorder point turn "watch the shelf and reorder when it looks low" into a repeatable, defensible policy — one that can be tuned as demand patterns, lead times, and supplier reliability change.`,
              },
              {
                title: 'Materials Management and the Bill of Materials',
                duration_minutes: 12,
                body: `Materials management is the coordination of everything required to make sure the right materials are available to support operations, maintenance, or production — spanning planning, procurement, receiving, warehousing, and issuing materials to the point of use. Where inventory management focuses on the stock itself, materials management focuses on the flow: making sure demand signals reach the warehouse, and that what the warehouse holds actually maps to what operations will need.

Central to this coordination is the Bill of Materials (BOM) — a structured list of every component, sub-assembly, and raw material needed to build or maintain a given piece of equipment or complete a given job, along with the quantities required. A BOM turns "we're doing a workover on this well" into a concrete, orderable list of parts, rather than relying on someone's memory of what was used last time. Accurate BOMs are what make demand planning possible at all: without them, materials teams are reacting to requests as they arrive instead of anticipating them.

A material master record complements the BOM by holding the reference data for each individual item — description, unit of measure, specifications, preferred suppliers, lead time, and stocking policy. Keeping the material master clean matters more than it sounds: duplicate records for the same physical item (created because a slightly different description slipped past a search) fragment demand history, distort reorder calculations, and make it look like an item has less usage than it really does. A disciplined "search before you create" habit, backed by a governance process for approving new material masters, is one of the highest-value, lowest-glamour things a materials team can do.

Finally, materials management has to account for physical reality: receiving inspection to confirm what arrived matches what was ordered, put-away logic that makes items easy to find later, and cycle counting to catch discrepancies between what the system says is on the shelf and what is actually there — before an operations team discovers the gap the hard way, at the moment they need the part.`,
              },
            ],
          },
          {
            title: 'Logistics & Distribution',
            lessons: [
              {
                title: 'The Role of Logistics in the Supply Chain',
                duration_minutes: 10,
                body: `Logistics is the physical movement and storage of goods as they flow from suppliers, through the organization, and on to their point of use or the end customer. If procurement decides what to buy and from whom, logistics is what actually gets it there — and it is often where plans meet reality hardest, because it depends on external factors (carriers, ports, customs, weather, road conditions) that the organization does not fully control.

It helps to separate logistics into inbound and outbound flows. Inbound logistics covers materials moving from suppliers into the organization — international freight, customs clearance, inland transport, and receipt at a warehouse or site. Outbound logistics covers goods moving from the organization to where they are needed — to a customer, a field location, or a rig site. In an oilfield services context, inbound and outbound are often tightly linked: equipment and consumables come in from manufacturers and distributors, get staged and prepared, and then move out again to often remote, time-sensitive field locations, sometimes on a very short window.

The logistics function is judged on a handful of core trade-offs: speed versus cost (air freight is fast and expensive, ocean freight is slow and cheap), reliability versus flexibility (a fixed contracted lane is predictable but less able to flex for unusual shipments), and visibility versus complexity (more tracking and documentation improves control but adds administrative load). None of these trade-offs has a universally right answer — the right choice depends on how time-sensitive and how critical the shipment is. A common failure mode is applying a single default logistics approach to everything, when a small number of genuinely urgent shipments would justify a premium mode while the bulk of routine shipments do not need it.

Because logistics sits at the interface between the organization and the outside world, it is also where a lot of supply chain risk becomes visible — a customs delay, a port congestion event, or a carrier capacity crunch can turn a well-planned order into a stockout, even when procurement and inventory management did everything right upstream. Good logistics planning builds in the kind of lead-time buffer and mode flexibility to absorb ordinary disruption without it cascading into an operational problem.`,
              },
              {
                title: 'Transportation Modes and Trade-offs',
                duration_minutes: 11,
                body: `Choosing how to move goods is one of the most consequential — and most frequently defaulted-on — decisions in logistics. Each transportation mode has a distinct cost, speed, and risk profile, and the right choice depends on what is being shipped, how urgently, and at what value.

Ocean freight is the backbone of international trade in volume: it is by far the cheapest way to move large quantities over long distances, but it is also the slowest, typically taking weeks, and it introduces port and customs dependencies that can add further delay. It suits planned, non-urgent replenishment of bulk or heavy items where lead time can be built into the plan well in advance.

Air freight is fast — often days instead of weeks — but costs substantially more per unit of weight, and its cost scales with weight and volume in a way that makes it uneconomical for heavy, low-value goods. It earns its cost premium for genuinely urgent needs: an emergency part that would otherwise stop a critical operation, or a shipment whose value or time-sensitivity dwarfs the freight cost. Used routinely for shipments that were not actually urgent, it quietly becomes one of the largest avoidable cost leaks in a logistics budget.

Road (trucking) is typically the mode for inland movement — from a port or airport to a warehouse, or warehouse to final site — and it is where flexibility is highest: routes and schedules can adjust quickly to changing needs. Rail sits between road and ocean for large, heavy, non-urgent inland volumes, offering lower cost than trucking for long distances at the expense of some flexibility and speed.

In practice, most shipments do not travel by a single mode — they move through an intermodal chain (ocean, then customs clearance, then trucking to final destination, for example), and the total lead time is the sum of transit time plus the handoffs and dwell time between modes, which is often underestimated. A realistic logistics plan accounts for the connections, not just the primary transit legs.`,
              },
              {
                title: 'Warehousing and Distribution Networks',
                duration_minutes: 11,
                body: `A warehouse is not just a place to store things — it is a node in a distribution network, and where that node sits, and how many of them exist, shapes how quickly and cheaply the organization can serve demand. A distribution network is the arrangement of warehouses, distribution centers, and stocking points that connects suppliers to the points where goods are actually needed.

The central design question is centralization versus decentralization. A single, large, central warehouse benefits from economies of scale (lower cost per unit stored, easier to manage inventory accuracy, less duplicated safety stock) but is farther, on average, from the points of demand, meaning longer delivery times and higher outbound transport cost. Multiple smaller, regional or forward-stocked warehouses sit closer to demand, enabling faster response, but require more total safety stock (because demand uncertainty pools less efficiently across many smaller locations) and more overhead to manage. Neither answer is universally correct — the right network design depends on how time-sensitive demand is, how many locations need to be served, and how expensive it is to hold inventory versus to move it quickly.

Within a warehouse, layout and process matter as much as location. Slotting — deciding where within the warehouse each item is stored — should reflect how often an item moves: fast-moving items placed for quick picking near dispatch, slow-moving items placed further away where retrieval time matters less. Receiving, put-away, picking, packing, and dispatch each represent a step where errors can enter (wrong item put away, wrong item picked) or time can be lost, and warehouse management systems exist largely to keep those steps accurate and auditable.

Distribution networks also need to account for reverse flows: returns, repairs, and redeployment of equipment from one site to another. In an oilfield services context, equipment frequently needs to move between field locations, not just from a central warehouse outward, and a distribution network designed only for one-way flow will struggle to support that kind of lateral movement efficiently.`,
              },
            ],
          },
          {
            title: 'Contract Management',
            lessons: [
              {
                title: 'Why Contracts Matter in Supply Chain',
                duration_minutes: 9,
                body: `A contract is where a sourcing decision becomes an enforceable commitment. It is easy to treat the contract as paperwork that follows a negotiation — a formality to be signed after the "real" decisions have been made. In practice, the contract is the mechanism that determines whether those decisions actually hold up once the relationship is underway, and it deserves the same attention as the commercial negotiation itself.

Contracts serve three purposes that go well beyond price. First, they define the deal precisely: scope of what is being supplied, specifications, quantities, delivery locations and timing, and acceptance criteria — removing ambiguity about what "done" means. Second, they allocate risk: who bears the cost if a shipment is delayed, if a specification is not met, if a third party is injured, or if currency or commodity prices move. Third, they create recourse: what happens, and what remedies are available, when something goes wrong — without this, the only recourse is an informal conversation, which is a weak position to negotiate from after the fact.

A poorly constructed contract does not just fail to help when something goes wrong — it can actively make a bad situation worse, by being silent on the exact issue that occurred, or by allocating risk in a way that seemed reasonable in the room but proves unworkable in practice. This is why contract terms should be treated as commercial decisions, not administrative boilerplate that legal fills in as a formality. The people negotiating the deal are usually best placed to know which risks are real and worth addressing explicitly.

Contract management does not end at signature. Its most important work happens during the life of the contract: tracking obligations on both sides, monitoring performance against what was committed, managing changes (a change in scope, quantity, or timeline), and knowing when and how to invoke the contract's remedies if performance falls short. A contract that is filed away and never referred to again has, in practice, reverted to an informal relationship — the protections it was written to provide are only real if someone is actively managing to them.`,
              },
              {
                title: 'Key Contract Terms Every SC Professional Should Know',
                duration_minutes: 13,
                body: `A handful of contract terms recur across almost every supply chain agreement, and understanding what they actually do — not just recognizing the words — is essential for anyone negotiating or managing supplier relationships.

Incoterms (International Commercial Terms) define exactly where responsibility, cost, and risk for a shipment transfer from seller to buyer — for example, EXW (Ex Works) means the buyer takes responsibility from the seller's own facility, while DDP (Delivered Duty Paid) means the seller is responsible all the way to the buyer's door, duties included. Getting the Incoterm wrong, or leaving it ambiguous, is a common source of disputes over who pays for a delay, a damaged shipment, or an unexpected customs cost.

Payment terms specify when payment is due relative to delivery or invoicing — net 30, net 60, or milestone-based payments tied to delivery stages. These terms directly affect working capital for both parties, and are a legitimate, frequently under-used lever in negotiation: a supplier may accept a lower price in exchange for faster payment, or vice versa.

Warranty and liability clauses define what the supplier is responsible for if goods or services fail to perform, for how long, and up to what financial limit (a liability cap). Without a liability cap, in theory a supplier could face unlimited exposure from a single failure — in practice, this drives suppliers to negotiate caps aggressively, and the buyer's job is to make sure the cap is not set so low it is meaningless relative to the actual risk.

Termination clauses specify how and when either party can end the agreement — for convenience (without cause, usually with notice) or for cause (due to a breach). Force majeure clauses excuse performance when extraordinary, unforeseeable events (natural disasters, government action, and — in recent years, explicitly — pandemics) make it impossible to perform; how broadly or narrowly this is defined matters enormously in practice, since a narrowly written clause may not cover the very event it was meant to address.

Service level agreements (SLAs) — common in services and logistics contracts — set measurable performance targets (on-time delivery percentage, response time, defect rate) along with what happens if they are missed, such as service credits. An SLA without a real consequence for missing it is, functionally, just a stated aspiration.`,
              },
              {
                title: 'Managing Contract Performance and Risk',
                duration_minutes: 11,
                body: `Signing a good contract is necessary but not sufficient — the value of a contract is realized (or lost) in how it is managed afterward. Contract performance management is the ongoing discipline of tracking whether a supplier is actually delivering against what was agreed, and acting on the answer.

This starts with knowing what to track. The contract itself should define the metrics that matter: on-time delivery rate, quality/defect rate, responsiveness to issues, compliance with specifications, and — for services contracts — SLA attainment. These should be tracked consistently and reviewed on a cadence appropriate to the contract's importance: a strategic, high-spend supplier might warrant a quarterly business review, while a lower-risk supplier might only need an annual check-in.

Risk does not stay static over the life of a contract — a supplier's financial health can deteriorate, a key sub-supplier can be lost, a geopolitical event can disrupt a region the supplier depends on. Periodically reassessing supplier and contract risk — not just at the point of award — is what allows an organization to act early (qualifying a backup supplier, renegotiating terms, or building additional buffer stock) rather than discovering the risk only when it has already become a supply disruption.

When performance falls short, the contract's remedies only have value if they are actually used. This does not mean reaching immediately for penalties or termination — most supplier relationships are better served by a structured escalation: raise the issue, document it against the specific contract term, agree a corrective action with a timeline, and only escalate to formal remedies (service credits, liability claims, termination) if the issue persists. Skipping straight to informal complaints without ever tying them back to the contract weakens the buyer's position if the relationship eventually needs to be enforced formally. Conversely, a buyer who never invokes contractual remedies even for repeated, well-documented failures signals to the market that its contracts are not really enforced — which tends to erode performance further over time.`,
              },
            ],
          },
          {
            title: 'Supplier Relationship Management',
            lessons: [
              {
                title: 'What Is Supplier Relationship Management?',
                duration_minutes: 10,
                body: `Supplier Relationship Management (SRM) is the discipline of deliberately managing an organization's relationships with its suppliers over time, rather than treating each transaction as a standalone event. Where sourcing is about selecting a supplier and contract management is about the terms of the deal, SRM is about the ongoing relationship — communication, collaboration, joint problem-solving, and mutual performance improvement — across the life of that relationship.

The underlying premise of SRM is that not all supplier relationships are the same, and they should not be managed the same way. A supplier providing a commodity item available from a dozen alternative sources needs a very different relationship model than a supplier providing a specialized, hard-to-substitute capability that the business depends on for years. Treating both with the same light-touch, transactional approach under-invests in the strategic relationship; treating both with the same heavy, resource-intensive approach wastes effort on relationships that do not need it.

Effective SRM typically includes a few recurring elements: regular performance reviews (structured conversations, not just a scorecard sent by email), a shared understanding of each party's priorities and constraints, a mechanism for raising and resolving issues before they escalate, and — for the most important relationships — joint planning, where the supplier gets visibility into future demand and the buyer gets visibility into the supplier's capacity and constraints. This two-way visibility is often what actually prevents disruptions, because problems on either side can be addressed while there is still time to act.

SRM is frequently under-resourced because its value is easy to underestimate: a well-managed strategic supplier relationship rarely makes headlines, precisely because problems get caught and resolved quietly before they become visible failures. The cost of neglecting SRM, by contrast, tends to show up suddenly and expensively — a critical supplier that was never really engaged as a partner turning out to be less reliable, less flexible, or less willing to prioritize the business than assumed.`,
              },
              {
                title: 'Segmenting Suppliers: Not All Relationships Are Equal',
                duration_minutes: 12,
                body: `Because an organization may have hundreds or thousands of suppliers, SRM cannot mean giving every one of them the same level of attention — that would spread effort too thin to be meaningful anywhere. The first step in effective SRM is supplier segmentation: consciously deciding which suppliers warrant which level and kind of engagement.

A common segmentation approach mirrors the Kraljic spend segmentation introduced earlier, applied specifically to the relationship rather than just the purchase. Strategic suppliers — those providing high-impact, high-risk categories, often with few viable alternatives — deserve the deepest investment: joint business planning, executive-level relationship sponsorship, shared roadmaps, and proactive risk management. These are the suppliers where a disruption would genuinely hurt the business, and where a strong relationship can unlock capability (priority allocation in a tight market, early access to innovation) that a purely transactional relationship never would.

Leverage suppliers — high spend but lower risk, typically because alternatives exist — warrant active commercial management (regular competitive benchmarking, negotiation leverage maintained) but less relationship investment, since the buyer's power in the relationship is already strong. Bottleneck suppliers — lower spend but high risk, often because there are few alternative sources for a specific, sometimes obscure requirement — deserve disproportionate risk-management attention relative to their spend, because their failure risk is out of proportion to how much money is involved. Routine or non-critical suppliers — low spend, low risk, easily substituted — should be managed with the lightest possible process: standard terms, minimal customization, and automation wherever possible.

Getting this segmentation wrong in either direction has a real cost. Under-investing in a strategic relationship leaves the organization exposed to a disruption it could have anticipated and mitigated. Over-investing relationship effort in a routine, easily substituted supplier is a poor use of scarce procurement and category management time that would create more value applied elsewhere. Reviewing the segmentation periodically matters too — a supplier's category can shift from bottleneck to strategic (or the reverse) as the business or the market changes, and a segmentation done once at onboarding and never revisited will drift out of date.`,
              },
              {
                title: 'Measuring and Improving Supplier Performance',
                duration_minutes: 11,
                body: `Managing a supplier relationship well requires more than good intentions — it requires a way to see, objectively, whether the relationship is actually delivering what the business needs. Supplier performance management is the practice of measuring suppliers against defined criteria and using that measurement to drive improvement, recognize good performance, or address poor performance before it becomes a crisis.

The most common performance dimensions are quality (defect rates, non-conformance reports, first-pass yield), delivery (on-time and in-full performance — often abbreviated OTIF — against the promised date), cost (year-over-year price trends, cost reduction contributions, total cost of ownership rather than just unit price), and responsiveness (how quickly a supplier resolves issues, answers requests, or adapts to changed requirements). A supplier scorecard combining these dimensions gives a fuller picture than any single metric — a supplier with excellent pricing but chronically late deliveries is not actually a strong performer, and a single-metric view would miss that.

Measurement only creates value if it feeds back into action. For top-performing suppliers, this might mean formal recognition, priority allocation of future business, or being brought into innovation and joint-planning conversations earlier. For underperforming suppliers, it should trigger a structured conversation: sharing the data, understanding the root cause (is it capacity, a process issue, a sub-supplier problem, or a misunderstanding of requirements?), and agreeing a corrective action plan with a clear timeline and a way to verify improvement.

It is worth being honest that not every underperforming supplier relationship can or should be salvaged — sometimes the right conclusion from a rigorous performance review is that the relationship should be wound down and business moved elsewhere. What performance management provides, either way, is an evidence base for that decision, rather than a gut call made in the heat of the latest failure. A consistent, well-documented performance history also strengthens the organization's negotiating position at contract renewal — whether that negotiation is about better terms with a strong performer, or about exit terms with a weak one.`,
              },
            ],
          },
        ],
      },
    ],
  },

  /* ───────────────────────────── SAP (placeholder) ───────────────────────────── */
  {
    key: 'sap',
    name: 'SAP',
    description: 'SAP navigation and Materials Management basics for supply chain users. Placeholder content — expand via the admin CMS.',
    icon: 'layout-grid',
    color: '#1e6bb8',
    courses: [
      {
        title: 'SAP Essentials for Supply Chain',
        description: 'A starter course covering SAP navigation and core Materials Management transactions. Placeholder — replace with NESR-specific SAP training material.',
        status: 'draft',
        modules: [
          {
            title: 'Navigating SAP',
            resourceLabel: 'NESR SAP Training Hub',
            resourceUrl: 'https://nesrcorp.sharepoint.com/sites/SAPTrainingHub/SitePages/Home.aspx',
            lessons: [
              {
                title: 'Getting Around the SAP GUI',
                duration_minutes: 8,
                body: `Placeholder lesson. This will cover logging into the SAP GUI, the layout of the main screen (menu bar, command field, standard toolbar), navigating between modules, and personalizing your user settings. Replace with NESR-specific screenshots and a walkthrough of our SAP landscape via the admin CMS.`,
              },
              {
                title: 'Transaction Codes You’ll Use Every Day',
                duration_minutes: 8,
                body: `Placeholder lesson. This will introduce transaction codes (t-codes) as shortcuts to specific SAP functions, how to enter them in the command field, and a starter list of the t-codes most relevant to supply chain users (e.g. material master display/change, purchase requisition and purchase order transactions, goods receipt). Replace with the specific t-code list and permissions relevant to NESR's SAP configuration.`,
              },
            ],
          },
          {
            title: 'Materials Management Basics',
            lessons: [
              {
                title: 'The Material Master Record',
                duration_minutes: 9,
                body: `Placeholder lesson. This will cover what a material master record is, the views that make it up (basic data, purchasing, MRP, accounting), and why a clean, non-duplicated material master matters for accurate demand planning and reporting. Replace with NESR's material master governance process and a real example record.`,
              },
              {
                title: 'Purchase Requisitions and Purchase Orders in SAP',
                duration_minutes: 9,
                body: `Placeholder lesson. This will walk through creating a purchase requisition, how it converts into a purchase order, the approval workflow, and how goods receipt and invoice verification close the loop. Replace with a screen-by-screen walkthrough matching NESR's actual SAP purchasing workflow.`,
              },
            ],
          },
        ],
      },
    ],
  },

  /* ───────────────────────────── NESR Supply Chain (placeholder — menu mirrors the NESR
     "Supply Chain Process Cycles & Systems" AS-IS -> TO BE diagram) ───────────────────────────── */
  {
    key: 'nesr_supply_chain',
    name: 'NESR Supply Chain',
    description: 'NESR’s end-to-end Source-to-Pay process cycle and the systems behind each step. Placeholder content — expand via the admin CMS.',
    icon: 'building-2',
    color: '#8a5a2b',
    courses: [
      {
        title: 'NESR Supply Chain: Source to Pay Process & Systems',
        description: 'Walks the NESR Source-to-Pay cycle (Source → Contract → Catalog → Demand → Procure → Deliver → Pay) plus the Logistics and Inventory lanes, and the system behind each step per the AS-IS → TO BE roadmap. Placeholder — expand each step via the admin CMS.',
        status: 'draft',
        modules: [
          {
            title: 'Overview',
            lessons: [
              {
                title: 'Course Introduction',
                duration_minutes: 6,
                videoUrl: 'https://url.us.m.mimecastprotect.com/s/vmLQCKrj6MCA2RlKivhXc5SPEK?domain=1drv.ms',
                body: `Placeholder lesson. This course walks through NESR's Source-to-Pay process cycle exactly as mapped in the current AS-IS → TO BE roadmap: Source → Contract → Catalog feeding into the main Demand → Procure → Deliver → Pay flow, with Logistics and Inventory as cross-cutting lanes. Each module below covers one stage of that cycle and the system that supports it today — noting where a step is still a manual, email-driven process, where it runs in core SAP, where a dedicated system is in limited use, and where a system is in phased deployment. Replace this lesson with a real walkthrough of the roadmap and how it is expected to evolve.`,
              },
            ],
          },
          {
            title: 'Source',
            lessons: [
              {
                title: 'RFP & Award — SAP Ariba Sourcing (P7)',
                duration_minutes: 7,
                body: `Placeholder lesson. This step is today a manual, email-driven process, moving toward SAP Ariba Sourcing (project P7) for RFP and award. Replace with a walkthrough of the current process and the target SAP Ariba Sourcing workflow.`,
              },
              {
                title: 'Supplier Onboarding — SAP Ariba SLP',
                duration_minutes: 7,
                body: `Placeholder lesson. Supplier onboarding runs through SAP Ariba SLP (Supplier Lifecycle & Performance). Replace with a walkthrough of onboarding a new supplier end-to-end in SAP Ariba SLP.`,
              },
            ],
          },
          {
            title: 'Contract',
            lessons: [
              {
                title: 'Contract Approval Workflow',
                duration_minutes: 6,
                body: `Placeholder lesson. This will cover NESR's contract approval workflow — who reviews and signs off at each stage before a contract is executed. Replace with the current approval workflow and sign-off matrix.`,
              },
              {
                title: 'Contracts Repository — Sirion (P1)',
                duration_minutes: 7,
                body: `Placeholder lesson. Today, populating the contracts repository is a manual, email-driven process feeding into Sirion (project P1), NESR's contract lifecycle management system. Replace with a walkthrough of finding and filing a contract in Sirion.`,
              },
            ],
          },
          {
            title: 'Catalog',
            lessons: [
              {
                title: 'Supplier Price & Lead-Time Records — Guided Buying (P4)',
                duration_minutes: 7,
                body: `Placeholder lesson. Supplier price and lead-time records are maintained in Guided Buying (project P4), currently in limited deployment. Replace with a walkthrough of looking up a catalog price/lead-time record and how coverage is expanding.`,
              },
            ],
          },
          {
            title: 'Demand',
            lessons: [
              {
                title: 'Planning & Demand Forecasting',
                duration_minutes: 6,
                body: `Placeholder lesson. This will cover how demand planning and forecasting feeds the rest of the cycle, including its link to Inventory (Stock Replenishment Planning). Replace with the current forecasting process and system of record.`,
              },
              {
                title: 'Demand Creation (SAP)',
                duration_minutes: 6,
                body: `Placeholder lesson. Demand creation runs in core SAP. Replace with a screen-by-screen walkthrough of creating a demand line in SAP.`,
              },
              {
                title: 'Demand PR Approval (SAP)',
                duration_minutes: 6,
                body: `Placeholder lesson. Purchase requisition approval for demand runs in core SAP. Replace with the current PR approval workflow and thresholds.`,
              },
            ],
          },
          {
            title: 'Procure',
            lessons: [
              {
                title: 'Supplier Assessment',
                duration_minutes: 6,
                body: `Placeholder lesson. Supplier assessment at the procure stage is today a manual, email-driven process. Replace with the current assessment checklist and criteria.`,
              },
              {
                title: 'Supplier PO Approval (SAP)',
                duration_minutes: 6,
                body: `Placeholder lesson. Supplier purchase order approval runs in core SAP. Replace with the current PO approval workflow and thresholds.`,
              },
            ],
          },
          {
            title: 'Deliver & Logistics',
            lessons: [
              {
                title: 'Supplier Acknowledgement',
                duration_minutes: 6,
                body: `Placeholder lesson. This will cover how supplier order acknowledgement is captured before delivery and tracking begin. Replace with the current process.`,
              },
              {
                title: 'Tracking & Update of Variations — shipwaves (P2)',
                duration_minutes: 7,
                body: `Placeholder lesson. Shipment tracking and updating delivery variations is today a manual, email-driven process feeding into shipwaves (project P2). Replace with a walkthrough of tracking a shipment in shipwaves.`,
              },
              {
                title: 'Expediting & Readiness — n8n (P5)',
                duration_minutes: 7,
                body: `Placeholder lesson. Expediting and delivery-readiness follow-ups are today a manual, email-driven process, automated via an n8n workflow (project P5) that feeds back into procurement. Replace with a walkthrough of what the n8n automation does and when to step in manually.`,
              },
              {
                title: 'Freight Forwarder Bid & Award — shipwaves',
                duration_minutes: 6,
                body: `Placeholder lesson. Freight forwarder bid and award is today a manual, email-driven process running through shipwaves. Replace with a walkthrough of running an FF bid in shipwaves.`,
              },
              {
                title: 'Delivery Acknowledgment (SAP)',
                duration_minutes: 6,
                body: `Placeholder lesson. Delivery acknowledgement is recorded in core SAP. Replace with a walkthrough of confirming delivery in SAP.`,
              },
            ],
          },
          {
            title: 'Inventory Management',
            lessons: [
              {
                title: 'Stock Replenishment Planning',
                duration_minutes: 6,
                body: `Placeholder lesson. This will cover how stock replenishment planning connects demand forecasting to physical inventory. Replace with the current planning process and cadence.`,
              },
              {
                title: 'Physical Counting',
                duration_minutes: 6,
                body: `Placeholder lesson. Physical counting is today a manual, email-driven process. Replace with the current cycle-count procedure and frequency.`,
              },
              {
                title: 'Goods Issue',
                duration_minutes: 6,
                body: `Placeholder lesson. Goods issue is today a manual, email-driven process. Replace with the current goods-issue procedure.`,
              },
              {
                title: 'Goods Receipt — Coda (P3)',
                duration_minutes: 7,
                body: `Placeholder lesson. Goods receipt is today a manual, email-driven process feeding into Coda (project P3). Replace with a walkthrough of recording a goods receipt in Coda.`,
              },
              {
                title: 'Inventory Digital Twin — Translytics (P6)',
                duration_minutes: 7,
                body: `Placeholder lesson. NESR's inventory digital twin, Translytics (project P6), is in phased deployment. Replace with a walkthrough of what the digital twin shows and which sites currently have it live.`,
              },
            ],
          },
          {
            title: 'Pay',
            lessons: [
              {
                title: 'Payment Request / Invoice — SAP Ariba Commerce Automation',
                duration_minutes: 7,
                body: `Placeholder lesson. Payment request and invoicing are moving to SAP Ariba Commerce Automation, currently in phased deployment. Replace with a walkthrough of submitting and tracking an invoice through Commerce Automation.`,
              },
              {
                title: 'Demand Supply Validation (3-Way Match, SAP)',
                duration_minutes: 6,
                body: `Placeholder lesson. Demand-supply validation (three-way match between PO, goods receipt, and invoice) runs in core SAP. Replace with a walkthrough of resolving a 3WM mismatch.`,
              },
              {
                title: 'Pay (SAP)',
                duration_minutes: 6,
                body: `Placeholder lesson. Final payment execution runs in core SAP. Replace with the current payment run schedule and how it connects to ProcureGuard for adhoc and advance payments.`,
              },
            ],
          },
        ],
      },
    ],
  },
];
