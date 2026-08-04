// NESR spend taxonomy — sourced from the authoritative NESR/SourceGuide taxonomy workbook
// (SourceGuide-Taxonomy.xlsx, "Taxonomy" tab: Spend Type / Category / Sub-Category / Family / Commodity).
// Drives the cascading Category → Sub-category → Commodity selects on the entry form,
// and seeds the spend_category / spend_subcategory master-data tables.
// spend_type classifies each category as Direct or Indirect spend.

export type SpendTypeName = "Direct" | "Indirect";
export interface TaxCommodity { n: string; f: string; code: string; desc: string; kw: string[] }
export interface TaxSubcategory { name: string; commodities: TaxCommodity[] }
export interface TaxCategory { type: SpendTypeName; name: string; subs: TaxSubcategory[] }

export const SPEND_TYPES = ["Direct", "Indirect"] as const;

export const SPEND_TAXONOMY: TaxCategory[] = [
  {
    "type": "Direct",
    "name": "Cement",
    "subs": [
      {
        "name": "Commodities Chemicals",
        "commodities": [
          {
            "n": "Class G Cement",
            "f": "Cement",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oil Well Lightweight Cement",
            "f": "Cement",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Chemicals",
    "subs": [
      {
        "name": "Chemicals",
        "commodities": [
          {
            "n": "Chemicals",
            "f": "Chemicals",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Base Fluids & Brines",
        "commodities": [
          {
            "n": "Base Fluids & Brines",
            "f": "Base Fluids & Brines",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Monovalent brines",
            "f": "Completion fluids",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Commodities Chemicals",
        "commodities": [
          {
            "n": "Commodities Chemicals",
            "f": "Commodities Chemicals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Methanol",
            "f": "Commodities Chemicals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hydrochloric acid",
            "f": "Acid",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Class G Cement",
            "f": "Cement",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oil Well Lightweight Cement",
            "f": "Cement",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oil well standard fine type III cement",
            "f": "Cement",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Extenders",
            "f": "Cement Extenders",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling mud and materials",
            "f": "Drilling mud and materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud weighting Agent",
            "f": "Drilling mud and materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Acetylene",
            "f": "Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Carbon Dioxide",
            "f": "Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Nitrogen",
            "f": "Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ammonium sulphate",
            "f": "Inorganic compounds",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inorganic acids",
            "f": "Inorganic compounds",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inorganic metal salts",
            "f": "Inorganic compounds",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sodium hydroxide",
            "f": "Inorganic compounds",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Liquid Nitrogen",
            "f": "Nitrogen",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wetting Agents",
            "f": "Wetting Agents",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Minerals",
        "commodities": [
          {
            "n": "Minerals",
            "f": "Minerals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Barium Ba",
            "f": "Barite",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Proppant",
        "commodities": [
          {
            "n": "Cement expanding agents",
            "f": "Cement expanding agents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ceramic proppants",
            "f": "Ceramic proppants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Resin Coated Ceramics",
            "f": "Resin Coated Ceramics",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fracturing Sands",
            "f": "Well fracturing proppants",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Specialty Chemicals",
        "commodities": [
          {
            "n": "Specialty Chemicals",
            "f": "Specialty Chemicals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Acidic polymer breakers",
            "f": "Acidic polymer breakers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Anionic Friction Reducer",
            "f": "Anionic Friction Reducer",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bactericide",
            "f": "Bactericide",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Organic polymer breakers",
            "f": "Breakers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Acid buffers",
            "f": "Buffer",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Basic buffers",
            "f": "Buffer",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Neutral buffers",
            "f": "Buffer",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cationic friction reducers",
            "f": "Cationic friction reducers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Defoamer: Silicone/PDMS-based",
            "f": "Cement Defoamer: Silicone/PDMS-based",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement expanding agents",
            "f": "Cement Expander",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Extenders",
            "f": "Cement Extenders",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Organic clay stabilizers",
            "f": "Clay Stabilizer & Fluid reduce control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Corrosion Inhibitors",
            "f": "Corrosion Inhibitors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crosslinker",
            "f": "Crosslinker",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Accelerator",
            "f": "Curing agents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Retarders",
            "f": "Curing agents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Detergent Surfactants",
            "f": "Detergent Surfactants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling mud and materials",
            "f": "Drilling mud and materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fluid spacers",
            "f": "Drilling mud and materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "General drilling chemical",
            "f": "Drilling mud and materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lost Circulation Material & Bridging",
            "f": "Drilling mud and materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fluid Loss Additives",
            "f": "Fluid Loss Additives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Modified polymer fluid loss additives",
            "f": "Fluid Loss Additives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Fluid Loss Additives Fluid Loss Additives",
            "f": "Fluid Loss Additives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Anionic friction reducers",
            "f": "Friction Reducer",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Anti gas migration additives",
            "f": "Gas Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Canthaxanthin",
            "f": "Gelling Agent",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hydrochloric acid",
            "f": "Hydrochloric acid",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diverting agents",
            "f": "Indicators and Reagents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inorganic Clay Stabilizers",
            "f": "Inorganic Clay Stabilizers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inorganic metal salts",
            "f": "Inorganic compounds",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inorganic metal Salts",
            "f": "Inorganic metal Salts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Iron Control Agent",
            "f": "Iron Control Agent",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Monovalent brines",
            "f": "Monovalent brines",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Natural gelling agents",
            "f": "Natural gelling agents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oxygenated solvents",
            "f": "Oxygenated solvents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Scale Inhibitor",
            "f": "Scale Inhibitor",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "H2S absorbent",
            "f": "Scavengers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Production oil treatment chemicals",
            "f": "Scavengers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Scavengers",
            "f": "Scavengers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hydrocarbonated solvents",
            "f": "Solvents",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inorganic clay stabilizers",
            "f": "Stabilizers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Anti-Foam",
            "f": "Surfactants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Anti-Sludge Agent",
            "f": "Surfactants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Detergent surfactants",
            "f": "Surfactants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Dispersant",
            "f": "Surfactants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Foaming Agent",
            "f": "Surfactants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Suspending Agent",
            "f": "Suspending Agent",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Synthetic gelling agents Polymer base",
            "f": "Visocosifier",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wetting Agents",
            "f": "Wetting Agents",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Field Technical Equipment & Services",
    "subs": [
      {
        "name": "Cabins, Camps & Cargo",
        "commodities": [
          {
            "n": "CC&C GPS Tracking - Hardware",
            "f": "General CC&C",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "CC&C GPS Tracking - Software / Services",
            "f": "General CC&C",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engineering & Design CC&C (DNV)",
            "f": "General CC&C",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engineering & Design CC&C (Non-DNV)",
            "f": "General CC&C",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Camp Accommodation Units",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Land Cabins - Manufacture (e.g. Offices, Labs)",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Land Cabins - Rental (e.g. Offices, Labs)",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Land Cabins - Repair & Maintenance",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Land Cabins - Spare Parts",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Land Camps - Manufacture (e.g. Accommodations)",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Land Camps - Rentals (e.g. Accommodations)",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Land Camps - Repair & Maintenance",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Land Camps - Spare Parts",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Containers",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Portable Buildings - Purchase",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Portable Buildings - Rental",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Welfare Units",
            "f": "Land Cabins & Camps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Offshore Accommodation Modules",
            "f": "Offshore Cabins",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Offshore Office Modules",
            "f": "Offshore Cabins",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equipment Leasing Services",
            "f": "Operational Leasing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Baskets & Skips",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cargo Carrying Units - Bins / Waste Skips",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cargo Carrying Units (CCU)",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cargo Carrying Units - Drill Cuttings / Mud Skips",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazmat (Explosive, Radioactive) Transport Units - Purchase",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazmat (Explosive, Radioactive) Transport Units - Rental",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Offshore Containers",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tank Containers",
            "f": "Portable Cargo",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Completion Tools",
        "commodities": [
          {
            "n": "Cross Coupling Cable Protectors",
            "f": "Cable Protectors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hybrid PDC",
            "f": "Cables",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Permanent Downhole Cable (PDC)",
            "f": "Cables",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Twisted Pair PDC",
            "f": "Cables",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Baskets",
            "f": "Casing Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Cleaners",
            "f": "Casing Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Centralizers & Turbolizers",
            "f": "Casing Hardware",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Float Equipment (Collar, Shoe)",
            "f": "Casing Hardware",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plugs (Top, Bottom)",
            "f": "Casing Hardware",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Stage Equipment (Mechanical, Hydraulic)",
            "f": "Casing Hardware",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Adjustable Joints",
            "f": "Completion Tubular Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Expansion Joints",
            "f": "Completion Tubular Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "No-Go Nipples & Locks",
            "f": "Completion Tubular Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "On-Off Units",
            "f": "Completion Tubular Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sliding Sleeves",
            "f": "Completion Tubular Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tubing Plugs",
            "f": "Completion Tubular Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seamless Control Line",
            "f": "Control Line",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Welded Control Line",
            "f": "Control Line",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Adjustable Joints)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Elastomeric Sliding Sleeves)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Expansion Joints)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (No-Go Locks)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (No-Go Nipples)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Non-Elastomeric Sliding Sleeves)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (On-Off Units)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Other Tubular)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Pump Out Plugs/Subs)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Receptacle Sub)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Stinger)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Swivels)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Tubular ACCS (Tubing Plugs)",
            "f": "Core Completions Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Lubricator Valve (SFIV)",
            "f": "Downhole Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flow Control Valves",
            "f": "Downhole Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Formation Isolation Valve",
            "f": "Downhole Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Landing Nipples",
            "f": "Downhole Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Well Testing Test Tools",
            "f": "Downhole Well Testing Test Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "3 Way Sub",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Blast Joints",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bull Plugs",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Completion Crossovers",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flow Couplings",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Multiple Joint Lifting Plugs",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Perforated Pup Joints",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pipe Plug",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Production Tubing Pup Joints - Purchase",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Single Joint Lifting Plugs",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline Entry Guide",
            "f": "Dumb Iron Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Annulus Gas Vent Valve",
            "f": "ESP Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gas Vent Valve with SSD",
            "f": "ESP Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Penetrator",
            "f": "ESP Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Penetrator Retainer",
            "f": "ESP Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vent Valve",
            "f": "ESP Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Liner Hanger Running Tools",
            "f": "Liner Hangers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Liner Hanger Systems",
            "f": "Liner Hangers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Blanking Plug",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equalizing Check Valve",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equalizing Plug",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equalizing Prong",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equalizing Sub",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Instrument Hanger",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lock",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Locking Collet",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Locking Dog",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lock Mandrel Redress Kit",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lock Mandrel Running Kit",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lock Ring",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plug Redress Kit",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Prong Plug",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pulling Prong",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Running Prong",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Standing Valve",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tubing Hanger Lock",
            "f": "Lock & Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Multilateral Casing",
            "f": "Multilateral Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Multilateral Junctions",
            "f": "Multilateral Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Multilateral Packer Parts & Accessories",
            "f": "Multilateral Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Multilateral Packers",
            "f": "Multilateral Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Anchor Latch",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Retainer Settling Tool",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crossover Seal Unit",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Locator",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Locator Seal Assembly/Seal Unit",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mandrel Seal Unit",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Millout Seal Unit",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Polished Bore Receptacle",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seal Assembly",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seal Bore Extension",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seal Unit",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Spacer Seal Assembly",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline Adapter Kit",
            "f": "Packers Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bridge Plugs",
            "f": "Packers & Bridge Plugs",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Retainers",
            "f": "Packers & Bridge Plugs",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Packer Accessories",
            "f": "Packers & Bridge Plugs",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Production Packers",
            "f": "Packers & Bridge Plugs",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Perforating Accessories",
            "f": "Perforating Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Perforating Guns",
            "f": "Perforating Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Shaped Charges",
            "f": "Perforating Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "RMC - Splice Sub",
            "f": "RMC",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "RMC - Splice Sub RDK",
            "f": "RMC",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "RMC - Wellhead Outlet",
            "f": "RMC",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gravel Pack Equipment",
            "f": "Sand Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inflow Control Devices (ICD)",
            "f": "Sand Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sand Screens",
            "f": "Sand Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "O-Ring Seal Sub & Slick Joints",
            "f": "Sandface Completions",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Accessories Communication Tool",
            "f": "SSSV Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Accessories Communication Tool RDK",
            "f": "SSSV Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Accessories Flow Tubes",
            "f": "SSSV Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Accessories Lockout Tool",
            "f": "SSSV Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Accessories Lockout Tool RDK",
            "f": "SSSV Flow Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HPHT, Subsea or Downhole Connectors",
            "f": "Subsea Downhole Connectors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Accessories",
            "f": "Subsurface Safety Valves",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SSSV Systems",
            "f": "Subsurface Safety Valves",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Blast Joints & Flow Couplings",
            "f": "Tubing Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tubing Anchors",
            "f": "Tubing Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tubing Hangers",
            "f": "Tubing Accessories",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Compressors & Generators",
        "commodities": [
          {
            "n": "Pneumatic, Hydraulic, Electric & Others",
            "f": "Actuators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air & Steam Accessories - Purchase",
            "f": "Air & Steam Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air & Steam Accessories - Rental",
            "f": "Air & Steam Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Assembly Design & Engineering Services",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oilfield Equipment Mounted on Truck/Trailer - Purchase",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oilfield Equipment Mounted on Truck/Trailer - Rental",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pump Skid, Instrumentation, Controls",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pump Skids",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bulk Compressor Maintenance",
            "f": "Bulk Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bulk Compressors - Purchase",
            "f": "Bulk Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bulk Compressors - Rental",
            "f": "Bulk Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Cooler, Centrifuge, Filtration Components",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Dryers - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Receivers - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air System Components - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fuel System - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hardware - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hydraulic Installations - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Motors - All Types (Hydraulic, Electric, Pneumatic)",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Power Generation (Hydraulic, Pneumatic & Electric)",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Radiators - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Regulators - All Types",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Silencer - Power Building",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Spare Parts",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Valves",
            "f": "Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Compressor - Operating Services",
            "f": "Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Compressor - Purchase",
            "f": "Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Compressor - Rental",
            "f": "Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Compressor - Repair & Maintenance",
            "f": "Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "All KVA Rating",
            "f": "Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heat Exchangers (A&S Testing Applications) - Product",
            "f": "Heat Exchangers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heat Exchangers (A&S Testing Applications) - Rental",
            "f": "Heat Exchangers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Brake System",
            "f": "Mechanical",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gearbox",
            "f": "Mechanical",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Rotating Equipment",
            "f": "Other Rotating Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Rotating Equipment - Spare Parts",
            "f": "Other Rotating Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Doghouse",
            "f": "Performance Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Performance Materials - Other",
            "f": "Performance Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Riser Buoyancy",
            "f": "Performance Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Stiffener",
            "f": "Performance Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Strake",
            "f": "Performance Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Thermal Insulation",
            "f": "Performance Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel Generators - Purchase",
            "f": "Power Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel Generators - Rental",
            "f": "Power Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gas Turbine Generators",
            "f": "Power Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Generator Maintenance",
            "f": "Power Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engine Accessories (Radiators, Exhaust & Cooling Systems)",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engine Replacement Parts",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engines < 750 hp",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engines > 751 hp",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engines Rental",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engines Repair",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Planned/Routine Maintenance",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Transmission Parts",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Transmissions",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Unplanned Maintenance",
            "f": "Powertrain",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Centrifugal Pumps - Pump",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Centrifugal Pumps - Repair",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Centrifugal Pumps - Spare Parts",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cryogenic Pumps - Pump",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cryogenic Pumps - Repair",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cryogenic Pumps - Spare Parts",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plunger Pumps - Fluid End Repair",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plunger Pumps - Power End",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plunger Pumps - Power End Repair",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plunger Pumps - Pump 1000-2200 HP",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plunger Pumps - Pump >= 2250 HP",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plunger Pumps - Pump <= 600HP",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Progressive Cavity Pumps - Pump",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Progressive Cavity Pumps - Repair",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Progressive Cavity Pumps - Spare Parts",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sucker Rod Pumping System - Pump",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sucker Rod Pumping System - Repair",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sucker Rod Pumping System - Spare Parts",
            "f": "Pumps",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Cooling - Maintenance",
            "f": "Rig Cooling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Cooling - Operating Services",
            "f": "Rig Cooling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Cooling - Rental",
            "f": "Rig Cooling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sand Filters - Purchase",
            "f": "Sand Filters",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sand Filters - Rental",
            "f": "Sand Filters",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Steam Generators - Maintenance",
            "f": "Steam Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Steam Generators - Operating Services",
            "f": "Steam Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Steam Generators - Purchase",
            "f": "Steam Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Steam Generators - Rental",
            "f": "Steam Generators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Flow Meter, Multi-Phase",
            "f": "Subsea Meters",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Flow Meter, Single-Phase",
            "f": "Subsea Meters",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Wet Gas Meter",
            "f": "Subsea Meters",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Buoyancy Equipment or Module",
            "f": "Subsea Pipeline Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Fitting",
            "f": "Subsea Pipeline Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Flange",
            "f": "Subsea Pipeline Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Manifold",
            "f": "Subsea Project Installation Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Running Tool",
            "f": "Subsea Project Installation Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Production Monitoring Equipment",
            "f": "Subsea Well Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Well Test Compressor Services",
            "f": "Well Testing Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Well Test Compressors - Purchase",
            "f": "Well Testing Compressors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Well Test Compressors - Rental",
            "f": "Well Testing Compressors",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Data Acquisition",
        "commodities": [
          {
            "n": "Conventional Gyro Services",
            "f": "Downhole Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gravity/Magnetic Field Surveys",
            "f": "Downhole Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Pulse Telemetry",
            "f": "Downhole Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireless Data Transmission",
            "f": "Downhole Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "GWD Services",
            "f": "Gyro While Drilling (GWD)",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "GWD Systems",
            "f": "Gyro While Drilling (GWD)",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seismic Processing Services",
            "f": "Seismic Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seismic Survey Equipment",
            "f": "Seismic Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Real-time Data Transmission",
            "f": "Surface Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Surface Data Logging",
            "f": "Surface Data Acquisition",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "DHT",
        "commodities": [
          {
            "n": "Gas Lift Equipment",
            "f": "Artificial Lift",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Progressive Cavity Pumps",
            "f": "Artificial Lift",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rod Pumps & Sucker Rods",
            "f": "Artificial Lift",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "CT Bottomhole Assemblies",
            "f": "Coiled Tubing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "CT Clean Out Tools",
            "f": "Coiled Tubing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "CT Milling Tools",
            "f": "Coiled Tubing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Electric Submersible Pumps",
            "f": "ESP Systems",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "ESP Accessories",
            "f": "ESP Systems",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "ESP Motors & Cables",
            "f": "ESP Systems",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bailers & Dump Valves",
            "f": "Slickline Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gauge Cutters & Swabs",
            "f": "Slickline Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pulling & Running Tools",
            "f": "Slickline Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline Punchers & Cutters",
            "f": "Wireline Conveyed Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline Setting Tools",
            "f": "Wireline Conveyed Tools",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Drilling Product & Services",
        "commodities": [
          {
            "n": "Casing Running & Tubing Equipment Rental",
            "f": "Casing Running & Tubing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Running & Tubing Service Offshore - Conventional",
            "f": "Casing Running & Tubing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Running & Tubing Service Offshore - CRT",
            "f": "Casing Running & Tubing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Running & Tubing Service Onshore - Conventional",
            "f": "Casing Running & Tubing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Running & Tubing Service Onshore - CRT",
            "f": "Casing Running & Tubing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hydraulic Catwalk",
            "f": "Casing Running & Tubing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling Spear",
            "f": "Casing While Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling Spear Parts & Accessories",
            "f": "Casing While Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Shoe",
            "f": "Casing While Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Shoe Parts & Accessories",
            "f": "Casing While Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Scraper Parts & Accessories",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing Scrapers",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coring Equipment",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Pipe Thread Protectors",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gauge Rings",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hole Openers (Downhole Drilling Applications)",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rotating Control Head (Downhole Drilling Applications)",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rotating Control Head Parts & Accessories",
            "f": "Conventional Drilling Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Conventional Gyro Services - LIH Insurance",
            "f": "Conventional Gyro",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Conventional Gyro Services - Lost in Hole (LIH)",
            "f": "Conventional Gyro",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coring Services Offshore",
            "f": "Coring Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coring Services Onshore",
            "f": "Coring Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Casing Inspection Tool & Accessories",
            "f": "Data Acquisition - Downhole",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Logging - Downhole Camera",
            "f": "Data Acquisition - Downhole",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Downhole Data Acquisition (MWD/LWD/DD/Ranging)",
            "f": "Data Acquisition - Downhole",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Drilling Mud/Fluid Analysis",
            "f": "Data Acquisition - Off Site/Lab",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Off-Site Laboratory Downhole Data Acquisition",
            "f": "Data Acquisition - Off Site/Lab",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Motor Accessories & Parts",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Motor - Lost in Hole (LIH)",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Motor - Lost in Hole (LIH) Insurance",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Motor - Relines",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Motor - Rotors, Stators, Power-Sections",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Positive Displacement Motors",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Turbine Motors",
            "f": "Downhole Motors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "PDC Bits - Purchase",
            "f": "Drilling Bits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "PDC Bits - Rental",
            "f": "Drilling Bits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Roller Cone Bits - Milltooth",
            "f": "Drilling Bits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Roller Cone Bits - TCI",
            "f": "Drilling Bits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Circulating Tools (Bypass Subs) - Purchase",
            "f": "Drilling Products",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Circulating Tools (Bypass Subs) - Rental",
            "f": "Drilling Products",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Debris Recovery Tools - Rental",
            "f": "Drilling Products",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling Products - Lost in Hole (LIH) Insurance",
            "f": "Drilling Products",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Reamers & Underreamers - Purchase",
            "f": "Drilling Products",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Reamers & Underreamers - Rental",
            "f": "Drilling Products",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fishing Jars",
            "f": "Fishing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fishing Tools - Lost in Hole (LIH) Insurance",
            "f": "Fishing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Magnets & Junk Baskets",
            "f": "Fishing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mills & Cutters",
            "f": "Fishing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Overshots & Spears",
            "f": "Fishing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coating Services",
            "f": "Machine Shop Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Threading Services",
            "f": "Machine Shop Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Welding Services",
            "f": "Machine Shop Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Casing",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Pipe - Purchase",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Pipe - Rental",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Weight Drill Pipe (HWDP) - Purchase",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Weight Drill Pipe (HWDP) - Rental",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Line Pipe",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Production Tubing",
            "f": "Oil Country Tubular Goods",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Camp & Catering at Rig Site",
            "f": "Other Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equipment Rental - Rig Site",
            "f": "Other Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Rig Site Services",
            "f": "Other Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Mud Cleaning Services",
            "f": "Other Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wellsite Construction Services",
            "f": "Other Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wellsite Construction Services - Sub-Contracted Services",
            "f": "Other Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Well Cementing Services (Alliance)",
            "f": "Rig Cementing System",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "DROPS Survey",
            "f": "Rig Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Human Competence Inspection",
            "f": "Rig Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Management System Inspection",
            "f": "Rig Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Other Rig Inspection Services",
            "f": "Rig Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Acceptance Inspection",
            "f": "Rig Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Offshore Drilling Rig Rentals",
            "f": "Rig Rentals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Offshore Workover Rig Rentals",
            "f": "Rig Rentals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Onshore Drilling Rig Rentals",
            "f": "Rig Rentals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Onshore Workover Rig Rentals",
            "f": "Rig Rentals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Move Services",
            "f": "Rig Rentals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Multistage Acid Fracturing",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Multistage CO2 Fracturing",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Multistage Hydraulic Proppant Fracturing",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Single Stage Acid Fracturing",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Single Stage CO2 Fracturing",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Single Stage Hydraulic Proppant Fracturing",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "WSV - Well Cementing Services",
            "f": "Rig Site Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Waste Offshore - Disposal Facility",
            "f": "Rig Waste Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Waste Offshore - Trucking",
            "f": "Rig Waste Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Waste Onshore - Disposal Facility",
            "f": "Rig Waste Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Waste Onshore - Trucking",
            "f": "Rig Waste Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Thru Tubing Mills",
            "f": "Thru Tubing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Thru Tubing Whipstocks",
            "f": "Thru Tubing Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Casing & Tubing",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Collars",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling Tubular Pup Joints - Purchase",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling Tubular Pup Joints - Rental",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drill Pipe",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drillstring Crossovers & Subs - Purchase",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drillstring Crossovers & Subs - Rental",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Weight Drill Pipe",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Stabilizer - Purchase",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Stabilizer - Rental",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tubulars - Lost in Hole (LIH)",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tubulars - Lost in Hole (LIH) Insurance",
            "f": "Tubulars",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "While Drilling Gyro",
            "f": "While Drilling Gyro",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "While Drilling Gyro - LIH Insurance",
            "f": "While Drilling Gyro",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "While Drilling Gyro - Lost in Hole (LIH)",
            "f": "While Drilling Gyro",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Electronics",
        "commodities": [
          {
            "n": "Motor Control Centers",
            "f": "Electrical Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Power Distribution Equipment",
            "f": "Electrical Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Variable Frequency Drives",
            "f": "Electrical Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Actuators & Solenoids",
            "f": "Electro-Mechanical Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Control Systems",
            "f": "Electro-Mechanical Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Circuit Boards & PCBs",
            "f": "Electronic Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Integrated Circuits",
            "f": "Electronic Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Resistors & Capacitors",
            "f": "Electronic Components",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Accelerometers",
            "f": "Sensors & Transducers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Magnetometers",
            "f": "Sensors & Transducers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pressure Transducers",
            "f": "Sensors & Transducers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Temperature Sensors",
            "f": "Sensors & Transducers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Connectors & Harnesses",
            "f": "Wire, Cable & Connectors",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Cables",
            "f": "Wire, Cable & Connectors",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Laboratory Services",
        "commodities": [
          {
            "n": "Routine Core Analysis",
            "f": "Core Analysis",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Special Core Analysis (SCAL)",
            "f": "Core Analysis",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Analysis Services",
            "f": "Fluid Analysis",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Oil & Gas PVT Analysis",
            "f": "Fluid Analysis",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Water Analysis Services",
            "f": "Fluid Analysis",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Chemical Analysis",
            "f": "Material Testing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Metallurgical Testing",
            "f": "Material Testing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Non-Destructive Testing (NDT)",
            "f": "Material Testing",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Logging tools",
        "commodities": [
          {
            "n": "Acoustic/Sonic Tools",
            "f": "Formation Evaluation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Nuclear Magnetic Resonance (NMR)",
            "f": "Formation Evaluation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Porosity Tools (Neutron, Density)",
            "f": "Formation Evaluation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Resistivity Tools",
            "f": "Formation Evaluation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Borehole Imaging Tools",
            "f": "Imaging Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Formation Micro-Imaging",
            "f": "Imaging Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Logging While Drilling (LWD) Tools",
            "f": "LWD/MWD Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Measurement While Drilling (MWD) Tools",
            "f": "LWD/MWD Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rotary Steerable Systems",
            "f": "LWD/MWD Tools",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cased Hole Logging Tools",
            "f": "Wireline Logging",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Open Hole Logging Tools",
            "f": "Wireline Logging",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Production Logging Tools",
            "f": "Wireline Logging",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Power Driven Integration",
        "commodities": [
          {
            "n": "Design & Engineering Services",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Skid Unit - Purchase",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Skid Unit - Rental",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Trailer/Truck Unit - Purchase",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Trailer/Truck Unit - Rental",
            "f": "Assembly",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Skid Unit Refurbishment",
            "f": "Refurbishment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Trailer Unit Refurbishment",
            "f": "Refurbishment",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Pressure Containment Equipment",
        "commodities": [
          {
            "n": "Coiled Tubing Pipe Purchase",
            "f": "Coiled Tubing Pipe",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing Pipe Services",
            "f": "Coiled Tubing Pipe",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flexible Hoses Services",
            "f": "Flow Control - Flexible Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "High Pressure Flexible Hoses Purchase (Coflexip)",
            "f": "Flow Control - Flexible Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "High Pressure Flexible Hoses Rental (Coflexip)",
            "f": "Flow Control - Flexible Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Low Pressure Flexible Hoses Purchase",
            "f": "Flow Control - Flexible Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Low Pressure Flexible Hoses Rental",
            "f": "Flow Control - Flexible Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Surface Crossover, Adapters & Flanges",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treating Iron Accessories, Spare Parts & Consumables",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treating Iron Piping Purchase (Straight Joint, Swivel, Tee)",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treating Iron Rental",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treating Iron Services (Inspection, Certification, Repair)",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treating Iron Valves Purchase (Plug, Check, Relief Valves)",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Well Testing Piping, Flowback Iron (Piping, Elbow, Tee)",
            "f": "Flow Control - Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flexible Hoses",
            "f": "High Pressure Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flexible Steel Hoses (Coflexip)",
            "f": "High Pressure Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "High Pressure Hoses - Rental",
            "f": "High Pressure Hoses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flow Control Recertification",
            "f": "Recertification Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wellhead Maintenance & Recertification",
            "f": "Recertification Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Chokes & Choke Manifolds",
            "f": "Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flowback Iron (Piping, Elbows)",
            "f": "Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Flow Control Valves (Gate, Globe, Ball)",
            "f": "Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pressure Relief & Safety Valves",
            "f": "Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treating Iron Equipment",
            "f": "Valves & Piping",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cement Heads & Accessories",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing WPCE",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drilling BOP",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Frac Head Equipment",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subsea Wellhead Equipment",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Surface Wellhead & Xmas Tree",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline/Slickline WPCE",
            "f": "Wellhead Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing WPCE Accessories, Spare Parts & Consumables",
            "f": "Wellhead Equipment - Coiled Tubing WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing WPCE Purchase",
            "f": "Wellhead Equipment - Coiled Tubing WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing WPCE Rental",
            "f": "Wellhead Equipment - Coiled Tubing WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing WPCE Services",
            "f": "Wellhead Equipment - Coiled Tubing WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Surface Wellhead Purchase (Frac Head, Flowhead, Cement Head)",
            "f": "Wellhead Equipment - Surface Wellhead",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Surface Wellhead Rental (Frac Head, Flowhead, Cement Head)",
            "f": "Wellhead Equipment - Surface Wellhead",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Surface Wellhead Services (Frac Head, Flowhead, Cement Head)",
            "f": "Wellhead Equipment - Surface Wellhead",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treesaver Tool Accessories, Spare Parts & Consumables",
            "f": "Wellhead Equipment - Treesaver",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treesaver Tool Purchase (Wellhead Isolation Tool)",
            "f": "Wellhead Equipment - Treesaver",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treesaver Tool Rental (Wellhead Isolation Tool)",
            "f": "Wellhead Equipment - Treesaver",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treesaver Tool Services (Wellhead Isolation Tool)",
            "f": "Wellhead Equipment - Treesaver",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline/Slickline WPCE Accessories, Spare Parts & Consumables",
            "f": "Wellhead Equipment - Wireline/Slickline WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline/Slickline WPCE Purchase",
            "f": "Wellhead Equipment - Wireline/Slickline WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline/Slickline WPCE Rental",
            "f": "Wellhead Equipment - Wireline/Slickline WPCE",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline/Slickline WPCE Services",
            "f": "Wellhead Equipment - Wireline/Slickline WPCE",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Regulated Materials",
        "commodities": [
          {
            "n": "Detonators & Boosters",
            "f": "Explosives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Explosive Accessories",
            "f": "Explosives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Explosive Powder",
            "f": "Explosives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Shaped Charges",
            "f": "Explosives",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Neutron Sources",
            "f": "Nuclear Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pulse Neutron Generators (PNG)",
            "f": "Nuclear Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Logging Sources",
            "f": "Radioactive Sources",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Source Handling Equipment",
            "f": "Radioactive Sources",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Fuel, Lubricants and Gases",
    "subs": [
      {
        "name": "Diesel",
        "commodities": [
          {
            "n": "Diesel Exhaust Fluid (DEF) for On-Site Fueling",
            "f": "Bulk & Onsite",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel - Off-Road (Red/Dyed) Bulk Transport/Inventory Fuel",
            "f": "Bulk & Onsite",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel - Off-Road (Red/Dyed) On-Site Fueling",
            "f": "Bulk & Onsite",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel - On-Road (Green/Clear) Bulk Transport/Inventory Fuel",
            "f": "Bulk & Onsite",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel - On-Road (Green/Clear) On-Site Fueling",
            "f": "Bulk & Onsite",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel - Off-Road Fuel Card/Petrol Station",
            "f": "Retail & Alternative",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Diesel - On-Road Fuel Card/Petrol Station",
            "f": "Retail & Alternative",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Gases",
        "commodities": [
          {
            "n": "Compressed Natural Gas (CNG)",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ethanol",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ethanol Based Fuel",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Kerosene",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Liquefied Natural Gas (LNG)",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Methane",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Unleaded Gasoline for Bulk Transport/Inventory Fuel",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Unleaded Gasoline for Fuel Card/Petrol Station",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Unleaded Gasoline for On-Site Fueling",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Urea/Diesel Exhaust Fluid (DEF)",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vehicle Propane",
            "f": "Alternative Fuels",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Argon",
            "f": "Industrial Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Carbon Dioxide (CO2)",
            "f": "Industrial Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Helium",
            "f": "Industrial Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Industrial Nitrogen",
            "f": "Industrial Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Industrial Oxygen",
            "f": "Industrial Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mixed & Specialty Gases",
            "f": "Industrial Gases",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Lubricants",
        "commodities": [
          {
            "n": "Antifreeze",
            "f": "Lubricants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Engine Oil",
            "f": "Lubricants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hydraulic Fluid",
            "f": "Lubricants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Industrial Grease",
            "f": "Lubricants",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Transmission Fluid for Land Based Lubricants",
            "f": "Lubricants",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Inspection & Certification",
    "subs": [
      {
        "name": "Calibration Services",
        "commodities": [
          {
            "n": "Flow Meter Calibration",
            "f": "Calibration Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Instrument Calibration",
            "f": "Calibration Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pressure Gauge Calibration",
            "f": "Calibration Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Temperature Calibration",
            "f": "Calibration Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Certificates",
        "commodities": [
          {
            "n": "Equipment Certification",
            "f": "Certification Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Material Certification",
            "f": "Certification Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Personnel Certification",
            "f": "Certification Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "System Certification",
            "f": "Certification Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Inspections & Quality Assurance",
        "commodities": [
          {
            "n": "Internal Audits",
            "f": "Audits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Third Party Audits",
            "f": "Audits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Class Services - Marine Assurance",
            "f": "Class Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Class Services - Offshore Classification",
            "f": "Class Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Marine Classification",
            "f": "Class Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Offshore Classification",
            "f": "Class Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "QHSE Training",
            "f": "Consulting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Risk Management Advisory",
            "f": "Consulting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Technical Support Services",
            "f": "Consulting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Consulting Services - Technical Support",
            "f": "Consulting Services (Inspection & Quality)",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inspection Services",
            "f": "Technical Assurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "NDT Inspection Services",
            "f": "Technical Assurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Testing Services",
            "f": "Technical Assurance",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Lifting Equipment",
    "subs": [
      {
        "name": "Crains",
        "commodities": [
          {
            "n": "Crane Maintenance Services",
            "f": "Crane Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crane Operator Services",
            "f": "Crane Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crane Rental Services",
            "f": "Crane Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "All Terrain Cranes",
            "f": "Mobile Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crawler Cranes",
            "f": "Mobile Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Truck Mounted Cranes",
            "f": "Mobile Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Knuckle Boom Cranes",
            "f": "Offshore Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pedestal Cranes",
            "f": "Offshore Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gantry Cranes",
            "f": "Static Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Overhead Cranes",
            "f": "Static Cranes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tower Cranes",
            "f": "Static Cranes",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Forklift",
        "commodities": [
          {
            "n": "Diesel/LPG Forklifts",
            "f": "Counterbalance Forklifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Electric Forklifts",
            "f": "Counterbalance Forklifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Forklift Maintenance",
            "f": "Forklift Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Forklift Rental",
            "f": "Forklift Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rough Terrain Forklifts",
            "f": "Heavy Duty Forklifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Telehandlers",
            "f": "Heavy Duty Forklifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pallet Trucks",
            "f": "Warehouse Forklifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Reach Trucks",
            "f": "Warehouse Forklifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lifting Equipment & Accessories",
            "f": "Material Handling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lifting Equipment & Accessories Maintenance & Certification",
            "f": "Material Handling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lifting Equipment & Accessories Rental",
            "f": "Material Handling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Material Handling Equipment (Forklifts, Pallet Trucks)",
            "f": "Material Handling",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Riggers",
        "commodities": [
          {
            "n": "Rigging Hardware",
            "f": "Rigging Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Spreader Bars & Lifting Beams",
            "f": "Rigging Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Certified Riggers",
            "f": "Rigging Personnel",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rigging Supervisors",
            "f": "Rigging Personnel",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Lift Services",
            "f": "Rigging Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lift Planning Services",
            "f": "Rigging Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Slings & Wire Rope",
        "commodities": [
          {
            "n": "Grade 100 Chain Slings",
            "f": "Chain Slings",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Grade 80 Chain Slings",
            "f": "Chain Slings",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lifting Equipment Inspection",
            "f": "Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Load Testing Services",
            "f": "Inspection Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Eyebolts & Pad Eyes",
            "f": "Lifting Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hooks & Links",
            "f": "Lifting Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Shackles",
            "f": "Lifting Accessories",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Polyester Round Slings",
            "f": "Synthetic Slings",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Webbing Slings",
            "f": "Synthetic Slings",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Steel Wire Rope",
            "f": "Wire Rope",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wire Rope Fittings",
            "f": "Wire Rope",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wire Rope Slings",
            "f": "Wire Rope",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Maintenance & Repair Operations",
    "subs": [
      {
        "name": "DHT",
        "commodities": [
          {
            "n": "Downhole Tool Cleaning Services",
            "f": "Downhole Tool MRO",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Tool Repair & Reconditioning",
            "f": "Downhole Tool MRO",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Downhole Tool Spare Parts",
            "f": "Downhole Tool MRO",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Fabrication",
        "commodities": [
          {
            "n": "Manufacturing Machinery (CNC, Lathe, Grinding, Welding)",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Manufacturing Machinery Servicing",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Paints (Bulk, Bucket, etc.)",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Paint Service",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Field Technical Equipment & Services",
        "commodities": [
          {
            "n": "Field Equipment Calibration Services",
            "f": "Field Equipment MRO",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Field Equipment Repair & Overhaul",
            "f": "Field Equipment MRO",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Field Equipment Spare Parts & Components",
            "f": "Field Equipment MRO",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Filters",
        "commodities": [
          {
            "n": "Filtration & Rubber Accessories",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Hydraulic",
        "commodities": [
          {
            "n": "Hydraulic or Pneumatic Pump & Related Spares",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pipes or Hoses, Valves & Fittings (Commercial Items)",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Insulation",
        "commodities": [
          {
            "n": "Acoustic Insulation Materials",
            "f": "Insulation Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Insulation Installation Services",
            "f": "Insulation Materials",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Thermal Insulation Materials",
            "f": "Insulation Materials",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Machine Shop",
        "commodities": [
          {
            "n": "Adhesives & Sealants",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fasteners & Hardware",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Kevlar, Optical Fiber, Yarn, Other Fabrics",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Laboratory & Testing - Calibration & Repair Services",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Laboratory & Testing - Lab Instruments (Non-Chemical)",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Measuring & Inspection",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mechanical Drive & Accessories",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tools & Metal Cutting Accessories",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Mechanical Lifting Equipment",
        "commodities": [
          {
            "n": "Material Handling & Securing",
            "f": "MRO or Distributor Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Mechanical Seals",
        "commodities": [
          {
            "n": "Mechanical Seal Assemblies",
            "f": "Mechanical Seals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mechanical Seal Repair Services",
            "f": "Mechanical Seals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mechanical Seal Spare Parts & Kits",
            "f": "Mechanical Seals",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Radiators",
        "commodities": [
          {
            "n": "Radiator Cores & Assemblies",
            "f": "Radiators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Radiator Repair & Maintenance",
            "f": "Radiators",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Radiator Spare Parts",
            "f": "Radiators",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Sling and Shackles",
        "commodities": [
          {
            "n": "Rigging Equipment Inspection & Recertification",
            "f": "Rigging MRO",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sling & Shackle Replacement Parts",
            "f": "Rigging MRO",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Natural Sand",
    "subs": [
      {
        "name": "Proppant",
        "commodities": [
          {
            "n": "Fracturing Sands",
            "f": "Well fracturing proppants",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Nitrogen",
    "subs": [
      {
        "name": "Commodities Chemicals",
        "commodities": [
          {
            "n": "Helium",
            "f": "Gases",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Liquid Nitrogen",
            "f": "Nitrogen",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Direct",
    "name": "Operation Rental",
    "subs": [
      {
        "name": "Non-Field Technical rental equipment",
        "commodities": [
          {
            "n": "HVAC Equipment Rental",
            "f": "General Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lighting Equipment Rental",
            "f": "General Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Power Tools Rental",
            "f": "General Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Communication Equipment Rental",
            "f": "Office Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IT Equipment Rental",
            "f": "Office Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Furniture Rental",
            "f": "Office Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Technical Rental equipment",
        "commodities": [
          {
            "n": "Flowback Equipment Rental",
            "f": "Completion Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wellhead Equipment Rental",
            "f": "Completion Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Well Testing Equipment Rental",
            "f": "Completion Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mud Systems Rental",
            "f": "Drilling Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Rentals",
            "f": "Drilling Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Solids Control Rental",
            "f": "Drilling Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Coiled Tubing Units Rental",
            "f": "Well Service Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Nitrogen Equipment Rental",
            "f": "Well Service Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireline Units Rental",
            "f": "Well Service Equipment Rental",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "Facility",
    "subs": [
      {
        "name": "Catering Services",
        "commodities": [
          {
            "n": "Catering Services",
            "f": "Catering Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Banquet Services",
            "f": "Event Catering",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Meeting & Event Catering",
            "f": "Event Catering",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Kitchen Equipment Maintenance",
            "f": "Kitchen Operations",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Kitchen Equipment Supply",
            "f": "Kitchen Operations",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cafeteria Services",
            "f": "On-Site Catering",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crew Catering Services",
            "f": "On-Site Catering",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Rig Catering Services",
            "f": "On-Site Catering",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drinking Water Supply",
            "f": "Pantry & Vending",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pantry Supplies",
            "f": "Pantry & Vending",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vending Machine Services",
            "f": "Pantry & Vending",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Engineering & Construction",
        "commodities": [
          {
            "n": "Engineering & Construction",
            "f": "Engineering & Construction",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Professional Fees & Commissioning Services",
            "f": "Closing Process - Commissioning Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Civil Works Construction",
            "f": "Construction Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Electrical Construction",
            "f": "Construction Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "General Contracting",
            "f": "Construction Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HVAC Installation",
            "f": "Construction Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plumbing Construction",
            "f": "Construction Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Structural Construction",
            "f": "Construction Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Architectural Design",
            "f": "Design Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Civil Engineering Design",
            "f": "Design Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "MEP Design Services",
            "f": "Design Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Structural Engineering Design",
            "f": "Design Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Architectural, Civil & Structural Works",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Construction Consultancy & Professional Services",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Construction Materials & Equipment",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Energy Conservation & Energy Saving Features Installation",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fit Out & Site Renovation Products",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fit Out & Site Renovation Services",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "General Contractor Management & Preliminaries",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IT, Communications, Security, Safety & Access Equipment",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IT, Communications, Security, Safety & Access Installation",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Landscape Architecture",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mechanical, Electrical & Plumbing (MEP)",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Non Rig-site Non-Facility Construction (Clients Contracts)",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pre-Fabricated Structures",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Site Preparation & Exterior Works",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Site Supervision & Project Management",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Site Utilities & Services Network",
            "f": "Execution Process - Construction Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "All Disciplines Construction Contractor Design",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Architectural, Interior Design & Professional Services",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Civil Engineering Discipline",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HVAC Design Discipline",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mechanical & Electrical Engineering Discipline",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plumbing & Drainage Engineering Discipline",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Quantity Surveying & Cost Estimation",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Structural & Geotechnical Engineering Disciplines",
            "f": "Execution Process - Design Phase",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Consulting to Improve Operational Flow within Facility",
            "f": "Planning Process - Feasibility",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Environmental & Legal Assessment & Permits",
            "f": "Planning Process - Feasibility",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Site Assessment, Surveys & Investigations",
            "f": "Planning Process - Feasibility",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Construction Management Services",
            "f": "Project Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Project Commissioning Services",
            "f": "Project Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fire Protection Systems",
            "f": "Specialty Construction",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Landscaping Construction",
            "f": "Specialty Construction",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Security Systems Installation",
            "f": "Specialty Construction",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Furniture",
        "commodities": [
          {
            "n": "Furniture",
            "f": "Furniture",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Kitchen Appliances",
            "f": "Appliances",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Appliances",
            "f": "Appliances",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Meeting Room Furniture",
            "f": "Office Furniture",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Chairs & Seating",
            "f": "Office Furniture",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Desks & Workstations",
            "f": "Office Furniture",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Filing Cabinets & Storage",
            "f": "Storage Furniture",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Shelving Systems",
            "f": "Storage Furniture",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Operations & Maintenance",
        "commodities": [
          {
            "n": "Operations & Maintenance",
            "f": "Operations & Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Archiving & Document Storage",
            "f": "Archiving & Document Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Shredding Services",
            "f": "Archiving & Document Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Building Exterior Maintenance",
            "f": "Building Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Corrective Maintenance Services",
            "f": "Building Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Preventive Maintenance Services",
            "f": "Building Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Deep Cleaning Services",
            "f": "Cleaning Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Janitorial Services",
            "f": "Cleaning Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Window Cleaning Services",
            "f": "Cleaning Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fire & Life Safety Equipment",
            "f": "Fire & Life Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fire & Life Safety Services",
            "f": "Fire & Life Safety Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Landscaping Services",
            "f": "Grounds Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Roads & Pavement Maintenance",
            "f": "Grounds Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Facility - Skilled Temp Labor (Handy Man, Electrician)",
            "f": "Hard Services - Temp Labor",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Facility - Laundry Services",
            "f": "Laundry Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mailing Room Services",
            "f": "Mailing Room Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "At Facility Medic & Nurses Services",
            "f": "Medical Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Non-Facility Medic & Nurses Services",
            "f": "Medical Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Medicines & First Aid Supplies",
            "f": "Medicines & First Aid",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Supplies for Log Printing",
            "f": "Non-Facility Supplies",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Assistance (Receptionist, Admins)",
            "f": "Office Assistance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Moving (Move, Add & Changes)",
            "f": "Office Moving",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Supplies (Excluding IT & Operation Supplies)",
            "f": "Office Supplies",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pest Control Services",
            "f": "Pest Control",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HSE Certification/Inspection for Statutory & Safety",
            "f": "Statutory Safety Inspection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Electrical Maintenance Services",
            "f": "Technical Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Elevator Maintenance Services",
            "f": "Technical Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Generator & UPS Maintenance",
            "f": "Technical Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HVAC Maintenance Services",
            "f": "Technical Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Plumbing Maintenance Services",
            "f": "Technical Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Facility - Non-Skilled (Helper, Cleaner)",
            "f": "Temp Labor - Facility",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Facility - Skilled (Handy Man, Electrician, Fork-Driver)",
            "f": "Temp Labor - Facility",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Property Management",
        "commodities": [
          {
            "n": "Property Management",
            "f": "Property Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Building & Land Tax and Municipality Fees",
            "f": "Buildings & Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fixed Crew Housing (Staff House Rental)",
            "f": "Buildings & Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lease & Rent Property (excluding Employee Housing)",
            "f": "Buildings & Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Real Estate Broker Services (excluding Employee Housing)",
            "f": "Buildings & Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Site Selection & Appraisal Services",
            "f": "Buildings & Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Temporary Crew Accommodation (Travel to Job)",
            "f": "Buildings & Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Turnkey Fixed Camp Rental including Hospitality Services",
            "f": "Camp Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Land Lease",
            "f": "Lease Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Office Space Lease",
            "f": "Lease Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Warehouse Space Lease",
            "f": "Lease Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Building & Land Taxation",
            "f": "Property Taxes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Property Valuation Services",
            "f": "Real Estate Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Real Estate Brokerage",
            "f": "Real Estate Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Security",
        "commodities": [
          {
            "n": "Security",
            "f": "Security",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Access Control Systems",
            "f": "Electronic Security",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Alarm & Intrusion Detection",
            "f": "Electronic Security",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "CCTV Systems & Monitoring",
            "f": "Electronic Security",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Armed Security Services",
            "f": "Guarding Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Manned Security Services",
            "f": "Guarding Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Reception & Concierge Security",
            "f": "Guarding Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Security Risk Assessment",
            "f": "Security Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Security System Design",
            "f": "Security Consulting",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Staff House",
        "commodities": [
          {
            "n": "Staff House",
            "f": "Staff House",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Camp Housekeeping Services",
            "f": "Camp Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Camp Management Services",
            "f": "Camp Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Camp Recreation Services",
            "f": "Camp Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Integrated Camp Management Services",
            "f": "Camp Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crew Camp Services",
            "f": "Crew Accommodation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hotel Crew Accommodation",
            "f": "Crew Accommodation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Staff House Rental",
            "f": "Crew Accommodation",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Utility",
        "commodities": [
          {
            "n": "Utility",
            "f": "Utility",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Electricity Supply",
            "f": "Electricity",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Renewable Energy Supply",
            "f": "Electricity",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Energy Audit Services",
            "f": "Energy Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Energy Conservation Services",
            "f": "Energy Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Generator Fuel Supply",
            "f": "Fuel",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Natural Gas Supply",
            "f": "Natural Gas",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Industrial Water Supply",
            "f": "Water",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Water Supply Services",
            "f": "Water",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Waste Disposal",
        "commodities": [
          {
            "n": "Waste Disposal",
            "f": "Waste Disposal",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Environmental Baseline Audits and Survey",
            "f": "Environmental Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Environmental Management & Protection Services",
            "f": "Environmental Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Environmental Remediation",
            "f": "Environmental Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazardous & Industrial Waste Containers & Accessories (Buy)",
            "f": "Facility Containment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazardous & Industrial Waste Containers & Accessories - Rental",
            "f": "Facility Containment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pollutants Tracking, Monitoring, Rehabilitation Services",
            "f": "Facility Waste Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Municipal Waste Collection",
            "f": "General Waste",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Recycling Services",
            "f": "General Waste",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Chemical Waste Disposal",
            "f": "Hazardous Waste",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazardous Waste Disposal",
            "f": "Hazardous Waste",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Industrial Waste Incineration",
            "f": "Hazardous Waste",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Spill Cleanup Services",
            "f": "Spill Response",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drainage Services",
            "f": "Wastewater",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wastewater Treatment Services",
            "f": "Wastewater",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "HR",
    "subs": [
      {
        "name": "Light vehicles",
        "commodities": [
          {
            "n": "Light vehicles",
            "f": "Light vehicles",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Light Vehicles",
        "commodities": [
          {
            "n": "Car Allowance Programs",
            "f": "Employee Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Company Car Lease",
            "f": "Employee Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pool Vehicle Services",
            "f": "Employee Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fleet Management Services",
            "f": "Vehicle Administration",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vehicle Insurance",
            "f": "Vehicle Administration",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Medical Checkup",
        "commodities": [
          {
            "n": "Medical Checkup",
            "f": "Medical Checkup",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Industrial Hygiene",
            "f": "Environment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Annual Health Checkups",
            "f": "Periodic Medical",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Occupational Health Assessments",
            "f": "Periodic Medical",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Drug & Alcohol Testing",
            "f": "Pre-Employment Medical",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pre-Employment Screening",
            "f": "Pre-Employment Medical",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Regulatory Compliance",
            "f": "Safety",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Risk Management Providers",
            "f": "Safety",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fitness for Duty Assessments",
            "f": "Specialty Assessments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vision & Hearing Tests",
            "f": "Specialty Assessments",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Medical Insurance",
        "commodities": [
          {
            "n": "Medical Insurance",
            "f": "Medical Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Employee Seniority Awards and Recognition",
            "f": "Awards & Recognition",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Life Insurance and AD&D providers & Plan administrators",
            "f": "Deferred & Insured Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Retirement Plans (Pension, Savings, Provident Funds)",
            "f": "Deferred & Insured Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "EAP Services",
            "f": "Employee Assistance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mental Health Services",
            "f": "Employee Assistance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Medical Check Up",
            "f": "Employee Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Schooling (For Employee Dependents Only)",
            "f": "Employee Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Housing Business Delivery (not crew related)",
            "f": "Fringe & Mobility Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Housing Business Enablement (not crew related)",
            "f": "Fringe & Mobility Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Recreational Membership & Discount Programs",
            "f": "Fringe & Mobility Benefits",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Dental Insurance",
            "f": "Health Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Group Medical Insurance",
            "f": "Health Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vision Insurance",
            "f": "Health Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Disability Insurance",
            "f": "Life & Disability",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Group Life Insurance",
            "f": "Life & Disability",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Recruitment",
        "commodities": [
          {
            "n": "Recruitment",
            "f": "Recruitment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Executive Search Firms",
            "f": "Agency Recruitment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Recruitment Agencies",
            "f": "Agency Recruitment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Technical Recruitment Specialists",
            "f": "Agency Recruitment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Assessment & Testing Services",
            "f": "Assessment Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Background Verification",
            "f": "Assessment Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Direct Hire Recruiting or Headhunting Firm",
            "f": "Direct Hire Recruiting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Job Boards & Social Media",
            "f": "Direct Hire Recruiting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Recruiting Process Outsourcing",
            "f": "Direct Hire Recruiting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Job Posting Services",
            "f": "Direct Sourcing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Recruitment Marketing",
            "f": "Direct Sourcing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Relocation Services",
            "f": "Onboarding",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Visa & Immigration Services",
            "f": "Onboarding",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Relocation Management Companies",
            "f": "Relocation Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Household Good Shipments, Packing, Storage",
            "f": "Relocation Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Relocation Services - Destination Services",
            "f": "Relocation Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Training",
        "commodities": [
          {
            "n": "Training",
            "f": "Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Business Delivery Training",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Business Enablement Training",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HSE Services Training",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IT Training",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Leadership Development Training",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "NExT Training",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Professional Certifications & Memberships",
            "f": "Continued Education & Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Custom E-Learning Development",
            "f": "E-Learning",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Online Learning Platforms",
            "f": "E-Learning",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Conferences & Seminars",
            "f": "External Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Professional Certifications",
            "f": "External Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Leadership Training",
            "f": "Professional Development",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Soft Skills Training",
            "f": "Professional Development",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IT Skills Training",
            "f": "Technical Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety & Compliance Training",
            "f": "Technical Training",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Technical Skills Training",
            "f": "Technical Training",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "IT",
    "subs": [
      {
        "name": "Hardware",
        "commodities": [
          {
            "n": "Hardware",
            "f": "Hardware",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Computers, PCs, Tablet - Rental",
            "f": "Computers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Desktop Computers",
            "f": "Computers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Handheld Computer Scanners",
            "f": "Computers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Laptop Computers",
            "f": "Computers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tablets",
            "f": "Computers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Uninterrupted Power Supplies (UPS)",
            "f": "Critical Power for DC",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Data Storage, Tape Library",
            "f": "Maintenance & Repairs, Spare Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Data Storage, Tape Library - Data Processing",
            "f": "Maintenance & Repairs, Spare Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Maintenance & Repairs, Spare Parts for Computer",
            "f": "Maintenance & Repairs, Spare Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Maintenance & Repairs, Spare Parts for Servers",
            "f": "Maintenance & Repairs, Spare Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Maintenance & Repairs, Spare Parts for Telecom Equipment",
            "f": "Maintenance & Repairs, Spare Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Accessories",
            "f": "Mobile Devices",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Phones",
            "f": "Mobile Devices",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Input Devices",
            "f": "Peripherals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Monitors & Displays",
            "f": "Peripherals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Printers & MFDs",
            "f": "Peripherals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Visual Display Units (Large Format Displays - Not Desktop)",
            "f": "Peripherals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Facility - Managed Printers Services - Lease",
            "f": "Printers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Printer Supplies, Spare Parts, Maintenance (not paper)",
            "f": "Printers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Specialized Label Printers",
            "f": "Printers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Enterprise Servers & Mid-Range - Lease",
            "f": "Server",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Server Support & Extension",
            "f": "Server",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Enterprise Servers",
            "f": "Servers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Server Accessories & Parts",
            "f": "Servers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Data Storage Systems",
            "f": "Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Storage Media",
            "f": "Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Storage Media (Tapes & Library) - Data Processing",
            "f": "Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Storage Systems High End - Datacenter - Lease",
            "f": "Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Storage System Support & Extension",
            "f": "Storage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fixed phones & PBX (Legacy or IP)",
            "f": "Telecom Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Satellite Equipment",
            "f": "Telecom Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Telecom Infrastructure Hardware",
            "f": "Telecom Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Video-Conferencing Equipment",
            "f": "Telecom Equipment",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Hardware/ Software",
        "commodities": [
          {
            "n": "Hardware/ Software",
            "f": "Hardware/ Software",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Infrastructure",
        "commodities": [
          {
            "n": "Infrastructure",
            "f": "Infrastructure",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fiber Optic Infrastructure",
            "f": "Cabling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Structured Cabling",
            "f": "Cabling",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Conferencing Services - Audio & Web",
            "f": "Conferencing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cloud Infrastructure Services",
            "f": "Data Center",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Data Center Hosting Services",
            "f": "Data Center",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Data Network Services (Terrestrial)",
            "f": "Data Networks",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IPT Management Services (IP Telephony)",
            "f": "Fixed Voice",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Voice Services - Fixed Line, Fax, & Toll",
            "f": "Fixed Voice",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Services - Cellular Voice, 3G Data, & Pagers",
            "f": "Mobile Voice & Data",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Firewalls & Security Appliances",
            "f": "Network Infrastructure",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Network Switches & Routers",
            "f": "Network Infrastructure",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Wireless Infrastructure",
            "f": "Network Infrastructure",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Satellite Communications Services (VSAT, L-Band, M2M)",
            "f": "Satellite Networks",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Management for Telecom Device & Services",
            "f": "Telecom Expenses Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "PBX & Phone Systems",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Satellite Communication",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Video Conferencing Systems",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Licenses",
        "commodities": [
          {
            "n": "Licenses",
            "f": "Licenses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Perpetual Software Licenses",
            "f": "Software Licenses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Software Maintenance & Support",
            "f": "Software Licenses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subscription Software Licenses",
            "f": "Software Licenses",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fixed Line Services",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Internet Services",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Mobile Voice & Data Services",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Satellite Services",
            "f": "Telecommunications",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Software",
        "commodities": [
          {
            "n": "Software",
            "f": "Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Application Development, Systems Integration & Sustaining",
            "f": "Application Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Consulting & Research Services Related To IT",
            "f": "Application Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Enterprise Applications",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Productivity Software",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Software as a Service (SaaS)",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Software (Maintenance & Support)",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Software (Perpetual License)",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Software (Termed Licenses)",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Specialized Applications",
            "f": "Application Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Database Management Systems",
            "f": "Database Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hosting Co-location Services",
            "f": "Data Center Hosting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hosting Infrastructure-as-a-Service (IaaS)",
            "f": "Data Center Hosting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "On-premise Data Center Hosting Services",
            "f": "Data Center Hosting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Data & Record Migration, Storage, Digitization",
            "f": "Data Record Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "IT Strategy",
            "f": "IT Strategy Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Desktop Operating Systems",
            "f": "Operating Systems",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Server Operating Systems",
            "f": "Operating Systems",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Antivirus & Endpoint Security",
            "f": "Security Software",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Firewall & Network Security",
            "f": "Security Software",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "Logistics",
    "subs": [
      {
        "name": "Crew Transportation",
        "commodities": [
          {
            "n": "Crew Transportation",
            "f": "Crew Transportation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fixed Wing Charter",
            "f": "Air Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Helicopter Charter Services",
            "f": "Air Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crew Land Shuttle to & from Jobsite",
            "f": "Crew Shuttle Land",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Charter - Helicopters - People Movers",
            "f": "Crew Shuttle Other",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crew Bus Services",
            "f": "Ground Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crew Van Services",
            "f": "Ground Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Crew Boat Services",
            "f": "Marine Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fast Supply Vessel Crew Transfer",
            "f": "Marine Transport",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Custom Clearance Services",
        "commodities": [
          {
            "n": "Custom Clearance Services",
            "f": "Custom Clearance Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bonded Transit Document Fee",
            "f": "Customs Clearance Agent Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Customs Clearance Fees",
            "f": "Customs Clearance Agent Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Customs Fines and Penalties",
            "f": "Customs Clearance Agent Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Customs Duties",
            "f": "Customs Duties",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Customs Duties Payment",
            "f": "Duties & Taxes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Trade Compliance Services",
            "f": "Duties & Taxes",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Export Customs Clearance",
            "f": "Export Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Export Documentation",
            "f": "Export Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Import Customs Clearance",
            "f": "Import Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Import Documentation",
            "f": "Import Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Freight Forwarding Services",
        "commodities": [
          {
            "n": "Freight Forwarding Services",
            "f": "Freight Forwarding Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Charter",
            "f": "Charter Brokers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean Charter",
            "f": "Charter Brokers",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Domestic Distribution",
            "f": "Domestic Forwarding",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Freight Payment System - Auditor Fees",
            "f": "Freight Payment System",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Freight Payment System - Passthrough Charges",
            "f": "Freight Payment System",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Freight Forwarding",
            "f": "International Forwarding",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Multimodal Forwarding",
            "f": "International Forwarding",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sea Freight Forwarding",
            "f": "International Forwarding",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Parcel - Domestic Shipment",
            "f": "Parcel",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Parcel - International Shipment",
            "f": "Parcel",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Postage",
            "f": "Postage & Courier",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cargo Insurance",
            "f": "Value Added Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cargo Tracking",
            "f": "Value Added Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Heavy Trucks and Parts",
        "commodities": [
          {
            "n": "Heavy Trucks and Parts",
            "f": "Heavy Trucks and Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Domestic - Bulk Cargo",
            "f": "Call Out Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Domestic - Hotshot",
            "f": "Call Out Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "International - Bulk Cargo",
            "f": "Call Out Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "International - Full Truckload (FTL)",
            "f": "Call Out Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "International - Hotshot",
            "f": "Call Out Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "International - Less Than Truckload (LTL)",
            "f": "Call Out Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Demurrage & Detention (Trucking)",
            "f": "Demurrage & Detention (Trucking)",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Trucks/Trailers - Rental/Lease",
            "f": "Fleet Rental Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Duty Vehicle - Purchase (Body, Chassis, Truck, Tractor)",
            "f": "Heavy Trucks & Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Duty Vehicle - Purchase (Maintenance Parts & Spares)",
            "f": "Heavy Trucks & Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Powertrain Planned/Routine Maintenance - Heavy Vehicles",
            "f": "Heavy Trucks & Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Standard Trailers - Purchase (Tanker Trailers, Flatbeds)",
            "f": "Heavy Trucks & Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Duty Trucks",
            "f": "Heavy Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Specialized Heavy Vehicles",
            "f": "Heavy Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Vehicle Maintenance",
            "f": "Parts & Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Vehicle Spare Parts",
            "f": "Parts & Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tire Services",
            "f": "Parts & Maintenance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Domestic - Tank Truck",
            "f": "Tank Truck",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "International - Tank Truck",
            "f": "Tank Truck",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Light Vehicles for Operation",
        "commodities": [
          {
            "n": "Light Vehicles for Operation",
            "f": "Light Vehicles for Operation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Material Handling Rental Rigsite - Excl Crane Services",
            "f": "Lease & Rent",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pickup Trucks",
            "f": "Light Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SUVs & 4x4 Vehicles",
            "f": "Light Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vans & Utility Vehicles",
            "f": "Light Vehicles",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Light Duty Vehicle Maintenance Parts & Spares",
            "f": "Light Vehicles & Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Light Duty Vehicle - Purchase",
            "f": "Light Vehicles & Parts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Driving Monitors (Hardware & Related Charges)",
            "f": "Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "RDMD, DIM Installation & Services",
            "f": "Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Subscription Costs Related to Driving Monitors",
            "f": "Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fuel Cards & Management",
            "f": "Vehicle Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Light Vehicle Lease & Rental",
            "f": "Vehicle Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Light Vehicle Maintenance",
            "f": "Vehicle Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Shipping Services",
        "commodities": [
          {
            "n": "Shipping Services",
            "f": "Shipping Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Cargo Services",
            "f": "Air Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Express Air Services",
            "f": "Air Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Shipment - Dangerous Goods",
            "f": "Air Shipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Shipment - Express",
            "f": "Air Shipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air Shipment - Standard",
            "f": "Air Shipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Barges",
            "f": "Barge",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Air & Ocean Demurrage, Detention & Storage",
            "f": "Demurrage & Detention (Freight Shipping)",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean Break Bulk",
            "f": "Ocean Bulk Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean Dry Bulk",
            "f": "Ocean Bulk Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean Liquid Bulk",
            "f": "Ocean Bulk Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean FCL",
            "f": "Ocean Container Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean FCL - Dangerous Goods",
            "f": "Ocean Container Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean LCL",
            "f": "Ocean Container Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Ocean LCL - Dangerous Goods",
            "f": "Ocean Container Shipments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Break Bulk Shipping",
            "f": "Ocean Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Container Shipping",
            "f": "Ocean Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Port Terminal Services",
            "f": "Port Terminal Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Full Truckload (FTL)",
            "f": "Road Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Less Than Truckload (LTL)",
            "f": "Road Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tanker Transport",
            "f": "Road Freight",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazardous Materials Transport",
            "f": "Specialized Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Heavy Lift Transport",
            "f": "Specialized Transport",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Warehouse Services",
        "commodities": [
          {
            "n": "Cross-docking Services",
            "f": "Handling Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Inventory Management",
            "f": "Handling Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Pick & Pack Services",
            "f": "Handling Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "General Warehousing",
            "f": "Storage Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hazardous Materials Storage",
            "f": "Storage Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Temperature Controlled Storage",
            "f": "Storage Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Disposal Services",
            "f": "Warehousing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Handling In/Out",
            "f": "Warehousing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Packing",
            "f": "Warehousing Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sampling",
            "f": "Warehousing Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "Manpower",
    "subs": [
      {
        "name": "Manpower",
        "commodities": [
          {
            "n": "Manpower",
            "f": "Manpower",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Administrative Contract Staff",
            "f": "Contract Labor",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Field Operations Contract Staff",
            "f": "Contract Labor",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Technical Contract Staff",
            "f": "Contract Labor",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Managed Service Provider",
            "f": "Managed Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Statement of Work Services",
            "f": "Managed Services",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Staffing",
        "commodities": [
          {
            "n": "Contractor Cost Business Delivery",
            "f": "Contingent Workforce",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Contractor Cost Business Enablement",
            "f": "Contingent Workforce",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Payroll Service Providers",
            "f": "Contingent Workforce",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Vendor Management System & Managed Service Providers",
            "f": "Contingent Workforce",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Direct Hire Recruitment",
            "f": "Permanent Placement",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Executive Search Services",
            "f": "Permanent Placement",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Background Screening Services",
            "f": "Recruitment Support",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Job Boards & Advertising",
            "f": "Recruitment Support",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Seasonal Staff Services",
            "f": "Temporary Staffing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Temporary Labor Agencies",
            "f": "Temporary Staffing",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "Professional Services",
    "subs": [
      {
        "name": "Finance",
        "commodities": [
          {
            "n": "Finance",
            "f": "Finance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bookkeeping Services",
            "f": "Accounting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Financial Reporting Services",
            "f": "Accounting Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bank Charges",
            "f": "Banking",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Insurance (Including Building & Building Contents Insurance)",
            "f": "Banking",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Payroll Provider / Pension Administration",
            "f": "Banking",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Business Process Outsourcing Services (excluding IT & HR)",
            "f": "BPO Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Client Entertainment",
            "f": "Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gifts & Giveaways",
            "f": "Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Internal Entertainment",
            "f": "Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Social Club Dues & Memberships",
            "f": "Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Regulatory Agencies (Fees, Surcharges, Permits & Penalties)",
            "f": "Federal & State Payments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Financial Investment Consulting",
            "f": "Financial",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "External Audit Services",
            "f": "Financial Audit",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Internal Audit Services",
            "f": "Financial Audit",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Payments for Customs Related Tax or Duties Collections",
            "f": "Government Payments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Regulatory Agencies (Fees, Surcharges, Permits, & Penalties)",
            "f": "Government Payments",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "HR Consulting & Research Services",
            "f": "HR Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Management Consulting Services (excluding IT & HR)",
            "f": "Management Consulting",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Automobile Licenses & Taxes",
            "f": "Taxes & Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Franchise Taxes",
            "f": "Taxes & Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Local Taxes, Municipality Taxes, & Tax Authorities",
            "f": "Taxes & Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Miscellaneous (Taxes & Fees)",
            "f": "Taxes & Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Stamp Duties & Taxes",
            "f": "Taxes & Fees",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tax Advisory Services",
            "f": "Tax Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Tax Preparation Services",
            "f": "Tax Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Transfer Pricing Services",
            "f": "Tax Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Technical Consulting Services (excl. Field, Facilities, IT)",
            "f": "Technical Consulting",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Insurance",
        "commodities": [
          {
            "n": "Insurance",
            "f": "Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Group Life Insurance",
            "f": "Employee Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Workers Compensation Insurance",
            "f": "Employee Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Directors & Officers Insurance",
            "f": "Liability Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "General Liability Insurance",
            "f": "Liability Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Professional Indemnity Insurance",
            "f": "Liability Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Building & Contents Insurance",
            "f": "Property Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Business Interruption Insurance",
            "f": "Property Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Equipment & Machinery Insurance",
            "f": "Property Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cyber Insurance",
            "f": "Specialty Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Environmental Liability Insurance",
            "f": "Specialty Insurance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Marine Cargo Insurance",
            "f": "Specialty Insurance",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Legal",
        "commodities": [
          {
            "n": "Legal",
            "f": "Legal",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Contract Drafting & Review",
            "f": "Corporate Legal",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Corporate Governance Services",
            "f": "Corporate Legal",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "M&A Legal Services",
            "f": "Corporate Legal",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Arbitration & Mediation Services",
            "f": "Litigation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Commercial Litigation Services",
            "f": "Litigation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Employment Law Services",
            "f": "Regulatory & Compliance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Intellectual Property Services",
            "f": "Regulatory & Compliance",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Regulatory Compliance Services",
            "f": "Regulatory & Compliance",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Marketing",
        "commodities": [
          {
            "n": "Marketing",
            "f": "Marketing",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Advertising Agency Services",
            "f": "Advertising",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Digital Marketing Services",
            "f": "Advertising",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Media Buying Services",
            "f": "Advertising",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Graphic Design Services",
            "f": "Creative Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Video Production Services",
            "f": "Creative Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Donations / Sponsors",
            "f": "CSR & Donations",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Non-Deductible Donations",
            "f": "CSR & Donations",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "SEED Donations",
            "f": "CSR & Donations",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Student Organizations",
            "f": "CSR & Donations",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Event Management Services",
            "f": "Events & Promotions",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Promotional Items & Merchandise",
            "f": "Events & Promotions",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Sponsorships",
            "f": "Events & Promotions",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Market & Industry Research & Memberships",
            "f": "MarCom",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Translation & Interpretation Services",
            "f": "MarCom",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Printing Services",
            "f": "Print & Publications",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Publications & Subscriptions",
            "f": "Print & Publications",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Treasury",
        "commodities": [
          {
            "n": "Treasury",
            "f": "Treasury",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Bank Account Management",
            "f": "Cash Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Cash Pooling Services",
            "f": "Cash Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Payment Processing Services",
            "f": "Cash Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "FX Hedging Services",
            "f": "Foreign Exchange",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "FX Trading Services",
            "f": "Foreign Exchange",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Short-term Investment Services",
            "f": "Investment Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Treasury Advisory Services",
            "f": "Investment Management",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "Safety",
    "subs": [
      {
        "name": "Safety",
        "commodities": [
          {
            "n": "Safety",
            "f": "Safety",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Life Safety (PPE)",
        "commodities": [
          {
            "n": "Life Safety (PPE)",
            "f": "Life Safety (PPE)",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hi-Visibility Clothing",
            "f": "Body Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Coveralls",
            "f": "Body Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hearing Protection",
            "f": "Eye & Ear Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Glasses & Goggles",
            "f": "Eye & Ear Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Lanyards & Lifelines",
            "f": "Fall Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Harnesses",
            "f": "Fall Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Footwear",
            "f": "Hand & Foot Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Gloves",
            "f": "Hand & Foot Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Face Shields & Visors",
            "f": "Head Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Helmets & Hard Hats",
            "f": "Head Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Respirators & Masks",
            "f": "Respiratory Protection",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Self-Contained Breathing Apparatus",
            "f": "Respiratory Protection",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Safety Equipment",
        "commodities": [
          {
            "n": "Safety Equipment",
            "f": "Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Gas Detectors",
            "f": "Detection Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Smoke & Heat Detectors",
            "f": "Detection Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Emergency Showers",
            "f": "Emergency Response",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Spill Kits",
            "f": "Emergency Response",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fire Blankets & Kits",
            "f": "Fire Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Fire Extinguishers",
            "f": "Fire Safety Equipment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "AED Defibrillators",
            "f": "First Aid",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Eye Wash Stations",
            "f": "First Aid",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "First Aid Kits",
            "f": "First Aid",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Barriers & Cones",
            "f": "Safety Signage",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Safety Signs & Labels",
            "f": "Safety Signage",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  },
  {
    "type": "Indirect",
    "name": "Travel & Entertainment",
    "subs": [
      {
        "name": "Air Tickets",
        "commodities": [
          {
            "n": "Air Tickets",
            "f": "Air Tickets",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Charter - Private Aircraft",
            "f": "Air Charter",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Airport Lounge Access",
            "f": "Ancillary Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Baggage & Seat Fees",
            "f": "Ancillary Services",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Domestic Air Tickets",
            "f": "Commercial Air",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "International Air Tickets",
            "f": "Commercial Air",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Passport/Visa/Global Entry & Travel Related Admin Fees",
            "f": "Travel Administration",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Corporate Travel Programs",
            "f": "Travel Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Travel Agency Services",
            "f": "Travel Management",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Travel Agency Transaction Fees",
            "f": "Travel Management",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Entertainment",
        "commodities": [
          {
            "n": "Entertainment",
            "f": "Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Client Events & Hospitality",
            "f": "Client Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Client Meals & Dining",
            "f": "Client Entertainment",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Employee Social Events",
            "f": "Employee Events",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Team Building Events",
            "f": "Employee Events",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Business Gifts",
            "f": "Gifts",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Internal Meetings",
            "f": "Meetings & Events",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Non-Facility Catering (training/meeting related)",
            "f": "Meetings & Events",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      },
      {
        "name": "Hotel",
        "commodities": [
          {
            "n": "Hotel",
            "f": "Hotel",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hotel Booking Services",
            "f": "Corporate Programs",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Hotel Corporate Rates",
            "f": "Corporate Programs",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Short-Term Vehicle Rental",
            "f": "Ground Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Shuttle Services (T&E)",
            "f": "Ground Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Taxi & Limo Services",
            "f": "Ground Transport",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Employee Meals (not crew)",
            "f": "Meals",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Business Hotels",
            "f": "Transient Accommodation",
            "code": "",
            "desc": "",
            "kw": []
          },
          {
            "n": "Extended Stay Hotels",
            "f": "Transient Accommodation",
            "code": "",
            "desc": "",
            "kw": []
          }
        ]
      }
    ]
  }
];
