// NESR spend taxonomy — ported from the Catalog Repo design (real NESR taxonomy).
// Drives the cascading Category → Sub-category → Commodity selects on the entry form,
// and seeds the spend_category / spend_subcategory master-data tables.
// spend_type classifies each category as Materials & Assets, Consumables, or Services.

export type SpendTypeName = "Materials & Assets" | "Consumables" | "Services";
export interface TaxCommodity { n: string; f: string; code: string; desc: string; kw: string[] }
export interface TaxSubcategory { name: string; commodities: TaxCommodity[] }
export interface TaxCategory { type: SpendTypeName; name: string; subs: TaxSubcategory[] }

export const SPEND_TYPES = ["Materials & Assets", "Consumables", "Services"] as const;

export const SPEND_TAXONOMY: TaxCategory[] = [
  {
    "type": "Services",
    "name": "Professional Services",
    "subs": [
      {
        "name": "Insurance",
        "commodities": [
          {
            "n": "Building & Contents Insurance",
            "f": "Property Insurance",
            "code": "84131501",
            "desc": "Insurance for structures and property contents",
            "kw": [
              "asset protection",
              "building contents insurance",
              "building insurance",
              "contents insurance",
              "coverage"
            ]
          },
          {
            "n": "Equipment & Machinery Insurance",
            "f": "Property Insurance",
            "code": "84131512",
            "desc": "Coverage for industrial equipment and machinery",
            "kw": [
              "asset cover",
              "coverage",
              "equipment insurance",
              "insurance",
              "machinery breakdown"
            ]
          },
          {
            "n": "Business Interruption Insurance",
            "f": "Property Insurance",
            "code": "84131507",
            "desc": "Coverage for lost income during disruptions",
            "kw": [
              "BI insurance",
              "coverage",
              "insurance",
              "loss of income",
              "revenue protection"
            ]
          },
          {
            "n": "General Liability Insurance",
            "f": "Liability Insurance",
            "code": "84131601",
            "desc": "Public and general liability coverage",
            "kw": [
              "coverage",
              "insurance",
              "public liability",
              "risk management",
              "third party liability"
            ]
          },
          {
            "n": "Professional Indemnity Insurance",
            "f": "Liability Insurance",
            "code": "84131601",
            "desc": "Professional liability and errors coverage",
            "kw": [
              "E&O insurance",
              "PI insurance",
              "coverage",
              "errors and omissions",
              "insurance"
            ]
          },
          {
            "n": "Directors & Officers Insurance",
            "f": "Liability Insurance",
            "code": "84131602",
            "desc": "D&O liability coverage",
            "kw": [
              "D&O insurance",
              "coverage",
              "directors liability",
              "insurance",
              "officers insurance"
            ]
          },
          {
            "n": "Workers Compensation Insurance",
            "f": "Employee Insurance",
            "code": "84131701",
            "desc": "Employee injury and illness coverage",
            "kw": [
              "coverage",
              "employee injury coverage",
              "insurance",
              "risk management",
              "workers compensation"
            ]
          }
        ]
      },
      {
        "name": "Treasury",
        "commodities": [
          {
            "n": "Cash Pooling Services",
            "f": "Cash Management",
            "code": "84121501",
            "desc": "Centralized cash management services",
            "kw": [
              "cash management",
              "cash pooling",
              "finance",
              "liquidity management",
              "notional pooling"
            ]
          },
          {
            "n": "Payment Processing Services",
            "f": "Cash Management",
            "code": "84121501",
            "desc": "Electronic payment processing",
            "kw": [
              "EFT",
              "cash management",
              "electronic payments",
              "finance",
              "payment processing"
            ]
          },
          {
            "n": "Bank Account Management",
            "f": "Cash Management",
            "code": "84121502",
            "desc": "Banking relationship management",
            "kw": [
              "account management",
              "banking services",
              "cash management",
              "finance",
              "treasury"
            ]
          },
          {
            "n": "FX Trading Services",
            "f": "Foreign Exchange",
            "code": "84121603",
            "desc": "Currency exchange and trading",
            "kw": [
              "FX trading",
              "cash management",
              "currency exchange",
              "finance",
              "foreign exchange"
            ]
          },
          {
            "n": "FX Hedging Services",
            "f": "Foreign Exchange",
            "code": "84121601",
            "desc": "Currency risk management",
            "kw": [
              "FX hedging",
              "cash management",
              "currency hedging",
              "derivatives",
              "finance"
            ]
          },
          {
            "n": "Short-term Investment Services",
            "f": "Investment Management",
            "code": "84121701",
            "desc": "Money market and short-term investments",
            "kw": [
              "cash management",
              "finance",
              "money market",
              "short term investment",
              "treasury"
            ]
          },
          {
            "n": "Treasury Advisory Services",
            "f": "Investment Management",
            "code": "84121701",
            "desc": "Treasury consulting and advisory",
            "kw": [
              "cash management",
              "cash strategy",
              "finance",
              "treasury",
              "treasury advisory"
            ]
          }
        ]
      },
      {
        "name": "Finance",
        "commodities": [
          {
            "n": "External Audit Services",
            "f": "Financial Audit",
            "code": "84111501",
            "desc": "Independent financial statement audit",
            "kw": [
              "Big Four",
              "external audit",
              "finance",
              "financial services",
              "financial statement audit"
            ]
          },
          {
            "n": "Internal Audit Services",
            "f": "Financial Audit",
            "code": "84111501",
            "desc": "Internal control and compliance audit",
            "kw": [
              "compliance audit",
              "finance",
              "financial services",
              "internal audit",
              "internal controls"
            ]
          },
          {
            "n": "Bookkeeping Services",
            "f": "Accounting Services",
            "code": "84111601",
            "desc": "Financial record keeping services",
            "kw": [
              "accounting services",
              "accounts maintenance",
              "bookkeeping",
              "finance",
              "financial records"
            ]
          },
          {
            "n": "Financial Reporting Services",
            "f": "Accounting Services",
            "code": "84111601",
            "desc": "Financial statement preparation",
            "kw": [
              "IFRS",
              "finance",
              "financial reporting",
              "financial services",
              "financial statements"
            ]
          },
          {
            "n": "Tax Advisory Services",
            "f": "Tax Services",
            "code": "84111701",
            "desc": "Tax planning and consultation",
            "kw": [
              "finance",
              "financial services",
              "tax advisory",
              "tax consulting",
              "tax planning"
            ]
          },
          {
            "n": "Tax Preparation Services",
            "f": "Tax Services",
            "code": "84111701",
            "desc": "Tax return preparation and filing",
            "kw": [
              "corporate tax return",
              "finance",
              "financial services",
              "tax filing",
              "tax preparation"
            ]
          },
          {
            "n": "Transfer Pricing Services",
            "f": "Tax Services",
            "code": "84111702",
            "desc": "Intercompany pricing advisory",
            "kw": [
              "TP advisory",
              "finance",
              "financial services",
              "intercompany pricing",
              "related party transactions"
            ]
          }
        ]
      },
      {
        "name": "Legal",
        "commodities": [
          {
            "n": "Corporate Governance Services",
            "f": "Corporate Legal",
            "code": "80121501",
            "desc": "Corporate legal advisory",
            "kw": [
              "board advisory",
              "company secretarial",
              "corporate governance",
              "law firm",
              "legal counsel"
            ]
          },
          {
            "n": "M&A Legal Services",
            "f": "Corporate Legal",
            "code": "80121501",
            "desc": "Mergers and acquisitions legal support",
            "kw": [
              "M&A legal",
              "deal legal advisory",
              "law firm",
              "legal counsel",
              "legal services"
            ]
          },
          {
            "n": "Contract Drafting & Review",
            "f": "Corporate Legal",
            "code": "80121502",
            "desc": "Legal contract services",
            "kw": [
              "agreement review",
              "contract drafting",
              "contract review",
              "law firm",
              "legal contracts"
            ]
          },
          {
            "n": "Commercial Litigation Services",
            "f": "Litigation",
            "code": "80121601",
            "desc": "Business dispute resolution",
            "kw": [
              "commercial dispute",
              "court proceedings",
              "law firm",
              "legal counsel",
              "legal services"
            ]
          },
          {
            "n": "Arbitration & Mediation Services",
            "f": "Litigation",
            "code": "80121601",
            "desc": "Alternative dispute resolution",
            "kw": [
              "ADR",
              "arbitration",
              "dispute resolution",
              "law firm",
              "legal counsel"
            ]
          },
          {
            "n": "Regulatory Compliance Services",
            "f": "Regulatory & Compliance",
            "code": "80121701",
            "desc": "Regulatory advisory and compliance",
            "kw": [
              "compliance advisory",
              "law firm",
              "legal counsel",
              "legal services",
              "regulatory advisory"
            ]
          },
          {
            "n": "Intellectual Property Services",
            "f": "Regulatory & Compliance",
            "code": "80121701",
            "desc": "IP protection and advisory",
            "kw": [
              "IP services",
              "copyright",
              "intellectual property",
              "law firm",
              "legal counsel"
            ]
          }
        ]
      },
      {
        "name": "Marketing",
        "commodities": [
          {
            "n": "Advertising Agency Services",
            "f": "Advertising",
            "code": "80141501",
            "desc": "Full-service advertising agency",
            "kw": [
              "ad agency",
              "advertising agency",
              "communications",
              "creative agency",
              "marketing"
            ]
          },
          {
            "n": "Media Buying Services",
            "f": "Advertising",
            "code": "80141501",
            "desc": "Advertising media placement",
            "kw": [
              "advertising spend",
              "communications",
              "marketing",
              "media buying",
              "media placement"
            ]
          },
          {
            "n": "Digital Marketing Services",
            "f": "Advertising",
            "code": "80141502",
            "desc": "Online and social media marketing",
            "kw": [
              "SEO",
              "communications",
              "digital advertising",
              "digital marketing",
              "marketing"
            ]
          },
          {
            "n": "Graphic Design Services",
            "f": "Creative Services",
            "code": "82141501",
            "desc": "Visual design and artwork",
            "kw": [
              "branding",
              "communications",
              "creative design",
              "graphic design",
              "marketing"
            ]
          },
          {
            "n": "Video Production Services",
            "f": "Creative Services",
            "code": "82141501",
            "desc": "Corporate video and multimedia",
            "kw": [
              "communications",
              "corporate video",
              "marketing",
              "multimedia production",
              "video production"
            ]
          },
          {
            "n": "Printing Services",
            "f": "Print & Publications",
            "code": "82121501",
            "desc": "Commercial printing services",
            "kw": [
              "commercial printing",
              "communications",
              "marketing",
              "print production"
            ]
          },
          {
            "n": "Publications & Subscriptions",
            "f": "Print & Publications",
            "code": "82121501",
            "desc": "Industry publications and media",
            "kw": [
              "communications",
              "industry journals",
              "marketing",
              "media subscriptions",
              "publications"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Facility",
    "subs": [
      {
        "name": "Engineering & Construction",
        "commodities": [
          {
            "n": "Architectural Design",
            "f": "Design Services",
            "code": "81101501",
            "desc": "Building architectural design services",
            "kw": [
              "architecture services",
              "building design",
              "construction",
              "engineering"
            ]
          },
          {
            "n": "Structural Engineering Design",
            "f": "Design Services",
            "code": "81101501",
            "desc": "Structural design services",
            "kw": [
              "civil structural",
              "construction",
              "engineering",
              "structural design",
              "structural engineering"
            ]
          },
          {
            "n": "MEP Design Services",
            "f": "Design Services",
            "code": "81101502",
            "desc": "Mechanical, electrical, plumbing design",
            "kw": [
              "M&E",
              "MEP",
              "building services",
              "construction",
              "engineering"
            ]
          },
          {
            "n": "Civil Engineering Design",
            "f": "Design Services",
            "code": "81101503",
            "desc": "Civil infrastructure design",
            "kw": [
              "civil construction",
              "civil engineering",
              "construction",
              "engineering",
              "infrastructure design"
            ]
          },
          {
            "n": "General Contracting",
            "f": "Construction Services",
            "code": "72101501",
            "desc": "General construction contractor",
            "kw": [
              "construction",
              "construction management",
              "engineering",
              "general contractor",
              "main contractor"
            ]
          },
          {
            "n": "Civil Works Construction",
            "f": "Construction Services",
            "code": "72101501",
            "desc": "Site preparation and civil construction",
            "kw": [
              "civil construction",
              "civil engineering",
              "construction",
              "engineering",
              "infrastructure design"
            ]
          },
          {
            "n": "Structural Construction",
            "f": "Construction Services",
            "code": "81101505",
            "desc": "Building structural works",
            "kw": [
              "civil structural",
              "construction",
              "engineering",
              "structural design",
              "structural engineering"
            ]
          }
        ]
      },
      {
        "name": "Operations & Maintenance",
        "commodities": [
          {
            "n": "Preventive Maintenance Services",
            "f": "Building Maintenance",
            "code": "72151501",
            "desc": "Scheduled building maintenance",
            "kw": [
              "PPM",
              "facility management",
              "maintenance",
              "operations",
              "preventive maintenance"
            ]
          },
          {
            "n": "Corrective Maintenance Services",
            "f": "Building Maintenance",
            "code": "72151501",
            "desc": "Reactive repairs and maintenance",
            "kw": [
              "breakdown repairs",
              "corrective maintenance",
              "facility management",
              "maintenance",
              "operations"
            ]
          },
          {
            "n": "Building Exterior Maintenance",
            "f": "Building Maintenance",
            "code": "72151502",
            "desc": "Roof, facade, and exterior maintenance",
            "kw": [
              "facade maintenance",
              "facility management",
              "maintenance",
              "operations",
              "roof maintenance"
            ]
          },
          {
            "n": "HVAC Maintenance Services",
            "f": "Technical Maintenance",
            "code": "72151501",
            "desc": "Heating and cooling system maintenance",
            "kw": [
              "AC servicing",
              "HVAC maintenance",
              "cooling maintenance",
              "facility management",
              "maintenance"
            ]
          },
          {
            "n": "Electrical Maintenance Services",
            "f": "Technical Maintenance",
            "code": "72151508",
            "desc": "Electrical system maintenance",
            "kw": [
              "electrical maintenance",
              "electrical repairs",
              "electrical services",
              "facility management",
              "maintenance"
            ]
          },
          {
            "n": "Plumbing Maintenance Services",
            "f": "Technical Maintenance",
            "code": "72151602",
            "desc": "Plumbing system maintenance",
            "kw": [
              "drainage maintenance",
              "facility management",
              "maintenance",
              "operations",
              "pipe repairs"
            ]
          },
          {
            "n": "Elevator Maintenance Services",
            "f": "Technical Maintenance",
            "code": "72151603",
            "desc": "Lift and escalator maintenance",
            "kw": [
              "elevator maintenance",
              "escalator maintenance",
              "facility management",
              "lift servicing",
              "maintenance"
            ]
          }
        ]
      },
      {
        "name": "Property Management",
        "commodities": [
          {
            "n": "Office Space Lease",
            "f": "Lease Management",
            "code": "80131501",
            "desc": "Commercial office space rental",
            "kw": [
              "commercial office",
              "facility",
              "office lease",
              "property management",
              "real estate"
            ]
          },
          {
            "n": "Warehouse Space Lease",
            "f": "Lease Management",
            "code": "80131501",
            "desc": "Industrial warehouse rental",
            "kw": [
              "facility",
              "industrial rental",
              "property management",
              "real estate",
              "storage facility"
            ]
          },
          {
            "n": "Land Lease",
            "f": "Lease Management",
            "code": "80131502",
            "desc": "Land and site rental",
            "kw": [
              "facility",
              "land rental",
              "property management",
              "real estate",
              "site rental"
            ]
          },
          {
            "n": "Real Estate Brokerage",
            "f": "Real Estate Services",
            "code": "80131601",
            "desc": "Property acquisition services",
            "kw": [
              "facility",
              "property acquisition",
              "property agent",
              "property management",
              "real estate"
            ]
          },
          {
            "n": "Property Valuation Services",
            "f": "Real Estate Services",
            "code": "80131601",
            "desc": "Real estate appraisal services",
            "kw": [
              "asset valuation",
              "facility",
              "property management",
              "property valuation",
              "real estate"
            ]
          },
          {
            "n": "Building & Land Taxation",
            "f": "Property Taxes",
            "code": "80131701",
            "desc": "Property tax management",
            "kw": [
              "building tax",
              "facility",
              "land tax",
              "municipality fees",
              "property management"
            ]
          },
          {
            "n": "Fixed Crew Housing (Staff House Rental)",
            "f": "Buildings & Land",
            "code": "80131801",
            "desc": "Fixed crew housing and staff house rental",
            "kw": [
              "crew housing",
              "facility",
              "fixed employee accommodation",
              "property management",
              "real estate"
            ]
          }
        ]
      },
      {
        "name": "Catering Services",
        "commodities": [
          {
            "n": "Cafeteria Services",
            "f": "On-Site Catering",
            "code": "90101501",
            "desc": "Staff canteen and cafeteria operation",
            "kw": [
              "catering",
              "employee meals",
              "food services",
              "on-site catering",
              "staff canteen"
            ]
          },
          {
            "n": "Crew Catering Services",
            "f": "On-Site Catering",
            "code": "90101501",
            "desc": "Field crew meal services",
            "kw": [
              "camp meal services",
              "catering",
              "crew catering",
              "field catering",
              "food services"
            ]
          },
          {
            "n": "Rig Catering Services",
            "f": "On-Site Catering",
            "code": "90101502",
            "desc": "Offshore and rig catering",
            "kw": [
              "catering",
              "food services",
              "offshore catering",
              "rig catering",
              "rig food services"
            ]
          },
          {
            "n": "Pantry Supplies",
            "f": "Pantry & Vending",
            "code": "90101601",
            "desc": "Coffee, tea, and pantry items",
            "kw": [
              "catering",
              "food services",
              "office coffee",
              "pantry consumables",
              "tea supplies"
            ]
          },
          {
            "n": "Vending Machine Services",
            "f": "Pantry & Vending",
            "code": "90101601",
            "desc": "Vending machine supply and maintenance",
            "kw": [
              "catering",
              "drinks machine",
              "food services",
              "snack machine"
            ]
          },
          {
            "n": "Drinking Water Supply",
            "f": "Pantry & Vending",
            "code": "90101602",
            "desc": "Bottled and filtered water supply",
            "kw": [
              "bottled water",
              "catering",
              "food services",
              "water dispenser"
            ]
          },
          {
            "n": "Meeting & Event Catering",
            "f": "Event Catering",
            "code": "90101701",
            "desc": "Corporate event food services",
            "kw": [
              "catering",
              "corporate catering",
              "event catering",
              "food services",
              "meeting catering"
            ]
          }
        ]
      },
      {
        "name": "Security",
        "commodities": [
          {
            "n": "Manned Security Services",
            "f": "Guarding Services",
            "code": "92121504",
            "desc": "Security personnel and guards",
            "kw": [
              "guarding services",
              "manned security",
              "safety and security",
              "security guards",
              "security services"
            ]
          },
          {
            "n": "Armed Security Services",
            "f": "Guarding Services",
            "code": "92121504",
            "desc": "Armed security personnel",
            "kw": [
              "armed guards",
              "armed personnel",
              "armed security",
              "safety and security",
              "security services"
            ]
          },
          {
            "n": "Reception & Concierge Security",
            "f": "Guarding Services",
            "code": "92121502",
            "desc": "Front desk security services",
            "kw": [
              "concierge security",
              "front desk security",
              "reception security",
              "safety and security",
              "security services"
            ]
          },
          {
            "n": "CCTV Systems & Monitoring",
            "f": "Electronic Security",
            "code": "92121601",
            "desc": "Video surveillance services",
            "kw": [
              "CCTV",
              "IP cameras",
              "safety and security",
              "security monitoring",
              "security services"
            ]
          },
          {
            "n": "Access Control Systems",
            "f": "Electronic Security",
            "code": "92121601",
            "desc": "Electronic access control",
            "kw": [
              "access control",
              "biometric systems",
              "door control",
              "electronic access",
              "safety and security"
            ]
          },
          {
            "n": "Alarm & Intrusion Detection",
            "f": "Electronic Security",
            "code": "92121602",
            "desc": "Security alarm systems",
            "kw": [
              "alarm system",
              "burglar alarm",
              "intrusion detection",
              "safety and security",
              "security alarm"
            ]
          },
          {
            "n": "Security Risk Assessment",
            "f": "Security Consulting",
            "code": "92121701",
            "desc": "Security audit and risk analysis",
            "kw": [
              "safety and security",
              "security audit",
              "security services",
              "threat assessment"
            ]
          }
        ]
      },
      {
        "name": "Staff House",
        "commodities": [
          {
            "n": "Staff House Rental",
            "f": "Crew Accommodation",
            "code": "80131504",
            "desc": "Employee housing rental",
            "kw": [
              "accommodation",
              "accommodation rental",
              "camp services",
              "crew housing",
              "employee housing"
            ]
          },
          {
            "n": "Crew Camp Services",
            "f": "Crew Accommodation",
            "code": "80131801",
            "desc": "Turnkey camp accommodation",
            "kw": [
              "accommodation",
              "camp accommodation",
              "camp services",
              "crew housing",
              "turnkey camp"
            ]
          },
          {
            "n": "Hotel Crew Accommodation",
            "f": "Crew Accommodation",
            "code": "80131801",
            "desc": "Hotel-based crew lodging",
            "kw": [
              "accommodation",
              "camp services",
              "crew hotel booking",
              "crew housing",
              "hotel lodging"
            ]
          },
          {
            "n": "Camp Management Services",
            "f": "Camp Management",
            "code": "90101604",
            "desc": "Camp operations management",
            "kw": [
              "accommodation",
              "camp facilities management",
              "camp management",
              "camp operations",
              "camp services"
            ]
          },
          {
            "n": "Camp Housekeeping Services",
            "f": "Camp Management",
            "code": "76111501",
            "desc": "Camp cleaning and laundry",
            "kw": [
              "accommodation",
              "camp housekeeping",
              "camp services",
              "cleaning services",
              "crew housing"
            ]
          },
          {
            "n": "Camp Recreation Services",
            "f": "Camp Management",
            "code": "90101601",
            "desc": "Camp recreation facilities",
            "kw": [
              "accommodation",
              "camp recreation",
              "camp services",
              "crew housing",
              "crew welfare"
            ]
          },
          {
            "n": "Integrated Camp Management Services",
            "f": "Camp Services",
            "code": "76111501",
            "desc": "Integrated camp management and operations services",
            "kw": [
              "EPCM camp",
              "accommodation",
              "camp facilities management",
              "camp management",
              "camp operations"
            ]
          }
        ]
      },
      {
        "name": "Waste Disposal",
        "commodities": [
          {
            "n": "Municipal Waste Collection",
            "f": "General Waste",
            "code": "76121501",
            "desc": "General waste collection services",
            "kw": [
              "disposal",
              "environmental services",
              "general waste",
              "refuse collection",
              "skip hire"
            ]
          },
          {
            "n": "Recycling Services",
            "f": "General Waste",
            "code": "76121501",
            "desc": "Recyclable material collection",
            "kw": [
              "disposal",
              "environmental services",
              "recyclable materials",
              "sustainability",
              "waste management"
            ]
          },
          {
            "n": "Hazardous Waste Disposal",
            "f": "Hazardous Waste",
            "code": "76121601",
            "desc": "Hazardous material disposal",
            "kw": [
              "COSHH waste",
              "dangerous waste",
              "disposal",
              "environmental services",
              "special waste"
            ]
          },
          {
            "n": "Industrial Waste Incineration",
            "f": "Hazardous Waste",
            "code": "76121601",
            "desc": "Industrial waste treatment",
            "kw": [
              "disposal",
              "environmental services",
              "incineration",
              "industrial waste disposal",
              "thermal treatment"
            ]
          },
          {
            "n": "Chemical Waste Disposal",
            "f": "Hazardous Waste",
            "code": "76121602",
            "desc": "Chemical waste handling and disposal",
            "kw": [
              "disposal",
              "environmental services",
              "lab waste management",
              "solvent disposal",
              "waste management"
            ]
          },
          {
            "n": "Wastewater Treatment Services",
            "f": "Wastewater",
            "code": "76121701",
            "desc": "Effluent treatment and disposal",
            "kw": [
              "disposal",
              "effluent treatment",
              "environmental services",
              "sewage treatment",
              "waste management"
            ]
          },
          {
            "n": "Drainage Services",
            "f": "Wastewater",
            "code": "76121701",
            "desc": "Drainage cleaning and maintenance",
            "kw": [
              "disposal",
              "drain cleaning",
              "environmental services",
              "sewer maintenance",
              "waste management"
            ]
          }
        ]
      },
      {
        "name": "Utility",
        "commodities": [
          {
            "n": "Electricity Supply",
            "f": "Electricity",
            "code": "83101501",
            "desc": "Electric power supply",
            "kw": [
              "electric utility",
              "electricity",
              "energy management",
              "grid power",
              "power supply"
            ]
          },
          {
            "n": "Renewable Energy Supply",
            "f": "Electricity",
            "code": "83101501",
            "desc": "Solar, wind, and renewable power",
            "kw": [
              "energy management",
              "green energy",
              "renewable energy",
              "solar power",
              "utilities"
            ]
          },
          {
            "n": "Natural Gas Supply",
            "f": "Natural Gas",
            "code": "83101601",
            "desc": "Natural gas utility supply",
            "kw": [
              "energy management",
              "gas utility",
              "pipeline gas",
              "utilities"
            ]
          },
          {
            "n": "Water Supply Services",
            "f": "Water",
            "code": "83101601",
            "desc": "Municipal water supply",
            "kw": [
              "energy management",
              "municipal water",
              "utilities",
              "water supply",
              "water utility"
            ]
          },
          {
            "n": "Industrial Water Supply",
            "f": "Water",
            "code": "83101601",
            "desc": "Process water supply",
            "kw": [
              "energy management",
              "municipal water",
              "utilities",
              "water supply",
              "water utility"
            ]
          },
          {
            "n": "Generator Fuel Supply",
            "f": "Fuel",
            "code": "83101801",
            "desc": "Diesel and generator fuel",
            "kw": [
              "diesel fuel supply",
              "energy management",
              "fuel management",
              "generator fuel",
              "utilities"
            ]
          },
          {
            "n": "Energy Audit Services",
            "f": "Energy Management",
            "code": "83101601",
            "desc": "Energy consumption analysis",
            "kw": [
              "energy assessment",
              "energy audit",
              "energy consumption analysis",
              "energy management",
              "utilities"
            ]
          }
        ]
      },
      {
        "name": "Furniture",
        "commodities": [
          {
            "n": "Office Desks & Workstations",
            "f": "Office Furniture",
            "code": "56101504",
            "desc": "Office desk and workstation furniture",
            "kw": [
              "furniture",
              "office desk",
              "office furniture",
              "sit-stand desk",
              "workstation"
            ]
          },
          {
            "n": "Office Chairs & Seating",
            "f": "Office Furniture",
            "code": "56101501",
            "desc": "Office seating solutions",
            "kw": [
              "desk chair",
              "ergonomic seating",
              "furniture",
              "office chair",
              "office furniture"
            ]
          },
          {
            "n": "Meeting Room Furniture",
            "f": "Office Furniture",
            "code": "56101502",
            "desc": "Conference tables and chairs",
            "kw": [
              "boardroom furniture",
              "conference table",
              "furniture",
              "office furniture"
            ]
          },
          {
            "n": "Filing Cabinets & Storage",
            "f": "Storage Furniture",
            "code": "56101601",
            "desc": "Office storage solutions",
            "kw": [
              "document storage cabinet",
              "filing cabinet",
              "furniture",
              "office furniture",
              "office storage"
            ]
          },
          {
            "n": "Shelving Systems",
            "f": "Storage Furniture",
            "code": "56101601",
            "desc": "Storage shelving units",
            "kw": [
              "furniture",
              "office furniture",
              "shelf rack",
              "storage rack"
            ]
          },
          {
            "n": "Office Appliances",
            "f": "Appliances",
            "code": "56101701",
            "desc": "Refrigerators, microwaves, etc.",
            "kw": [
              "coffee machine",
              "furniture",
              "microwave",
              "office furniture"
            ]
          },
          {
            "n": "Kitchen Appliances",
            "f": "Appliances",
            "code": "56101701",
            "desc": "Commercial kitchen appliances",
            "kw": [
              "dishwasher",
              "furniture",
              "office furniture",
              "refrigerator"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "IT",
    "subs": [
      {
        "name": "Hardware",
        "commodities": [
          {
            "n": "Desktop Computers",
            "f": "Computers",
            "code": "43211507",
            "desc": "Desktop PC and workstations",
            "kw": [
              "IT hardware",
              "PC",
              "desktop computer",
              "technology equipment",
              "workstation computer"
            ]
          },
          {
            "n": "Laptop Computers",
            "f": "Computers",
            "code": "43211501",
            "desc": "Portable computers and notebooks",
            "kw": [
              "IT hardware",
              "laptop",
              "notebook computer",
              "portable PC",
              "technology equipment"
            ]
          },
          {
            "n": "Tablets",
            "f": "Computers",
            "code": "43211502",
            "desc": "Tablet computers and devices",
            "kw": [
              "IT hardware",
              "iPad",
              "mobile tablet",
              "tablet computer",
              "technology equipment"
            ]
          },
          {
            "n": "Enterprise Servers",
            "f": "Servers",
            "code": "43211601",
            "desc": "Data center server hardware",
            "kw": [
              "IT hardware",
              "blade server",
              "enterprise server",
              "rack server",
              "technology equipment"
            ]
          },
          {
            "n": "Server Accessories & Parts",
            "f": "Servers",
            "code": "43211601",
            "desc": "Server components and spares",
            "kw": [
              "IT hardware",
              "rack accessories",
              "server accessories",
              "server parts",
              "technology equipment"
            ]
          },
          {
            "n": "Data Storage Systems",
            "f": "Storage",
            "code": "43211706",
            "desc": "SAN, NAS, and storage arrays",
            "kw": [
              "IT hardware",
              "NAS",
              "SAN",
              "data storage system",
              "storage array"
            ]
          },
          {
            "n": "Storage Media",
            "f": "Storage",
            "code": "43211701",
            "desc": "Tapes, drives, and backup media",
            "kw": [
              "IT hardware",
              "NAS",
              "SAN",
              "SSD",
              "USB drive"
            ]
          }
        ]
      },
      {
        "name": "Software",
        "commodities": [
          {
            "n": "Enterprise Applications",
            "f": "Application Software",
            "code": "43231501",
            "desc": "ERP, CRM, and business software",
            "kw": [
              "ERP",
              "IT software",
              "SAP",
              "business applications",
              "enterprise software"
            ]
          },
          {
            "n": "Productivity Software",
            "f": "Application Software",
            "code": "43231501",
            "desc": "Office and productivity tools",
            "kw": [
              "IT software",
              "M365",
              "Microsoft Office",
              "Office 365",
              "software"
            ]
          },
          {
            "n": "Specialized Applications",
            "f": "Application Software",
            "code": "43231602",
            "desc": "Industry-specific software",
            "kw": [
              "IT software",
              "industry software",
              "niche applications",
              "software",
              "specialized software"
            ]
          },
          {
            "n": "Server Operating Systems",
            "f": "Operating Systems",
            "code": "43231601",
            "desc": "Server OS licenses",
            "kw": [
              "IT software",
              "Linux OS",
              "Windows Server",
              "server OS",
              "software"
            ]
          },
          {
            "n": "Desktop Operating Systems",
            "f": "Operating Systems",
            "code": "43231601",
            "desc": "Desktop OS licenses",
            "kw": [
              "IT software",
              "Windows",
              "desktop OS",
              "macOS",
              "software"
            ]
          },
          {
            "n": "Database Management Systems",
            "f": "Database Software",
            "code": "43231601",
            "desc": "DBMS licenses",
            "kw": [
              "DBMS",
              "IT software",
              "Oracle DB",
              "SQL",
              "database software"
            ]
          },
          {
            "n": "Antivirus & Endpoint Security",
            "f": "Security Software",
            "code": "43233205",
            "desc": "Security software licenses",
            "kw": [
              "EDR",
              "IT software",
              "antivirus",
              "endpoint security",
              "malware protection"
            ]
          }
        ]
      },
      {
        "name": "Infrastructure",
        "commodities": [
          {
            "n": "Network Switches & Routers",
            "f": "Network Infrastructure",
            "code": "43222501",
            "desc": "Network hardware equipment",
            "kw": [
              "IT infrastructure",
              "LAN",
              "WAN",
              "network services",
              "network switch"
            ]
          },
          {
            "n": "Firewalls & Security Appliances",
            "f": "Network Infrastructure",
            "code": "43222501",
            "desc": "Network security hardware",
            "kw": [
              "IT infrastructure",
              "UTM",
              "firewall",
              "network services",
              "next-gen firewall"
            ]
          },
          {
            "n": "Wireless Infrastructure",
            "f": "Network Infrastructure",
            "code": "43222502",
            "desc": "WiFi and wireless equipment",
            "kw": [
              "IT infrastructure",
              "WLAN",
              "WiFi",
              "access points",
              "network services"
            ]
          },
          {
            "n": "PBX & Phone Systems",
            "f": "Telecommunications",
            "code": "43222805",
            "desc": "Voice communication systems",
            "kw": [
              "IP telephony",
              "IT infrastructure",
              "PABX",
              "PBX system",
              "network services"
            ]
          },
          {
            "n": "Video Conferencing Systems",
            "f": "Telecommunications",
            "code": "43222605",
            "desc": "VC equipment and systems",
            "kw": [
              "AV systems",
              "IT infrastructure",
              "VC room system",
              "network services",
              "video conferencing system"
            ]
          },
          {
            "n": "Satellite Communication",
            "f": "Telecommunications",
            "code": "43222602",
            "desc": "Satellite equipment and services",
            "kw": [
              "IT infrastructure",
              "VSAT",
              "network services",
              "satellite internet"
            ]
          },
          {
            "n": "Data Center Hosting Services",
            "f": "Data Center",
            "code": "81112201",
            "desc": "Colocation and hosting",
            "kw": [
              "DC hosting",
              "IT infrastructure",
              "data center",
              "network services",
              "server hosting"
            ]
          }
        ]
      },
      {
        "name": "Licenses",
        "commodities": [
          {
            "n": "Perpetual Software Licenses",
            "f": "Software Licenses",
            "code": "43232101",
            "desc": "One-time software purchases",
            "kw": [
              "IT licenses",
              "one-time purchase",
              "perpetual software license",
              "subscriptions",
              "telecom services"
            ]
          },
          {
            "n": "Subscription Software Licenses",
            "f": "Software Licenses",
            "code": "43232101",
            "desc": "SaaS and subscription licenses",
            "kw": [
              "IT licenses",
              "SaaS",
              "recurring license",
              "subscription license",
              "subscriptions"
            ]
          },
          {
            "n": "Software Maintenance & Support",
            "f": "Software Licenses",
            "code": "43232102",
            "desc": "Software support contracts",
            "kw": [
              "IT licenses",
              "M&S contract",
              "annual maintenance",
              "software support",
              "subscriptions"
            ]
          },
          {
            "n": "Fixed Line Services",
            "f": "Telecommunications",
            "code": "81112301",
            "desc": "Landline and fixed voice",
            "kw": [
              "IT licenses",
              "PSTN contract",
              "landline billing",
              "subscriptions",
              "telecom services"
            ]
          },
          {
            "n": "Mobile Voice & Data Services",
            "f": "Telecommunications",
            "code": "81112301",
            "desc": "Cellular service plans",
            "kw": [
              "IT licenses",
              "SIM services",
              "corporate mobile plan",
              "data plan",
              "mobile telecom"
            ]
          },
          {
            "n": "Internet Services",
            "f": "Telecommunications",
            "code": "81112302",
            "desc": "ISP and internet connectivity",
            "kw": [
              "ISP",
              "IT licenses",
              "broadband",
              "internet connectivity",
              "subscriptions"
            ]
          },
          {
            "n": "Satellite Services",
            "f": "Telecommunications",
            "code": "81112303",
            "desc": "Satellite communication services",
            "kw": [
              "IT licenses",
              "VSAT subscription",
              "satellite lease",
              "subscriptions",
              "telecom services"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Logistics",
    "subs": [
      {
        "name": "Shipping Services",
        "commodities": [
          {
            "n": "Container Shipping",
            "f": "Ocean Freight",
            "code": "78141501",
            "desc": "Ocean container transport",
            "kw": [
              "FCL",
              "freight",
              "full container load",
              "logistics",
              "sea freight"
            ]
          },
          {
            "n": "Break Bulk Shipping",
            "f": "Ocean Freight",
            "code": "78141501",
            "desc": "Non-containerized ocean cargo",
            "kw": [
              "break bulk",
              "bulk shipping",
              "freight",
              "logistics",
              "ocean cargo"
            ]
          },
          {
            "n": "Air Cargo Services",
            "f": "Air Freight",
            "code": "78141601",
            "desc": "Air freight transport",
            "kw": [
              "air cargo",
              "air shipment",
              "airfreight",
              "freight",
              "logistics"
            ]
          },
          {
            "n": "Express Air Services",
            "f": "Air Freight",
            "code": "78141601",
            "desc": "Expedited air delivery",
            "kw": [
              "air express",
              "express air freight",
              "freight",
              "logistics",
              "shipping"
            ]
          },
          {
            "n": "Full Truckload (FTL)",
            "f": "Road Freight",
            "code": "78141701",
            "desc": "Dedicated truck transport",
            "kw": [
              "FTL",
              "freight",
              "full truckload",
              "logistics",
              "road freight"
            ]
          },
          {
            "n": "Less Than Truckload (LTL)",
            "f": "Road Freight",
            "code": "78141701",
            "desc": "Shared truck transport",
            "kw": [
              "LTL",
              "freight",
              "less than truckload",
              "logistics",
              "partial load"
            ]
          },
          {
            "n": "Tanker Transport",
            "f": "Road Freight",
            "code": "78141702",
            "desc": "Liquid cargo road transport",
            "kw": [
              "freight",
              "liquid transport",
              "logistics",
              "shipping",
              "tanker truck"
            ]
          }
        ]
      },
      {
        "name": "Custom Clearance Services",
        "commodities": [
          {
            "n": "Import Customs Clearance",
            "f": "Import Services",
            "code": "78131501",
            "desc": "Import declaration processing",
            "kw": [
              "customs broker",
              "customs clearance",
              "import clearance",
              "import export",
              "trade compliance"
            ]
          },
          {
            "n": "Import Documentation",
            "f": "Import Services",
            "code": "78131501",
            "desc": "Import paperwork services",
            "kw": [
              "customs clearance",
              "customs documentation",
              "import documents",
              "import export",
              "import paperwork"
            ]
          },
          {
            "n": "Export Customs Clearance",
            "f": "Export Services",
            "code": "78131601",
            "desc": "Export declaration processing",
            "kw": [
              "customs clearance",
              "export broker",
              "export clearance",
              "import export",
              "trade compliance"
            ]
          },
          {
            "n": "Export Documentation",
            "f": "Export Services",
            "code": "78131601",
            "desc": "Export paperwork services",
            "kw": [
              "certificate of origin",
              "customs clearance",
              "export documents",
              "export paperwork",
              "import export"
            ]
          },
          {
            "n": "Customs Duties Payment",
            "f": "Duties & Taxes",
            "code": "78131701",
            "desc": "Import duty management",
            "kw": [
              "customs clearance",
              "customs duties",
              "import duty payment",
              "import export",
              "tariffs"
            ]
          },
          {
            "n": "Trade Compliance Services",
            "f": "Duties & Taxes",
            "code": "78131701",
            "desc": "Customs compliance advisory",
            "kw": [
              "customs clearance",
              "export controls",
              "import export",
              "import regulations",
              "sanctions"
            ]
          },
          {
            "n": "Customs Clearance Fees",
            "f": "Customs Clearance Agent Fees",
            "code": "78141502",
            "desc": "Customs clearance agent fees",
            "kw": [
              "customs clearance",
              "import export",
              "trade compliance"
            ]
          }
        ]
      },
      {
        "name": "Freight Forwarding Services",
        "commodities": [
          {
            "n": "Sea Freight Forwarding",
            "f": "International Forwarding",
            "code": "78141901",
            "desc": "Ocean freight coordination",
            "kw": [
              "forwarder",
              "freight forwarding",
              "logistics provider",
              "ocean forwarding"
            ]
          },
          {
            "n": "Air Freight Forwarding",
            "f": "International Forwarding",
            "code": "78141901",
            "desc": "Air freight coordination",
            "kw": [
              "airfreight agent",
              "forwarder",
              "freight forwarding",
              "logistics provider"
            ]
          },
          {
            "n": "Multimodal Forwarding",
            "f": "International Forwarding",
            "code": "78141902",
            "desc": "Combined transport coordination",
            "kw": [
              "door-to-door",
              "forwarder",
              "freight forwarding",
              "intermodal logistics",
              "logistics provider"
            ]
          },
          {
            "n": "Domestic Distribution",
            "f": "Domestic Forwarding",
            "code": "78142001",
            "desc": "Local freight coordination",
            "kw": [
              "domestic freight",
              "forwarder",
              "freight forwarding",
              "inland distribution",
              "local delivery"
            ]
          },
          {
            "n": "Cargo Insurance",
            "f": "Value Added Services",
            "code": "78142101",
            "desc": "Freight insurance services",
            "kw": [
              "coverage",
              "forwarder",
              "freight forwarding",
              "goods in transit insurance",
              "insurance"
            ]
          },
          {
            "n": "Cargo Tracking",
            "f": "Value Added Services",
            "code": "78142101",
            "desc": "Shipment visibility services",
            "kw": [
              "forwarder",
              "freight forwarding",
              "logistics provider",
              "shipment tracking",
              "supply chain visibility"
            ]
          },
          {
            "n": "Parcel - Domestic Shipment",
            "f": "Parcel",
            "code": "78102201",
            "desc": "Domestic parcel and courier delivery",
            "kw": [
              "domestic courier",
              "forwarder",
              "freight forwarding",
              "last mile delivery",
              "logistics provider"
            ]
          }
        ]
      },
      {
        "name": "Crew Transportation",
        "commodities": [
          {
            "n": "Helicopter Charter Services",
            "f": "Air Transport",
            "code": "78111803",
            "desc": "Helicopter crew transport",
            "kw": [
              "aviation services",
              "crew transport",
              "helicopter charter",
              "mobilization",
              "offshore helicopter"
            ]
          },
          {
            "n": "Fixed Wing Charter",
            "f": "Air Transport",
            "code": "78111803",
            "desc": "Aircraft crew transport",
            "kw": [
              "aircraft charter",
              "crew transport",
              "mobilization",
              "personnel transport",
              "private flight"
            ]
          },
          {
            "n": "Crew Bus Services",
            "f": "Ground Transport",
            "code": "78111901",
            "desc": "Ground crew shuttle services",
            "kw": [
              "crew transport",
              "mobilization",
              "personnel shuttle",
              "personnel transport",
              "shuttle bus"
            ]
          },
          {
            "n": "Crew Van Services",
            "f": "Ground Transport",
            "code": "78111901",
            "desc": "Small vehicle crew transport",
            "kw": [
              "crew transport",
              "minibus transport",
              "mobilization",
              "personnel transport",
              "staff van"
            ]
          },
          {
            "n": "Crew Boat Services",
            "f": "Marine Transport",
            "code": "78112001",
            "desc": "Marine crew transfer",
            "kw": [
              "crew transport",
              "crew vessel",
              "mobilization",
              "offshore crew transfer",
              "personnel transport"
            ]
          },
          {
            "n": "Fast Supply Vessel Crew Transfer",
            "f": "Marine Transport",
            "code": "78112001",
            "desc": "Offshore crew transport",
            "kw": [
              "FSV",
              "crew transport",
              "fast supply vessel",
              "mobilization",
              "offshore crew transfer vessel"
            ]
          },
          {
            "n": "Crew Land Shuttle to & from Jobsite",
            "f": "Crew Shuttle Land",
            "code": "78111803",
            "desc": "Crew land shuttle services to and from jobsite",
            "kw": [
              "crew bus services",
              "crew transport",
              "mobilization",
              "personnel shuttle",
              "personnel transport"
            ]
          }
        ]
      },
      {
        "name": "Warehouse Services",
        "commodities": [
          {
            "n": "General Warehousing",
            "f": "Storage Services",
            "code": "78121501",
            "desc": "Standard storage facilities",
            "kw": [
              "3PL storage",
              "inventory management",
              "storage",
              "storage facility",
              "warehousing"
            ]
          },
          {
            "n": "Temperature Controlled Storage",
            "f": "Storage Services",
            "code": "78121501",
            "desc": "Climate controlled warehousing",
            "kw": [
              "cold storage",
              "inventory management",
              "refrigerated storage",
              "storage",
              "temperature controlled warehouse"
            ]
          },
          {
            "n": "Hazardous Materials Storage",
            "f": "Storage Services",
            "code": "78121502",
            "desc": "Dangerous goods storage",
            "kw": [
              "COSHH storage",
              "dangerous goods warehouse",
              "hazardous storage",
              "inventory management",
              "storage"
            ]
          },
          {
            "n": "Inventory Management",
            "f": "Handling Services",
            "code": "78121601",
            "desc": "Stock control services",
            "kw": [
              "WMS",
              "stock management",
              "storage",
              "warehouse management system",
              "warehousing"
            ]
          },
          {
            "n": "Pick & Pack Services",
            "f": "Handling Services",
            "code": "78121601",
            "desc": "Order fulfillment services",
            "kw": [
              "fulfillment services",
              "inventory management",
              "order picking",
              "pick and pack",
              "storage"
            ]
          },
          {
            "n": "Cross-docking Services",
            "f": "Handling Services",
            "code": "78121602",
            "desc": "Transit storage services",
            "kw": [
              "cross-docking",
              "direct loading",
              "inventory management",
              "storage",
              "transshipment"
            ]
          },
          {
            "n": "Disposal Services",
            "f": "Warehousing Services",
            "code": "76121501",
            "desc": "Warehouse disposal services",
            "kw": [
              "asset disposal",
              "inventory management",
              "scrap disposal",
              "stock disposal",
              "storage"
            ]
          }
        ]
      },
      {
        "name": "Heavy Trucks and Parts",
        "commodities": [
          {
            "n": "Heavy Duty Trucks",
            "f": "Heavy Vehicles",
            "code": "25101501",
            "desc": "Commercial trucks and lorries",
            "kw": [
              "HGV",
              "flatbed truck",
              "fleet",
              "heavy duty truck",
              "heavy vehicles"
            ]
          },
          {
            "n": "Specialized Heavy Vehicles",
            "f": "Heavy Vehicles",
            "code": "25101501",
            "desc": "Tankers, flatbeds, lowboys",
            "kw": [
              "fleet",
              "heavy vehicles",
              "special purpose truck",
              "specialized vehicle",
              "trucks"
            ]
          },
          {
            "n": "Heavy Vehicle Spare Parts",
            "f": "Parts & Maintenance",
            "code": "25101601",
            "desc": "Truck parts and components",
            "kw": [
              "OEM spare parts",
              "facility management",
              "fleet",
              "heavy vehicles",
              "maintenance"
            ]
          },
          {
            "n": "Heavy Vehicle Maintenance",
            "f": "Parts & Maintenance",
            "code": "25101601",
            "desc": "Truck repair and servicing",
            "kw": [
              "HGV maintenance",
              "facility management",
              "fleet",
              "fleet service",
              "heavy vehicles"
            ]
          },
          {
            "n": "Tire Services",
            "f": "Parts & Maintenance",
            "code": "25101602",
            "desc": "Commercial tire supply and service",
            "kw": [
              "facility management",
              "fleet",
              "heavy vehicles",
              "maintenance",
              "operations"
            ]
          },
          {
            "n": "Domestic - Hotshot",
            "f": "Call Out Truck",
            "code": "78111803",
            "desc": "Domestic hotshot urgent delivery",
            "kw": [
              "call-out truck",
              "domestic urgent freight",
              "fleet",
              "heavy vehicles",
              "hotshot delivery"
            ]
          },
          {
            "n": "Domestic - Bulk Cargo",
            "f": "Call Out Truck",
            "code": "78141501",
            "desc": "Domestic bulk cargo trucking",
            "kw": [
              "bulk cargo truck",
              "domestic bulk transport",
              "fleet",
              "heavy vehicles",
              "trucks"
            ]
          }
        ]
      },
      {
        "name": "Light Vehicles for Operation",
        "commodities": [
          {
            "n": "Pickup Trucks",
            "f": "Light Vehicles",
            "code": "25101702",
            "desc": "Light duty pickup trucks",
            "kw": [
              "fleet management",
              "light vehicles",
              "pick-up",
              "pickup truck",
              "utility vehicle"
            ]
          },
          {
            "n": "SUVs & 4x4 Vehicles",
            "f": "Light Vehicles",
            "code": "25101507",
            "desc": "Sport utility and off-road vehicles",
            "kw": [
              "4x4",
              "SUV",
              "field vehicle",
              "fleet management",
              "light vehicles"
            ]
          },
          {
            "n": "Vans & Utility Vehicles",
            "f": "Light Vehicles",
            "code": "25101702",
            "desc": "Commercial vans and utilities",
            "kw": [
              "cargo van",
              "fleet management",
              "light vehicles",
              "utility van",
              "van"
            ]
          },
          {
            "n": "Light Vehicle Maintenance",
            "f": "Vehicle Services",
            "code": "25101801",
            "desc": "Light vehicle repair services",
            "kw": [
              "car servicing",
              "fleet maintenance",
              "fleet management",
              "light vehicles",
              "vehicle maintenance"
            ]
          },
          {
            "n": "Light Vehicle Lease & Rental",
            "f": "Vehicle Services",
            "code": "25101801",
            "desc": "Vehicle rental services",
            "kw": [
              "car rental",
              "fleet leasing",
              "fleet management",
              "light vehicles",
              "vehicle lease"
            ]
          },
          {
            "n": "Fuel Cards & Management",
            "f": "Vehicle Services",
            "code": "25101802",
            "desc": "Fleet fuel management",
            "kw": [
              "fleet fuel management",
              "fleet management",
              "fuel card",
              "light vehicles",
              "petrol card"
            ]
          },
          {
            "n": "Material Handling Rental Rigsite - Excl Crane Services",
            "f": "Lease & Rent",
            "code": "78121604",
            "desc": "Material handling equipment rental at rigsite",
            "kw": [
              "car rental",
              "fleet leasing",
              "fleet management",
              "light vehicles",
              "vehicle lease"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Manpower",
    "subs": [
      {
        "name": "Manpower",
        "commodities": [
          {
            "n": "Technical Contract Staff",
            "f": "Contract Labor",
            "code": "80111501",
            "desc": "Technical contractor services",
            "kw": [
              "contract engineers",
              "manpower",
              "staffing",
              "technical contractors",
              "technical staff"
            ]
          },
          {
            "n": "Administrative Contract Staff",
            "f": "Contract Labor",
            "code": "80111501",
            "desc": "Admin contractor services",
            "kw": [
              "admin contractors",
              "admin staff",
              "back office contractors",
              "manpower",
              "staffing"
            ]
          },
          {
            "n": "Field Operations Contract Staff",
            "f": "Contract Labor",
            "code": "80111502",
            "desc": "Field contractor services",
            "kw": [
              "field contractors",
              "manpower",
              "oilfield manpower",
              "operational staff",
              "rig crew"
            ]
          },
          {
            "n": "Managed Service Provider",
            "f": "Managed Services",
            "code": "80111601",
            "desc": "Outsourced workforce management",
            "kw": [
              "MSP",
              "VMS",
              "manpower",
              "staffing",
              "workforce"
            ]
          },
          {
            "n": "Statement of Work Services",
            "f": "Managed Services",
            "code": "80111601",
            "desc": "Project-based contracted work",
            "kw": [
              "SOW services",
              "deliverable-based work",
              "manpower",
              "project-based services",
              "staffing"
            ]
          }
        ]
      },
      {
        "name": "Staffing",
        "commodities": [
          {
            "n": "Temporary Labor Agencies",
            "f": "Temporary Staffing",
            "code": "80111701",
            "desc": "Temp staff placement services",
            "kw": [
              "agency workers",
              "manpower",
              "staffing",
              "temp workers",
              "temporary staff"
            ]
          },
          {
            "n": "Seasonal Staff Services",
            "f": "Temporary Staffing",
            "code": "80111701",
            "desc": "Short-term staff solutions",
            "kw": [
              "manpower",
              "seasonal staffing",
              "seasonal workers",
              "staffing",
              "workforce"
            ]
          },
          {
            "n": "Executive Search Services",
            "f": "Permanent Placement",
            "code": "80111701",
            "desc": "Senior executive recruitment",
            "kw": [
              "C-suite search",
              "executive search",
              "headhunting",
              "manpower",
              "staffing"
            ]
          },
          {
            "n": "Direct Hire Recruitment",
            "f": "Permanent Placement",
            "code": "80111701",
            "desc": "Permanent staff placement",
            "kw": [
              "direct hire",
              "manpower",
              "permanent placement",
              "permanent recruitment",
              "staffing"
            ]
          },
          {
            "n": "Job Boards & Advertising",
            "f": "Recruitment Support",
            "code": "80141501",
            "desc": "Recruitment advertising",
            "kw": [
              "job boards",
              "job posting",
              "manpower",
              "recruitment advertising",
              "staffing"
            ]
          },
          {
            "n": "Background Screening Services",
            "f": "Recruitment Support",
            "code": "80111702",
            "desc": "Pre-employment verification",
            "kw": [
              "background check",
              "employee screening",
              "manpower",
              "staffing",
              "vetting services"
            ]
          },
          {
            "n": "Contractor Cost Business Delivery",
            "f": "Contingent Workforce",
            "code": "80111501",
            "desc": "Contractor costs for business delivery",
            "kw": [
              "business delivery contractors",
              "contingent workforce",
              "manpower",
              "staff augmentation",
              "staffing"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Travel & Entertainment",
    "subs": [
      {
        "name": "Hotel",
        "commodities": [
          {
            "n": "Business Hotels",
            "f": "Transient Accommodation",
            "code": "90111501",
            "desc": "Business travel hotel stays",
            "kw": [
              "T&E",
              "accommodation",
              "business hotel",
              "corporate hotel",
              "hotel booking"
            ]
          },
          {
            "n": "Extended Stay Hotels",
            "f": "Transient Accommodation",
            "code": "90111501",
            "desc": "Long-term accommodation",
            "kw": [
              "T&E",
              "extended stay hotel",
              "long-stay accommodation",
              "serviced apartment",
              "travel"
            ]
          },
          {
            "n": "Hotel Corporate Rates",
            "f": "Corporate Programs",
            "code": "90111601",
            "desc": "Negotiated hotel programs",
            "kw": [
              "T&E",
              "corporate hotel rates",
              "negotiated hotel rates",
              "preferred hotels",
              "travel"
            ]
          },
          {
            "n": "Hotel Booking Services",
            "f": "Corporate Programs",
            "code": "90111601",
            "desc": "Hotel reservation services",
            "kw": [
              "T&E",
              "online booking tool",
              "reservation services",
              "travel"
            ]
          },
          {
            "n": "Short-Term Vehicle Rental",
            "f": "Ground Transport",
            "code": "78181503",
            "desc": "Short-term business travel vehicle rental",
            "kw": [
              "T&E",
              "car rental",
              "short-term rental",
              "travel",
              "vehicle hire"
            ]
          },
          {
            "n": "Shuttle Services (T&E)",
            "f": "Ground Transport",
            "code": "78111901",
            "desc": "Business travel shuttle services",
            "kw": [
              "T&E",
              "airport transfer",
              "hotel shuttle",
              "shuttle service",
              "travel"
            ]
          },
          {
            "n": "Taxi & Limo Services",
            "f": "Ground Transport",
            "code": "78111804",
            "desc": "Taxi and limousine services for business travel",
            "kw": [
              "T&E",
              "ground transport",
              "limousine",
              "ride-hailing",
              "taxi services"
            ]
          }
        ]
      },
      {
        "name": "Entertainment",
        "commodities": [
          {
            "n": "Client Meals & Dining",
            "f": "Client Entertainment",
            "code": "90151501",
            "desc": "Business dining expenses",
            "kw": [
              "T&E",
              "business meals",
              "client dining",
              "restaurant entertainment",
              "travel"
            ]
          },
          {
            "n": "Client Events & Hospitality",
            "f": "Client Entertainment",
            "code": "90151501",
            "desc": "Client entertainment events",
            "kw": [
              "T&E",
              "client entertainment events",
              "client hospitality",
              "corporate hospitality",
              "travel"
            ]
          },
          {
            "n": "Employee Social Events",
            "f": "Employee Events",
            "code": "90151601",
            "desc": "Staff parties and celebrations",
            "kw": [
              "T&E",
              "employee events",
              "staff social events",
              "team activities",
              "travel"
            ]
          },
          {
            "n": "Team Building Events",
            "f": "Employee Events",
            "code": "90151601",
            "desc": "Corporate team activities",
            "kw": [
              "T&E",
              "corporate team activities",
              "group engagement",
              "travel"
            ]
          },
          {
            "n": "Business Gifts",
            "f": "Gifts",
            "code": "90151701",
            "desc": "Corporate gift items",
            "kw": [
              "T&E",
              "client gifts",
              "corporate gifts",
              "gift giving",
              "travel"
            ]
          },
          {
            "n": "Internal Meetings",
            "f": "Meetings & Events",
            "code": "80141601",
            "desc": "Internal corporate meeting expenses",
            "kw": [
              "T&E",
              "meeting services",
              "offsite meetings",
              "travel"
            ]
          },
          {
            "n": "Non-Facility Catering (training/meeting related)",
            "f": "Meetings & Events",
            "code": "90101701",
            "desc": "Catering for business meetings and training",
            "kw": [
              "T&E",
              "meeting catering",
              "non-facility food services",
              "off-site catering",
              "travel"
            ]
          }
        ]
      },
      {
        "name": "Air Tickets",
        "commodities": [
          {
            "n": "Domestic Air Tickets",
            "f": "Commercial Air",
            "code": "90121501",
            "desc": "Domestic flight tickets",
            "kw": [
              "T&E",
              "airline tickets domestic",
              "domestic flights",
              "internal air travel",
              "travel"
            ]
          },
          {
            "n": "International Air Tickets",
            "f": "Commercial Air",
            "code": "90121501",
            "desc": "International flight tickets",
            "kw": [
              "T&E",
              "international flights",
              "long-haul flights",
              "overseas air travel",
              "travel"
            ]
          },
          {
            "n": "Travel Agency Services",
            "f": "Travel Management",
            "code": "90121601",
            "desc": "Travel booking and management",
            "kw": [
              "T&E",
              "TMC",
              "travel",
              "travel agency",
              "travel management company"
            ]
          },
          {
            "n": "Corporate Travel Programs",
            "f": "Travel Management",
            "code": "90121601",
            "desc": "Managed travel services",
            "kw": [
              "T&E",
              "business travel management",
              "corporate travel program",
              "travel",
              "travel policy"
            ]
          },
          {
            "n": "Baggage & Seat Fees",
            "f": "Ancillary Services",
            "code": "90121701",
            "desc": "Airline ancillary charges",
            "kw": [
              "T&E",
              "ancillary air fees",
              "baggage fees",
              "seat selection",
              "travel"
            ]
          },
          {
            "n": "Airport Lounge Access",
            "f": "Ancillary Services",
            "code": "90121701",
            "desc": "Premium travel services",
            "kw": [
              "T&E",
              "executive lounge",
              "priority pass",
              "travel"
            ]
          },
          {
            "n": "Passport/Visa/Global Entry & Travel Related Admin Fees",
            "f": "Travel Administration",
            "code": "93151501",
            "desc": "Visa, passport and travel document services",
            "kw": [
              "T&E",
              "immigration fees",
              "passport services",
              "travel",
              "travel administration"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Consumables",
    "name": "Safety",
    "subs": [
      {
        "name": "Life Safety (PPE)",
        "commodities": [
          {
            "n": "Safety Helmets & Hard Hats",
            "f": "Head Protection",
            "code": "46181501",
            "desc": "Head protection equipment",
            "kw": [
              "PPE",
              "hard hat",
              "head protection",
              "personal protective equipment",
              "safety"
            ]
          },
          {
            "n": "Face Shields & Visors",
            "f": "Head Protection",
            "code": "46181501",
            "desc": "Face protection equipment",
            "kw": [
              "PPE",
              "face protection",
              "face shield",
              "personal protective equipment",
              "safety"
            ]
          },
          {
            "n": "Safety Glasses & Goggles",
            "f": "Eye & Ear Protection",
            "code": "46181601",
            "desc": "Eye protection equipment",
            "kw": [
              "PPE",
              "eye protection",
              "goggles",
              "personal protective equipment",
              "safety"
            ]
          },
          {
            "n": "Hearing Protection",
            "f": "Eye & Ear Protection",
            "code": "46181601",
            "desc": "Ear protection equipment",
            "kw": [
              "PPE",
              "ear defenders",
              "earplugs",
              "noise protection",
              "personal protective equipment"
            ]
          },
          {
            "n": "Safety Coveralls",
            "f": "Body Protection",
            "code": "46181701",
            "desc": "Protective workwear",
            "kw": [
              "PPE",
              "coverall",
              "overalls",
              "personal protective equipment",
              "safety"
            ]
          },
          {
            "n": "Hi-Visibility Clothing",
            "f": "Body Protection",
            "code": "46181701",
            "desc": "High visibility apparel",
            "kw": [
              "PPE",
              "hi-vis clothing",
              "high-visibility vest",
              "personal protective equipment",
              "reflective clothing"
            ]
          },
          {
            "n": "Safety Gloves",
            "f": "Hand & Foot Protection",
            "code": "46181702",
            "desc": "Hand protection equipment",
            "kw": [
              "PPE",
              "hand protection",
              "personal protective equipment",
              "safety",
              "work gloves"
            ]
          }
        ]
      },
      {
        "name": "Safety Equipment",
        "commodities": [
          {
            "n": "Fire Extinguishers",
            "f": "Fire Safety Equipment",
            "code": "46191501",
            "desc": "Portable fire suppression",
            "kw": [
              "CO2 extinguisher",
              "PPE",
              "dry powder extinguisher",
              "fire extinguisher",
              "fire fighting"
            ]
          },
          {
            "n": "Fire Blankets & Kits",
            "f": "Fire Safety Equipment",
            "code": "46191501",
            "desc": "Fire safety accessories",
            "kw": [
              "PPE",
              "emergency fire supplies",
              "fire blanket",
              "fire kit",
              "personal protective equipment"
            ]
          },
          {
            "n": "First Aid Kits",
            "f": "First Aid",
            "code": "46191601",
            "desc": "Emergency medical kits",
            "kw": [
              "PPE",
              "emergency medical kit",
              "first aid box",
              "first aid kit",
              "personal protective equipment"
            ]
          },
          {
            "n": "AED Defibrillators",
            "f": "First Aid",
            "code": "46191601",
            "desc": "Automated external defibrillators",
            "kw": [
              "AED",
              "PPE",
              "cardiac emergency device",
              "defibrillator",
              "personal protective equipment"
            ]
          },
          {
            "n": "Eye Wash Stations",
            "f": "First Aid",
            "code": "46191602",
            "desc": "Emergency eye wash equipment",
            "kw": [
              "PPE",
              "emergency eye wash",
              "eyewash station",
              "personal protective equipment",
              "safety"
            ]
          },
          {
            "n": "Gas Detectors",
            "f": "Detection Equipment",
            "code": "46191504",
            "desc": "Gas monitoring equipment",
            "kw": [
              "H2S detector",
              "LEL detector",
              "PPE",
              "gas detector",
              "gas monitor"
            ]
          },
          {
            "n": "Smoke & Heat Detectors",
            "f": "Detection Equipment",
            "code": "46191501",
            "desc": "Fire detection equipment",
            "kw": [
              "PPE",
              "fire alarm sensor",
              "heat detector",
              "personal protective equipment",
              "safety"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "HR",
    "subs": [
      {
        "name": "Light Vehicles",
        "commodities": [
          {
            "n": "Company Car Lease",
            "f": "Employee Vehicles",
            "code": "78181501",
            "desc": "Employee vehicle lease",
            "kw": [
              "HR",
              "company car",
              "employee car",
              "fleet car lease",
              "fleet management"
            ]
          },
          {
            "n": "Car Allowance Programs",
            "f": "Employee Vehicles",
            "code": "78181501",
            "desc": "Vehicle allowance management",
            "kw": [
              "HR",
              "car allowance",
              "fleet management",
              "human resources",
              "light vehicles"
            ]
          },
          {
            "n": "Pool Vehicle Services",
            "f": "Employee Vehicles",
            "code": "78181502",
            "desc": "Shared vehicle fleet",
            "kw": [
              "HR",
              "company pool car",
              "fleet management",
              "human resources",
              "light vehicles"
            ]
          },
          {
            "n": "Vehicle Insurance",
            "f": "Vehicle Administration",
            "code": "78181601",
            "desc": "Employee vehicle insurance",
            "kw": [
              "HR",
              "car insurance",
              "coverage",
              "fleet insurance",
              "fleet management"
            ]
          },
          {
            "n": "Fleet Management Services",
            "f": "Vehicle Administration",
            "code": "78141503",
            "desc": "Fleet administration",
            "kw": [
              "HR",
              "fleet management",
              "fleet tracking",
              "human resources",
              "light vehicles"
            ]
          }
        ]
      },
      {
        "name": "Training",
        "commodities": [
          {
            "n": "Technical Skills Training",
            "f": "Technical Training",
            "code": "86132001",
            "desc": "Job-specific technical training",
            "kw": [
              "HR",
              "human resources",
              "people management",
              "skills development",
              "technical skills"
            ]
          },
          {
            "n": "Safety & Compliance Training",
            "f": "Technical Training",
            "code": "86132001",
            "desc": "HSE and regulatory training",
            "kw": [
              "HR",
              "HSE training",
              "compliance training",
              "human resources",
              "people management"
            ]
          },
          {
            "n": "IT Skills Training",
            "f": "Technical Training",
            "code": "86132101",
            "desc": "Computer and software training",
            "kw": [
              "HR",
              "IT training",
              "human resources",
              "people management",
              "software training"
            ]
          },
          {
            "n": "Leadership Training",
            "f": "Professional Development",
            "code": "86132001",
            "desc": "Management development programs",
            "kw": [
              "HR",
              "human resources",
              "leadership program",
              "management development",
              "people management"
            ]
          },
          {
            "n": "Soft Skills Training",
            "f": "Professional Development",
            "code": "86132101",
            "desc": "Communication and interpersonal skills",
            "kw": [
              "HR",
              "communication training",
              "human resources",
              "interpersonal skills",
              "people management"
            ]
          },
          {
            "n": "Conferences & Seminars",
            "f": "External Training",
            "code": "86132102",
            "desc": "Industry events and conferences",
            "kw": [
              "HR",
              "conferences",
              "external training events",
              "human resources",
              "people management"
            ]
          },
          {
            "n": "Professional Certifications",
            "f": "External Training",
            "code": "86132102",
            "desc": "Certification programs",
            "kw": [
              "CPD",
              "HR",
              "accreditation",
              "human resources",
              "people management"
            ]
          }
        ]
      },
      {
        "name": "Medical Checkup",
        "commodities": [
          {
            "n": "Pre-Employment Screening",
            "f": "Pre-Employment Medical",
            "code": "85121801",
            "desc": "New hire medical examination",
            "kw": [
              "HR",
              "health screening",
              "human resources",
              "people management",
              "pre-employment medical"
            ]
          },
          {
            "n": "Drug & Alcohol Testing",
            "f": "Pre-Employment Medical",
            "code": "85121801",
            "desc": "Substance screening services",
            "kw": [
              "D&A testing",
              "HR",
              "alcohol testing",
              "drug testing",
              "human resources"
            ]
          },
          {
            "n": "Annual Health Checkups",
            "f": "Periodic Medical",
            "code": "85121901",
            "desc": "Regular employee health exams",
            "kw": [
              "HR",
              "annual health checkup",
              "human resources",
              "people management",
              "periodic medical"
            ]
          },
          {
            "n": "Occupational Health Assessments",
            "f": "Periodic Medical",
            "code": "85121901",
            "desc": "Work-related health monitoring",
            "kw": [
              "HR",
              "OH services",
              "human resources",
              "occupational health",
              "people management"
            ]
          },
          {
            "n": "Vision & Hearing Tests",
            "f": "Specialty Assessments",
            "code": "85122001",
            "desc": "Sensory health assessments",
            "kw": [
              "HR",
              "audiometry",
              "eye examination",
              "hearing test",
              "human resources"
            ]
          },
          {
            "n": "Fitness for Duty Assessments",
            "f": "Specialty Assessments",
            "code": "85122001",
            "desc": "Work capability evaluations",
            "kw": [
              "FFD",
              "HR",
              "fitness for duty assessment",
              "human resources",
              "medical fitness"
            ]
          },
          {
            "n": "Industrial Hygiene",
            "f": "Environment",
            "code": "77101502",
            "desc": "Industrial hygiene assessment and monitoring",
            "kw": [
              "HR",
              "IH monitoring",
              "human resources",
              "occupational hygiene",
              "people management"
            ]
          }
        ]
      },
      {
        "name": "Medical Insurance",
        "commodities": [
          {
            "n": "Group Medical Insurance",
            "f": "Health Insurance",
            "code": "84131901",
            "desc": "Employee health coverage",
            "kw": [
              "HR",
              "coverage",
              "employee health insurance",
              "human resources",
              "insurance"
            ]
          },
          {
            "n": "Dental Insurance",
            "f": "Health Insurance",
            "code": "84131901",
            "desc": "Employee dental coverage",
            "kw": [
              "HR",
              "coverage",
              "dental benefits",
              "dental coverage",
              "human resources"
            ]
          },
          {
            "n": "Vision Insurance",
            "f": "Health Insurance",
            "code": "84131902",
            "desc": "Employee vision coverage",
            "kw": [
              "HR",
              "coverage",
              "eye care insurance",
              "human resources",
              "insurance"
            ]
          },
          {
            "n": "Group Life Insurance",
            "f": "Life & Disability",
            "code": "84131601",
            "desc": "Employee life coverage",
            "kw": [
              "HR",
              "coverage",
              "death benefit",
              "employee death benefit",
              "employee life coverage"
            ]
          },
          {
            "n": "Disability Insurance",
            "f": "Life & Disability",
            "code": "84131604",
            "desc": "Short and long-term disability",
            "kw": [
              "HR",
              "coverage",
              "disability coverage",
              "human resources",
              "income protection"
            ]
          },
          {
            "n": "EAP Services",
            "f": "Employee Assistance",
            "code": "84131602",
            "desc": "Employee assistance programs",
            "kw": [
              "EAP",
              "HR",
              "counseling services",
              "employee assistance program",
              "human resources"
            ]
          },
          {
            "n": "Mental Health Services",
            "f": "Employee Assistance",
            "code": "84131602",
            "desc": "Counseling and support services",
            "kw": [
              "HR",
              "human resources",
              "people management",
              "psychological support",
              "wellbeing services"
            ]
          }
        ]
      },
      {
        "name": "Recruitment",
        "commodities": [
          {
            "n": "Executive Search Firms",
            "f": "Agency Recruitment",
            "code": "80111701",
            "desc": "Senior executive headhunting",
            "kw": [
              "HR",
              "executive search firm",
              "headhunter",
              "human resources",
              "people management"
            ]
          },
          {
            "n": "Recruitment Agencies",
            "f": "Agency Recruitment",
            "code": "80111701",
            "desc": "General recruitment agencies",
            "kw": [
              "HR",
              "human resources",
              "people management",
              "recruitment agency",
              "staffing agency"
            ]
          },
          {
            "n": "Technical Recruitment Specialists",
            "f": "Agency Recruitment",
            "code": "80111701",
            "desc": "Specialized technical recruiters",
            "kw": [
              "HR",
              "engineering recruiter",
              "human resources",
              "people management",
              "specialist recruiter"
            ]
          },
          {
            "n": "Job Posting Services",
            "f": "Direct Sourcing",
            "code": "80141501",
            "desc": "Job board advertising",
            "kw": [
              "HR",
              "careers page",
              "human resources",
              "job boards",
              "job posting"
            ]
          },
          {
            "n": "Recruitment Marketing",
            "f": "Direct Sourcing",
            "code": "80111702",
            "desc": "Employer branding services",
            "kw": [
              "HR",
              "employer branding",
              "human resources",
              "people management",
              "talent marketing"
            ]
          },
          {
            "n": "Assessment & Testing Services",
            "f": "Assessment Services",
            "code": "80111703",
            "desc": "Candidate evaluation services",
            "kw": [
              "HR",
              "aptitude test",
              "candidate assessment",
              "human resources",
              "people management"
            ]
          },
          {
            "n": "Background Verification",
            "f": "Assessment Services",
            "code": "80111702",
            "desc": "Reference and background checks",
            "kw": [
              "HR",
              "employee vetting",
              "human resources",
              "people management",
              "reference check"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Materials & Assets",
    "name": "Lifting Equipment",
    "subs": [
      {
        "name": "Forklift",
        "commodities": [
          {
            "n": "Material Handling Equipment (Forklifts, Pallet Trucks)",
            "f": "Material Handling",
            "code": "24101603",
            "desc": "Material handling equipment purchase",
            "kw": [
              "Material Handling Equipment (Forklifts",
              "Pallet Trucks)",
              "cranes",
              "hand pallet jack",
              "lifting equipment"
            ]
          },
          {
            "n": "Lifting Equipment & Accessories",
            "f": "Material Handling",
            "code": "31151703",
            "desc": "Lifting equipment and accessories purchase",
            "kw": [
              "cranes",
              "lifting equipment",
              "material handling"
            ]
          },
          {
            "n": "Lifting Equipment & Accessories Rental",
            "f": "Material Handling",
            "code": "72154503",
            "desc": "Lifting equipment and accessories rental",
            "kw": [
              "cranes",
              "lifting equipment",
              "material handling"
            ]
          },
          {
            "n": "Lifting Equipment & Accessories Maintenance & Certification",
            "f": "Material Handling",
            "code": "81101703",
            "desc": "Lifting equipment maintenance and certification",
            "kw": [
              "cranes",
              "lifting equipment",
              "material handling"
            ]
          },
          {
            "n": "Electric Forklifts",
            "f": "Counterbalance Forklifts",
            "code": "24101505",
            "desc": "Electric counterbalance forklifts",
            "kw": [
              "battery forklift",
              "cranes",
              "downhole",
              "electric forklift",
              "indoor forklift"
            ]
          },
          {
            "n": "Diesel/LPG Forklifts",
            "f": "Counterbalance Forklifts",
            "code": "24101505",
            "desc": "IC engine forklifts",
            "kw": [
              "LPG forklift",
              "counterbalance forklift",
              "cranes",
              "diesel forklift",
              "downhole"
            ]
          },
          {
            "n": "Reach Trucks",
            "f": "Warehouse Forklifts",
            "code": "24101505",
            "desc": "Warehouse reach trucks",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "narrow aisle forklift"
            ]
          }
        ]
      },
      {
        "name": "Crains",
        "commodities": [
          {
            "n": "Truck Mounted Cranes",
            "f": "Mobile Cranes",
            "code": "23101501",
            "desc": "Truck mounted crane equipment",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "mobile crane"
            ]
          },
          {
            "n": "Crawler Cranes",
            "f": "Mobile Cranes",
            "code": "23101501",
            "desc": "Crawler crane equipment",
            "kw": [
              "cranes",
              "crawler crane",
              "downhole",
              "heavy lift crawler",
              "lattice boom crane"
            ]
          },
          {
            "n": "All Terrain Cranes",
            "f": "Mobile Cranes",
            "code": "23101502",
            "desc": "All terrain crane systems",
            "kw": [
              "AT crane",
              "all terrain crane",
              "cranes",
              "downhole",
              "lifting equipment"
            ]
          },
          {
            "n": "Tower Cranes",
            "f": "Static Cranes",
            "code": "24101623",
            "desc": "Tower crane systems",
            "kw": [
              "construction tower crane",
              "cranes",
              "downhole",
              "hammerhead crane",
              "lifting equipment"
            ]
          },
          {
            "n": "Overhead Cranes",
            "f": "Static Cranes",
            "code": "24101653",
            "desc": "Overhead bridge cranes",
            "kw": [
              "EOT crane",
              "bridge crane",
              "cranes",
              "downhole",
              "lifting equipment"
            ]
          },
          {
            "n": "Gantry Cranes",
            "f": "Static Cranes",
            "code": "24101654",
            "desc": "Gantry crane systems",
            "kw": [
              "cranes",
              "downhole",
              "gantry crane",
              "lifting equipment",
              "material handling"
            ]
          },
          {
            "n": "Pedestal Cranes",
            "f": "Offshore Cranes",
            "code": "24101664",
            "desc": "Offshore pedestal cranes",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "offshore pedestal crane"
            ]
          }
        ]
      },
      {
        "name": "Riggers",
        "commodities": [
          {
            "n": "Certified Riggers",
            "f": "Rigging Personnel",
            "code": "80111601",
            "desc": "Certified rigging personnel services",
            "kw": [
              "banksman",
              "certified rigger",
              "cranes",
              "downhole",
              "lift supervisor"
            ]
          },
          {
            "n": "Rigging Supervisors",
            "f": "Rigging Personnel",
            "code": "80111601",
            "desc": "Rigging supervisor services",
            "kw": [
              "banksman",
              "certified rigger",
              "cranes",
              "downhole",
              "lift supervisor"
            ]
          },
          {
            "n": "Lift Planning Services",
            "f": "Rigging Services",
            "code": "72151801",
            "desc": "Engineered lift planning",
            "kw": [
              "cranes",
              "critical lift",
              "downhole",
              "lift plan",
              "lifting equipment"
            ]
          },
          {
            "n": "Heavy Lift Services",
            "f": "Rigging Services",
            "code": "72151801",
            "desc": "Heavy lift rigging services",
            "kw": [
              "abnormal lift",
              "cranes",
              "downhole",
              "engineered lift",
              "lifting equipment"
            ]
          },
          {
            "n": "Rigging Hardware",
            "f": "Rigging Equipment",
            "code": "31151703",
            "desc": "Rigging hardware and accessories",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Spreader Bars & Lifting Beams",
            "f": "Rigging Equipment",
            "code": "31162001",
            "desc": "Spreader bars and lifting beams",
            "kw": [
              "below hook device",
              "cranes",
              "downhole",
              "lifting beam",
              "lifting equipment"
            ]
          }
        ]
      },
      {
        "name": "Slings & Wire Rope",
        "commodities": [
          {
            "n": "Steel Wire Rope",
            "f": "Wire Rope",
            "code": "31151505",
            "desc": "Steel wire rope products",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Wire Rope Slings",
            "f": "Wire Rope",
            "code": "31151505",
            "desc": "Wire rope sling assemblies",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Wire Rope Fittings",
            "f": "Wire Rope",
            "code": "31151522",
            "desc": "Wire rope fittings and accessories",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Polyester Round Slings",
            "f": "Synthetic Slings",
            "code": "31151601",
            "desc": "Polyester round sling products",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Webbing Slings",
            "f": "Synthetic Slings",
            "code": "31151601",
            "desc": "Webbing sling products",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Grade 80 Chain Slings",
            "f": "Chain Slings",
            "code": "31151703",
            "desc": "Grade 80 lifting chain slings",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          },
          {
            "n": "Grade 100 Chain Slings",
            "f": "Chain Slings",
            "code": "31151703",
            "desc": "Grade 100 lifting chain slings",
            "kw": [
              "cranes",
              "downhole",
              "lifting equipment",
              "material handling",
              "oilfield services"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Field Technical Equipment & Services",
    "subs": [
      {
        "name": "Completion Tools",
        "commodities": [
          {
            "n": "Cross Coupling Cable Protectors",
            "f": "Cable Protectors",
            "code": "20121801",
            "desc": "Cable protection equipment for downhole applications",
            "kw": [
              "ESP cable protection",
              "cable protectors",
              "completion tools",
              "downhole",
              "downhole cable protection"
            ]
          },
          {
            "n": "Permanent Downhole Cable (PDC)",
            "f": "Cables",
            "code": "26121601",
            "desc": "Permanent downhole communication cables",
            "kw": [
              "ESP cable",
              "PDC cable",
              "completion tools",
              "downhole",
              "downhole wire"
            ]
          },
          {
            "n": "Hybrid PDC",
            "f": "Cables",
            "code": "26121601",
            "desc": "Hybrid permanent downhole cables",
            "kw": [
              "ESP cable",
              "PDC cable",
              "completion tools",
              "downhole",
              "downhole wire"
            ]
          },
          {
            "n": "Twisted Pair PDC",
            "f": "Cables",
            "code": "26121602",
            "desc": "Twisted pair downhole cables",
            "kw": [
              "ESP cable",
              "PDC cable",
              "completion tools",
              "downhole",
              "downhole wire"
            ]
          },
          {
            "n": "Casing Baskets",
            "f": "Casing Accessories",
            "code": "20121501",
            "desc": "Casing basket equipment",
            "kw": [
              "casing basket",
              "centralizer basket",
              "completion tools",
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Casing Cleaners",
            "f": "Casing Accessories",
            "code": "20121501",
            "desc": "Casing cleaning equipment",
            "kw": [
              "bore cleaner",
              "casing cleaner",
              "completion tools",
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Centralizers & Turbolizers",
            "f": "Casing Hardware",
            "code": "20121601",
            "desc": "Centralization equipment for casing",
            "kw": [
              "bow spring centralizer",
              "casing centralizer",
              "completion tools",
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Data Acquisition",
        "commodities": [
          {
            "n": "Conventional Gyro Services",
            "f": "Downhole Data Acquisition",
            "code": "20121901",
            "desc": "Conventional gyroscopic survey services",
            "kw": [
              "data acquisition",
              "directional survey",
              "downhole",
              "downhole survey",
              "gyro services"
            ]
          },
          {
            "n": "Gravity/Magnetic Field Surveys",
            "f": "Downhole Data Acquisition",
            "code": "20121903",
            "desc": "Gravity and magnetic field-based surveys",
            "kw": [
              "data acquisition",
              "downhole",
              "downhole survey",
              "field survey",
              "gravity survey"
            ]
          },
          {
            "n": "Mud Pulse Telemetry",
            "f": "Downhole Data Acquisition",
            "code": "20121802",
            "desc": "MWD mud pulse telemetry systems",
            "kw": [
              "MWD telemetry",
              "data acquisition",
              "downhole",
              "downhole communication",
              "downhole survey"
            ]
          },
          {
            "n": "Wireless Data Transmission",
            "f": "Downhole Data Acquisition",
            "code": "20121901",
            "desc": "Wireless downhole data acquisition",
            "kw": [
              "EM telemetry",
              "acoustic telemetry",
              "data acquisition",
              "downhole",
              "downhole survey"
            ]
          },
          {
            "n": "GWD Systems",
            "f": "Gyro While Drilling (GWD)",
            "code": "20121803",
            "desc": "Gyro while drilling systems",
            "kw": [
              "GWD",
              "azimuthal gyro MWD",
              "data acquisition",
              "downhole",
              "downhole drilling tools"
            ]
          },
          {
            "n": "GWD Services",
            "f": "Gyro While Drilling (GWD)",
            "code": "20121803",
            "desc": "Gyro while drilling services",
            "kw": [
              "GWD",
              "azimuthal gyro MWD",
              "data acquisition",
              "downhole",
              "downhole drilling tools"
            ]
          },
          {
            "n": "Surface Data Logging",
            "f": "Surface Data Acquisition",
            "code": "20121901",
            "desc": "Surface data logging systems",
            "kw": [
              "data acquisition",
              "downhole",
              "downhole survey",
              "formation evaluation logging",
              "mud logging"
            ]
          }
        ]
      },
      {
        "name": "Drilling Product & Services",
        "commodities": [
          {
            "n": "PDC Bits - Purchase",
            "f": "Drilling Bits",
            "code": "20141501",
            "desc": "PDC drill bits for purchase",
            "kw": [
              "PDC bit",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          },
          {
            "n": "PDC Bits - Rental",
            "f": "Drilling Bits",
            "code": "20141501",
            "desc": "PDC drill bits for rental",
            "kw": [
              "PDC bit",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          },
          {
            "n": "Roller Cone Bits - Milltooth",
            "f": "Drilling Bits",
            "code": "20141502",
            "desc": "Milltooth roller cone bits",
            "kw": [
              "TCI bit",
              "casing cutter",
              "downhole",
              "downhole drilling tools",
              "drill bit"
            ]
          },
          {
            "n": "Roller Cone Bits - TCI",
            "f": "Drilling Bits",
            "code": "20141503",
            "desc": "Tungsten carbide insert roller cone bits",
            "kw": [
              "TCI bit",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          },
          {
            "n": "Positive Displacement Motors",
            "f": "Downhole Motors",
            "code": "20141601",
            "desc": "Positive displacement drilling motors",
            "kw": [
              "PDM",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          },
          {
            "n": "Turbine Motors",
            "f": "Downhole Motors",
            "code": "20141601",
            "desc": "Turbine drilling motors",
            "kw": [
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling",
              "drilling turbine"
            ]
          },
          {
            "n": "Motor Accessories & Parts",
            "f": "Downhole Motors",
            "code": "20121802",
            "desc": "Downhole motor accessories",
            "kw": [
              "PDM parts",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          }
        ]
      },
      {
        "name": "Electronics",
        "commodities": [
          {
            "n": "Power Distribution Equipment",
            "f": "Electrical Equipment",
            "code": "26111503",
            "desc": "Electrical power distribution systems",
            "kw": [
              "MCC",
              "downhole",
              "downhole electronics",
              "electronics",
              "oilfield electronics"
            ]
          },
          {
            "n": "Motor Control Centers",
            "f": "Electrical Equipment",
            "code": "26111601",
            "desc": "Motor control center assemblies",
            "kw": [
              "MCC",
              "VSD controls",
              "downhole",
              "downhole electronics",
              "electronics"
            ]
          },
          {
            "n": "Variable Frequency Drives",
            "f": "Electrical Equipment",
            "code": "26111601",
            "desc": "VFD motor control systems",
            "kw": [
              "VFD",
              "VSD",
              "downhole",
              "downhole electronics",
              "electronics"
            ]
          },
          {
            "n": "Circuit Boards & PCBs",
            "f": "Electronic Components",
            "code": "32101502",
            "desc": "Electronic circuit boards",
            "kw": [
              "PCB",
              "downhole",
              "downhole electronics",
              "electronics",
              "electronics board"
            ]
          },
          {
            "n": "Integrated Circuits",
            "f": "Electronic Components",
            "code": "43211507",
            "desc": "Integrated circuit components",
            "kw": [
              "IC",
              "downhole",
              "downhole electronics",
              "electronics",
              "integrated circuit"
            ]
          },
          {
            "n": "Resistors & Capacitors",
            "f": "Electronic Components",
            "code": "32101502",
            "desc": "Passive electronic components",
            "kw": [
              "capacitors",
              "downhole",
              "downhole electronics",
              "electronic components",
              "electronics"
            ]
          },
          {
            "n": "Pressure Transducers",
            "f": "Sensors & Transducers",
            "code": "41111501",
            "desc": "Pressure sensing transducers",
            "kw": [
              "downhole",
              "downhole electronics",
              "downhole pressure gauge",
              "electronics",
              "oilfield electronics"
            ]
          }
        ]
      },
      {
        "name": "Regulated Materials",
        "commodities": [
          {
            "n": "Shaped Charges",
            "f": "Explosives",
            "code": "20122103",
            "desc": "Perforating shaped charges",
            "kw": [
              "downhole",
              "explosive charge",
              "oilfield explosives",
              "oilfield services",
              "perforating charge"
            ]
          },
          {
            "n": "Explosive Powder",
            "f": "Explosives",
            "code": "20122103",
            "desc": "Explosive powder materials",
            "kw": [
              "RDX",
              "downhole",
              "oilfield explosives",
              "oilfield services",
              "propellant"
            ]
          },
          {
            "n": "Detonators & Boosters",
            "f": "Explosives",
            "code": "20122103",
            "desc": "Detonators and booster assemblies",
            "kw": [
              "booster",
              "detonator",
              "downhole",
              "firing system",
              "initiator"
            ]
          },
          {
            "n": "Explosive Accessories",
            "f": "Explosives",
            "code": "20122103",
            "desc": "Explosive handling accessories",
            "kw": [
              "downhole",
              "oilfield explosives",
              "oilfield services",
              "perforating hardware",
              "radioactive materials"
            ]
          },
          {
            "n": "Logging Sources",
            "f": "Radioactive Sources",
            "code": "20122103",
            "desc": "Radioactive logging sources",
            "kw": [
              "Cs-137",
              "downhole",
              "logging source",
              "nuclear source",
              "oilfield explosives"
            ]
          },
          {
            "n": "Source Handling Equipment",
            "f": "Radioactive Sources",
            "code": "20121902",
            "desc": "Radioactive source handling equipment",
            "kw": [
              "downhole",
              "oilfield explosives",
              "oilfield services",
              "radioactive handling",
              "radioactive materials"
            ]
          },
          {
            "n": "Pulse Neutron Generators (PNG)",
            "f": "Nuclear Materials",
            "code": "20121901",
            "desc": "Pulse neutron generator systems",
            "kw": [
              "PNG",
              "active neutron source",
              "downhole",
              "neutron tool",
              "oilfield explosives"
            ]
          }
        ]
      },
      {
        "name": "Compressors & Generators",
        "commodities": [
          {
            "n": "Bulk Compressors - Purchase",
            "f": "Bulk Compressors",
            "code": "26111701",
            "desc": "Bulk air compressor systems",
            "kw": [
              "air compressor",
              "bulk compressor",
              "compressor services",
              "downhole",
              "gas compressor"
            ]
          },
          {
            "n": "Bulk Compressors - Rental",
            "f": "Bulk Compressors",
            "code": "26111701",
            "desc": "Bulk compressor rental services",
            "kw": [
              "air compressor",
              "bulk compressor",
              "compressor services",
              "downhole",
              "gas compressor"
            ]
          },
          {
            "n": "Bulk Compressor Maintenance",
            "f": "Bulk Compressors",
            "code": "26111702",
            "desc": "Bulk compressor maintenance services",
            "kw": [
              "bulk compressor",
              "downhole",
              "nitrogen compressor",
              "oilfield equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Well Test Compressors - Purchase",
            "f": "Well Testing Compressors",
            "code": "26111801",
            "desc": "Well testing compressor systems",
            "kw": [
              "air compressor",
              "compressor services",
              "downhole",
              "gas compressor",
              "oilfield equipment"
            ]
          },
          {
            "n": "Well Test Compressors - Rental",
            "f": "Well Testing Compressors",
            "code": "26111801",
            "desc": "Well test compressor rental",
            "kw": [
              "air compressor",
              "compressor services",
              "downhole",
              "gas compressor",
              "oilfield equipment"
            ]
          },
          {
            "n": "Well Test Compressor Services",
            "f": "Well Testing Compressors",
            "code": "26111802",
            "desc": "Well test compressor operating services",
            "kw": [
              "downhole",
              "oilfield equipment",
              "oilfield services",
              "production testing compressor",
              "rotating equipment"
            ]
          },
          {
            "n": "Diesel Generators - Purchase",
            "f": "Power Generators",
            "code": "26111901",
            "desc": "Diesel generator sets",
            "kw": [
              "diesel generator",
              "downhole",
              "genset",
              "oilfield equipment",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Cabins, Camps & Cargo",
        "commodities": [
          {
            "n": "Portable Buildings - Purchase",
            "f": "Land Cabins & Camps",
            "code": "30161501",
            "desc": "Portable building structures",
            "kw": [
              "cargo containers",
              "downhole",
              "field accommodation",
              "modular building",
              "oilfield services"
            ]
          },
          {
            "n": "Portable Buildings - Rental",
            "f": "Land Cabins & Camps",
            "code": "30161501",
            "desc": "Portable building rental",
            "kw": [
              "cargo containers",
              "downhole",
              "field accommodation",
              "modular building",
              "oilfield services"
            ]
          },
          {
            "n": "Camp Accommodation Units",
            "f": "Land Cabins & Camps",
            "code": "30161502",
            "desc": "Camp accommodation modules",
            "kw": [
              "camp accommodation unit",
              "cargo containers",
              "crew quarters",
              "downhole",
              "field accommodation"
            ]
          },
          {
            "n": "Office Containers",
            "f": "Land Cabins & Camps",
            "code": "30161503",
            "desc": "Containerized office units",
            "kw": [
              "cargo containers",
              "containerized office",
              "downhole",
              "field accommodation",
              "office container"
            ]
          },
          {
            "n": "Welfare Units",
            "f": "Land Cabins & Camps",
            "code": "30161504",
            "desc": "Welfare and sanitary units",
            "kw": [
              "cargo containers",
              "downhole",
              "field accommodation",
              "oilfield services",
              "portable structures"
            ]
          },
          {
            "n": "Offshore Accommodation Modules",
            "f": "Offshore Cabins",
            "code": "30161601",
            "desc": "Offshore living quarter modules",
            "kw": [
              "LQ module",
              "cargo containers",
              "downhole",
              "field accommodation",
              "living quarters offshore"
            ]
          },
          {
            "n": "Offshore Office Modules",
            "f": "Offshore Cabins",
            "code": "30161601",
            "desc": "Offshore office containers",
            "kw": [
              "cargo containers",
              "downhole",
              "field accommodation",
              "offshore container module",
              "offshore office module"
            ]
          }
        ]
      },
      {
        "name": "Power Driven Integration",
        "commodities": [
          {
            "n": "Skid Unit - Purchase",
            "f": "Assembly",
            "code": "20142302",
            "desc": "Skid-mounted equipment assemblies",
            "kw": [
              "downhole",
              "engineered skid",
              "integrated oilfield equipment",
              "oilfield equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Skid Unit - Rental",
            "f": "Assembly",
            "code": "20142302",
            "desc": "Skid unit rental services",
            "kw": [
              "downhole",
              "engineered skid",
              "integrated oilfield equipment",
              "oilfield equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Trailer/Truck Unit - Purchase",
            "f": "Assembly",
            "code": "20142301",
            "desc": "Trailer-mounted equipment units",
            "kw": [
              "downhole",
              "integrated oilfield equipment",
              "mobile trailer unit",
              "oilfield equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Trailer/Truck Unit - Rental",
            "f": "Assembly",
            "code": "78181502",
            "desc": "Trailer unit rental services",
            "kw": [
              "downhole",
              "integrated oilfield equipment",
              "mobile trailer unit",
              "oilfield equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Design & Engineering Services",
            "f": "Assembly",
            "code": "81101501",
            "desc": "Power integration design services",
            "kw": [
              "custom design",
              "downhole",
              "engineering design services",
              "integrated oilfield equipment",
              "oilfield equipment"
            ]
          },
          {
            "n": "Skid Unit Refurbishment",
            "f": "Refurbishment",
            "code": "73152101",
            "desc": "Skid unit refurbishment services",
            "kw": [
              "downhole",
              "equipment overhaul",
              "integrated oilfield equipment",
              "oilfield services",
              "power driven integration"
            ]
          },
          {
            "n": "Trailer Unit Refurbishment",
            "f": "Refurbishment",
            "code": "73152101",
            "desc": "Trailer unit refurbishment services",
            "kw": [
              "downhole",
              "integrated oilfield equipment",
              "mobile equipment overhaul",
              "oilfield services",
              "power driven integration"
            ]
          }
        ]
      },
      {
        "name": "Pressure Containment Equipment",
        "commodities": [
          {
            "n": "Flexible Hoses",
            "f": "High Pressure Hoses",
            "code": "40141719",
            "desc": "High pressure flexible hoses",
            "kw": [
              "HP hose",
              "downhole",
              "flexible hose",
              "high pressure equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Flexible Steel Hoses (Coflexip)",
            "f": "High Pressure Hoses",
            "code": "40142020",
            "desc": "Coflexip flexible steel hoses",
            "kw": [
              "coflexip hose",
              "downhole",
              "flexible steel hose",
              "high pressure equipment",
              "kill line hose"
            ]
          },
          {
            "n": "High Pressure Hoses - Rental",
            "f": "High Pressure Hoses",
            "code": "40142020",
            "desc": "High pressure hose rental",
            "kw": [
              "HP hose rental",
              "downhole",
              "high pressure equipment",
              "oilfield services",
              "pressure containment"
            ]
          },
          {
            "n": "Chokes & Choke Manifolds",
            "f": "Valves & Piping",
            "code": "40141604",
            "desc": "Choke manifold assemblies",
            "kw": [
              "adjustable choke",
              "choke manifold",
              "downhole",
              "high pressure equipment",
              "oilfield services"
            ]
          },
          {
            "n": "Flow Control Valves (Gate, Globe, Ball)",
            "f": "Valves & Piping",
            "code": "40141605",
            "desc": "High pressure flow control valves",
            "kw": [
              "Flow Control Valves (Gate",
              "Globe",
              "Ball)",
              "ball valve",
              "downhole"
            ]
          },
          {
            "n": "Flowback Iron (Piping, Elbows)",
            "f": "Valves & Piping",
            "code": "40141605",
            "desc": "Well testing flowback iron",
            "kw": [
              "Flowback Iron (Piping",
              "Elbows)",
              "downhole",
              "flowback iron",
              "hammer union"
            ]
          },
          {
            "n": "Treating Iron Equipment",
            "f": "Valves & Piping",
            "code": "40141719",
            "desc": "Stimulation treating iron",
            "kw": [
              "downhole",
              "frac iron",
              "high pressure equipment",
              "high pressure manifold",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Laboratory Services",
        "commodities": [
          {
            "n": "Routine Core Analysis",
            "f": "Core Analysis",
            "code": "77101601",
            "desc": "Routine core analysis services",
            "kw": [
              "RCA",
              "core porosity",
              "downhole",
              "laboratory services",
              "oilfield services"
            ]
          },
          {
            "n": "Special Core Analysis (SCAL)",
            "f": "Core Analysis",
            "code": "77101601",
            "desc": "Special core analysis services",
            "kw": [
              "SCAL",
              "capillary pressure",
              "downhole",
              "laboratory services",
              "oilfield services"
            ]
          },
          {
            "n": "Mud Analysis Services",
            "f": "Fluid Analysis",
            "code": "77101701",
            "desc": "Drilling mud analysis",
            "kw": [
              "downhole",
              "drilling fluid testing",
              "laboratory services",
              "mud analysis",
              "mud rheology"
            ]
          },
          {
            "n": "Water Analysis Services",
            "f": "Fluid Analysis",
            "code": "77101701",
            "desc": "Formation water analysis",
            "kw": [
              "downhole",
              "laboratory services",
              "oilfield services",
              "produced water analysis",
              "reservoir analysis"
            ]
          },
          {
            "n": "Oil & Gas PVT Analysis",
            "f": "Fluid Analysis",
            "code": "77101702",
            "desc": "PVT fluid analysis services",
            "kw": [
              "EOS modeling",
              "PVT analysis",
              "downhole",
              "fluid properties analysis",
              "laboratory services"
            ]
          },
          {
            "n": "Metallurgical Testing",
            "f": "Material Testing",
            "code": "77101801",
            "desc": "Metallurgical testing services",
            "kw": [
              "corrosion testing",
              "downhole",
              "hardness testing",
              "laboratory services",
              "material testing"
            ]
          },
          {
            "n": "Chemical Analysis",
            "f": "Material Testing",
            "code": "77101801",
            "desc": "Chemical composition analysis",
            "kw": [
              "chromatography",
              "downhole",
              "laboratory services",
              "oilfield services",
              "reservoir analysis"
            ]
          }
        ]
      },
      {
        "name": "Logging tools",
        "commodities": [
          {
            "n": "Open Hole Logging Tools",
            "f": "Wireline Logging",
            "code": "20122901",
            "desc": "Open hole wireline logging tools",
            "kw": [
              "downhole",
              "downhole measurement",
              "formation evaluation",
              "logging tools",
              "oilfield services"
            ]
          },
          {
            "n": "Cased Hole Logging Tools",
            "f": "Wireline Logging",
            "code": "20122901",
            "desc": "Cased hole wireline logging tools",
            "kw": [
              "cased hole logging",
              "cement bond log",
              "downhole",
              "downhole measurement",
              "logging tools"
            ]
          },
          {
            "n": "Production Logging Tools",
            "f": "Wireline Logging",
            "code": "20122902",
            "desc": "Production logging equipment",
            "kw": [
              "PLT",
              "downhole",
              "downhole measurement",
              "flow profiling",
              "logging tools"
            ]
          },
          {
            "n": "Logging While Drilling (LWD) Tools",
            "f": "LWD/MWD Tools",
            "code": "20131003",
            "desc": "LWD measurement tools",
            "kw": [
              "LWD",
              "downhole",
              "downhole measurement",
              "formation evaluation LWD",
              "logging tools"
            ]
          },
          {
            "n": "Measurement While Drilling (MWD) Tools",
            "f": "LWD/MWD Tools",
            "code": "20131003",
            "desc": "MWD directional tools",
            "kw": [
              "MWD",
              "directional MWD",
              "downhole",
              "downhole measurement",
              "logging tools"
            ]
          },
          {
            "n": "Rotary Steerable Systems",
            "f": "LWD/MWD Tools",
            "code": "20131003",
            "desc": "Rotary steerable drilling systems",
            "kw": [
              "RSS",
              "directional drilling RSS",
              "downhole",
              "downhole measurement",
              "logging tools"
            ]
          },
          {
            "n": "Resistivity Tools",
            "f": "Formation Evaluation",
            "code": "20122901",
            "desc": "Resistivity logging tools",
            "kw": [
              "downhole",
              "downhole measurement",
              "induction log",
              "laterolog",
              "logging tools"
            ]
          }
        ]
      },
      {
        "name": "DHT",
        "commodities": [
          {
            "n": "Pulling & Running Tools",
            "f": "Slickline Tools",
            "code": "20122339",
            "desc": "Slickline pulling and running tools",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "oilfield services",
              "pulling tool"
            ]
          },
          {
            "n": "Gauge Cutters & Swabs",
            "f": "Slickline Tools",
            "code": "20122358",
            "desc": "Slickline gauge cutters and swabs",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "gauge cutter",
              "oilfield services"
            ]
          },
          {
            "n": "Bailers & Dump Valves",
            "f": "Slickline Tools",
            "code": "20122307",
            "desc": "Slickline bailers and dump valves",
            "kw": [
              "DHT",
              "bailer",
              "downhole",
              "downhole tools",
              "dump valve"
            ]
          },
          {
            "n": "Wireline Setting Tools",
            "f": "Wireline Conveyed Tools",
            "code": "20122308",
            "desc": "Wireline setting tools",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "electric line setting",
              "oilfield services"
            ]
          },
          {
            "n": "Wireline Punchers & Cutters",
            "f": "Wireline Conveyed Tools",
            "code": "20122308",
            "desc": "Wireline pipe cutters",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "oilfield services",
              "well intervention"
            ]
          },
          {
            "n": "CT Bottomhole Assemblies",
            "f": "Coiled Tubing Tools",
            "code": "20122516",
            "desc": "Coiled tubing BHA tools",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "oilfield services",
              "well intervention"
            ]
          },
          {
            "n": "CT Milling Tools",
            "f": "Coiled Tubing Tools",
            "code": "20122501",
            "desc": "Coiled tubing milling tools",
            "kw": [
              "CT milling",
              "DHT",
              "coiled tubing milling tools",
              "downhole",
              "downhole tools"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Inspection & Certification",
    "subs": [
      {
        "name": "Calibration Services",
        "commodities": [
          {
            "n": "Instrument Calibration",
            "f": "Calibration Services",
            "code": "81101701",
            "desc": "Precision instrument calibration",
            "kw": [
              "calibration services",
              "certification",
              "downhole",
              "inspection services",
              "metrology"
            ]
          },
          {
            "n": "Pressure Gauge Calibration",
            "f": "Calibration Services",
            "code": "81101701",
            "desc": "Pressure gauge calibration services",
            "kw": [
              "certification",
              "downhole",
              "gauge calibration",
              "inspection services",
              "oilfield services"
            ]
          },
          {
            "n": "Temperature Calibration",
            "f": "Calibration Services",
            "code": "81101702",
            "desc": "Temperature sensor calibration",
            "kw": [
              "certification",
              "downhole",
              "inspection services",
              "oilfield services",
              "quality assurance"
            ]
          },
          {
            "n": "Flow Meter Calibration",
            "f": "Calibration Services",
            "code": "81101703",
            "desc": "Flow meter calibration services",
            "kw": [
              "certification",
              "downhole",
              "flow measurement calibration",
              "inspection services",
              "meter proving"
            ]
          }
        ]
      },
      {
        "name": "Certificates",
        "commodities": [
          {
            "n": "Equipment Certification",
            "f": "Certification Services",
            "code": "81101801",
            "desc": "Equipment certification services",
            "kw": [
              "CE marking",
              "certification",
              "downhole",
              "inspection services",
              "oilfield services"
            ]
          },
          {
            "n": "Material Certification",
            "f": "Certification Services",
            "code": "81101801",
            "desc": "Material test certificates",
            "kw": [
              "MTR",
              "certification",
              "downhole",
              "inspection services",
              "material traceability"
            ]
          },
          {
            "n": "Personnel Certification",
            "f": "Certification Services",
            "code": "81101802",
            "desc": "Personnel competency certification",
            "kw": [
              "IWCF",
              "OPITO",
              "certification",
              "competence assessment",
              "downhole"
            ]
          },
          {
            "n": "System Certification",
            "f": "Certification Services",
            "code": "81101803",
            "desc": "Management system certification",
            "kw": [
              "ISO certification",
              "QMS certification",
              "certification",
              "downhole",
              "inspection services"
            ]
          }
        ]
      },
      {
        "name": "Inspections & Quality Assurance",
        "commodities": [
          {
            "n": "Inspection Services",
            "f": "Technical Assurance",
            "code": "81101902",
            "desc": "Technical inspection services",
            "kw": [
              "TPI",
              "certification",
              "downhole",
              "oilfield services",
              "quality assurance"
            ]
          },
          {
            "n": "Testing Services",
            "f": "Technical Assurance",
            "code": "81101703",
            "desc": "Technical testing services",
            "kw": [
              "FAT",
              "certification",
              "downhole",
              "factory acceptance test",
              "inspection services"
            ]
          },
          {
            "n": "NDT Inspection Services",
            "f": "Technical Assurance",
            "code": "81101902",
            "desc": "Non-destructive testing services",
            "kw": [
              "NDT services",
              "RT",
              "TPI",
              "UT",
              "certification"
            ]
          },
          {
            "n": "Internal Audits",
            "f": "Audits",
            "code": "81102001",
            "desc": "Internal audit services",
            "kw": [
              "QMS audit",
              "certification",
              "downhole",
              "inspection services",
              "internal audit"
            ]
          },
          {
            "n": "Third Party Audits",
            "f": "Audits",
            "code": "81102001",
            "desc": "Third party audit services",
            "kw": [
              "certification",
              "downhole",
              "external audit",
              "inspection services",
              "oilfield services"
            ]
          },
          {
            "n": "Marine Classification",
            "f": "Class Services",
            "code": "78141703",
            "desc": "Marine classification services",
            "kw": [
              "ABS certification",
              "DNV",
              "Lloyds Register",
              "certification",
              "downhole"
            ]
          },
          {
            "n": "Offshore Classification",
            "f": "Class Services",
            "code": "78141703",
            "desc": "Offshore equipment classification",
            "kw": [
              "MODU class",
              "certification",
              "downhole",
              "inspection services",
              "offshore survey certificate"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Materials & Assets",
    "name": "Operation Rental",
    "subs": [
      {
        "name": "Non-Field Technical rental equipment",
        "commodities": [
          {
            "n": "IT Equipment Rental",
            "f": "Office Equipment Rental",
            "code": "80131601",
            "desc": "Computer and IT equipment rental",
            "kw": [
              "computer hire",
              "downhole",
              "equipment rental",
              "hire",
              "oilfield services"
            ]
          },
          {
            "n": "Office Furniture Rental",
            "f": "Office Equipment Rental",
            "code": "80131601",
            "desc": "Office furniture rental services",
            "kw": [
              "downhole",
              "equipment rental",
              "furniture rental",
              "hire",
              "office equipment rental"
            ]
          },
          {
            "n": "Communication Equipment Rental",
            "f": "Office Equipment Rental",
            "code": "80131602",
            "desc": "Communication equipment rental",
            "kw": [
              "comms rental",
              "downhole",
              "equipment rental",
              "hire",
              "oilfield services"
            ]
          },
          {
            "n": "Power Tools Rental",
            "f": "General Equipment Rental",
            "code": "80131701",
            "desc": "Power tool rental services",
            "kw": [
              "downhole",
              "equipment hire",
              "equipment rental",
              "hire",
              "oilfield services"
            ]
          },
          {
            "n": "HVAC Equipment Rental",
            "f": "General Equipment Rental",
            "code": "80131701",
            "desc": "HVAC equipment rental",
            "kw": [
              "HVAC rental",
              "downhole",
              "equipment rental",
              "hire",
              "oilfield services"
            ]
          },
          {
            "n": "Lighting Equipment Rental",
            "f": "General Equipment Rental",
            "code": "80131702",
            "desc": "Temporary lighting rental",
            "kw": [
              "downhole",
              "equipment rental",
              "hire",
              "light tower hire",
              "lighting rental"
            ]
          }
        ]
      },
      {
        "name": "Technical Rental equipment",
        "commodities": [
          {
            "n": "Rig Rentals",
            "f": "Drilling Equipment Rental",
            "code": "20122803",
            "desc": "Drilling rig rental services",
            "kw": [
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling",
              "drilling rig rental"
            ]
          },
          {
            "n": "Mud Systems Rental",
            "f": "Drilling Equipment Rental",
            "code": "20122801",
            "desc": "Mud system equipment rental",
            "kw": [
              "centrifuge rental",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          },
          {
            "n": "Solids Control Rental",
            "f": "Drilling Equipment Rental",
            "code": "20122801",
            "desc": "Solids control equipment rental",
            "kw": [
              "centrifuge rental",
              "downhole",
              "downhole drilling tools",
              "drill bit",
              "drilling"
            ]
          },
          {
            "n": "Coiled Tubing Units Rental",
            "f": "Well Service Equipment Rental",
            "code": "20122503",
            "desc": "Coiled tubing unit rental",
            "kw": [
              "CT unit rental",
              "CTU rental",
              "coiled tubing unit",
              "downhole",
              "equipment rental"
            ]
          },
          {
            "n": "Wireline Units Rental",
            "f": "Well Service Equipment Rental",
            "code": "20122341",
            "desc": "Wireline unit rental",
            "kw": [
              "downhole",
              "e-line unit",
              "equipment rental",
              "hire",
              "oilfield services"
            ]
          },
          {
            "n": "Nitrogen Equipment Rental",
            "f": "Well Service Equipment Rental",
            "code": "20122801",
            "desc": "Nitrogen pumping equipment rental",
            "kw": [
              "N2 services",
              "downhole",
              "equipment rental",
              "hire",
              "nitrogen pump rental"
            ]
          },
          {
            "n": "Wellhead Equipment Rental",
            "f": "Completion Equipment Rental",
            "code": "78181503",
            "desc": "Wellhead equipment rental",
            "kw": [
              "Xmas tree rental",
              "downhole",
              "equipment rental",
              "hire",
              "oilfield services"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Services",
    "name": "Maintenance & Repair Operations",
    "subs": [
      {
        "name": "Machine Shop",
        "commodities": [
          {
            "n": "Adhesives & Sealants",
            "f": "MRO or Distributor Services",
            "code": "31201601",
            "desc": "Industrial adhesives and sealants",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Fasteners & Hardware",
            "f": "MRO or Distributor Services",
            "code": "31161501",
            "desc": "Industrial fasteners and hardware",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Kevlar, Optical Fiber, Yarn, Other Fabrics",
            "f": "MRO or Distributor Services",
            "code": "11151601",
            "desc": "Kevlar optical fiber and technical fabrics",
            "kw": [
              "Kevlar",
              "Optical Fiber",
              "Yarn",
              "Other Fabrics",
              "downhole"
            ]
          },
          {
            "n": "Laboratory & Testing - Lab Instruments (Non-Chemical)",
            "f": "MRO or Distributor Services",
            "code": "41111601",
            "desc": "Laboratory instruments non-chemical",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Laboratory & Testing - Calibration & Repair Services",
            "f": "MRO or Distributor Services",
            "code": "81101706",
            "desc": "Laboratory instrument calibration and repair",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Measuring & Inspection",
            "f": "MRO or Distributor Services",
            "code": "41111601",
            "desc": "Measuring and inspection instruments",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Tools & Metal Cutting Accessories",
            "f": "MRO or Distributor Services",
            "code": "27111601",
            "desc": "Industrial tools and metal cutting accessories",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Filters",
        "commodities": [
          {
            "n": "Filtration & Rubber Accessories",
            "f": "MRO or Distributor Services",
            "code": "40161501",
            "desc": "Filtration equipment and rubber accessories",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Hydraulic",
        "commodities": [
          {
            "n": "Hydraulic or Pneumatic Pump & Related Spares",
            "f": "MRO or Distributor Services",
            "code": "40151701",
            "desc": "Hydraulic and pneumatic pump spares",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Pipes or Hoses, Valves & Fittings (Commercial Items)",
            "f": "MRO or Distributor Services",
            "code": "40141719",
            "desc": "Commercial pipes hoses valves and fittings",
            "kw": [
              "Pipes or Hoses",
              "Valves & Fittings (Commercial Items)",
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Fabrication",
        "commodities": [
          {
            "n": "Manufacturing Machinery (CNC, Lathe, Grinding, Welding)",
            "f": "MRO or Distributor Services",
            "code": "23151501",
            "desc": "Manufacturing machinery CNC lathe grinding",
            "kw": [
              "Manufacturing Machinery (CNC",
              "Lathe",
              "Grinding",
              "Welding)",
              "downhole"
            ]
          },
          {
            "n": "Manufacturing Machinery Servicing",
            "f": "MRO or Distributor Services",
            "code": "73101601",
            "desc": "Manufacturing machinery servicing",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Paints (Bulk, Bucket, etc.)",
            "f": "MRO or Distributor Services",
            "code": "31201701",
            "desc": "Industrial paints and coatings",
            "kw": [
              "Paints (Bulk",
              "Bucket",
              "etc.)",
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Paint Service",
            "f": "MRO or Distributor Services",
            "code": "73151501",
            "desc": "Industrial painting services",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Mechanical Lifting Equipment",
        "commodities": [
          {
            "n": "Material Handling & Securing",
            "f": "MRO or Distributor Services",
            "code": "24101629",
            "desc": "Material handling and securing equipment",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Radiators",
        "commodities": [
          {
            "n": "Radiator Cores & Assemblies",
            "f": "Radiators",
            "code": "40151601",
            "desc": "Radiator core and assembly components",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Radiator Repair & Maintenance",
            "f": "Radiators",
            "code": "73152101",
            "desc": "Radiator repair and maintenance services",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Radiator Spare Parts",
            "f": "Radiators",
            "code": "40151601",
            "desc": "Radiator spare parts and components",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Field Technical Equipment & Services",
        "commodities": [
          {
            "n": "Field Equipment Repair & Overhaul",
            "f": "Field Equipment MRO",
            "code": "73152101",
            "desc": "Field technical equipment repair and overhaul",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Field Equipment Spare Parts & Components",
            "f": "Field Equipment MRO",
            "code": "31162001",
            "desc": "Field technical equipment spare parts",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Field Equipment Calibration Services",
            "f": "Field Equipment MRO",
            "code": "81101707",
            "desc": "Field technical equipment calibration",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Insulation",
        "commodities": [
          {
            "n": "Thermal Insulation Materials",
            "f": "Insulation Materials",
            "code": "30111501",
            "desc": "Thermal insulation materials for equipment",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Acoustic Insulation Materials",
            "f": "Insulation Materials",
            "code": "30111501",
            "desc": "Acoustic insulation materials",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Insulation Installation Services",
            "f": "Insulation Materials",
            "code": "72151905",
            "desc": "Insulation installation services",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "DHT",
        "commodities": [
          {
            "n": "Downhole Tool Repair & Reconditioning",
            "f": "Downhole Tool MRO",
            "code": "73152101",
            "desc": "Downhole tool repair and reconditioning",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "oilfield services",
              "well intervention"
            ]
          },
          {
            "n": "Downhole Tool Spare Parts",
            "f": "Downhole Tool MRO",
            "code": "31162001",
            "desc": "Downhole tool spare parts and components",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "oilfield services",
              "well intervention"
            ]
          },
          {
            "n": "Downhole Tool Cleaning Services",
            "f": "Downhole Tool MRO",
            "code": "76111801",
            "desc": "Downhole tool cleaning and decontamination",
            "kw": [
              "DHT",
              "downhole",
              "downhole tools",
              "oilfield services",
              "well intervention"
            ]
          }
        ]
      },
      {
        "name": "Sling and Shackles",
        "commodities": [
          {
            "n": "Rigging Equipment Inspection & Recertification",
            "f": "Rigging MRO",
            "code": "81101703",
            "desc": "Rigging equipment inspection and recertification",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Sling & Shackle Replacement Parts",
            "f": "Rigging MRO",
            "code": "31151501",
            "desc": "Sling and shackle replacement components",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Mechanical Seals",
        "commodities": [
          {
            "n": "Mechanical Seal Assemblies",
            "f": "Mechanical Seals",
            "code": "40141719",
            "desc": "Mechanical seal assemblies",
            "kw": [
              "downhole",
              "oilfield equipment",
              "oilfield services",
              "rotating equipment"
            ]
          },
          {
            "n": "Mechanical Seal Spare Parts & Kits",
            "f": "Mechanical Seals",
            "code": "40141719",
            "desc": "Mechanical seal spare parts and kits",
            "kw": [
              "downhole",
              "oilfield equipment",
              "oilfield services",
              "rotating equipment"
            ]
          },
          {
            "n": "Mechanical Seal Repair Services",
            "f": "Mechanical Seals",
            "code": "73152101",
            "desc": "Mechanical seal repair services",
            "kw": [
              "downhole",
              "oilfield equipment",
              "oilfield services",
              "rotating equipment"
            ]
          }
        ]
      }
    ]
  },
  {
    "type": "Consumables",
    "name": "Fuel, Lubricants and Gases",
    "subs": [
      {
        "name": "Diesel",
        "commodities": [
          {
            "n": "Diesel - Off-Road (Red/Dyed) Bulk Transport/Inventory Fuel",
            "f": "Bulk & Onsite",
            "code": "15101505",
            "desc": "Off-road diesel bulk transport and inventory fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Diesel - Off-Road (Red/Dyed) On-Site Fueling",
            "f": "Bulk & Onsite",
            "code": "15101505",
            "desc": "Off-road diesel on-site fueling",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Diesel - On-Road (Green/Clear) Bulk Transport/Inventory Fuel",
            "f": "Bulk & Onsite",
            "code": "15101505",
            "desc": "On-road diesel bulk transport and inventory fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Diesel - On-Road (Green/Clear) On-Site Fueling",
            "f": "Bulk & Onsite",
            "code": "15101505",
            "desc": "On-road diesel on-site fueling",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Diesel Exhaust Fluid (DEF) for On-Site Fueling",
            "f": "Bulk & Onsite",
            "code": "15101505",
            "desc": "Diesel exhaust fluid DEF on-site",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Diesel - Off-Road Fuel Card/Petrol Station",
            "f": "Retail & Alternative",
            "code": "15101505",
            "desc": "Off-road diesel via fuel card or petrol station",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Diesel - On-Road Fuel Card/Petrol Station",
            "f": "Retail & Alternative",
            "code": "15101505",
            "desc": "On-road diesel via fuel card or petrol station",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Lubricants",
        "commodities": [
          {
            "n": "Engine Oil",
            "f": "Lubricants",
            "code": "15121501",
            "desc": "Engine lubricating oil",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Hydraulic Fluid",
            "f": "Lubricants",
            "code": "15121502",
            "desc": "Hydraulic system fluid",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Industrial Grease",
            "f": "Lubricants",
            "code": "15121503",
            "desc": "Industrial lubricating grease",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Antifreeze",
            "f": "Lubricants",
            "code": "15121504",
            "desc": "Engine antifreeze and coolant",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Transmission Fluid for Land Based Lubricants",
            "f": "Lubricants",
            "code": "15121508",
            "desc": "Transmission lubricating fluid for land vehicles",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      },
      {
        "name": "Gases",
        "commodities": [
          {
            "n": "Unleaded Gasoline for Bulk Transport/Inventory Fuel",
            "f": "Alternative Fuels",
            "code": "15101506",
            "desc": "Unleaded gasoline bulk transport and inventory fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Unleaded Gasoline for On-Site Fueling",
            "f": "Alternative Fuels",
            "code": "15101506",
            "desc": "Unleaded gasoline on-site fueling",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Unleaded Gasoline for Fuel Card/Petrol Station",
            "f": "Alternative Fuels",
            "code": "15101506",
            "desc": "Unleaded gasoline via fuel card",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Liquefied Natural Gas (LNG)",
            "f": "Alternative Fuels",
            "code": "15101512",
            "desc": "Liquefied natural gas fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Compressed Natural Gas (CNG)",
            "f": "Alternative Fuels",
            "code": "15101512",
            "desc": "Compressed natural gas fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Kerosene",
            "f": "Alternative Fuels",
            "code": "15101502",
            "desc": "Kerosene fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          },
          {
            "n": "Ethanol",
            "f": "Alternative Fuels",
            "code": "15101506",
            "desc": "Ethanol fuel",
            "kw": [
              "downhole",
              "oilfield services"
            ]
          }
        ]
      }
    ]
  }
];
