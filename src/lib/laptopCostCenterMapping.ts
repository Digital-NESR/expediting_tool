// Auto-generated from the "Cost Center Mapping" Excel export (cost center.xlsx) shared
// for the laptop procurement Cost Allocation section. Source of truth for the Company
// Name/Code dropdowns (filtered by requestor country) and the Cost Center auto-fill
// (looked up by company + department) on the request form. Regenerate by re-running the
// import script against a fresh export if the mapping changes.

export interface CostCenterCompany {
  code: string;
  name: string;
  countries: string[];
}

export interface CostCenterDepartment {
  department: string;
  costCenter: string;
}

export const COST_CENTER_COUNTRIES: string[] = ["Algeria","Bahrain","Chad","EOS JAFZA","Egypt","HQ Dubai","HQ Houston","India","Indonesia","Iraq","Jordon","KSA","Kuwait","Libya","Oman","Qatar","UAE","Yemen"];

export const COST_CENTER_COMPANIES: CostCenterCompany[] = [
  {
    "code": "2554",
    "name": "Action Energy (CPVEN) Kuwait",
    "countries": [
      "Kuwait"
    ]
  },
  {
    "code": "2112",
    "name": "Energy Oilfield Supplies DMCC",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "2113",
    "name": "Energy Oilfield Supplies JAFZA",
    "countries": [
      "EOS JAFZA"
    ]
  },
  {
    "code": "2555",
    "name": "Gulf Energy LLC",
    "countries": [
      "Kuwait"
    ]
  },
  {
    "code": "2440",
    "name": "Gulf Energy SAOC",
    "countries": [
      "Oman"
    ]
  },
  {
    "code": "3380",
    "name": "Gulf Energy SAOC Representative Office Algeria",
    "countries": [
      "Algeria"
    ]
  },
  {
    "code": "2869",
    "name": "Gulf Energy Services , Yemen Branch – Mukalla",
    "countries": [
      "Yemen"
    ]
  },
  {
    "code": "2868",
    "name": "Gulf Energy Services , Yemen Branch – Sanaa",
    "countries": [
      "Yemen"
    ]
  },
  {
    "code": "2441",
    "name": "Gulf Energy Services LLC",
    "countries": [
      "Oman"
    ]
  },
  {
    "code": "2334",
    "name": "Gulf Energy Services LLC KSA",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "2442",
    "name": "Integrated Petroleum Services LLC",
    "countries": [
      "Oman"
    ]
  },
  {
    "code": "2443",
    "name": "Makamen Petroleum LLC",
    "countries": [
      "Oman"
    ]
  },
  {
    "code": "2331",
    "name": "National Drilling Company KSA",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "2552",
    "name": "National Gulf Petroleum Services",
    "countries": [
      "Kuwait"
    ]
  },
  {
    "code": "4190",
    "name": "National Oil Well Maintenance Company India",
    "countries": [
      "India"
    ]
  },
  {
    "code": "3277",
    "name": "National Petroleum Services JSC Libya",
    "countries": [
      "Libya"
    ]
  },
  {
    "code": "2330",
    "name": "National Petroleum Technology Company Limited KSA",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "1101",
    "name": "NESR BVI",
    "countries": [
      "HQ Houston"
    ]
  },
  {
    "code": "2111",
    "name": "NESR DMCC",
    "countries": [
      "HQ Dubai"
    ]
  },
  {
    "code": "2765",
    "name": "NESR DMCC- Iraq South",
    "countries": [
      "Iraq"
    ]
  },
  {
    "code": "2118",
    "name": "NESR Energy Services  HQ",
    "countries": [
      "HQ Dubai"
    ]
  },
  {
    "code": "2115",
    "name": "NESR Energy Services LLC",
    "countries": [
      "UAE"
    ]
  },
  {
    "code": "2661",
    "name": "NESR Oil and Gas Services - Qatar",
    "countries": [
      "Qatar"
    ]
  },
  {
    "code": "1102",
    "name": "NESR TEXAS",
    "countries": [
      "HQ Houston"
    ]
  },
  {
    "code": "2222",
    "name": "NESR WLL",
    "countries": [
      "HQ Dubai"
    ]
  },
  {
    "code": "1104",
    "name": "NESR-UK",
    "countries": [
      "HQ Houston"
    ]
  },
  {
    "code": "1103",
    "name": "NESR-USA",
    "countries": [
      "HQ Houston"
    ]
  },
  {
    "code": "2117",
    "name": "NNG Reinsurance Limited",
    "countries": [
      "HQ Dubai"
    ]
  },
  {
    "code": "2660",
    "name": "NOWMCO",
    "countries": [
      "Qatar"
    ]
  },
  {
    "code": "2764",
    "name": "NPS Bahrain for Oil & Gas Well Services WLL- North Iraq",
    "countries": [
      "Iraq"
    ]
  },
  {
    "code": "3275",
    "name": "NPS Bahrain for Oil & Gas Wells Services Libya bra",
    "countries": [
      "Libya"
    ]
  },
  {
    "code": "2220",
    "name": "NPS Bahrain for Oil and Gas Well Services WLL",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "4192",
    "name": "NPS Bahrain for Oil and Gas Well Services WLL",
    "countries": [
      "India"
    ]
  },
  {
    "code": "3381",
    "name": "NPS Bahrain for Oil and Gas Well Services WLL- Alg",
    "countries": [
      "Algeria"
    ]
  },
  {
    "code": "2332",
    "name": "NPS Bahrain for Oil and Gas Well Services WLL-BH Operation",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "2550",
    "name": "NPS Bahrain For Oil and Gas Wells Services WLL - K",
    "countries": [
      "Kuwait"
    ]
  },
  {
    "code": "3587",
    "name": "NPS Bahrain-Congo",
    "countries": [
      "Bahrain"
    ]
  },
  {
    "code": "2221",
    "name": "NPS Energy Holding WLL",
    "countries": [
      "HQ Dubai"
    ]
  },
  {
    "code": "3485",
    "name": "NPS Energy Holding WLL, SUCCURSAL",
    "countries": [
      "Chad"
    ]
  },
  {
    "code": "4191",
    "name": "NPS Energy India Private Limited",
    "countries": [
      "India"
    ]
  },
  {
    "code": "2110",
    "name": "NPS Holdings Limited DIFC",
    "countries": [
      "HQ Dubai"
    ]
  },
  {
    "code": "2925",
    "name": "NPS Jordan",
    "countries": [
      "Jordon"
    ]
  },
  {
    "code": "4293",
    "name": "PT DFI ASIA ENERGI",
    "countries": [
      "Indonesia"
    ]
  },
  {
    "code": "4294",
    "name": "PT NPS Energy Indonesia",
    "countries": [
      "Indonesia"
    ]
  },
  {
    "code": "4295",
    "name": "PT Tiger Energy Services ROI",
    "countries": [
      "Indonesia"
    ]
  },
  {
    "code": "3174",
    "name": "Sahara for Maint & Oper. Service LLC",
    "countries": [
      "Egypt"
    ]
  },
  {
    "code": "2553",
    "name": "Sahara Petroleum Service - Kuwait Project",
    "countries": [
      "Kuwait"
    ]
  },
  {
    "code": "3276",
    "name": "Sahara Petroleum Service - Libya Branch",
    "countries": [
      "Libya"
    ]
  },
  {
    "code": "3170",
    "name": "Sahara Petroleum Service - SAPESCO",
    "countries": [
      "Egypt"
    ]
  },
  {
    "code": "2116",
    "name": "SAPESCO",
    "countries": [
      "UAE"
    ]
  },
  {
    "code": "2333",
    "name": "SAPESCO Arabia for Petroleum Service",
    "countries": [
      "KSA"
    ]
  },
  {
    "code": "3382",
    "name": "SARL NESR ALGERIA",
    "countries": [
      "Algeria"
    ]
  },
  {
    "code": "2444",
    "name": "Sino Gulf Energy Enterprises LLC",
    "countries": [
      "Oman"
    ]
  },
  {
    "code": "2551",
    "name": "Sino Gulf Energy Enterprises LLC - Kuwait",
    "countries": [
      "Kuwait"
    ]
  },
  {
    "code": "2446",
    "name": "Sledgehammer Gulf LLC",
    "countries": [
      "Oman"
    ]
  },
  {
    "code": "2114",
    "name": "Taqaat Prof Services DMCC",
    "countries": [
      "HQ Dubai"
    ]
  }
];

