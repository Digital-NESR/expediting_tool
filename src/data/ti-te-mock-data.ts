// TI-TE mock data — converted from References/data.js

export type AlertLevel = 'overdue' | 'urgent' | 'action' | 'plan' | 'info' | 'ok' | 'closed';

export interface Shipment {
  id: number;
  segment: string;
  from: string;
  to: string;
  invoice: string;
  invoiceValue: number;
  bayan: string;
  description: string;
  mot: string;
  awb: string;
  importDate: Date;
  depositSAR: number;
  po: string;
  movement: 'Import' | 'Export';
  expiry: Date;
  extended: Date | null;
  comments: string;
  status: 'Active' | 'Closed' | 'Overdue' | 'At risk';
  owner: string;
  // computed
  daysToExpiry: number | null;
  alert: AlertLevel;
}

export interface ShipmentDoc {
  name: string;
  kind: string;
  size: string;
  uploadedBy: string;
  uploadedAt: Date;
}

export interface TimelineEvent {
  at: Date;
  who: string;
  kind: 'created' | 'document' | 'system' | 'extension' | 'alert' | 'closed';
  text: string;
}

// Reference date used for status computations
export const TODAY = new Date(2026, 4, 7); // May 7, 2026

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Excel serial date → JS Date
function xd(serial: number): Date {
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms);
}

