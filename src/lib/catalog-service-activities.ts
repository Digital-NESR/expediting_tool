// NESR SAP service activities — imported from "List Of Service Activities.xlsx".
// Reference master data: every service activity in the system (activity number, short text, base UOM).

export interface ServiceActivity { no: string; text: string; uom: string }

export const SERVICE_ACTIVITIES: ServiceActivity[] = [
  {
    "no": "310000000000",
    "text": "Air Freight",
    "uom": "AU"
  },
  {
    "no": "310000000001",
    "text": "Sea Freight",
    "uom": "AU"
  },
  {
    "no": "310000000002",
    "text": "Courier Expense",
    "uom": "AU"
  },
  {
    "no": "310000000003",
    "text": "Land Freight",
    "uom": "AU"
  },
  {
    "no": "310000000004",
    "text": "Marine Insurance",
    "uom": "AU"
  },
  {
    "no": "310000000005",
    "text": "Customs Clearance /",
    "uom": "AU"
  },
  {
    "no": "310000000006",
    "text": "Customs Duty / Local custom administrati",
    "uom": "AU"
  },
  {
    "no": "310000000007",
    "text": "Other Freight Charges ( Documentation /",
    "uom": "AU"
  },
  {
    "no": "310000000008",
    "text": "Local Transportation",
    "uom": "AU"
  },
  {
    "no": "310000000009",
    "text": "Explosives Transportation",
    "uom": "AU"
  },
  {
    "no": "310000000010",
    "text": "Heavy Truck Transportation",
    "uom": "AU"
  },
  {
    "no": "310000000011",
    "text": "Light Vehicle Transportation",
    "uom": "AU"
  },
  {
    "no": "310000000012",
    "text": "Pickup Transportation",
    "uom": "AU"
  },
  {
    "no": "310000000013",
    "text": "Rental  Commercial Plates",
    "uom": "DAY"
  },
  {
    "no": "310000000020",
    "text": "EOS Freight Charges",
    "uom": "AU"
  },
  {
    "no": "320000000000",
    "text": "Equipment Maintenance",
    "uom": "AU"
  },
  {
    "no": "320000000001",
    "text": "Truck Maintenance",
    "uom": "AU"
  },
  {
    "no": "320000000002",
    "text": "Paint & Sand blasting",
    "uom": "AU"
  },
  {
    "no": "320000000003",
    "text": "Vehicles Maintenance Services",
    "uom": "AU"
  },
  {
    "no": "320000000004",
    "text": "Mechanicals, Electric&Electronics, Machi",
    "uom": "AU"
  },
  {
    "no": "320000000005",
    "text": "Peripheral equipment Services",
    "uom": "AU"
  },
  {
    "no": "320000000006",
    "text": "Motors and power transmission Services",
    "uom": "AU"
  },
  {
    "no": "330000000000",
    "text": "Rental Office",
    "uom": "AU"
  },
  {
    "no": "330000000001",
    "text": "Rental Residence /Staff House/Camp /Ware",
    "uom": "AU"
  },
  {
    "no": "330000000002",
    "text": "Buffe Service / Supplies -  Restaurants",
    "uom": "AU"
  },
  {
    "no": "330000000003",
    "text": "Office / Camp Cleaning  Services / Laund",
    "uom": "AU"
  },
  {
    "no": "330000000004",
    "text": "Security services",
    "uom": "AU"
  },
  {
    "no": "330000000005",
    "text": "Building, Landscaping Staff House (Plumb",
    "uom": "AU"
  },
  {
    "no": "330000000006",
    "text": "Electricity  & Water",
    "uom": "AU"
  },
  {
    "no": "330000000007",
    "text": "Janitorial and cleaning supplies and ser",
    "uom": "AU"
  },
  {
    "no": "330000000008",
    "text": "Casual Labor  For Office / Camp",
    "uom": "AU"
  },
  {
    "no": "330000000009",
    "text": "Waste disposal ( Hazard & Non Hazard )",
    "uom": "AU"
  },
  {
    "no": "330000000010",
    "text": "Office supplies",
    "uom": "AU"
  },
  {
    "no": "330000000011",
    "text": "Office moving Services",
    "uom": "AU"
  },
  {
    "no": "330000000012",
    "text": "Heating and ventilation and AirCondition",
    "uom": "AU"
  },
  {
    "no": "330000000013",
    "text": "Yard Rental",
    "uom": "AU"
  },
  {
    "no": "330000000014",
    "text": "Warehouse / Storage Rental",
    "uom": "AU"
  },
  {
    "no": "330000000015",
    "text": "Office Rental",
    "uom": "AU"
  },
  {
    "no": "330000000016",
    "text": "Camp Rental",
    "uom": "AU"
  },
  {
    "no": "340000000000",
    "text": "Calibration & Certifications",
    "uom": "AU"
  },
  {
    "no": "340000000001",
    "text": "Inspection",
    "uom": "DAY"
  },
  {
    "no": "340000000002",
    "text": "Lifting Equipment Rental",
    "uom": "DAY"
  },
  {
    "no": "340000000003",
    "text": "NFT Equipment Rental",
    "uom": "DAY"
  },
  {
    "no": "340000000004",
    "text": "Licenses Rental",
    "uom": "DAY"
  },
  {
    "no": "350000000000",
    "text": "Oilfield  Equip. Rental",
    "uom": "AU"
  },
  {
    "no": "350000000001",
    "text": "Tools Rental",
    "uom": "DAY"
  },
  {
    "no": "350000000010",
    "text": "Rental Tanks",
    "uom": "DAY"
  },
  {
    "no": "350000000020",
    "text": "Mixing Charge Per Drum",
    "uom": "AU"
  },
  {
    "no": "350000000030",
    "text": "Training - Operations",
    "uom": "AU"
  },
  {
    "no": "360000000000",
    "text": "Gasoline  & Diesel",
    "uom": "AU"
  },
  {
    "no": "360000000001",
    "text": "ROW water ( Jobs )",
    "uom": "AU"
  },
  {
    "no": "360000000010",
    "text": "W/Fabricate Sand Hopper",
    "uom": "AU"
  },
  {
    "no": "370000000000",
    "text": "Equipment Insurance",
    "uom": "AU"
  },
  {
    "no": "370000000001",
    "text": "Facility Insurance",
    "uom": "AU"
  },
  {
    "no": "370000000002",
    "text": "Other Type of Insurance",
    "uom": "AU"
  },
  {
    "no": "370000000003",
    "text": "Vehicle Insurance",
    "uom": "AU"
  },
  {
    "no": "370000000004",
    "text": "Third Party liability Insurance",
    "uom": "AU"
  },
  {
    "no": "380000000000",
    "text": "Medical Insurance",
    "uom": "AU"
  },
  {
    "no": "380000000001",
    "text": "Life Insurance",
    "uom": "AU"
  },
  {
    "no": "380000000010",
    "text": "Medical Expences",
    "uom": "AU"
  },
  {
    "no": "390000000000",
    "text": "Software / Licenses",
    "uom": "AU"
  },
  {
    "no": "390000000001",
    "text": "Hardware",
    "uom": "AU"
  },
  {
    "no": "390000000002",
    "text": "Mobile Phone Services",
    "uom": "AU"
  },
  {
    "no": "390000000003",
    "text": "Telecommunication equipment and parts",
    "uom": "AU"
  },
  {
    "no": "390000000004",
    "text": "ERP Support",
    "uom": "AU"
  },
  {
    "no": "390000000005",
    "text": "Voice services - Fixed line",
    "uom": "AU"
  },
  {
    "no": "390000000006",
    "text": "Internet  Services",
    "uom": "AU"
  },
  {
    "no": "400000000000",
    "text": "Giveaway",
    "uom": "AU"
  },
  {
    "no": "400000000001",
    "text": "Branding",
    "uom": "AU"
  },
  {
    "no": "400000000002",
    "text": "Advertising",
    "uom": "AU"
  },
  {
    "no": "400000000003",
    "text": "Exhibitions",
    "uom": "AU"
  },
  {
    "no": "400000000004",
    "text": "Donations",
    "uom": "AU"
  },
  {
    "no": "400000000005",
    "text": "Seminars",
    "uom": "AU"
  },
  {
    "no": "400000000006",
    "text": "Donation Others",
    "uom": "AU"
  },
  {
    "no": "410000000000",
    "text": "Internal Events",
    "uom": "AU"
  },
  {
    "no": "410000000001",
    "text": "Hotel and Lodging",
    "uom": "AU"
  },
  {
    "no": "410000000002",
    "text": "Air Ticket-Business",
    "uom": "AU"
  },
  {
    "no": "410000000003",
    "text": "Travel Agency Fees",
    "uom": "AU"
  },
  {
    "no": "410000000004",
    "text": "Other entertainment",
    "uom": "AU"
  },
  {
    "no": "410000000005",
    "text": "Charter Flights",
    "uom": "AU"
  },
  {
    "no": "420000000000",
    "text": "Stationary",
    "uom": "AU"
  },
  {
    "no": "420000000001",
    "text": "Photocopy / Printing",
    "uom": "AU"
  },
  {
    "no": "420000000002",
    "text": "Other Admn Fees",
    "uom": "AU"
  },
  {
    "no": "420000000003",
    "text": "Subscription Fees",
    "uom": "AU"
  },
  {
    "no": "420000000004",
    "text": "Financial Services Fees",
    "uom": "AU"
  },
  {
    "no": "420000000005",
    "text": "Financial Audit Fees",
    "uom": "AU"
  },
  {
    "no": "420000000006",
    "text": "Penalty and Fines",
    "uom": "AU"
  },
  {
    "no": "420000000007",
    "text": "Penalty and Fines",
    "uom": "AU"
  },
  {
    "no": "420000000010",
    "text": "Vehicles License Renewal",
    "uom": "EA"
  },
  {
    "no": "420000000020",
    "text": "GOSI-Social Security",
    "uom": "AU"
  },
  {
    "no": "430000000000",
    "text": "Ticket-Annual-Rotation EMP",
    "uom": "AU"
  },
  {
    "no": "430000000001",
    "text": "Housing",
    "uom": "AU"
  },
  {
    "no": "430000000002",
    "text": "Housing Maintenance",
    "uom": "AU"
  },
  {
    "no": "430000000003",
    "text": "Relocation",
    "uom": "AU"
  },
  {
    "no": "430000000010",
    "text": "Camp/ Staff House-other related Expense",
    "uom": "AU"
  },
  {
    "no": "430000000020",
    "text": "Empl. Payable-Payrol",
    "uom": "AU"
  },
  {
    "no": "430000000021",
    "text": "Staff Accommodation-locations",
    "uom": "AU"
  },
  {
    "no": "430000000022",
    "text": "Accruals-Ops Related-Non PO related",
    "uom": "AU"
  },
  {
    "no": "440000000000",
    "text": "Legal & Professional Fees",
    "uom": "AU"
  },
  {
    "no": "440000000001",
    "text": "Consultation (Operation related)",
    "uom": "AU"
  },
  {
    "no": "440000000002",
    "text": "Outside Service / Translation",
    "uom": "AU"
  },
  {
    "no": "450000000000",
    "text": "PPE (Personal Protective Equipment)",
    "uom": "AU"
  },
  {
    "no": "450000000001",
    "text": "Safety/Security equipment",
    "uom": "AU"
  },
  {
    "no": "450000000002",
    "text": "Firefighting Services",
    "uom": "AU"
  },
  {
    "no": "450000000003",
    "text": "Driving monitor  ( VDO)",
    "uom": "AU"
  },
  {
    "no": "450000000004",
    "text": "Other Safety Relative",
    "uom": "AU"
  },
  {
    "no": "450000000005",
    "text": "Safety Training - Local",
    "uom": "AU"
  },
  {
    "no": "450000000006",
    "text": "Safety Training - Expat",
    "uom": "AU"
  },
  {
    "no": "450000000007",
    "text": "Environmental services",
    "uom": "AU"
  },
  {
    "no": "450000000008",
    "text": "Waste Disposal Costs",
    "uom": "AU"
  },
  {
    "no": "460000000000",
    "text": "Temporary labor/Consultant",
    "uom": "AU"
  },
  {
    "no": "460000000001",
    "text": "Subcontractor Personnel Services",
    "uom": "AU"
  },
  {
    "no": "460000000002",
    "text": "Contractor's Staff ( direct between CO.",
    "uom": "AU"
  },
  {
    "no": "470000000000",
    "text": "Visas Iqamas and Permits",
    "uom": "AU"
  },
  {
    "no": "480000000000",
    "text": "Other Income",
    "uom": "AU"
  },
  {
    "no": "480000000001",
    "text": "Other Expense",
    "uom": "AU"
  },
  {
    "no": "480000000010",
    "text": "Reimbursable",
    "uom": "AU"
  },
  {
    "no": "490000000000",
    "text": "Prepaid Rent - Office",
    "uom": "AU"
  },
  {
    "no": "490000000001",
    "text": "Prepaid Rent - Staff housing",
    "uom": "AU"
  },
  {
    "no": "490000000002",
    "text": "Prepaid Rent - Operational",
    "uom": "AU"
  },
  {
    "no": "490000000003",
    "text": "Prepaid School Fee",
    "uom": "AU"
  },
  {
    "no": "490000000004",
    "text": "Prepaid Insurance - Employee related",
    "uom": "AU"
  },
  {
    "no": "490000000005",
    "text": "Prepaid Insurance-Property&General Liab.",
    "uom": "AU"
  },
  {
    "no": "490000000006",
    "text": "Prepaid Insurance - D&O",
    "uom": "AU"
  },
  {
    "no": "490000000007",
    "text": "Prepaid Legal and Professional fee",
    "uom": "AU"
  },
  {
    "no": "490000000008",
    "text": "Prepaid / Deferred Expenses-Project Star",
    "uom": "AU"
  },
  {
    "no": "490000000009",
    "text": "Prepaid Others",
    "uom": "AU"
  }
];