export const COMPANY_DEPARTMENTS: Record<string, CostCenterDepartment[]> = {
  "1101": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C018800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C019960004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C011180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C018800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C011100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C011110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C013410101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C013440101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C019960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C019999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C017700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C018800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C013450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C018800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C011130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C019960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C019960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C018800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C019960007"
    },
    {
      "department": "IT",
      "costCenter": "C018800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C019960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C019960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C019960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C017700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C018800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C019960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C017700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C013460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C017700001"
    },
    {
      "department": "MANAGED PRESSURE DRI",
      "costCenter": "C013470101"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C018800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C013480101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C018800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C019960003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C011140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C019960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C017700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C013490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C012320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C019960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C018800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C012300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C017700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C013500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C017700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C013420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C019960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C017700007"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C012310101"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C019960013"
    }
  ],
  "1102": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C028800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C029960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C028800005"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C029960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C029999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C028800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C028800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C029960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C029960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C028800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C029960007"
    },
    {
      "department": "IT",
      "costCenter": "C028800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C029960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C029960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C029960011"
    },
    {
      "department": "LEGAL",
      "costCenter": "C028800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C029960009"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C028800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C028800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C029960003"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C029960006"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C029960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C028800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C027700005"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C029960005"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C024600101"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C029960013"
    }
  ],
  "1103": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C038800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C039960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C038800005"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C039960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C039999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C038800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C038800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C039960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C039960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C038800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C039960007"
    },
    {
      "department": "IT",
      "costCenter": "C038800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C039960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C039960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C039960011"
    },
    {
      "department": "LEGAL",
      "costCenter": "C038800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C039960009"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C038800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C038800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C039960003"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C039960006"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C039960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C038800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C037700005"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C039960005"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C039960013"
    }
  ],
  "1104": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C048800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C049960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C048800005"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C049960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C049999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C048800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C048800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C049960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C049960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C048800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C049960007"
    },
    {
      "department": "IT",
      "costCenter": "C048800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C049960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C049960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C049960011"
    },
    {
      "department": "LEGAL",
      "costCenter": "C048800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C049960009"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C048800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C048800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C049960003"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C049960006"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C049960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C048800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C047700005"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C049960005"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C049960013"
    }
  ],
  "2110": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C108800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C109960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C108800005"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C109960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C109999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C108800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C108800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C109960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C109960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C108800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C109960007"
    },
    {
      "department": "IT",
      "costCenter": "C108800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C109960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C109960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C109960011"
    },
    {
      "department": "LEGAL",
      "costCenter": "C108800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C109960009"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C108800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C108800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C109960003"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C109960006"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C109960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C108800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C107700005"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C109960005"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C109960013"
    }
  ],
  "2111": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C118800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C119960004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C111180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C118800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C111100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C111110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C113410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C113430101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C113440101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C119960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C119999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C117700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C118800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C113450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C118800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C111130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C119960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C119960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C118800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C119960007"
    },
    {
      "department": "IT",
      "costCenter": "C118800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C119960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C119960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C119960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C117700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C118800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C119960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C117700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C113460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C117700001"
    },
    {
      "department": "MANAGED PRESSURE DRI",
      "costCenter": "C113470101"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C118800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C113480101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C118800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C119960003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C111140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C119960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C117700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C113490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C112320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C119960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C118800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C112300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C117700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C113500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C117700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C113420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C119960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C117700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C114600101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C112310101"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C119960013"
    }
  ],
  "2112": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C128800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C129960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C128800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C121100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C121110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C123410101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C129960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C129999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C128800002"
    },
    {
      "department": "HUB - FACILITY",
      "costCenter": "C128890003"
    },
    {
      "department": "HUB - FINANCE",
      "costCenter": "C128890002"
    },
    {
      "department": "HUB - HR",
      "costCenter": "C128890007"
    },
    {
      "department": "HUB - INTERNS",
      "costCenter": "C128890008"
    },
    {
      "department": "HUB - IT",
      "costCenter": "C128890006"
    },
    {
      "department": "HUB - MANAGEMENT",
      "costCenter": "C128890009"
    },
    {
      "department": "HUB - MARKETING",
      "costCenter": "C128890005"
    },
    {
      "department": "HUB - SUPPLY CHAIN",
      "costCenter": "C128890001"
    },
    {
      "department": "HUB- LOGISTICS",
      "costCenter": "C128890017"
    },
    {
      "department": "HUB-ADMIN,GOVT&SECUR",
      "costCenter": "C128890004"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C128800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C121130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C129960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C129960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C128800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C129960007"
    },
    {
      "department": "IT",
      "costCenter": "C128800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C129960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C129960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C129960011"
    },
    {
      "department": "LEGAL",
      "costCenter": "C128800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C129960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C127700008"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C128800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C128800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C129960003"
    },
    {
      "department": "OVERHEAD ADMIN GOVT",
      "costCenter": "C128809904"
    },
    {
      "department": "OVERHEAD CEMENTING",
      "costCenter": "C121109901"
    },
    {
      "department": "OVERHEAD CTU",
      "costCenter": "C121119901"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C123419901"
    },
    {
      "department": "OVERHEAD ESG COST",
      "costCenter": "C124609901"
    },
    {
      "department": "OVERHEAD FINANCE",
      "costCenter": "C128809902"
    },
    {
      "department": "OVERHEAD FRAC",
      "costCenter": "C121139901"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C128809907"
    },
    {
      "department": "OVERHEAD INTERNS",
      "costCenter": "C128809908"
    },
    {
      "department": "OVERHEAD IT",
      "costCenter": "C128809906"
    },
    {
      "department": "OVERHEAD LEGAL",
      "costCenter": "C128809910"
    },
    {
      "department": "OVERHEAD LOGGING",
      "costCenter": "C122319901"
    },
    {
      "department": "OVERHEAD LOGISTICS",
      "costCenter": "C127709908"
    },
    {
      "department": "OVERHEAD MANAGEMENT",
      "costCenter": "C128809909"
    },
    {
      "department": "OVERHEAD MARKETING",
      "costCenter": "C128809905"
    },
    {
      "department": "OVERHEAD OFFICE FACI",
      "costCenter": "C128809903"
    },
    {
      "department": "OVERHEAD RIGS",
      "costCenter": "C123499901"
    },
    {
      "department": "OVERHEAD SUPPL CHAIN",
      "costCenter": "C128809901"
    },
    {
      "department": "OVERHEAD TECH. MANAG",
      "costCenter": "C127709905"
    },
    {
      "department": "OVERHEAD TRS",
      "costCenter": "C123429901"
    },
    {
      "department": "PROD & SPECIAL CHEM",
      "costCenter": "C121160101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C129960006"
    },
    {
      "department": "RIGS",
      "costCenter": "C123490101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C129960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C128800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C127700005"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C123420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C129960005"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C129960013"
    }
  ],
  "2113": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C138800004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C131180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C138800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C131100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C131110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C133410101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C133440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C139999999"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C131120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C138800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C133450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C138800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C131130101"
    },
    {
      "department": "INTERNS",
      "costCenter": "C138800008"
    },
    {
      "department": "IT",
      "costCenter": "C138800006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C138800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C137700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C133460101"
    },
    {
      "department": "MANAGED PRESSURE DRI",
      "costCenter": "C133470101"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C138800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C133480101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C138800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C131140101"
    },
    {
      "department": "RIGS",
      "costCenter": "C133490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C132320101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C138800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C132300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C137700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C133500101"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C133420101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C132310101"
    }
  ],
  "2114": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C148800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C148800005"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C149999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C148800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C148800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C148800008"
    },
    {
      "department": "IT",
      "costCenter": "C148800006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C148800010"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C148800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C148800003"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C148800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C147700005"
    }
  ],
  "2115": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C158800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C159960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C158800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C151100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C151100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C151110101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C159960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C159999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C157700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C158800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C158800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C151130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C151130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C159960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C159960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C158800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C159960007"
    },
    {
      "department": "IT",
      "costCenter": "C158800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C159960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C159960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C159960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C157700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C158800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C159960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C157700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C157700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C158800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C152300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C151150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C158800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C159960003"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C153419901"
    },
    {
      "department": "OVERHEAD FINANCE",
      "costCenter": "C158809902"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C158809907"
    },
    {
      "department": "OVERHEAD LEGAL",
      "costCenter": "C158809910"
    },
    {
      "department": "OVERHEAD MARKETING",
      "costCenter": "C158809905"
    },
    {
      "department": "OVERHEAD SUPPL CHAIN",
      "costCenter": "C158809901"
    },
    {
      "department": "OVERHEAD WTS",
      "costCenter": "C152309901"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C151140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C159960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C157700002"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C159960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C151170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C158800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C152300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C157700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C157700003"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C159960001"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C157700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C154600101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C152310101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C152310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C159960013"
    }
  ],
  "2116": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C168800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C168800005"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C161110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C161110201"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C163410501"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C163430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C169999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C167700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C168800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C168800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C168800008"
    },
    {
      "department": "IT",
      "costCenter": "C168800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C167700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C168800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C167700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C167700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C168800009"
    },
    {
      "department": "MUD LOGGING",
      "costCenter": "C163410601"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C161150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C161140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C168800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C161140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C167700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C162320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C161170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C168800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C162300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C167700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C167700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C163420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C169960001"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C167700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C164600101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C162310201"
    }
  ],
  "2117": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C178800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C178800005"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C179999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C178800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C178800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C178800008"
    },
    {
      "department": "IT",
      "costCenter": "C178800006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C178800010"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C178800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C178800003"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C178800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C177700005"
    }
  ],
  "2118": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C188800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C188800005"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C181110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C181110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C181110301"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C189999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C187700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C188800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C188800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C188800008"
    },
    {
      "department": "IT",
      "costCenter": "C188800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C187700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C188800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C187700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C187700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C188800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C188800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C187700002"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C188800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C187700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C187700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C187700007"
    }
  ],
  "2220": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C208800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C209960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C208800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C201100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C201110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C203410101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C209960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C209999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C204610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C207700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C201120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C208800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C203450101"
    },
    {
      "department": "HUB - FACILITY",
      "costCenter": "C208890003"
    },
    {
      "department": "HUB - FINANCE",
      "costCenter": "C208890002"
    },
    {
      "department": "HUB - HR",
      "costCenter": "C208890007"
    },
    {
      "department": "HUB - INTERNS",
      "costCenter": "C208890008"
    },
    {
      "department": "HUB - IT",
      "costCenter": "C208890006"
    },
    {
      "department": "HUB - MANAGEMENT",
      "costCenter": "C208890009"
    },
    {
      "department": "HUB - MARKETING",
      "costCenter": "C208890005"
    },
    {
      "department": "HUB - SUPPLY CHAIN",
      "costCenter": "C208890001"
    },
    {
      "department": "HUB-ADMIN,GOVT&SECUR",
      "costCenter": "C208890004"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C208800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C201130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C201130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C209960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C209960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C208800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C209960007"
    },
    {
      "department": "IT",
      "costCenter": "C208800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C209960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C209960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C209960011"
    },
    {
      "department": "LEGAL",
      "costCenter": "C208800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C209960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C207700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C207700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C208800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C201150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C201140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C208800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C209960003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C203510201"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C203419901"
    },
    {
      "department": "OVERHEAD MANAGEMENT",
      "costCenter": "C208809909"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C209960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C207700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C203490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C202320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C209960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C201170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C208800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C202300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C207700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C203500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C207700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C203420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C209960005"
    },
    {
      "department": "WELL TESTING UNCONVE",
      "costCenter": "C202300301"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C202310101"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C209960013"
    }
  ],
  "2221": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C218800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C219960004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C211180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C218800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C211100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C211100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C211110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C211110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C211110301"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C211140601"
    },
    {
      "department": "COMPLETIONS",
      "costCenter": "C211190101"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C213410501"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C213410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C213430101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C213440101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C219960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C219999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C214610101"
    },
    {
      "department": "ENGINEERING & CONSUL",
      "costCenter": "C211200101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C217700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C211120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C218800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C213450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C214620101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C211140401"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C214630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C218800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C211130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C211130101"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C211140501"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C219960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C219960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C218800008"
    },
    {
      "department": "IPM - GENERAL",
      "costCenter": "C211210101"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C219960007"
    },
    {
      "department": "IT",
      "costCenter": "C218800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C219960014"
    },
    {
      "department": "KBOS",
      "costCenter": "C213410701"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C219960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C219960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C217700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C218800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C219960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C217700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C213460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C217700001"
    },
    {
      "department": "MANAGED PRESSURE DRI",
      "costCenter": "C213470101"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C218800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C213480101"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C212300201"
    },
    {
      "department": "NESR R&D – DD",
      "costCenter": "C213410102"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C211150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C211140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C218800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C219960003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C213510201"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C211140101"
    },
    {
      "department": "PROD & SPECIAL CHEM",
      "costCenter": "C211160101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C219960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C217700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C213490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C212320101"
    },
    {
      "department": "SLICKLINE UNCN-OUTOS",
      "costCenter": "C212320301"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C219960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C211170101"
    },
    {
      "department": "STIMULATION UNCONVEN",
      "costCenter": "C211170301"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C218800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C212300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C217700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C213500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C217700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C213420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C219960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C217700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C214600101"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C212300401"
    },
    {
      "department": "WELL TESTING UNCONVE",
      "costCenter": "C212300301"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C212310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C212310501"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C212310401"
    },
    {
      "department": "WL LOG UNCONVENTION",
      "costCenter": "C212310301"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C212310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C219960013"
    }
  ],
  "2222": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C228800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C228800005"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C229999999"
    },
    {
      "department": "FINANCE",
      "costCenter": "C228800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C228800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C228800008"
    },
    {
      "department": "IT",
      "costCenter": "C228800006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C228800010"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C228800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C228800003"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C228800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C227700005"
    }
  ],
  "2330": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C308800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C309960004"
    },
    {
      "department": "BITS",
      "costCenter": "C303400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C308800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C301100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C301110101"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C301110301"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C303410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C303430101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C303440101"
    },
    {
      "department": "DRILLING UNCONVENT.",
      "costCenter": "C303500301"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C309960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C309999901"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C304610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C307700004"
    },
    {
      "department": "FACILITY - SPARK",
      "costCenter": "C307700011"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C301120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C308800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C303450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C304620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C304630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C308800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C301130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C301130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C309960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C309960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C308800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C309960007"
    },
    {
      "department": "IT",
      "costCenter": "C308800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C309960014"
    },
    {
      "department": "KBOS",
      "costCenter": "C303410701"
    },
    {
      "department": "KSA - HUB TRAINING",
      "costCenter": "C308891001"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C309960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C309960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C307700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C308800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C309960009"
    },
    {
      "department": "LOGG. WHILE DRILLING",
      "costCenter": "C303410301"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C307700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C303460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C307700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C308800009"
    },
    {
      "department": "MEASUREMENT WHILE DR",
      "costCenter": "C303410201"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C302300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C301150101"
    },
    {
      "department": "NORI – BUILDING",
      "costCenter": "C307700009"
    },
    {
      "department": "NORI – LAB",
      "costCenter": "C307700010"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C308800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C309960003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C303510201"
    },
    {
      "department": "OVERHEAD ADMIN GOVT",
      "costCenter": "C308809904"
    },
    {
      "department": "OVERHEAD BITS",
      "costCenter": "C303409901"
    },
    {
      "department": "OVERHEAD CEMENTING",
      "costCenter": "C301109901"
    },
    {
      "department": "OVERHEAD CTU",
      "costCenter": "C301119901"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C303419901"
    },
    {
      "department": "OVERHEAD DS",
      "costCenter": "C303439901"
    },
    {
      "department": "OVERHEAD ESG COST",
      "costCenter": "C304609901"
    },
    {
      "department": "OVERHEAD FACILITY",
      "costCenter": "C307709904"
    },
    {
      "department": "OVERHEAD FILTRATION",
      "costCenter": "C301129901"
    },
    {
      "department": "OVERHEAD FINANCE",
      "costCenter": "C308809902"
    },
    {
      "department": "OVERHEAD FISHING",
      "costCenter": "C303459901"
    },
    {
      "department": "OVERHEAD FLUIDS",
      "costCenter": "C303449901"
    },
    {
      "department": "OVERHEAD FRAC",
      "costCenter": "C301139901"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C308809907"
    },
    {
      "department": "OVERHEAD INTERNS",
      "costCenter": "C308809908"
    },
    {
      "department": "OVERHEAD IT",
      "costCenter": "C308809906"
    },
    {
      "department": "OVERHEAD LAB CTU&CMT",
      "costCenter": "C307709906"
    },
    {
      "department": "OVERHEAD LEGAL",
      "costCenter": "C308809910"
    },
    {
      "department": "OVERHEAD LOGGING",
      "costCenter": "C302319901"
    },
    {
      "department": "OVERHEAD LOGISTICS",
      "costCenter": "C307709908"
    },
    {
      "department": "OVERHEAD MACHINSHOP",
      "costCenter": "C303469901"
    },
    {
      "department": "OVERHEAD MAINT&WORKS",
      "costCenter": "C307709901"
    },
    {
      "department": "OVERHEAD MANAGEMENT",
      "costCenter": "C308809909"
    },
    {
      "department": "OVERHEAD MARKETING",
      "costCenter": "C308809905"
    },
    {
      "department": "OVERHEAD OFFICE FACI",
      "costCenter": "C308809903"
    },
    {
      "department": "OVERHEAD PIS",
      "costCenter": "C301149901"
    },
    {
      "department": "OVERHEAD QHSE",
      "costCenter": "C307709902"
    },
    {
      "department": "OVERHEAD SLICK LINE",
      "costCenter": "C302329901"
    },
    {
      "department": "OVERHEAD STIM",
      "costCenter": "C301179901"
    },
    {
      "department": "OVERHEAD SUPPL CHAIN",
      "costCenter": "C308809901"
    },
    {
      "department": "OVERHEAD TECH. MANAG",
      "costCenter": "C307709905"
    },
    {
      "department": "OVERHEAD THT",
      "costCenter": "C303509901"
    },
    {
      "department": "OVERHEAD TRANSPORT",
      "costCenter": "C307709903"
    },
    {
      "department": "OVERHEAD TRS",
      "costCenter": "C303429901"
    },
    {
      "department": "OVERHEAD WAREHOUSE",
      "costCenter": "C307709907"
    },
    {
      "department": "OVERHEAD WTS",
      "costCenter": "C302309901"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C301140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C309960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C307700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C303490101"
    },
    {
      "department": "ROTARY STEERABLE SYS",
      "costCenter": "C303410801"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C302320101"
    },
    {
      "department": "SLICKLINE UNCN-OUTOS",
      "costCenter": "C302320301"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C309960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C301170101"
    },
    {
      "department": "STIMULATION UNCONVEN",
      "costCenter": "C301170301"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C308800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C302300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C307700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C303500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C307700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C303420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C309960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C307700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C304600101"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C302300401"
    },
    {
      "department": "WELL TESTING UNCONVE",
      "costCenter": "C302300301"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C302310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C302310501"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C302310401"
    },
    {
      "department": "WL LOG UNCONVENTION",
      "costCenter": "C302310301"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C302310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C309960013"
    }
  ],
  "2331": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C318800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C319960004"
    },
    {
      "department": "BITS",
      "costCenter": "C313400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C318800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C311100101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C313410101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C319960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C319999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C314610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C317700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C318800002"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C314620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C314630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C318800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C311130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C311130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C319960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C319960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C318800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C319960007"
    },
    {
      "department": "IT",
      "costCenter": "C318800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C319960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C319960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C319960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C317700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C318800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C319960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C317700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C317700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C318800009"
    },
    {
      "department": "MEASUREMENT WHILE DR",
      "costCenter": "C313410201"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C318800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C319960003"
    },
    {
      "department": "OVERHEAD FINANCE",
      "costCenter": "C318809902"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C319960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C317700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C313490101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C319960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C311170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C318800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C312300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C317700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C317700003"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C319960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C317700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C314600101"
    },
    {
      "department": "WELL TESTING UNCONVE",
      "costCenter": "C312300301"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C312310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C319960013"
    }
  ],
  "2332": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C328800004"
    },
    {
      "department": "BITS",
      "costCenter": "C323400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C328800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C321100101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C323410101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C329999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C324610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C327700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C328800002"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C324620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C324630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C328800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C321130101"
    },
    {
      "department": "INTERNS",
      "costCenter": "C328800008"
    },
    {
      "department": "IT",
      "costCenter": "C328800006"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C329960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C327700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C328800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C327700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C327700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C328800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C328800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C327700002"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C321170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C328800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C327700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C327700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C327700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C324600101"
    }
  ],
  "2333": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C338800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C338800005"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C331110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C331110201"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C333410501"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C333430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C339999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C334610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C337700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C338800002"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C334620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C334630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C338800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C338800008"
    },
    {
      "department": "IT",
      "costCenter": "C338800006"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C339960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C337700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C338800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C337700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C337700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C338800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C331150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C331140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C338800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C331140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C337700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C332320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C331170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C338800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C332300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C337700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C337700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C333420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C337700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C334600101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C332310201"
    }
  ],
  "2334": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C348800004"
    },
    {
      "department": "BITS",
      "costCenter": "C343400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C348800005"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C343410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C343430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C349999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C344610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C347700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C348800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C343450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C344620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C344630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C348800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C341130101"
    },
    {
      "department": "INTERNS",
      "costCenter": "C348800008"
    },
    {
      "department": "IT",
      "costCenter": "C348800006"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C349960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C347700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C348800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C347700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C347700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C348800009"
    },
    {
      "department": "MEASUREMENT WHILE DR",
      "costCenter": "C343410201"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C348800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C347700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C343490101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C348800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C347700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C343500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C347700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C343420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C347700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C344600101"
    }
  ],
  "2440": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C408800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C409960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C408800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C401100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C401110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C403410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C403430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C409960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C409999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C407700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C408800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C403450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C408800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C409960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C409960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C408800008"
    },
    {
      "department": "IPM - COILED TUBING",
      "costCenter": "C401210111"
    },
    {
      "department": "IPM - COMPLETIONS",
      "costCenter": "C401210119"
    },
    {
      "department": "IPM - FISHING",
      "costCenter": "C401210145"
    },
    {
      "department": "IPM - GENERAL",
      "costCenter": "C401210101"
    },
    {
      "department": "IPM - THROUGH TUBING",
      "costCenter": "C401210150"
    },
    {
      "department": "IPM - WELL HEADS",
      "costCenter": "C401210151"
    },
    {
      "department": "IPM - WELL TESTING",
      "costCenter": "C401210130"
    },
    {
      "department": "IPM-ARTIFI LIFT SERV",
      "costCenter": "C401210118"
    },
    {
      "department": "IPM-BITS",
      "costCenter": "C401210140"
    },
    {
      "department": "IPM-CEMENTING",
      "costCenter": "C401210110"
    },
    {
      "department": "IPM-DIRECTI. DRILL.",
      "costCenter": "C401210141"
    },
    {
      "department": "IPM-DOWN HOLE TOOLS",
      "costCenter": "C401210143"
    },
    {
      "department": "IPM-DRILLING FLUIDS",
      "costCenter": "C401210144"
    },
    {
      "department": "IPM-HYDRAUL FRACTUR.",
      "costCenter": "C401210113"
    },
    {
      "department": "IPM-MACHINE SHOP",
      "costCenter": "C401210146"
    },
    {
      "department": "IPM-MANUFACTURING",
      "costCenter": "C401210148"
    },
    {
      "department": "IPM-RIGS",
      "costCenter": "C401210149"
    },
    {
      "department": "IPM-STIMULATION&PUMP",
      "costCenter": "C401210117"
    },
    {
      "department": "IPM-TUBULAR RUN SERV",
      "costCenter": "C401210142"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C409960007"
    },
    {
      "department": "IT",
      "costCenter": "C408800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C409960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C409960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C409960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C407700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C408800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C409960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C407700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C403460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C407700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C408800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C403480101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C408800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C409960001"
    },
    {
      "department": "OVERHEAD FLUIDS",
      "costCenter": "C403449901"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C408809907"
    },
    {
      "department": "OVERHEAD MANAGEMENT",
      "costCenter": "C408809909"
    },
    {
      "department": "OVERHEAD QHSE",
      "costCenter": "C407709902"
    },
    {
      "department": "OVERHEAD SLICK LINE",
      "costCenter": "C402329901"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C409960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C407700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C402320101"
    },
    {
      "department": "SLICKLINE UNCN-OUTOS",
      "costCenter": "C402320301"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C409960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C408800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C402300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C407700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C403500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C407700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C403420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C409960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C407700007"
    },
    {
      "department": "WELL HEAD MAINTENANC",
      "costCenter": "C402320201"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C402310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C409960013"
    }
  ],
  "2441": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C418800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C419960004"
    },
    {
      "department": "BITS",
      "costCenter": "C413400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C418800005"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C413410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C413430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C419960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C419999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C417700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C418800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C413450101"
    },
    {
      "department": "GYRO SERVICES",
      "costCenter": "C413410401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C418800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C419960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C419960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C418800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C419960007"
    },
    {
      "department": "IT",
      "costCenter": "C418800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C419960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C419960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C419960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C417700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C418800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C419960009"
    },
    {
      "department": "LOGG. WHILE DRILLING",
      "costCenter": "C413410301"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C417700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C413460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C417700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C418800009"
    },
    {
      "department": "MEASUREMENT WHILE DR",
      "costCenter": "C413410201"
    },
    {
      "department": "MUD LOGGING",
      "costCenter": "C413410601"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C418800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C419960001"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C413419901"
    },
    {
      "department": "OVERHEAD FISHING",
      "costCenter": "C413459901"
    },
    {
      "department": "OVERHEAD THT",
      "costCenter": "C413509901"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C419960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C417700002"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C419960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C418800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C417700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C413500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C417700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C413420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C419960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C417700007"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C419960013"
    }
  ],
  "2442": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C428800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C429960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C428800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C421100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C421110101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C429960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C429999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C424610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C427700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C428800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C428800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C421130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C421130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C429960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C429960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C428800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C429960007"
    },
    {
      "department": "IT",
      "costCenter": "C428800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C429960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C429960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C429960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C427700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C428800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C429960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C427700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C427700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C428800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C428800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C429960001"
    },
    {
      "department": "OVERHEAD CTU",
      "costCenter": "C421119901"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C421140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C429960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C427700002"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C429960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C421170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C428800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C422300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C427700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C427700003"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C429960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C427700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C424600101"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C422300401"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C429960013"
    }
  ],
  "2443": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C438800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C439960004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C431180101"
    },
    {
      "department": "BOP",
      "costCenter": "C433510101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C438800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C431100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C431100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C431110101"
    },
    {
      "department": "COMPLETIONS",
      "costCenter": "C431190101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C433410101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C433440101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C439960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C439999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C437700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C438800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C438800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C439960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C439960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C438800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C439960007"
    },
    {
      "department": "IT",
      "costCenter": "C438800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C439960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C439960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C439960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C437700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C438800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C439960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C437700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C437700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C438800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C433480101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C438800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C439960001"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C433510201"
    },
    {
      "department": "OVERHEAD CEMENTING",
      "costCenter": "C431109901"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C439960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C437700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C433490101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C439960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C438800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C437700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C437700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C433420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C439960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C437700007"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C439960013"
    }
  ],
  "2444": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C448800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C449960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C448800005"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C443430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C449960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C449999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C447700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C448800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C448800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C449960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C449960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C448800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C449960007"
    },
    {
      "department": "IT",
      "costCenter": "C448800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C449960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C449960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C449960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C447700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C448800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C449960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C447700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C443460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C447700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C448800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C448800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C449960001"
    },
    {
      "department": "OVERHEAD DS",
      "costCenter": "C443439901"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C449960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C447700002"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C449960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C448800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C447700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C447700003"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C449960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C447700007"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C449960013"
    }
  ],
  "2446": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C468800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C468800005"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C463430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C469999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C467700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C468800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C468800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C468800008"
    },
    {
      "department": "IT",
      "costCenter": "C468800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C467700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C468800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C467700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C463460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C467700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C468800009"
    },
    {
      "department": "MANUFACTURING",
      "costCenter": "C463480101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C468800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C469960001"
    },
    {
      "department": "QHSE",
      "costCenter": "C467700002"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C468800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C467700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C467700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C467700007"
    }
  ],
  "2550": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C508800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C508800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C501100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C501100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C501110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C503410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C503430101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C503440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C509999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C504610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C507700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C508800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C503450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C504620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C504630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C508800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C508800008"
    },
    {
      "department": "IT",
      "costCenter": "C508800006"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C509960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C507700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C508800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C507700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C503460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C507700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C508800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C508800003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C503510201"
    },
    {
      "department": "QHSE",
      "costCenter": "C507700002"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C508800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C502300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C507700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C503500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C507700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C503420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C507700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C504600101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C502310201"
    }
  ],
  "2551": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C518800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C519960004"
    },
    {
      "department": "BITS",
      "costCenter": "C513400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C518800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C511100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C511110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C513410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C513430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C519960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C519999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C517700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C518800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C513450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C518800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C519960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C519960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C518800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C519960007"
    },
    {
      "department": "IT",
      "costCenter": "C518800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C519960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C519960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C519960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C517700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C518800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C519960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C517700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C513460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C517700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C518800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C518800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C519960003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C513510201"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C513419901"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C519960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C517700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C513490101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C519960012"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C518800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C512300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C517700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C513500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C517700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C513420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C519960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C517700007"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C512310101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C512310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C519960013"
    }
  ],
  "2552": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C528800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C528800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C521100101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C523410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C523430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C529999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C527700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C528800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C523450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C528800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C528800008"
    },
    {
      "department": "IT",
      "costCenter": "C528800006"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C529960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C527700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C528800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C527700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C523460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C527700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C528800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C528800003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C523510201"
    },
    {
      "department": "QHSE",
      "costCenter": "C527700002"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C528800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C522300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C527700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C523500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C527700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C523420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C527700007"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C522310201"
    }
  ],
  "2553": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C538800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C538800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C531100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C531110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C531110201"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C533410501"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C533410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C533430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C539999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C537700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C538800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C533450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C538800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C538800008"
    },
    {
      "department": "IT",
      "costCenter": "C538800006"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C539960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C537700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C538800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C537700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C533460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C537700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C538800009"
    },
    {
      "department": "MUD LOGGING",
      "costCenter": "C533410601"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C531150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C531140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C538800003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C533510201"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C531140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C537700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C532320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C531170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C538800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C532300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C537700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C533500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C537700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C533420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C537700007"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C532310201"
    }
  ],
  "2554": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C548800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C548800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C541100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C541100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C541110101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C543440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C549999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C547700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C548800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C548800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C541130101"
    },
    {
      "department": "INTERNS",
      "costCenter": "C548800008"
    },
    {
      "department": "IT",
      "costCenter": "C548800006"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C549960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C547700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C548800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C547700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C547700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C548800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C541150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C548800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C547700002"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C541170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C548800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C547700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C547700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C547700007"
    }
  ],
  "2555": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C558800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C558800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C551100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C551100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C551110101"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C553410501"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C553410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C553430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C559999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C554610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C557700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C558800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C553450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C554620101"
    },
    {
      "department": "GYRO SERVICES",
      "costCenter": "C553410401"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C554630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C558800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C558800008"
    },
    {
      "department": "IT",
      "costCenter": "C558800006"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C559960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C557700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C558800010"
    },
    {
      "department": "LOGG. WHILE DRILLING",
      "costCenter": "C553410301"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C557700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C553460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C557700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C558800009"
    },
    {
      "department": "MEASUREMENT WHILE DR",
      "costCenter": "C553410201"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C558800003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C553510201"
    },
    {
      "department": "QHSE",
      "costCenter": "C557700002"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C558800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C552300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C557700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C553500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C557700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C553420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C557700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C554600101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C552310201"
    }
  ],
  "2660": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C608800004"
    },
    {
      "department": "BITS",
      "costCenter": "C603400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C608800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C601100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C601100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C601110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C601110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C601110301"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C601140601"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C609999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C604610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C607700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C608800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C603450101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C601140401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C608800007"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C601140501"
    },
    {
      "department": "INTERNS",
      "costCenter": "C608800008"
    },
    {
      "department": "IT",
      "costCenter": "C608800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C607700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C608800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C607700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C607700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C608800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C602300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C601150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C601140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C608800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C601140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C609960001"
    },
    {
      "department": "QHSE",
      "costCenter": "C607700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C603490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C602320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C601170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C608800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C602300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C607700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C603500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C607700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C603420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C607700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C604600101"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C602300401"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C602310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C602310501"
    }
  ],
  "2661": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C618800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C619960004"
    },
    {
      "department": "BITS",
      "costCenter": "C613400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C618800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C611100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C611100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C611110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C611110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C611110301"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C611140601"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C613410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C613430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C619960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C619999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C614610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C617700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C618800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C613450101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C611140401"
    },
    {
      "department": "HUB - FACILITY",
      "costCenter": "C618890003"
    },
    {
      "department": "HUB - FINANCE",
      "costCenter": "C618890002"
    },
    {
      "department": "HUB - HR",
      "costCenter": "C618890007"
    },
    {
      "department": "HUB - INTERNS",
      "costCenter": "C618890008"
    },
    {
      "department": "HUB - IT",
      "costCenter": "C618890006"
    },
    {
      "department": "HUB - MANAGEMENT",
      "costCenter": "C618890009"
    },
    {
      "department": "HUB - MARKETING",
      "costCenter": "C618890005"
    },
    {
      "department": "HUB - SUPPLY CHAIN",
      "costCenter": "C618890001"
    },
    {
      "department": "HUB-ADMIN,GOVT&SECUR",
      "costCenter": "C618890004"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C618800007"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C611140501"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C619960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C619960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C618800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C619960007"
    },
    {
      "department": "IT",
      "costCenter": "C618800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C619960014"
    },
    {
      "department": "KBOS",
      "costCenter": "C613410701"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C619960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C619960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C617700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C618800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C619960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C617700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C617700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C618800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C612300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C611150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C611140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C618800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C619960003"
    },
    {
      "department": "OVERHEAD ADMIN GOVT",
      "costCenter": "C618809904"
    },
    {
      "department": "OVERHEAD BITS",
      "costCenter": "C613409901"
    },
    {
      "department": "OVERHEAD CEMENTING",
      "costCenter": "C611109901"
    },
    {
      "department": "OVERHEAD CTU",
      "costCenter": "C611119901"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C613419901"
    },
    {
      "department": "OVERHEAD DS",
      "costCenter": "C613439901"
    },
    {
      "department": "OVERHEAD ESG COST",
      "costCenter": "C614609901"
    },
    {
      "department": "OVERHEAD FACILITY",
      "costCenter": "C617709904"
    },
    {
      "department": "OVERHEAD FINANCE",
      "costCenter": "C618809902"
    },
    {
      "department": "OVERHEAD FISHING",
      "costCenter": "C613459901"
    },
    {
      "department": "OVERHEAD FRAC",
      "costCenter": "C611139901"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C618809907"
    },
    {
      "department": "OVERHEAD INTERNS",
      "costCenter": "C618809908"
    },
    {
      "department": "OVERHEAD IT",
      "costCenter": "C618809906"
    },
    {
      "department": "OVERHEAD LAB CTU&CMT",
      "costCenter": "C617709906"
    },
    {
      "department": "OVERHEAD LEGAL",
      "costCenter": "C618809910"
    },
    {
      "department": "OVERHEAD LOGGING",
      "costCenter": "C612319901"
    },
    {
      "department": "OVERHEAD LOGISTICS",
      "costCenter": "C617709908"
    },
    {
      "department": "OVERHEAD MAINT&WORKS",
      "costCenter": "C617709901"
    },
    {
      "department": "OVERHEAD MANAGEMENT",
      "costCenter": "C618809909"
    },
    {
      "department": "OVERHEAD MARKETING",
      "costCenter": "C618809905"
    },
    {
      "department": "OVERHEAD OFFICE FACI",
      "costCenter": "C618809903"
    },
    {
      "department": "OVERHEAD PIS",
      "costCenter": "C611149901"
    },
    {
      "department": "OVERHEAD QHSE",
      "costCenter": "C617709902"
    },
    {
      "department": "OVERHEAD SLICK LINE",
      "costCenter": "C612329901"
    },
    {
      "department": "OVERHEAD STIM",
      "costCenter": "C611179901"
    },
    {
      "department": "OVERHEAD SUPPL CHAIN",
      "costCenter": "C618809901"
    },
    {
      "department": "OVERHEAD TECH. MANAG",
      "costCenter": "C617709905"
    },
    {
      "department": "OVERHEAD THT",
      "costCenter": "C613509901"
    },
    {
      "department": "OVERHEAD TRANSPORT",
      "costCenter": "C617709903"
    },
    {
      "department": "OVERHEAD TRS",
      "costCenter": "C613429901"
    },
    {
      "department": "OVERHEAD WAREHOUSE",
      "costCenter": "C617709907"
    },
    {
      "department": "OVERHEAD WTS",
      "costCenter": "C612309901"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C611140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C619960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C617700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C612320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C619960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C611170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C618800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C612300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C617700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C613500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C617700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C613420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C619960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C617700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C614600101"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C612300401"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C612310101"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C619960013"
    }
  ],
  "2764": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C648800004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C641180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C648800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C641100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C641110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C641110201"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C643410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C643430101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C643440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C649999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C647700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C641120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C648800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C643450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C644620101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C641140401"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C644630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C648800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C641130301"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C641140501"
    },
    {
      "department": "INTERNS",
      "costCenter": "C648800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C649960001"
    },
    {
      "department": "IT",
      "costCenter": "C648800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C647700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C648800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C647700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C647700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C648800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C642300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C641150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C641140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C648800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C641140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C647700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C643490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C642320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C641170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C648800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C642300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C647700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C643500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C647700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C647700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C644600101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C642310101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C642310201"
    }
  ],
  "2765": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C658800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C658800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C651100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C651110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C651110201"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C653410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C653430101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C653440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C659999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C657700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C651120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C658800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C653450101"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C654620101"
    },
    {
      "department": "HEAT AND GEOTHERMAL",
      "costCenter": "C654630101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C658800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C658800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C659960001"
    },
    {
      "department": "IT",
      "costCenter": "C658800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C657700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C658800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C657700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C657700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C658800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C652300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C651150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C651140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C658800003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C653510201"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C651140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C657700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C653490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C652320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C651170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C658800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C652300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C657700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C653500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C657700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C653420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C657700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C654600101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C652310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C652310501"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C652310201"
    }
  ],
  "2868": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C688800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C688800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C681100101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C683410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C683430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C689999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C687700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C688800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C683450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C688800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C688800008"
    },
    {
      "department": "IT",
      "costCenter": "C688800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C687700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C688800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C687700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C687700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C688800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C688800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C687700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C683490101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C688800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C687700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C687700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C683420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C687700007"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C689960001"
    }
  ],
  "2869": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C698800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C698800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C691100101"
    },
    {
      "department": "COMPLETIONS",
      "costCenter": "C691190101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C693430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C699999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C697700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C698800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C693450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C698800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C698800008"
    },
    {
      "department": "IT",
      "costCenter": "C698800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C697700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C698800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C697700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C697700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C698800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C698800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C697700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C693490101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C698800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C697700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C697700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C693420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C697700007"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C699960001"
    }
  ],
  "2925": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C258800004"
    },
    {
      "department": "BITS",
      "costCenter": "C253400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C258800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C251100101"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C253440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C259999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C257700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C258800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C258800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C258800008"
    },
    {
      "department": "IT",
      "costCenter": "C258800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C259960001"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C257700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C258800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C257700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C257700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C258800009"
    },
    {
      "department": "MUD LOGGING",
      "costCenter": "C253410601"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C258800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C257700002"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C258800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C257700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C257700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C257700007"
    }
  ],
  "3170": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C708800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C709960004"
    },
    {
      "department": "BITS",
      "costCenter": "C703400101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C708800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C701100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C701100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C701110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C701110201"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C701140601"
    },
    {
      "department": "COMMODITY CHEMICALS",
      "costCenter": "C701160201"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C703410501"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C703410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C703430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C709960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C709999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C707700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C708800002"
    },
    {
      "department": "FLARE CAPTURE",
      "costCenter": "C704620101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C701140401"
    },
    {
      "department": "HUB - COIL SERVICE",
      "costCenter": "C708890012"
    },
    {
      "department": "HUB - DRILLING",
      "costCenter": "C708890014"
    },
    {
      "department": "HUB - FINANCE",
      "costCenter": "C708890002"
    },
    {
      "department": "HUB - HR",
      "costCenter": "C708890007"
    },
    {
      "department": "HUB - IT",
      "costCenter": "C708890006"
    },
    {
      "department": "HUB - LEGAL",
      "costCenter": "C708890010"
    },
    {
      "department": "HUB - MANAGEMENT",
      "costCenter": "C708890009"
    },
    {
      "department": "HUB - MARKETING",
      "costCenter": "C708890005"
    },
    {
      "department": "HUB - SUPPLY CHAIN",
      "costCenter": "C708890001"
    },
    {
      "department": "HUB- SAP SYSTEM",
      "costCenter": "C708890011"
    },
    {
      "department": "HUB-SURFACE TESTING",
      "costCenter": "C708890013"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C708800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C701130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C701130101"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C701140501"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C709960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C709960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C708800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C709960007"
    },
    {
      "department": "IT",
      "costCenter": "C708800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C709960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C709960001"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C709960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C707700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C708800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C709960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C707700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C707700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C708800009"
    },
    {
      "department": "MUD LOGGING",
      "costCenter": "C703410601"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C701150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C701140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C708800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C709960003"
    },
    {
      "department": "OVERHEAD ADMIN GOVT",
      "costCenter": "C708809904"
    },
    {
      "department": "OVERHEAD BITS",
      "costCenter": "C703409901"
    },
    {
      "department": "OVERHEAD CEMENTING",
      "costCenter": "C701109901"
    },
    {
      "department": "OVERHEAD CTU",
      "costCenter": "C701119901"
    },
    {
      "department": "OVERHEAD DRILLING",
      "costCenter": "C703419901"
    },
    {
      "department": "OVERHEAD DS",
      "costCenter": "C703439901"
    },
    {
      "department": "OVERHEAD ESG COST",
      "costCenter": "C704609901"
    },
    {
      "department": "OVERHEAD FACILITY",
      "costCenter": "C707709904"
    },
    {
      "department": "OVERHEAD FINANCE",
      "costCenter": "C708809902"
    },
    {
      "department": "OVERHEAD FRAC",
      "costCenter": "C701139901"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C708809907"
    },
    {
      "department": "OVERHEAD INTERNS",
      "costCenter": "C708809908"
    },
    {
      "department": "OVERHEAD IT",
      "costCenter": "C708809906"
    },
    {
      "department": "OVERHEAD LAB CTU&CMT",
      "costCenter": "C707709906"
    },
    {
      "department": "OVERHEAD LEGAL",
      "costCenter": "C708809910"
    },
    {
      "department": "OVERHEAD LOGGING",
      "costCenter": "C702319901"
    },
    {
      "department": "OVERHEAD LOGISTICS",
      "costCenter": "C707709908"
    },
    {
      "department": "OVERHEAD MAINT&WORKS",
      "costCenter": "C707709901"
    },
    {
      "department": "OVERHEAD MANAGEMENT",
      "costCenter": "C708809909"
    },
    {
      "department": "OVERHEAD MARKETING",
      "costCenter": "C708809905"
    },
    {
      "department": "OVERHEAD OFFICE FACI",
      "costCenter": "C708809903"
    },
    {
      "department": "OVERHEAD PIS",
      "costCenter": "C701149901"
    },
    {
      "department": "OVERHEAD QHSE",
      "costCenter": "C707709902"
    },
    {
      "department": "OVERHEAD SLICK LINE",
      "costCenter": "C702329901"
    },
    {
      "department": "OVERHEAD STIM",
      "costCenter": "C701179901"
    },
    {
      "department": "OVERHEAD SUPPL CHAIN",
      "costCenter": "C708809901"
    },
    {
      "department": "OVERHEAD TECH. MANAG",
      "costCenter": "C707709905"
    },
    {
      "department": "OVERHEAD TRANSPORT",
      "costCenter": "C707709903"
    },
    {
      "department": "OVERHEAD TRS",
      "costCenter": "C703429901"
    },
    {
      "department": "OVERHEAD WAREHOUSE",
      "costCenter": "C707709907"
    },
    {
      "department": "OVERHEAD WTS",
      "costCenter": "C702309901"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C701140101"
    },
    {
      "department": "PROD & SPECIAL CHEM",
      "costCenter": "C701160101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C709960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C707700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C702320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C709960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C701170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C708800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C702300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C707700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C707700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C703420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C709960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C707700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C704600101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C702310101"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C702310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C702310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C709960013"
    }
  ],
  "3174": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C748800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C748800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C741100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C741110101"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C741140601"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C749960001"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C749999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C747700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C748800002"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C741140401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C748800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C741130101"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C741140501"
    },
    {
      "department": "INTERNS",
      "costCenter": "C748800008"
    },
    {
      "department": "IT",
      "costCenter": "C748800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C747700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C748800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C747700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C747700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C748800009"
    },
    {
      "department": "MUD LOGGING",
      "costCenter": "C743410601"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C741150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C741140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C748800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C741140101"
    },
    {
      "department": "PROD & SPECIAL CHEM",
      "costCenter": "C741160101"
    },
    {
      "department": "QHSE",
      "costCenter": "C747700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C742320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C741170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C748800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C742300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C747700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C747700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C743420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C747700007"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C742310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C742310201"
    }
  ],
  "3275": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C758800004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C751180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C758800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C751100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C751100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C751110101"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C753410101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C753430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C759999999"
    },
    {
      "department": "ENGINEERING & CONSUL",
      "costCenter": "C751200101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C757700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C758800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C753450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C758800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C751130101"
    },
    {
      "department": "INTERNS",
      "costCenter": "C758800008"
    },
    {
      "department": "IT",
      "costCenter": "C758800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C757700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C758800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C759960001"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C757700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C757700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C758800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C751150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C758800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C751140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C757700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C753490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C752320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C751170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C758800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C752300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C757700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C753500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C757700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C757700007"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C752300401"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C752310101"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C752310201"
    }
  ],
  "3276": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C768800004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C761180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C768800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C761100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C761110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C761110201"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C761140601"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C763410501"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C763430101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C769999999"
    },
    {
      "department": "ENGINEERING & CONSUL",
      "costCenter": "C761200101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C767700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C768800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C763450101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C761140401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C768800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C761130101"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C761140501"
    },
    {
      "department": "INTERNS",
      "costCenter": "C768800008"
    },
    {
      "department": "IT",
      "costCenter": "C768800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C767700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C768800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C769960001"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C767700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C767700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C768800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C761150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C761140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C768800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C761140101"
    },
    {
      "department": "PROD & SPECIAL CHEM",
      "costCenter": "C761160101"
    },
    {
      "department": "QHSE",
      "costCenter": "C767700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C762320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C761170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C768800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C762300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C767700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C763500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C767700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C763420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C767700007"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C762310201"
    }
  ],
  "3277": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C778800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C778800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C771100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C771100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C771110101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C779999999"
    },
    {
      "department": "ENGINEERING & CONSUL",
      "costCenter": "C771200101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C777700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C778800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C778800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C778800008"
    },
    {
      "department": "IT",
      "costCenter": "C778800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C777700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C778800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C779960001"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C777700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C777700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C778800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C771150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C778800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C777700002"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C771170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C778800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C777700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C777700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C777700007"
    }
  ],
  "3380": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C808800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C809960001"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C808800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C801100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C801100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C801110101"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C803430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C809960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C809999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C807700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C801120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C808800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C803450101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C801140401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C808800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C801130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C801130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C809960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C809960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C808800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C809960007"
    },
    {
      "department": "IT",
      "costCenter": "C808800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C809960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C809960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C809960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C807700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C808800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C809960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C807700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C803460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C807700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C808800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C802300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C801150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C808800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C809960003"
    },
    {
      "department": "OVERHEAD FISHING",
      "costCenter": "C803459901"
    },
    {
      "department": "OVERHEAD TRS",
      "costCenter": "C803429901"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C809960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C807700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C803490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C802320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C809960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C801170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C808800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C802300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C807700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C803500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C807700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C803420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C809960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C807700007"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C802310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C809960013"
    }
  ],
  "3381": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C818800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C819960001"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C818800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C811100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C811100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C811110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C811110201"
    },
    {
      "department": "DOWN HOLE TOOLS",
      "costCenter": "C813430101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C819960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C819999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C817700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C811120101"
    },
    {
      "department": "FINANCE",
      "costCenter": "C818800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C813450101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C811140401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C818800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C811130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C811130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C819960008"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C819960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C818800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C819960007"
    },
    {
      "department": "IT",
      "costCenter": "C818800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C819960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C819960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C819960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C817700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C818800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C819960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C817700008"
    },
    {
      "department": "MACHINE SHOP",
      "costCenter": "C813460101"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C817700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C818800009"
    },
    {
      "department": "MP FLOW METER",
      "costCenter": "C812300201"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C811150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C818800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C819960003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C813510201"
    },
    {
      "department": "OVERHEAD CEMENTING",
      "costCenter": "C811109901"
    },
    {
      "department": "OVERHEAD CTU",
      "costCenter": "C811119901"
    },
    {
      "department": "OVERHEAD LOGGING",
      "costCenter": "C812319901"
    },
    {
      "department": "OVERHEAD PIS",
      "costCenter": "C811149901"
    },
    {
      "department": "OVERHEAD SLICK LINE",
      "costCenter": "C812329901"
    },
    {
      "department": "OVERHEAD WTS",
      "costCenter": "C812309901"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C811140101"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C819960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C817700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C812320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C819960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C811170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C818800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C812300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C817700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C813500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C817700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C813420101"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C819960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C817700007"
    },
    {
      "department": "WELL TEST-LSTK SITES",
      "costCenter": "C812300401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C812310201"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C819960013"
    }
  ],
  "3382": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C828800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C829960001"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C821180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C828800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C821100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C821110101"
    },
    {
      "department": "COMMIS LEAK TEST-CLT",
      "costCenter": "C821140601"
    },
    {
      "department": "COMPLETIONS",
      "costCenter": "C821190101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C829999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C827700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C828800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C823450101"
    },
    {
      "department": "GROSS LEAK TEST -GLT",
      "costCenter": "C821140401"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C828800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C821130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C821130101"
    },
    {
      "department": "HYDRO TESTING",
      "costCenter": "C821140501"
    },
    {
      "department": "INTERNS",
      "costCenter": "C828800008"
    },
    {
      "department": "IT",
      "costCenter": "C828800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C827700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C828800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C827700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C827700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C828800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C821150101"
    },
    {
      "department": "NITROGEN PURGE",
      "costCenter": "C821140701"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C828800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C821140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C827700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C822320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C821170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C828800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C822300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C827700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C827700003"
    },
    {
      "department": "TUBULAR RUNNING SERV",
      "costCenter": "C823420101"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C827700007"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C822310201"
    }
  ],
  "3485": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C858800004"
    },
    {
      "department": "ARTIFICIAL LIFT SERV",
      "costCenter": "C851180101"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C858800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C851100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C851110101"
    },
    {
      "department": "COMPLETIONS",
      "costCenter": "C851190101"
    },
    {
      "department": "CORING SERVICES",
      "costCenter": "C853410501"
    },
    {
      "department": "DRILLING FLUIDS",
      "costCenter": "C853440101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C859999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C857700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C858800002"
    },
    {
      "department": "FISHING SERVICES",
      "costCenter": "C853450101"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C858800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C858800008"
    },
    {
      "department": "IT",
      "costCenter": "C858800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C857700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C858800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C857700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C857700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C858800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C851150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C858800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C857700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C853490101"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C852320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C859960001"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C851170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C858800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C857700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C857700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C857700007"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C852310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C852310501"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C852310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C852310201"
    }
  ],
  "3587": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C878800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C878800005"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C879999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C877700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C878800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C878800007"
    },
    {
      "department": "INTERNS",
      "costCenter": "C878800008"
    },
    {
      "department": "IT",
      "costCenter": "C878800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C877700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C878800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C877700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C877700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C878800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C878800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C877700002"
    },
    {
      "department": "RIGS",
      "costCenter": "C873490101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C879960001"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C878800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C877700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C877700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C877700007"
    }
  ],
  "4190": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C908800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C908800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C901100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C901110101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C909999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C907700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C908800002"
    },
    {
      "department": "HUB - SUPPLY CHAIN",
      "costCenter": "C908890001"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C908800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C909960001"
    },
    {
      "department": "INTERNS",
      "costCenter": "C908800008"
    },
    {
      "department": "IT",
      "costCenter": "C908800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C907700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C908800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C907700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C907700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C908800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C901150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C908800003"
    },
    {
      "department": "PIPELINES",
      "costCenter": "C901140101"
    },
    {
      "department": "QHSE",
      "costCenter": "C907700002"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C901170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C908800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C907700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C907700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C907700007"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C902310401"
    }
  ],
  "4191": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C918800004"
    },
    {
      "department": "ALGERIA HQ OVERHEAD",
      "costCenter": "C919960004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C918800005"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C911100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C911110101"
    },
    {
      "department": "EGYPT HQ OVERHEAD",
      "costCenter": "C919960002"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C919999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C917700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C918800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C918800007"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C919960001"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C919960010"
    },
    {
      "department": "INTERNS",
      "costCenter": "C918800008"
    },
    {
      "department": "IRAQ HQ OVERHEAD",
      "costCenter": "C919960007"
    },
    {
      "department": "IT",
      "costCenter": "C918800006"
    },
    {
      "department": "JORDAN HQ OVERHEAD",
      "costCenter": "C919960014"
    },
    {
      "department": "KSA HQ OVERHEAD",
      "costCenter": "C919960015"
    },
    {
      "department": "KUWAIT HQ OVERHEAD",
      "costCenter": "C919960011"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C917700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C918800010"
    },
    {
      "department": "LIBYA HQ OVERHEAD",
      "costCenter": "C919960009"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C917700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C917700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C918800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C911150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C918800003"
    },
    {
      "department": "OMAN HQ OVERHEAD",
      "costCenter": "C919960003"
    },
    {
      "department": "OVERHEAD HUMAN RESOU",
      "costCenter": "C918809907"
    },
    {
      "department": "OVERHEAD IT",
      "costCenter": "C918809906"
    },
    {
      "department": "QATAR HQ OVERHEAD",
      "costCenter": "C919960006"
    },
    {
      "department": "QHSE",
      "costCenter": "C917700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C912320101"
    },
    {
      "department": "SSA HQ OVERHEAD",
      "costCenter": "C919960012"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C911170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C918800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C912300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C917700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C917700003"
    },
    {
      "department": "UAE HQ OVERHEAD",
      "costCenter": "C919960005"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C917700007"
    },
    {
      "department": "YEMEN HQ OVERHEAD",
      "costCenter": "C919960013"
    }
  ],
  "4192": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C928800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C928800005"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C921110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C921110201"
    },
    {
      "department": "COMPLETIONS",
      "costCenter": "C921190101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C929999999"
    },
    {
      "department": "FACILITY",
      "costCenter": "C927700004"
    },
    {
      "department": "FINANCE",
      "costCenter": "C928800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C928800007"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C921130101"
    },
    {
      "department": "INDIA HQ OVERHEAD",
      "costCenter": "C929960001"
    },
    {
      "department": "IPM - COILED TUBING",
      "costCenter": "C921210111"
    },
    {
      "department": "IPM - COMPLETIONS",
      "costCenter": "C921210119"
    },
    {
      "department": "IPM - FISHING",
      "costCenter": "C921210145"
    },
    {
      "department": "IPM - GENERAL",
      "costCenter": "C921210101"
    },
    {
      "department": "IPM - THROUGH TUBING",
      "costCenter": "C921210150"
    },
    {
      "department": "IPM - WELL HEADS",
      "costCenter": "C921210151"
    },
    {
      "department": "IPM - WELL TESTING",
      "costCenter": "C921210130"
    },
    {
      "department": "IPM-DOWN HOLE TOOLS",
      "costCenter": "C921210143"
    },
    {
      "department": "IPM-DRILLING FLUIDS",
      "costCenter": "C921210144"
    },
    {
      "department": "IPM-HYDRAUL FRACTUR.",
      "costCenter": "C921210113"
    },
    {
      "department": "IPM-SLICKLINE",
      "costCenter": "C921210132"
    },
    {
      "department": "IPM-STIMULATION&PUMP",
      "costCenter": "C921210117"
    },
    {
      "department": "IPM-WIRELINE LOGGING",
      "costCenter": "C921210131"
    },
    {
      "department": "IT",
      "costCenter": "C928800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C927700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C928800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C927700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C927700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C928800009"
    },
    {
      "department": "NITROGEN",
      "costCenter": "C921150101"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C928800003"
    },
    {
      "department": "OTHER WELL HEADS",
      "costCenter": "C923510201"
    },
    {
      "department": "PROD & SPECIAL CHEM",
      "costCenter": "C921160101"
    },
    {
      "department": "QHSE",
      "costCenter": "C927700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C922320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C921170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C928800001"
    },
    {
      "department": "SURFACE TESTING",
      "costCenter": "C922300101"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C927700005"
    },
    {
      "department": "THROUGH TUBING",
      "costCenter": "C923500101"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C927700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C927700007"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C922310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C922310201"
    }
  ],
  "4293": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C938800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C938800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C931100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C931100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C931110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C931110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C931110301"
    },
    {
      "department": "COUNTRY LEVEL ADJ.",
      "costCenter": "C939000001"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C939999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C934610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C937700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C931120101"
    },
    {
      "department": "FILTRATION UNCONV",
      "costCenter": "C931120301"
    },
    {
      "department": "FINANCE",
      "costCenter": "C938800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C938800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C931130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C931130101"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C939960001"
    },
    {
      "department": "INTERNS",
      "costCenter": "C938800008"
    },
    {
      "department": "IT",
      "costCenter": "C938800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C937700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C938800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C937700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C937700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C938800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C938800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C937700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C932320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C931170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C938800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C937700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C937700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C937700007"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C932310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C932310501"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C932310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C932310201"
    }
  ],
  "4294": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C948800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C948800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C941100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C941100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C941110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C941110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C941110301"
    },
    {
      "department": "COUNTRY LEVEL ADJ.",
      "costCenter": "C949000001"
    },
    {
      "department": "DIRECTIONAL DRILLING",
      "costCenter": "C943410101"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C949999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C944610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C947700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C941120101"
    },
    {
      "department": "FILTRATION UNCONV",
      "costCenter": "C941120301"
    },
    {
      "department": "FINANCE",
      "costCenter": "C948800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C948800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C941130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C941130101"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C949960001"
    },
    {
      "department": "INTERNS",
      "costCenter": "C948800008"
    },
    {
      "department": "IT",
      "costCenter": "C948800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C947700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C948800010"
    },
    {
      "department": "LOGG. WHILE DRILLING",
      "costCenter": "C943410301"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C947700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C947700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C948800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C948800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C947700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C942320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C941170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C948800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C947700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C947700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C947700007"
    },
    {
      "department": "WATER & PROD ASSURAN",
      "costCenter": "C944600101"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C942310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C942310501"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C942310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C942310201"
    }
  ],
  "4295": [
    {
      "department": "ADMIN GOVT & SECURIT",
      "costCenter": "C958800004"
    },
    {
      "department": "BUSINESS DEVELOPMENT",
      "costCenter": "C958800005"
    },
    {
      "department": "CEMENT DHT",
      "costCenter": "C951100201"
    },
    {
      "department": "CEMENTING",
      "costCenter": "C951100101"
    },
    {
      "department": "COILED TUBING",
      "costCenter": "C951110101"
    },
    {
      "department": "COILED TUBING DHT",
      "costCenter": "C951110201"
    },
    {
      "department": "COILED TUBING UNCONV",
      "costCenter": "C951110301"
    },
    {
      "department": "COUNTRY LEVEL ADJ.",
      "costCenter": "C959000001"
    },
    {
      "department": "ELIMINATIONS",
      "costCenter": "C959999999"
    },
    {
      "department": "EMISSIONS CONTROL",
      "costCenter": "C954610101"
    },
    {
      "department": "FACILITY",
      "costCenter": "C957700004"
    },
    {
      "department": "FILTRATION",
      "costCenter": "C951120101"
    },
    {
      "department": "FILTRATION UNCONV",
      "costCenter": "C951120301"
    },
    {
      "department": "FINANCE",
      "costCenter": "C958800002"
    },
    {
      "department": "HUMAN RESOURCES",
      "costCenter": "C958800007"
    },
    {
      "department": "HYDRAULIC FRAC UNCON",
      "costCenter": "C951130301"
    },
    {
      "department": "HYDRAULIC FRACTURING",
      "costCenter": "C951130101"
    },
    {
      "department": "INDONESIA HQ OVERH.",
      "costCenter": "C959960001"
    },
    {
      "department": "INTERNS",
      "costCenter": "C958800008"
    },
    {
      "department": "IT",
      "costCenter": "C958800006"
    },
    {
      "department": "LAB CTU & CMT",
      "costCenter": "C957700006"
    },
    {
      "department": "LEGAL",
      "costCenter": "C958800010"
    },
    {
      "department": "LOGISTICS",
      "costCenter": "C957700008"
    },
    {
      "department": "MAINTENAN & WORKSHOP",
      "costCenter": "C957700001"
    },
    {
      "department": "MANAGEMENT",
      "costCenter": "C958800009"
    },
    {
      "department": "OFFICE FACILITY",
      "costCenter": "C958800003"
    },
    {
      "department": "QHSE",
      "costCenter": "C957700002"
    },
    {
      "department": "SLICKLINE",
      "costCenter": "C952320101"
    },
    {
      "department": "STIMULATION",
      "costCenter": "C951170101"
    },
    {
      "department": "SUPPLY CHAIN",
      "costCenter": "C958800001"
    },
    {
      "department": "TECHNICAL MANAGEMENT",
      "costCenter": "C957700005"
    },
    {
      "department": "TRANSPORTATION",
      "costCenter": "C957700003"
    },
    {
      "department": "WAREHOUSE",
      "costCenter": "C957700007"
    },
    {
      "department": "WL LOG - OPEN HOLE",
      "costCenter": "C952310101"
    },
    {
      "department": "WL LOG - RS",
      "costCenter": "C952310501"
    },
    {
      "department": "WL LOG - TCP",
      "costCenter": "C952310401"
    },
    {
      "department": "WL LOG-CASED HOLE",
      "costCenter": "C952310201"
    }
  ]
};