function computeAlert(
  s: Omit<Shipment, 'daysToExpiry' | 'alert' | 'status'> & { status: string },
): Pick<Shipment, 'daysToExpiry' | 'alert' | 'status'> {
  if (s.status === 'Closed') return { daysToExpiry: null, alert: 'closed', status: 'Closed' };
  const eff = s.extended || s.expiry;
  const daysToExpiry = Math.floor((eff.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
  let alert: AlertLevel;
  if (daysToExpiry < 0) alert = 'overdue';
  else if (daysToExpiry <= 7) alert = 'urgent';
  else if (daysToExpiry <= 14) alert = 'action';
  else if (daysToExpiry <= 30) alert = 'plan';
  else if (daysToExpiry <= 60) alert = 'info';
  else alert = 'ok';
  const status: Shipment['status'] = daysToExpiry < 0 ? 'Overdue' : daysToExpiry <= 14 ? 'At risk' : 'Active';
  return { daysToExpiry, alert, status };
}

const RAW: (Omit<Shipment, 'daysToExpiry' | 'alert'> & { status: string })[] = [
  { id: 1, segment: 'Coiled Tubing', from: 'India', to: 'KSA', invoice: 'NPS-CT-71-23-24', invoiceValue: 667274.34, bayan: '135339', description: 'Refundable Deposit for CT Units from India to Saudi', mot: 'Sea', awb: 'KCPMUNDMM2306051', importDate: xd(45144), depositSAR: 143405, po: '5190016363', movement: 'Import', expiry: xd(45363), extended: xd(45638), comments: '', status: 'Active', owner: 'Ahmed Al-Otaibi' },
  { id: 2, segment: 'Coiled Tubing', from: 'Qatar', to: 'KSA', invoice: 'CI-010/23 +6 more', invoiceValue: 809917.93, bayan: 'DXBN082300568', description: 'Refundable Deposit for CT Package from Qatar to SA', mot: 'Land', awb: 'DXBN082300568', importDate: xd(45132), depositSAR: 225310.77, po: '5190016603', movement: 'Import', expiry: xd(45312), extended: xd(45720), comments: 'Closed', status: 'Closed', owner: 'Ahmed Al-Otaibi' },
  { id: 3, segment: 'Coiled Tubing', from: 'Qatar', to: 'KSA', invoice: 'CI-013/23', invoiceValue: 203858, bayan: '7698', description: 'Temp. Cust. Deposit — CT Pack. Qatar PO 5190016636', mot: 'Land', awb: 'DXBN082300568', importDate: xd(45177), depositSAR: 38841.38, po: '5190016636', movement: 'Import', expiry: xd(45446), extended: xd(45706), comments: '', status: 'Closed', owner: 'Faisal Mansour' },
  { id: 4, segment: 'Coiled Tubing', from: 'Qatar', to: 'KSA', invoice: 'CI-009/23', invoiceValue: 187500, bayan: '7700', description: 'Temp. Cust. Deposit — CT Pack. Qatar PO 5190016637', mot: 'Land', awb: 'DXBN082300568', importDate: xd(45178), depositSAR: 28607, po: '5190016637', movement: 'Import', expiry: xd(45476), extended: xd(45568), comments: '', status: 'Closed', owner: 'Faisal Mansour' },
  { id: 5, segment: 'Coiled Tubing', from: 'Qatar', to: 'KSA', invoice: 'CI-010/23', invoiceValue: 210549, bayan: '7699', description: 'Temp. Cust. Deposit — CT Pack. Qatar PO 5190016638', mot: 'Land', awb: 'DXBN082300568', importDate: xd(45179), depositSAR: 47703.58, po: '5190016638', movement: 'Import', expiry: xd(45507), extended: xd(45568), comments: '', status: 'Closed', owner: 'Faisal Mansour' },
  { id: 6, segment: 'Coiled Tubing', from: 'Algeria', to: 'KSA', invoice: '2023-1', invoiceValue: 652000, bayan: '683229', description: 'Temp. Cust. Deposit — GDI Algeria PO 5190016765', mot: 'Air', awb: '157-87826093', importDate: xd(45139), depositSAR: 106933.58, po: '5190016765', movement: 'Import', expiry: xd(45449), extended: xd(45629), comments: '', status: 'Closed', owner: 'Ahmed Al-Otaibi' },
  { id: 7, segment: 'WL', from: 'USA', to: 'KSA', invoice: 'GES05202024', invoiceValue: 30000, bayan: '514832', description: 'Kenjer Price Lists — Free Trail Runs', mot: 'Air', awb: '157-35902171', importDate: xd(45602), depositSAR: 5683.32, po: '5190025068', movement: 'Import', expiry: xd(45454), extended: xd(45634), comments: '', status: 'Closed', owner: 'Layla Hassan' },
  { id: 8, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'SPM0003144', invoiceValue: 81784.63, bayan: '94674', description: 'SPM0003144 — Quintoplex pump components', mot: 'Land', awb: 'JBCJBL20240117', importDate: xd(45427), depositSAR: 32309.83, po: '5190024423', movement: 'Import', expiry: xd(45607), extended: xd(45767), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 9, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'SPM0003146', invoiceValue: 4134.62, bayan: '94797', description: 'SPM0003146', mot: 'Land', awb: 'JBCJBL20240117', importDate: xd(45427), depositSAR: 775.25, po: '5190024423', movement: 'Import', expiry: xd(45607), extended: xd(45767), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 10, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'SPM0003348', invoiceValue: 15504, bayan: '112486', description: 'SPM0003348', mot: 'Land', awb: 'JBCJBL20240123', importDate: xd(45510), depositSAR: 885.25, po: '5190025088', movement: 'Import', expiry: xd(45690), extended: xd(45850), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 11, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'SPM0003346', invoiceValue: 50729.77, bayan: '112471', description: 'SPM0003346', mot: 'Land', awb: 'JBCJBL20240123', importDate: xd(45510), depositSAR: 20265.95, po: '5190025089', movement: 'Import', expiry: xd(45690), extended: xd(45850), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 12, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'CIPL-OGNESR-2405-006', invoiceValue: 550000, bayan: '123855', description: 'CIPL-OGNESR-2405-006 — Quintoplex pump', mot: '', awb: '', importDate: xd(45471), depositSAR: 312069, po: '5190025554', movement: 'Import', expiry: xd(45651), extended: xd(45901), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 13, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: '', invoiceValue: 0, bayan: '10095', description: 'Vaporizer for KSA', mot: '', awb: '', importDate: xd(45467), depositSAR: 17892.14, po: '5190025314', movement: 'Import', expiry: xd(45647), extended: xd(45807), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 14, segment: 'Drilling', from: 'KSA', to: 'Oman', invoice: '', invoiceValue: 0, bayan: '10478', description: 'RoyalStream FT in Oman, TKT-0001100171', mot: '', awb: '', importDate: xd(45385), depositSAR: 0, po: 'N/A', movement: 'Export', expiry: xd(45565), extended: xd(45725), comments: 'No deposit — government export fees 170 SAR', status: 'Closed', owner: 'Mohammed Tariq' },
  { id: 15, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: '', invoiceValue: 0, bayan: '12912', description: 'Vaporizer for KSA', mot: '', awb: '', importDate: xd(45280), depositSAR: 10492.39, po: '5190020729', movement: 'Import', expiry: xd(45460), extended: xd(45640), comments: '', status: 'Closed', owner: 'Khalid Reza' },
  { id: 16, segment: 'Drilling', from: 'KSA', to: 'UAE', invoice: '', invoiceValue: 0, bayan: '34166', description: 'Motors — Final time', mot: '', awb: '', importDate: xd(45337), depositSAR: 865771.67, po: '5190022259', movement: 'Import', expiry: xd(45517), extended: xd(46055), comments: 'Multiple extensions granted', status: 'Active', owner: 'Mohammed Tariq' },
  { id: 17, segment: 'WL', from: 'USA', to: 'KSA', invoice: 'GW20240820-01', invoiceValue: 370500, bayan: '905079', description: 'Deformation and Eccentricity Tool', mot: 'Air', awb: '176-00098501', importDate: xd(45606), depositSAR: 70868.35, po: '5190028803', movement: 'Import', expiry: xd(45970), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 18, segment: 'Drilling', from: 'KSA', to: 'UAE', invoice: '', invoiceValue: 0, bayan: '20419', description: 'Drilling tools movement', mot: '', awb: '', importDate: xd(45628), depositSAR: 458601.68, po: '5190021846', movement: 'Import', expiry: xd(45988), extended: null, comments: '', status: 'Active', owner: 'Mohammed Tariq' },
  { id: 19, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'CIPL-NESR-2501-032', invoiceValue: 580000, bayan: '58884', description: 'Pump components', mot: 'Land', awb: 'AEPFL032880', importDate: xd(45698), depositSAR: 318312.5, po: '5190031105', movement: 'Import', expiry: xd(46056), extended: null, comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 20, segment: 'Frac', from: 'KSA', to: 'Algeria', invoice: '', invoiceValue: 0, bayan: '29379', description: 'Frac pump — Algeria deployment', mot: 'Sea', awb: '', importDate: xd(45755), depositSAR: 0, po: 'N/A', movement: 'Export', expiry: xd(45935), extended: xd(46295), comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 21, segment: 'Frac', from: 'KSA', to: 'Algeria', invoice: '', invoiceValue: 0, bayan: '29371', description: 'Sand king — Algeria', mot: 'Sea', awb: '', importDate: xd(45755), depositSAR: 0, po: 'N/A', movement: 'Export', expiry: xd(45935), extended: xd(46295), comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 22, segment: 'Drilling', from: 'KSA', to: 'UAE', invoice: 'GW20250210-03', invoiceValue: 139200, bayan: '202506', description: 'HP/LP system', mot: 'Air', awb: '176-09062384', importDate: xd(45709), depositSAR: 26625.62, po: '', movement: 'Import', expiry: xd(46072), extended: null, comments: '', status: 'Active', owner: 'Mohammed Tariq' },
  { id: 23, segment: 'Drilling', from: 'KSA', to: 'UAE', invoice: 'GW20250429-02A', invoiceValue: 145898, bayan: '227166', description: 'MFC40J-B 40-Arm Multifinger Caliper', mot: 'Land', awb: '', importDate: xd(45804), depositSAR: 27355.88, po: '', movement: 'Import', expiry: xd(45973), extended: xd(46123), comments: '', status: 'Active', owner: 'Mohammed Tariq' },
  { id: 24, segment: 'Drilling', from: 'KSA', to: 'UK', invoice: 'NESR-3492-WL-CH-2025', invoiceValue: 56848, bayan: '5190', description: 'TTCE Tools', mot: 'Air', awb: '176-08621992', importDate: xd(45802), depositSAR: 0, po: '', movement: 'Export', expiry: xd(45961), extended: xd(46111), comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 25, segment: 'Drilling', from: 'UK', to: 'KSA', invoice: 'NESR-3588-WL-CH-2025', invoiceValue: 93636, bayan: '100605', description: 'Multifinger Imaging Tool', mot: 'Land', awb: '32925-DXB', importDate: xd(45852), depositSAR: 0, po: '', movement: 'Import', expiry: xd(46174), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 26, segment: 'Drilling', from: 'KSA', to: 'Oman', invoice: 'NESR-3539-SLIKLINE-2025', invoiceValue: 248000, bayan: '323356', description: 'Multifinger Caliper', mot: 'Land', awb: 'SLK', importDate: xd(45877), depositSAR: 46500, po: '', movement: 'Import', expiry: xd(46204), extended: null, comments: '', status: 'Active', owner: 'Salem Khoury' },
  { id: 27, segment: 'Drilling', from: 'KSA', to: 'Oman', invoice: 'NESR-3540-SLIKLINE-2025', invoiceValue: 6784, bayan: '7785', description: 'SLK Unit 59', mot: 'Air', awb: 'SLK UNIT 59', importDate: xd(45872), depositSAR: 0, po: '', movement: 'Export', expiry: xd(46204), extended: null, comments: 'Returned and closed', status: 'Closed', owner: 'Salem Khoury' },
  { id: 28, segment: 'Drilling', from: 'KSA', to: 'Oman', invoice: 'NESR-3541-SLIKLINE-2025', invoiceValue: 363380, bayan: '353487', description: 'SLK Unit 60', mot: 'Air', awb: 'SLK UNIT 60', importDate: xd(45741), depositSAR: 76994.18, po: '', movement: 'Export', expiry: xd(46106), extended: null, comments: 'Returned', status: 'Active', owner: 'Salem Khoury' },
  { id: 29, segment: 'Drilling', from: 'KSA', to: 'Oman', invoice: 'GW20250730-01', invoiceValue: 574417.6, bayan: '399011', description: 'EPE43D-B Enhanced Pipe Detection Tool', mot: 'Air', awb: '40584 AJM', importDate: xd(45759), depositSAR: 110900.27, po: '', movement: 'Import', expiry: xd(46124), extended: null, comments: '', status: 'Active', owner: 'Mohammed Tariq' },
  { id: 30, segment: 'Drilling', from: 'KSA', to: 'China', invoice: 'NESR-3607-WL-CH-2025', invoiceValue: 132769.8, bayan: '570174', description: 'Pressure Temperature PTC43J-A', mot: 'Air', awb: '176-81691433', importDate: xd(45800), depositSAR: 26395, po: '', movement: 'Export', expiry: xd(46165), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 31, segment: 'Drilling', from: 'KSA', to: 'China', invoice: 'PTS098-A', invoiceValue: 184830.3, bayan: '780563', description: 'PTS098 — Pressure/Temp Sensor', mot: 'Air', awb: '235-83999510', importDate: xd(45849), depositSAR: 36352.66, po: '', movement: 'Export', expiry: xd(46214), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 32, segment: 'Drilling', from: 'KSA', to: 'China', invoice: 'PTS099-A', invoiceValue: 61450, bayan: '853236', description: 'PTS099', mot: 'Air', awb: '235-83981553', importDate: xd(45865), depositSAR: 12504.35, po: '', movement: 'Export', expiry: xd(46230), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 33, segment: 'Drilling', from: 'KSA', to: 'China', invoice: 'PTS104', invoiceValue: 9090, bayan: '944909', description: 'PTS104', mot: 'Air', awb: '235-84800306', importDate: xd(45882), depositSAR: 1852.37, po: '', movement: 'Export', expiry: xd(46247), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 34, segment: 'Drilling', from: 'KSA', to: 'China', invoice: 'PTS109', invoiceValue: 82944, bayan: '967313', description: 'PTS109', mot: 'Air', awb: '235-86533720', importDate: xd(45888), depositSAR: 15970.15, po: '', movement: 'Export', expiry: xd(46253), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 35, segment: 'Drilling', from: 'KSA', to: 'China', invoice: 'PTS111', invoiceValue: 128628.03, bayan: '570151', description: 'PTS111', mot: 'Air', awb: '235-86530695', importDate: xd(45800), depositSAR: 27737.26, po: '', movement: 'Export', expiry: xd(46165), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 36, segment: 'MPD', from: 'KSA', to: 'USA', invoice: 'DO05212025', invoiceValue: 101218.28, bayan: '202407', description: 'MPD Equipment', mot: 'Sea', awb: '176-06543574', importDate: xd(45768), depositSAR: 33279.4, po: '', movement: 'Export', expiry: xd(46133), extended: null, comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 37, segment: 'MPD', from: 'UAE', to: 'KSA', invoice: 'DH02132025', invoiceValue: 34057.62, bayan: '181077', description: 'MPD Equipment — Components', mot: 'Land', awb: '', importDate: xd(45774), depositSAR: 15725.16, po: '2500079297', movement: 'Import', expiry: xd(46139), extended: null, comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 38, segment: 'MPD', from: 'KSA', to: 'USA', invoice: 'CI-25-219', invoiceValue: 175126, bayan: '1044852', description: 'PTS118', mot: 'Air', awb: 'YN029HODA031', importDate: xd(45918), depositSAR: 34404.95, po: '', movement: 'Export', expiry: xd(46283), extended: null, comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 39, segment: 'TRS', from: 'UAE', to: 'KSA', invoice: 'TRS rental', invoiceValue: 69645, bayan: '64546', description: 'TRS — 5190019766 rental OGI-ENQ-4234', mot: 'Land', awb: '', importDate: xd(45393), depositSAR: 3325.88, po: '5190023482', movement: 'Import', expiry: xd(45758), extended: xd(46118), comments: '', status: 'Active', owner: 'Khalid Reza' },
  { id: 40, segment: 'ESG', from: '', to: 'KSA', invoice: 'Go 2 Lithium', invoiceValue: 480387.56, bayan: '498422', description: 'ESG rental', mot: 'Sea', awb: 'CAN0911729', importDate: xd(45900), depositSAR: 480387.56, po: '5190023482', movement: 'Import', expiry: xd(45900), extended: xd(46080), comments: '', status: 'Active', owner: 'Salem Khoury' },
  { id: 41, segment: 'Frac', from: 'KSA', to: 'Algeria', invoice: 'Crown tools', invoiceValue: 778652, bayan: '1104928', description: 'Crown tools — Algeria', mot: 'Air', awb: '5190037774', importDate: xd(45957), depositSAR: 233297.25, po: '5190037774', movement: 'Export', expiry: xd(46117), extended: null, comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 42, segment: 'WL', from: 'KSA', to: 'Iraq', invoice: 'NESR-WL-IRQ-2026-001', invoiceValue: 245000, bayan: '1167304', description: 'Cement Bond Log Tool — Iraq trial', mot: 'Land', awb: 'CBL-IRQ-26', importDate: new Date(2026, 0, 12), depositSAR: 64200, po: '5190041223', movement: 'Export', expiry: new Date(2026, 4, 4), extended: null, comments: 'Awaiting trial completion report', status: 'Active', owner: 'Layla Hassan' },
  { id: 43, segment: 'Coiled Tubing', from: 'UAE', to: 'KSA', invoice: 'NESR-CT-DXB-2026-014', invoiceValue: 412300, bayan: '1184205', description: 'Quintoplex pump skid + crossovers', mot: 'Sea', awb: 'AEDXB2026014', importDate: new Date(2026, 1, 2), depositSAR: 89230, po: '5190041680', movement: 'Import', expiry: new Date(2026, 4, 8), extended: null, comments: 'Extension paperwork in legal review', status: 'At risk', owner: 'Khalid Reza' },
  { id: 44, segment: 'Frac', from: 'KSA', to: 'Algeria', invoice: 'NESR-FRAC-ALG-2026-002', invoiceValue: 1240000, bayan: '1156889', description: 'Sand king + blender — Algeria campaign', mot: 'Sea', awb: 'KSAALGSEA26', importDate: new Date(2025, 11, 18), depositSAR: 0, po: 'N/A', movement: 'Export', expiry: new Date(2026, 3, 28), extended: null, comments: 'OVERDUE — re-export not yet executed', status: 'Overdue', owner: 'Yusuf Sharif' },
  { id: 45, segment: 'MPD', from: 'USA', to: 'KSA', invoice: 'NESR-MPD-USA-2026-007', invoiceValue: 167900, bayan: '1198032', description: 'MPD choke manifold — trial', mot: 'Air', awb: '176-44918003', importDate: new Date(2026, 1, 22), depositSAR: 41200, po: '5190042114', movement: 'Import', expiry: new Date(2026, 4, 22), extended: null, comments: '', status: 'Active', owner: 'Yusuf Sharif' },
  { id: 46, segment: 'Drilling', from: 'KSA', to: 'Oman', invoice: 'NESR-DR-OMN-2026-018', invoiceValue: 87500, bayan: '1201478', description: 'Slickline downhole tools — Oman', mot: 'Land', awb: 'SLK-OMN-26-18', importDate: new Date(2026, 2, 10), depositSAR: 19400, po: '5190042580', movement: 'Export', expiry: new Date(2026, 5, 15), extended: null, comments: '', status: 'Active', owner: 'Salem Khoury' },
  { id: 47, segment: 'WL', from: 'China', to: 'KSA', invoice: 'NESR-WL-CHN-2026-022', invoiceValue: 322110, bayan: '1212004', description: 'Pressure/Temp logging suite — eval', mot: 'Air', awb: '999-22884103', importDate: new Date(2026, 2, 1), depositSAR: 78400, po: '5190042890', movement: 'Import', expiry: new Date(2026, 6, 28), extended: null, comments: '', status: 'Active', owner: 'Layla Hassan' },
  { id: 48, segment: 'ESG', from: 'KSA', to: 'UAE', invoice: 'NESR-ESG-UAE-2026-003', invoiceValue: 96400, bayan: '1219991', description: 'Methane sniffer rental return', mot: 'Land', awb: 'ESG-UAE-26', importDate: new Date(2025, 10, 1), depositSAR: 22150, po: '5190040118', movement: 'Export', expiry: new Date(2026, 3, 1), extended: null, comments: 'OVERDUE — escalated to legal', status: 'Overdue', owner: 'Salem Khoury' },
  { id: 49, segment: 'TRS', from: 'UK', to: 'KSA', invoice: 'NESR-TRS-UK-2026-009', invoiceValue: 198000, bayan: '1224560', description: 'TRS reservoir tester — campaign', mot: 'Sea', awb: 'UK-TRS-26', importDate: new Date(2026, 0, 28), depositSAR: 51200, po: '5190041550', movement: 'Import', expiry: new Date(2026, 5, 1), extended: null, comments: '', status: 'Active', owner: 'Khalid Reza' },
];

export const SHIPMENTS: Shipment[] = RAW.map(s => {
  const computed = computeAlert(s);
  return { ...s, ...computed } as Shipment;
});

// Documents per shipment (synthetic)
export const DOCS_BY_ID: Record<number, ShipmentDoc[]> = {};
SHIPMENTS.forEach(s => {
  const docs: ShipmentDoc[] = [];
  if (s.bayan) docs.push({ name: `Bayan_${s.bayan}.pdf`, kind: 'Bayan', size: '142 KB', uploadedBy: s.owner, uploadedAt: s.importDate });
  if (s.invoice) docs.push({ name: `Invoice_${s.invoice.split(' ')[0].replace(/[^A-Za-z0-9-]/g, '')}.pdf`, kind: 'Invoice', size: '88 KB', uploadedBy: s.owner, uploadedAt: s.importDate });
  if (s.awb) docs.push({ name: `AWB_${s.awb.replace(/\s+/g, '')}.pdf`, kind: 'AWB / BL', size: '64 KB', uploadedBy: s.owner, uploadedAt: s.importDate });
  if (s.po && s.po !== 'N/A') docs.push({ name: `PO_${s.po}.pdf`, kind: 'PO', size: '52 KB', uploadedBy: s.owner, uploadedAt: s.importDate });
  if (s.extended) docs.push({ name: `Extension_Approval_${s.id}.pdf`, kind: 'Extension', size: '210 KB', uploadedBy: 'Customs Authority', uploadedAt: s.expiry });
  if (s.status === 'Closed') docs.push({ name: `ReExport_Confirmation_${s.id}.pdf`, kind: 'Re-export', size: '178 KB', uploadedBy: s.owner, uploadedAt: s.extended || s.expiry });
  DOCS_BY_ID[s.id] = docs;
});

// Activity timeline per shipment (synthetic)
export const TIMELINE_BY_ID: Record<number, TimelineEvent[]> = {};
SHIPMENTS.forEach(s => {
  const events: TimelineEvent[] = [];
  events.push({ at: s.importDate, who: s.owner, kind: 'created', text: `Shipment logged: ${s.movement} from ${s.from} to ${s.to}` });
  events.push({ at: new Date(s.importDate.getTime() + 86400000), who: s.owner, kind: 'document', text: `Bayan ${s.bayan} uploaded` });
  events.push({ at: new Date(s.importDate.getTime() + 86400000 * 3), who: 'System', kind: 'system', text: `Customs deposit recorded: SAR ${s.depositSAR.toLocaleString()}` });
  if (s.extended) {
    events.push({ at: new Date(s.expiry.getTime() - 86400000 * 25), who: s.owner, kind: 'extension', text: 'Extension request submitted to customs' });
    events.push({ at: new Date(s.expiry.getTime() - 86400000 * 7), who: 'Customs Authority', kind: 'extension', text: `Extension granted — new expiry ${fmtDate(s.extended)}` });
  }
  if (s.alert === 'overdue') {
    events.push({ at: new Date(s.expiry.getTime() + 86400000), who: 'System', kind: 'alert', text: 'CRITICAL: re-export deadline passed' });
    events.push({ at: new Date(s.expiry.getTime() + 86400000 * 2), who: 'Legal', kind: 'alert', text: 'Escalated to legal — penalty risk' });
  }
  if (s.status === 'Closed') {
    events.push({ at: s.extended || s.expiry, who: s.owner, kind: 'closed', text: 'Re-export confirmed, deposit refund initiated' });
  }
  TIMELINE_BY_ID[s.id] = events.sort((a, b) => a.at.getTime() - b.at.getTime());
});

export const ALERT_LABEL: Record<AlertLevel | string, string> = {
  ok: 'On track',
  info: 'Monitor',
  plan: 'Plan extension',
  action: 'Action required',
  urgent: 'Urgent',
  overdue: 'Overdue',
  closed: 'Closed',
};

export function sarFmt(n: number): string {
  return 'SAR ' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
export function usdFmt(n: number): string {
  return '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
