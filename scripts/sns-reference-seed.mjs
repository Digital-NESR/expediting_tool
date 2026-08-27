// Initial reference data for the S&S Registry — the taxonomy, countries,
// segments and reason codes the New Record wizard picks from.
//
// This is a STARTING POINT, not a source of truth: once seeded, all four sets
// are maintained from /admin → S&S Registry → Reference Data. The init script
// only inserts rows that are missing, so re-running it never overwrites edits
// made in the admin console.

/** [spendType, category, [ [subCategory, [ [family, [commodity, ...]], ... ]], ... ]] */
export const TAXONOMY = [
  ['Direct', 'Field Technical Equipment & Services', [
    ['Downhole Tools', [
      ['Fishing Tools', ['Overshot assemblies', 'Junk baskets', 'Milling tools']],
      ['Thru-Tubing Tools', ['Coiled tubing motors', 'Hydraulic disconnects']],
    ]],
    ['Pressure Pumping Equipment', [
      ['Frac Pumps', ['Triplex fluid ends', 'Quintuplex pump units']],
      ['Blenders & Hydration', ['Hydration units', 'Chemical additive skids']],
    ]],
    ['Wireline & Logging Hardware', [
      ['Logging Tools', ['Cased-hole logging strings', 'Perforating guns']],
      ['Wireline Units', ['Slickline units', 'Digital wireline cable']],
    ]],
  ]],
  ['Indirect', 'Facility', [
    ['Building Services', [
      ['HVAC', ['Chiller units', 'AHU maintenance']],
      ['Electrical', ['Diesel generators', 'UPS systems']],
    ]],
    ['Site Support', [
      ['Camp Services', ['Catering', 'Housekeeping']],
      ['Security', ['Manned guarding', 'CCTV systems']],
    ]],
  ]],
  ['Direct', 'Chemicals', [
    ['Stimulation Chemicals', [
      ['Acid Systems', ['Corrosion inhibitors', 'HCl blends']],
      ['Friction Reducers', ['Slickwater FR', 'High-TDS FR']],
    ]],
    ['Drilling Chemicals', [
      ['Fluid Additives', ['Barite', 'Bentonite']],
      ['Specialty Polymers', ['Xanthan gum', 'PAC-LV']],
    ]],
  ]],
  ['Indirect', 'Logistics', [
    ['Freight', [
      ['Air Freight', ['Charter cargo', 'Expedited air']],
      ['Ocean Freight', ['Full container load', 'Less than container load']],
    ]],
    ['In-Country Transport', [
      ['Trucking', ['Flatbed haulage', 'Bulk tankers']],
      ['Customs', ['Clearance services', 'Bonded warehousing']],
    ]],
  ]],
  ['Indirect', 'IT', [
    ['Software', [
      ['Enterprise Applications', ['SAP licenses', 'PLM licenses']],
      ['Engineering Software', ['Well modeling suites', 'CAD seats']],
    ]],
    ['Infrastructure', [
      ['Networking', ['SD-WAN circuits', 'Satellite VSAT']],
      ['End User Compute', ['Ruggedized laptops', 'Field tablets']],
    ]],
  ]],
  ['Indirect', 'Professional Services', [
    ['Advisory', [
      ['Consulting', ['Strategy advisory', 'Process re-engineering']],
      ['Audit & Assurance', ['External audit', 'Internal audit support']],
    ]],
    ['Legal', [
      ['Legal Counsel', ['Corporate counsel', 'Litigation support']],
    ]],
  ]],
  ['Indirect', 'HR', [
    ['Talent', [
      ['Recruitment', ['Executive search', 'Volume hiring']],
      ['Training', ['HSE certification training', 'Technical upskilling']],
    ]],
  ]],
  ['Direct', 'Lifting Equipment', [
    ['Cranes & Hoists', [
      ['Mobile Cranes', ['Rough terrain cranes', 'Crawler cranes']],
      ['Slings & Rigging', ['Wire rope slings', 'Shackles']],
    ]],
  ]],
  ['Direct', 'Maintenance & Repair Operations', [
    ['Rotating Equipment', [
      ['Pumps & Seals', ['Centrifugal pump spares', 'Mechanical seals']],
      ['Bearings', ['Roller bearings']],
    ]],
  ]],
  ['Direct', 'Fuel, Lubricants and Gases', [
    ['Bulk Supply', [
      ['Diesel', ['Bulk diesel supply', 'Jet A-1']],
      ['Lubricants', ['Hydraulic oils', 'Gear oils']],
    ]],
  ]],
  ['Indirect', 'Travel & Entertainment', [
    ['Travel', [
      ['Air Travel', ['Corporate airfare', 'Charter flights']],
      ['Accommodation', ['Hotel programs']],
    ]],
  ]],
  ['Indirect', 'Safety', [
    ['PPE', [
      ['Personal Protection', ['FR coveralls', 'Impact gloves']],
      ['Detection', ['Gas detectors', 'Breathing apparatus']],
    ]],
  ]],
  ['Direct', 'Inspection & Certification', [
    ['Third Party Inspection', [
      ['NDT Services', ['Ultrasonic testing', 'Radiographic testing']],
      ['Certification', ['Lifting gear certification']],
    ]],
  ]],
  ['Direct', 'Operation Rental', [
    ['Equipment Rental', [
      ['Rental Units', ['Rental frac tanks', 'Rental compressors']],
    ]],
  ]],
  ['Indirect', 'Manpower', [
    ['Contract Labor', [
      ['Field Contractors', ['Rig crew supply', 'Technician staffing']],
    ]],
  ]],
  ['Direct', 'Cement', [
    ['Cementing Materials', [
      ['Bulk Cement', ['Class G cement', 'Class H cement']],
    ]],
  ]],
  ['Direct', 'Nitrogen', [
    ['Nitrogen Supply', [
      ['Bulk Nitrogen', ['Liquid nitrogen', 'Nitrogen membrane units']],
    ]],
  ]],
  ['Direct', 'Natural Sand', [
    ['Proppant', [
      ['Frac Sand', ['Northern white sand']],
    ]],
  ]],
];