// COUNTRY_OPTIONS value -> matching Excel country label(s). Entries with no mapping here
// (e.g. 'Other') simply yield an empty company list.
export const COUNTRY_TO_COST_CENTER_COUNTRIES: Record<string, string[]> = {
  "Saudi Arabia": [
    "KSA"
  ],
  "United Arab Emirates (UAE)": [
    "UAE",
    "EOS JAFZA"
  ],
  "HQ Dubai": [
    "HQ Dubai"
  ],
  "Qatar": [
    "Qatar"
  ],
  "Kuwait": [
    "Kuwait"
  ],
  "Oman": [
    "Oman"
  ],
  "Bahrain": [
    "Bahrain"
  ],
  "Egypt": [
    "Egypt"
  ],
  "Algeria": [
    "Algeria"
  ],
  "Iraq": [
    "Iraq"
  ],
  "Libya": [
    "Libya"
  ],
  "Yemen": [
    "Yemen"
  ],
  "Chad": [
    "Chad"
  ],
  "India": [
    "India"
  ],
  "Indonesia": [
    "Indonesia"
  ]
};

/** Companies available to a given requestor country (COUNTRY_OPTIONS value). */
export function getCompaniesForRequestorCountry(requestorCountry: string | null | undefined): CostCenterCompany[] {
  const excelCountries = (requestorCountry && COUNTRY_TO_COST_CENTER_COUNTRIES[requestorCountry]) || [];
  if (!excelCountries.length) return [];
  return COST_CENTER_COMPANIES.filter(c => c.countries.some(ctry => excelCountries.includes(ctry)));
}

export function getCompanyByCode(code: string | null | undefined): CostCenterCompany | null {
  if (!code) return null;
  return COST_CENTER_COMPANIES.find(c => c.code === code) ?? null;
}

/** Departments available for a company, sorted alphabetically. */
export function getDepartmentsForCompany(code: string | null | undefined): CostCenterDepartment[] {
  if (!code) return [];
  return COMPANY_DEPARTMENTS[code] ?? [];
}

/** Cost center for a given company + department combination, or null if not found. */
export function getCostCenterFor(code: string | null | undefined, department: string | null | undefined): string | null {
  if (!code || !department) return null;
  const dept = COMPANY_DEPARTMENTS[code]?.find(d => d.department.toLowerCase() === department.trim().toLowerCase());
  return dept?.costCenter ?? null;
}