/** [name, code] — the code is embedded in issued Registry IDs. */
export const COUNTRIES = [
  ['Algeria', 'DZA'],
  ['Kuwait', 'KWT'],
  ['Abu Dhabi (UAE)', 'AUH'],
  ['Iraq', 'IRQ'],
  ['KSA', 'KSA'],
  ['India', 'IND'],
  ['HQ', 'HQ'],
  ['Bahrain', 'BHR'],
  ['Egypt', 'EGY'],
  ['Libya', 'LBY'],
  ['Oman', 'OMN'],
  ['EOS', 'EOS'],
  ['Global', 'GLB'],
];

export const SEGMENTS = [
  'Artificial Lift', 'Cementing Services', 'Coiled Tubing Services', 'Directional Drilling',
  'Drilling & Workover', 'Drilling Fluids', 'Drilling Services', 'ESG Impact', 'Filtration',
  'Fishing & Remedial', 'Hydraulic Fracturing', 'Integrated Project Management', 'Logging Services',
  'Nitrogen Services', 'Operations Support Services', 'Ops Support', 'Pipelines & Industrial Services',
  'Slick Line Services', 'Stimulation & Pumping Services', 'Thru Tubing Services',
  'Tubular Running Services', 'Well Testing Services',
];

/** Reason codes, keyed by classification. SGL = single-source, SOL = sole-source. */
export const REASONS = {
  SGL: [
    'OEM / patented technology',
    'Regulatory restriction',
    'Geographic or logistics constraint',
  ],
  SOL: [
    'Standardization',
    'Active contract / master agreement',
    'Warranty preservation',
    'Strategic relationship',
  ],
};
