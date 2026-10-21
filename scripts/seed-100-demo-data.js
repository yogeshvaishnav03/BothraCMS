const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ORG_ID = '1eb45938-3964-41ab-8145-c8ff93c90c73';

// Helper random pickers
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysBackStart, daysBackEnd) {
  const now = new Date();
  const daysAgo = randomInt(daysBackEnd, daysBackStart);
  const d = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return d;
}

function formatDateStr(date) {
  return date.toISOString().split('T')[0];
}

async function main() {
  console.log('🚀 Starting Comprehensive 100+ Demo Data Seeder for BothraCMS...');

  // 1. Fetch Organization and Super Admin user
  const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
  if (!org) {
    throw new Error(`Organization ${ORG_ID} not found`);
  }
  console.log(`✓ Target Org: ${org.name} (${org.id})`);

  let adminUser = await prisma.user.findFirst({
    where: { organizationId: ORG_ID, role: 'SUPER_ADMIN' },
  });
  if (!adminUser) {
    adminUser = await prisma.user.findFirst({
      where: { organizationId: ORG_ID },
    });
  }
  const adminId = adminUser ? adminUser.id : 'd7e07f5e-e6d1-441f-805f-aead94dc382d';
  console.log(`✓ Admin User: ${adminUser ? adminUser.name : 'System Super Admin'} (${adminId})`);

  // 2. Ensure the Core Sites exist:
  // - Chaupasni Phase 1
  // - Riverside Enclave Phase 2
  // - Skyline Heights
  // - North Gateway Site
  const targetSites = [
    {
      code: 'CHP-01',
      name: 'Chaupasni Phase 1',
      address: 'Chaupasni Road, Near Pal Balaji, Jodhpur, Rajasthan 342008',
      latitude: 26.2734,
      longitude: 72.9812,
    },
    {
      code: 'RIV-1EB4',
      name: 'Riverside Enclave Phase 2',
      address: 'Sector 128, Expressway, Noida, Uttar Pradesh 201304',
      latitude: 28.5145,
      longitude: 77.3688,
    },
    {
      code: 'SKY-01',
      name: 'Skyline Heights',
      address: 'Golf Course Extension Road, Sector 66, Gurugram, Haryana 122002',
      latitude: 28.4021,
      longitude: 77.0624,
    },
    {
      code: 'NGS-7619',
      name: 'North Gateway Site',
      address: 'Plot 104, Industrial Corridor, Jaipur, Rajasthan 302013',
      latitude: 26.9124,
      longitude: 75.7873,
    },
  ];

  const siteMap = new Map();
  for (const s of targetSites) {
    let siteRecord = await prisma.site.findUnique({
      where: { organizationId_code: { organizationId: ORG_ID, code: s.code } },
    });
    if (!siteRecord) {
      siteRecord = await prisma.site.create({
        data: {
          organizationId: ORG_ID,
          code: s.code,
          name: s.name,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          status: 'ACTIVE',
        },
      });
      console.log(`  + Created Site: ${s.name} (${s.code})`);
    } else {
      console.log(`  ✓ Existing Site: ${s.name} (${s.code})`);
    }
    siteMap.set(s.code, siteRecord);
  }

  // 3. Ensure Stores for each Site
  const storeMap = new Map();
  const allSites = Array.from(siteMap.values());
  for (const site of allSites) {
    const defaultStores = [
      { name: `${site.name} - Central Yard & Materials Depot` },
      { name: `${site.name} - Steel & Structural Yard` },
      { name: `${site.name} - Finishing & MEP Store` },
    ];
    for (const ds of defaultStores) {
      let store = await prisma.store.findFirst({
        where: { organizationId: ORG_ID, siteId: site.id, name: ds.name },
      });
      if (!store) {
        store = await prisma.store.create({
          data: {
            organizationId: ORG_ID,
            siteId: site.id,
            name: ds.name,
            status: 'ACTIVE',
          },
        });
        console.log(`  + Created Store: ${ds.name}`);
      }
      storeMap.set(`${site.code}_${ds.name}`, store);
    }
  }

  // 4. Ensure Projects exist
  const targetProjects = [
    {
      siteCode: 'CHP-01',
      code: 'PRJ-CHP-TOW-A',
      name: 'Chaupasni Tower A & B RCC Superstructure',
      budgetAmount: 14500000000, // Rs 14.5 Cr
      status: 'IN_PROGRESS',
    },
    {
      siteCode: 'CHP-01',
      code: 'PRJ-CHP-PODIUM',
      name: 'Chaupasni Commercial Podium & Retail Arcade',
      budgetAmount: 8500000000,
      status: 'IN_PROGRESS',
    },
    {
      siteCode: 'RIV-1EB4',
      code: 'PRJ-RIV-B',
      name: 'Riverside Commercial Plaza Core & Shell',
      budgetAmount: 18000000000,
      status: 'IN_PROGRESS',
    },
    {
      siteCode: 'RIV-1EB4',
      code: 'PRJ-RIV-INT',
      name: 'Riverside Luxury Suites Interior Fit-out',
      budgetAmount: 6200000000,
      status: 'IN_PROGRESS',
    },
    {
      siteCode: 'SKY-01',
      code: 'PRJ-SKY-TW1',
      name: 'Skyline Heights Tower 1 Finishing & Façade',
      budgetAmount: 22000000000,
      status: 'IN_PROGRESS',
    },
    {
      siteCode: 'SKY-01',
      code: 'PRJ-SKY-MEP',
      name: 'Skyline Heights Central HVAC & Substation MEP',
      budgetAmount: 9500000000,
      status: 'IN_PROGRESS',
    },
    {
      siteCode: 'NGS-7619',
      code: 'PRJ-7933',
      name: 'Gateway Highrise Project Phase 1',
      budgetAmount: 11000000000,
      status: 'IN_PROGRESS',
    },
  ];

  const projectMap = new Map();
  for (const p of targetProjects) {
    const site = siteMap.get(p.siteCode);
    let proj = await prisma.project.findUnique({
      where: { organizationId_code: { organizationId: ORG_ID, code: p.code } },
    });
    if (!proj) {
      proj = await prisma.project.create({
        data: {
          organizationId: ORG_ID,
          siteId: site.id,
          code: p.code,
          name: p.name,
          managerUserId: adminId,
          status: p.status,
          budgetAmount: p.budgetAmount,
          startDate: new Date('2025-04-01'),
          endDate: new Date('2027-03-31'),
        },
      });
      console.log(`  + Created Project: ${p.name} (${p.code})`);
    } else {
      console.log(`  ✓ Existing Project: ${p.name} (${p.code})`);
    }
    projectMap.set(p.code, proj);
  }

  const allProjects = Array.from(projectMap.values());
  const allStores = Array.from(storeMap.values());

  // 5. Ensure Material Categories exist
  const categoryNames = [
    'Cement & Binding Materials',
    'Steel & Structural Metals',
    'Aggregates, Sand & Stone',
    'Masonry, Bricks & AAC Blocks',
    'Plumbing, Sanitary & Drainage',
    'Electrical, Lighting & Cables',
    'Tiles, Marble & Granite Stone',
    'Waterproofing & Construction Chemicals',
    'Paints, Primers & Wall Finishes',
    'Woodwork, Doors & Hardware Fittings',
    'HVAC, Ducting & Ventilation',
    'Safety Gear & Site PPE Equipment',
    'Formwork, Shuttering & Scaffolding',
  ];

  const categoryMap = new Map();
  for (const catName of categoryNames) {
    let cat = await prisma.materialCategory.findUnique({
      where: { organizationId_name: { organizationId: ORG_ID, name: catName } },
    });
    if (!cat) {
      cat = await prisma.materialCategory.create({
        data: { organizationId: ORG_ID, name: catName },
      });
    }
    categoryMap.set(catName, cat);
  }
  console.log(`✓ Initialized ${categoryMap.size} Material Categories.`);

  // -------------------------------------------------------------
  // MODULE 1: PARTIES (Vendors & Contractors) - TARGET: 105+
  // -------------------------------------------------------------
  console.log('\n--- Seeding Vendors & Contractors (Parties) ---');
  const currentPartiesCount = await prisma.party.count({ where: { organizationId: ORG_ID } });
  console.log(`Current Parties count: ${currentPartiesCount}`);

  const vendorTemplates = [
    { name: 'UltraTech Cement ReadyMix Division', type: 'VENDOR', phone: '+91 98201 11001', pan: 'AAACU1234F', gstin: '07AAACU1234F1Z1', city: 'Noida', val: 12500000 },
    { name: 'Tata Steel Tubes & Rebars Depot', type: 'VENDOR', phone: '+91 98201 11002', pan: 'AAACT2345G', gstin: '07AAACT2345G1Z2', city: 'Delhi', val: 34000000 },
    { name: 'JSW Steel Structural Products', type: 'VENDOR', phone: '+91 98201 11003', pan: 'AAACJ3456H', gstin: '07AAACJ3456H1Z3', city: 'Gurugram', val: 28000000 },
    { name: 'Shree Cement North Depot', type: 'VENDOR', phone: '+91 98201 11004', pan: 'AAACS4567J', gstin: '08AAACS4567J1Z4', city: 'Jaipur', val: 9500000 },
    { name: 'Ambuja Cements Commercial Sales', type: 'VENDOR', phone: '+91 98201 11005', pan: 'AAACA5678K', gstin: '08AAACA5678K1Z5', city: 'Jodhpur', val: 11000000 },
    { name: 'Kajaria Ceramics Vitrified Hub', type: 'VENDOR', phone: '+91 98201 11006', pan: 'AAACK6789L', gstin: '07AAACK6789L1Z6', city: 'Noida', val: 7800000 },
    { name: 'Somany Ceramics Projects Division', type: 'VENDOR', phone: '+91 98201 11007', pan: 'AAACS7890M', gstin: '07AAACS7890M1Z7', city: 'Delhi', val: 6500000 },
    { name: 'Astral Pipes & Drainage Solutions', type: 'VENDOR', phone: '+91 98201 11008', pan: 'AAACA8901N', gstin: '24AAACA8901N1Z8', city: 'Ahmedabad', val: 4200000 },
    { name: 'Supreme Industries CPVC Supplies', type: 'VENDOR', phone: '+91 98201 11009', pan: 'AAACS9012P', gstin: '27AAACS9012P1Z9', city: 'Mumbai', val: 5100000 },
    { name: 'Finolex Cables & Wires Agency', type: 'VENDOR', phone: '+91 98201 11010', pan: 'AAACF0123Q', gstin: '27AAACF0123Q1ZA', city: 'Pune', val: 8900000 },
    { name: 'Havells Electrical Switchgear Pro', type: 'VENDOR', phone: '+91 98201 11011', pan: 'AAACH1234R', gstin: '07AAACH1234R1ZB', city: 'Noida', val: 14500000 },
    { name: 'Schneider Electric Power Systems', type: 'VENDOR', phone: '+91 98201 11012', pan: 'AAACS2345S', gstin: '07AAACS2345S1ZC', city: 'Gurugram', val: 19800000 },
    { name: 'Asian Paints Apex Commercial Group', type: 'VENDOR', phone: '+91 98201 11013', pan: 'AAACA3456T', gstin: '27AAACA3456T1ZD', city: 'Mumbai', val: 6200000 },
    { name: 'Berger Paints Protective Coatings', type: 'VENDOR', phone: '+91 98201 11014', pan: 'AAACB4567U', gstin: '19AAACB4567U1ZE', city: 'Kolkata', val: 4800000 },
    { name: 'Pidilite Industries Dr. Fixit Tech', type: 'VENDOR', phone: '+91 98201 11015', pan: 'AAACP5678V', gstin: '27AAACP5678V1ZF', city: 'Mumbai', val: 5600000 },
    { name: 'Fosroc Chemicals Construction Wing', type: 'VENDOR', phone: '+91 98201 11016', pan: 'AAACF6789W', gstin: '29AAACF6789W1ZG', city: 'Bengaluru', val: 7100000 },
    { name: 'Saint-Gobain Architectural Glass', type: 'VENDOR', phone: '+91 98201 11017', pan: 'AAACS7890X', gstin: '33AAACS7890X1ZH', city: 'Chennai', val: 16000000 },
    { name: 'Godrej Locks & Architectural Hardware', type: 'VENDOR', phone: '+91 98201 11018', pan: 'AAACG8901Y', gstin: '27AAACG8901Y1ZJ', city: 'Mumbai', val: 3900000 },
    { name: 'Greenlam Laminates & Veneers Ltd', type: 'VENDOR', phone: '+91 98201 11019', pan: 'AAACG9012Z', gstin: '07AAACG9012Z1ZK', city: 'Delhi', val: 4400000 },
    { name: 'Century Plyboards Film-Faced Shuttering', type: 'VENDOR', phone: '+91 98201 11020', pan: 'AAACC0123A', gstin: '19AAACC0123A1ZL', city: 'Kolkata', val: 5800000 },
    { name: 'Voltas Chillers & VRV Air-Conditioning', type: 'VENDOR', phone: '+91 98201 11021', pan: 'AAACV1234B', gstin: '27AAACV1234B1ZM', city: 'Mumbai', val: 21500000 },
    { name: 'Blue Star Commercial Cooling Div', type: 'VENDOR', phone: '+91 98201 11022', pan: 'AAACB2345C', gstin: '27AAACB2345C1ZN', city: 'Mumbai', val: 18200000 },
    { name: 'Kone Elevators India Projects', type: 'VENDOR', phone: '+91 98201 11023', pan: 'AAACK3456D', gstin: '33AAACK3456D1ZP', city: 'Chennai', val: 38000000 },
    { name: 'Schindler India Vertical Mobility', type: 'VENDOR', phone: '+91 98201 11024', pan: 'AAACS4567E', gstin: '27AAACS4567E1ZQ', city: 'Pune', val: 35000000 },
    { name: 'Jaquar & Company Sanitaryware Projects', type: 'VENDOR', phone: '+91 98201 11025', pan: 'AAACJ5678F', gstin: '06AAACJ5678F1ZR', city: 'Manesar', val: 8400000 },
    { name: 'Kohler India Kitchen & Bath Div', type: 'VENDOR', phone: '+91 98201 11026', pan: 'AAACK6789G', gstin: '07AAACK6789G1ZS', city: 'Gurugram', val: 9200000 },
    { name: 'Karam Safety Solutions India', type: 'VENDOR', phone: '+91 98201 11027', pan: 'AAACK7890H', gstin: '09AAACK7890H1ZT', city: 'Lucknow', val: 1800000 },
    { name: '3M India PPE & Safety Systems', type: 'VENDOR', phone: '+91 98201 11028', pan: 'AAACT8901J', gstin: '29AAACT8901J1ZU', city: 'Bengaluru', val: 2200000 },
    { name: 'Siporex AAC Lightweight Blocks', type: 'VENDOR', phone: '+91 98201 11029', pan: 'AAACS9012K', gstin: '27AAACS9012K1ZV', city: 'Pune', val: 4600000 },
    { name: 'Magicrete Building Solutions AAC Blocks', type: 'VENDOR', phone: '+91 98201 11030', pan: 'AAACM0123L', gstin: '24AAACM0123L1ZW', city: 'Surat', val: 5200000 },
  ];

  const contractorTemplates = [
    { name: 'Rajputana Earthmovers & Excavations', type: 'CONTRACTOR', phone: '+91 98201 22001', pan: 'AABPR1234A', city: 'Jodhpur', val: 8500000 },
    { name: 'Marwar Structural RCC Contractors', type: 'CONTRACTOR', phone: '+91 98201 22002', pan: 'AABPM2345B', city: 'Jodhpur', val: 45000000 },
    { name: 'Thar Steel Bar Benders Guild', type: 'CONTRACTOR', phone: '+91 98201 22003', pan: 'AABPT3456C', city: 'Jodhpur', val: 12000000 },
    { name: 'Noida Shuttering & Scaffolding Works', type: 'CONTRACTOR', phone: '+91 98201 22004', pan: 'AABPN4567D', city: 'Noida', val: 18500000 },
    { name: 'Expressway Concreting Gangs Ltd', type: 'CONTRACTOR', phone: '+91 98201 22005', pan: 'AABPE5678E', city: 'Greater Noida', val: 24000000 },
    { name: 'Gurugram MEP & Electrical Engineers', type: 'CONTRACTOR', phone: '+91 98201 22006', pan: 'AABPG6789F', city: 'Gurugram', val: 32000000 },
    { name: 'Apex Firefighting & Piping Contractors', type: 'CONTRACTOR', phone: '+91 98201 22007', pan: 'AABPA7890G', city: 'Delhi', val: 16500000 },
    { name: 'Jaipur Heritage Stone & Masonry Gang', type: 'CONTRACTOR', phone: '+91 98201 22008', pan: 'AABPJ8901H', city: 'Jaipur', val: 14000000 },
    { name: 'National Waterproofing Applicators', type: 'CONTRACTOR', phone: '+91 98201 22009', pan: 'AABPN9012J', city: 'Delhi', val: 9800000 },
    { name: 'Shree Krishna Tiles & Marble Polishers', type: 'CONTRACTOR', phone: '+91 98201 22010', pan: 'AABPS0123K', city: 'Jaipur', val: 8200000 },
    { name: 'Ganga HVAC Ducting Fabricators', type: 'CONTRACTOR', phone: '+91 98201 22011', pan: 'AABPG1234L', city: 'Ghaziabad', val: 11500000 },
    { name: 'Modern Façade Glazing Installers', type: 'CONTRACTOR', phone: '+91 98201 22012', pan: 'AABPM2345M', city: 'Noida', val: 26000000 },
    { name: 'Royal Woodwork & Carpenter Contractors', type: 'CONTRACTOR', phone: '+91 98201 22013', pan: 'AABPR3456N', city: 'Faridabad', val: 7900000 },
    { name: 'Universal Painters & Texture Finishing', type: 'CONTRACTOR', phone: '+91 98201 22014', pan: 'AABPU4567P', city: 'Delhi', val: 6800000 },
    { name: 'Bhakti Crane & Heavy Lifting Services', type: 'CONTRACTOR', phone: '+91 98201 22015', pan: 'AABPB5678Q', city: 'Jodhpur', val: 5500000 },
    { name: 'Diamond Core Cutting & Sawing Services', type: 'CONTRACTOR', phone: '+91 98201 22016', pan: 'AABPD6789R', city: 'Gurugram', val: 3200000 },
    { name: 'Pioneer Soil Compaction & Piling Co', type: 'CONTRACTOR', phone: '+91 98201 22017', pan: 'AABPP7890S', city: 'Noida', val: 28000000 },
    { name: 'Everest Plumbing & Sanitary Contractors', type: 'CONTRACTOR', phone: '+91 98201 22018', pan: 'AABPE8901T', city: 'Delhi', val: 12500000 },
    { name: 'High-Tech Elevators Installation Team', type: 'CONTRACTOR', phone: '+91 98201 22019', pan: 'AABPH9012U', city: 'Noida', val: 15000000 },
    { name: 'Suraksha Security & Site Marshalls', type: 'CONTRACTOR', phone: '+91 98201 22020', pan: 'AABPS0123V', city: 'Gurugram', val: 4200000 },
  ];

  const cityDistricts = ['Jodhpur', 'Noida', 'Gurugram', 'Jaipur', 'Delhi', 'Faridabad', 'Ghaziabad', 'Alwar', 'Ajmer', 'Bikaner'];
  const trades = ['Fabrication Works', 'Civil Infrastructures', 'RMC Solutions', 'Electricals', 'Plumbing Corp', 'Building Materials', 'Equipments', 'Engineers'];

  const partiesToCreate = [];
  // Add predefined vendors
  for (const v of vendorTemplates) {
    partiesToCreate.push({
      name: v.name,
      partyType: v.type,
      phone: v.phone,
      email: `${v.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@vendorhub.in`,
      address: `Plot ${randomInt(10, 500)}, Industrial Area, ${v.city}`,
      taxIdentifier: v.gstin || `07${v.pan}1Z1`,
      notes: `Approved Category-A Material Supplier. Quality audited.`,
      contractValue: v.val,
    });
  }
  // Add predefined contractors
  for (const c of contractorTemplates) {
    partiesToCreate.push({
      name: c.name,
      partyType: c.type,
      phone: c.phone,
      email: `${c.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@buildcontract.in`,
      address: `Sector ${randomInt(12, 110)}, Commercial Complex, ${c.city}`,
      taxIdentifier: `07${c.pan}1Z3`,
      notes: `Specialized labor and subcontracting agency with trained site workforce.`,
      contractValue: c.val,
    });
  }

  // Generate additional unique parties to guarantee over 110 entries
  let genIndex = 1;
  while (partiesToCreate.length < 115) {
    const city = pick(cityDistricts);
    const trade = pick(trades);
    const isVendor = genIndex % 2 === 0;
    const name = `${city} ${trade} Agency #${genIndex}`;
    partiesToCreate.push({
      name,
      partyType: isVendor ? 'VENDOR' : 'CONTRACTOR',
      phone: `+91 98201 ${String(30000 + genIndex).slice(0, 5)}`,
      email: `contact@agency${genIndex}.buildtrack.pro`,
      address: `Shop ${randomInt(1, 40)}, Phase ${randomInt(1, 4)}, Industrial Estate, ${city}`,
      taxIdentifier: `08AABPC${String(1000 + genIndex)}1Z${genIndex % 9}`,
      notes: `Verified local site partner for ${trade}.`,
      contractValue: randomInt(15, 120) * 100000,
    });
    genIndex++;
  }

  // Insert parties
  for (const p of partiesToCreate) {
    const existing = await prisma.party.findFirst({
      where: { organizationId: ORG_ID, name: p.name },
    });
    if (!existing) {
      await prisma.party.create({
        data: {
          organizationId: ORG_ID,
          name: p.name,
          partyType: p.partyType,
          phone: p.phone,
          email: p.email,
          address: p.address,
          taxIdentifier: p.taxIdentifier,
          notes: p.notes,
          contractValue: p.contractValue,
          active: true,
        },
      });
    }
  }

  const allParties = await prisma.party.findMany({ where: { organizationId: ORG_ID } });
  console.log(`✓ Parties (Vendors & Contractors) total in DB: ${allParties.length}`);

  // -------------------------------------------------------------
  // MODULE 2: MATERIALS & STOCK - TARGET: 110+ Materials, 120+ Movements
  // -------------------------------------------------------------
  console.log('\n--- Seeding Materials & Stock Movements ---');

  const materialSpecs = [
    // Cement
    { name: 'UltraTech OPC 53 Grade High Performance Cement (50kg)', cat: 'Cement & Binding Materials', unit: 'BAG', min: 200, reorder: 500, rate: 385 },
    { name: 'Ambuja PPC Weatherproof Cement (50kg)', cat: 'Cement & Binding Materials', unit: 'BAG', min: 200, reorder: 400, rate: 365 },
    { name: 'Shree Ultra Jung Rodhak Cement (50kg)', cat: 'Cement & Binding Materials', unit: 'BAG', min: 150, reorder: 300, rate: 345 },
    { name: 'JK White Cement Superior Finish (50kg)', cat: 'Cement & Binding Materials', unit: 'BAG', min: 50, reorder: 100, rate: 820 },
    { name: 'Micro-Silica Fly Ash Grade 1 for RMC High-Strength Mix', cat: 'Cement & Binding Materials', unit: 'BAG', min: 80, reorder: 200, rate: 290 },
    // Steel
    { name: 'Tata Tiscon 8mm Fe550D High Yield TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 10, reorder: 25, rate: 64500 },
    { name: 'Tata Tiscon 10mm Fe550D High Yield TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 12, reorder: 30, rate: 63800 },
    { name: 'Tata Tiscon 12mm Fe550D High Yield TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 15, reorder: 35, rate: 62500 },
    { name: 'Tata Tiscon 16mm Fe550D High Yield TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 15, reorder: 40, rate: 61900 },
    { name: 'Tata Tiscon 20mm Fe550D Heavy Column TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 10, reorder: 30, rate: 62100 },
    { name: 'Tata Tiscon 25mm Fe550D Foundation Pile TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 10, reorder: 25, rate: 62400 },
    { name: 'Tata Tiscon 32mm Fe550D Heavy Raft TMT Rebars', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 8, reorder: 20, rate: 63000 },
    { name: 'JSW Neosteel Structural MS Angles 50x50x6mm', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 5, reorder: 15, rate: 66000 },
    { name: 'JSW Structural MS Channels ISMC 150x75mm', cat: 'Steel & Structural Metals', unit: 'TONNE', min: 5, reorder: 15, rate: 67200 },
    { name: 'Annealed Mild Steel Binding Wire 18-Gauge', cat: 'Steel & Structural Metals', unit: 'KG', min: 500, reorder: 1500, rate: 76 },
    // Aggregates & Stone
    { name: 'Graded Crushed Blue Metal Aggregate 20mm Nominal', cat: 'Aggregates, Sand & Stone', unit: 'TONNE', min: 40, reorder: 100, rate: 880 },
    { name: 'Graded Crushed Blue Metal Aggregate 10mm Fine', cat: 'Aggregates, Sand & Stone', unit: 'TONNE', min: 30, reorder: 80, rate: 920 },
    { name: 'Stone Grit / Quarry Screenings 6mm Bedding', cat: 'Aggregates, Sand & Stone', unit: 'TONNE', min: 20, reorder: 50, rate: 650 },
    { name: 'Coarse River Sand / M-Sand Zone-II for Concreting', cat: 'Aggregates, Sand & Stone', unit: 'TONNE', min: 50, reorder: 120, rate: 1250 },
    { name: 'Plastering Sand Zone-IV Washed Superfine', cat: 'Aggregates, Sand & Stone', unit: 'TONNE', min: 30, reorder: 70, rate: 1350 },
    // Bricks & Blocks
    { name: 'Standard Red Clay Kiln Bricks Class-1 (9x4.25x2.75 inch)', cat: 'Masonry, Bricks & AAC Blocks', unit: 'PIECE', min: 5000, reorder: 15000, rate: 8.5 },
    { name: 'Siporex AAC Lightweight Blocks 600x200x150mm', cat: 'Masonry, Bricks & AAC Blocks', unit: 'PIECE', min: 800, reorder: 2500, rate: 74 },
    { name: 'Siporex AAC Lightweight Blocks 600x200x100mm', cat: 'Masonry, Bricks & AAC Blocks', unit: 'PIECE', min: 800, reorder: 2500, rate: 58 },
    { name: 'Magicrete AAC Thin-Bed Jointing Mortar (40kg)', cat: 'Masonry, Bricks & AAC Blocks', unit: 'BAG', min: 60, reorder: 180, rate: 420 },
    { name: 'Solid Concrete Load Bearing Blocks 400x200x200mm', cat: 'Masonry, Bricks & AAC Blocks', unit: 'PIECE', min: 500, reorder: 1500, rate: 48 },
    // Plumbing
    { name: 'Astral CPVC Pro Pipe Class-1 1-inch (3m Length)', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 80, reorder: 200, rate: 410 },
    { name: 'Astral CPVC Pro Pipe Class-1 0.75-inch (3m Length)', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 100, reorder: 300, rate: 290 },
    { name: 'Astral CPVC Pro Pipe Class-1 0.5-inch (3m Length)', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 100, reorder: 300, rate: 210 },
    { name: 'Supreme PVC SWR Soil & Waste Pipe 110mm Type B (3m)', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 40, reorder: 120, rate: 640 },
    { name: 'Supreme PVC SWR Rainwater Pipe 75mm Type A (3m)', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 40, reorder: 100, rate: 420 },
    { name: 'Brass Heavy Duty Concealed Stop Cock 15mm ISI', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 50, reorder: 150, rate: 650 },
    { name: 'Jaquar Single Lever Basin Mixer Spout Chrome', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 20, reorder: 60, rate: 2850 },
    { name: 'Jaquar Wall Hung Water Closet Rimless Ceramic', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 15, reorder: 40, rate: 5900 },
    { name: 'Supreme Overhead Polyethylene Water Tank 1000L Triple Layer', cat: 'Plumbing, Sanitary & Drainage', unit: 'PIECE', min: 4, reorder: 10, rate: 6200 },
    // Electrical
    { name: 'Finolex FRLS Industrial Copper Wire 1.5 sq mm (90m Coil)', cat: 'Electrical, Lighting & Cables', unit: 'BOX', min: 30, reorder: 80, rate: 1650 },
    { name: 'Finolex FRLS Industrial Copper Wire 2.5 sq mm (90m Coil)', cat: 'Electrical, Lighting & Cables', unit: 'BOX', min: 30, reorder: 80, rate: 2580 },
    { name: 'Finolex FRLS Industrial Copper Wire 4.0 sq mm (90m Coil)', cat: 'Electrical, Lighting & Cables', unit: 'BOX', min: 20, reorder: 50, rate: 3950 },
    { name: 'Polycab 4-Core Armoured Submersible Cable 10 sq mm', cat: 'Electrical, Lighting & Cables', unit: 'METER', min: 100, reorder: 300, rate: 285 },
    { name: 'Precision Rigid Heavy Gauge PVC Conduit 25mm (3m)', cat: 'Electrical, Lighting & Cables', unit: 'PIECE', min: 150, reorder: 450, rate: 95 },
    { name: 'Schneider Acti9 32A Triple Pole C-Curve MCB', cat: 'Electrical, Lighting & Cables', unit: 'PIECE', min: 25, reorder: 60, rate: 890 },
    { name: 'Schneider Acti9 63A 4-Pole 30mA RCCB Residual Breaker', cat: 'Electrical, Lighting & Cables', unit: 'PIECE', min: 15, reorder: 40, rate: 2450 },
    { name: 'Havells Fabio 16A 3-Pin Modular Switch & Socket Combination', cat: 'Electrical, Lighting & Cables', unit: 'PIECE', min: 80, reorder: 250, rate: 265 },
    { name: 'Philips 36W Recessed LED Panel Light 2x2 Cleanroom', cat: 'Electrical, Lighting & Cables', unit: 'PIECE', min: 30, reorder: 100, rate: 1450 },
    // Tiles & Marble
    { name: 'Kajaria Double Charge Vitrified Floor Tiles 600x600mm Statuario', cat: 'Tiles, Marble & Granite Stone', unit: 'BOX', min: 60, reorder: 180, rate: 1150 },
    { name: 'Kajaria Glazed Polished Vitrified 800x1600mm Onyx Crema', cat: 'Tiles, Marble & Granite Stone', unit: 'BOX', min: 40, reorder: 120, rate: 2200 },
    { name: 'Somany Anti-Skid Ceramic Bathroom Floor Tiles 300x300mm Grey', cat: 'Tiles, Marble & Granite Stone', unit: 'BOX', min: 50, reorder: 150, rate: 480 },
    { name: 'Somany Glossy Digital Ceramic Wall Tiles 300x600mm Floral White', cat: 'Tiles, Marble & Granite Stone', unit: 'BOX', min: 50, reorder: 150, rate: 560 },
    { name: 'Black Galaxy Polished Granite Slab 18mm Pre-Cut Step Riser', cat: 'Tiles, Marble & Granite Stone', unit: 'PIECE', min: 25, reorder: 70, rate: 1850 },
    { name: 'Roff New Construction Tile Adhesive T01 Power Matix (20kg)', cat: 'Tiles, Marble & Granite Stone', unit: 'BAG', min: 50, reorder: 150, rate: 380 },
    { name: 'Laticrete Epoxy Tile Grout Stainfree SP-100 (5kg Kit)', cat: 'Tiles, Marble & Granite Stone', unit: 'BOX', min: 20, reorder: 60, rate: 1450 },
    // Waterproofing
    { name: 'Dr. Fixit 101 LW+ Integral Waterproofing Admixture (20L Drum)', cat: 'Waterproofing & Construction Chemicals', unit: 'LITRE', min: 10, reorder: 25, rate: 165 },
    { name: 'Dr. Fixit Fastflex Dual-Component Acrylic Polymer Membrane (48kg Kit)', cat: 'Waterproofing & Construction Chemicals', unit: 'BOX', min: 15, reorder: 40, rate: 4200 },
    { name: 'Fosroc Conbextra GP Non-Shrink Precision Grout (25kg)', cat: 'Waterproofing & Construction Chemicals', unit: 'BAG', min: 30, reorder: 80, rate: 720 },
    { name: 'SikaTop Seal-107 Elastic Waterproofing Slurry (25kg Pack)', cat: 'Waterproofing & Construction Chemicals', unit: 'BAG', min: 20, reorder: 50, rate: 1850 },
    { name: 'Polyurethane Joint Sealant 600ml Sausage High Elasticity', cat: 'Waterproofing & Construction Chemicals', unit: 'PIECE', min: 50, reorder: 150, rate: 490 },
    // Paints
    { name: 'Asian Paints Apex Ultima All Weather Exterior Emulsion (20L Drum)', cat: 'Paints, Primers & Wall Finishes', unit: 'LITRE', min: 15, reorder: 40, rate: 340 },
    { name: 'Asian Paints Royale Luxury Interior Acrylic Emulsion (20L Drum)', cat: 'Paints, Primers & Wall Finishes', unit: 'LITRE', min: 15, reorder: 40, rate: 390 },
    { name: 'Asian Paints TruCare Exterior Wall Primer Sealer (20L Drum)', cat: 'Paints, Primers & Wall Finishes', unit: 'LITRE', min: 20, reorder: 50, rate: 175 },
    { name: 'Birla White Wall Care Polymer Putty (40kg Bag)', cat: 'Paints, Primers & Wall Finishes', unit: 'BAG', min: 80, reorder: 250, rate: 780 },
    { name: 'Asian Paints Rust Shield Red Oxide Metal Primer (20L)', cat: 'Paints, Primers & Wall Finishes', unit: 'LITRE', min: 5, reorder: 15, rate: 210 },
    // Woodwork & Hardware
    { name: 'Solid Core Commercial Flush Door Shutter 35mm BWP (7ft x 3ft)', cat: 'Woodwork, Doors & Hardware Fittings', unit: 'PIECE', min: 25, reorder: 80, rate: 2600 },
    { name: 'Greenlam High Pressure Decorative Laminate 1.0mm Teak Finish', cat: 'Woodwork, Doors & Hardware Fittings', unit: 'PIECE', min: 30, reorder: 90, rate: 1650 },
    { name: 'Godrej Mortise Lock Double Action Brass Plated 6-Lever', cat: 'Woodwork, Doors & Hardware Fittings', unit: 'PIECE', min: 25, reorder: 80, rate: 1450 },
    { name: 'Stainless Steel SS304 Heavy Duty Ball Bearing Hinges 5x3x3mm', cat: 'Woodwork, Doors & Hardware Fittings', unit: 'PIECE', min: 100, reorder: 300, rate: 180 },
    { name: 'Dorma TS 68 Overhead Hydraulic Door Closer Silver Finish', cat: 'Woodwork, Doors & Hardware Fittings', unit: 'PIECE', min: 20, reorder: 50, rate: 2150 },
    // Safety Gear
    { name: 'Karam ISI Marked High Impact Industrial Safety Helmet (Yellow)', cat: 'Safety Gear & Site PPE Equipment', unit: 'PIECE', min: 100, reorder: 300, rate: 195 },
    { name: 'Karam ISI Full Body Fall Arrest Harness with Twin Scaffolding Lanyard', cat: 'Safety Gear & Site PPE Equipment', unit: 'PIECE', min: 20, reorder: 60, rate: 1850 },
    { name: 'High Visibility Fluorescent Orange Reflective Safety Jacket Class 2', cat: 'Safety Gear & Site PPE Equipment', unit: 'PIECE', min: 100, reorder: 300, rate: 145 },
    { name: 'Steel Toe Cap Heavy Duty Construction Safety Shoes IS:15298', cat: 'Safety Gear & Site PPE Equipment', unit: 'PIECE', min: 40, reorder: 120, rate: 890 },
    { name: 'Cotton Knitted Rubber Palm Coated Work Hand Gloves (Pair)', cat: 'Safety Gear & Site PPE Equipment', unit: 'PIECE', min: 200, reorder: 600, rate: 35 },
    // Shuttering & Scaffolding
    { name: 'Century Film-Faced Shuttering Plywood 12mm 34kg Heavy Duty (8x4 ft)', cat: 'Formwork, Shuttering & Scaffolding', unit: 'PIECE', min: 80, reorder: 250, rate: 1950 },
    { name: 'Scaffolding Mild Steel Pipes 48.3mm OD 3.2mm Wall (3m Length)', cat: 'Formwork, Shuttering & Scaffolding', unit: 'PIECE', min: 150, reorder: 400, rate: 1100 },
    { name: 'Scaffolding Drop Forged Swivel Couplers Heavy Duty BS:1139', cat: 'Formwork, Shuttering & Scaffolding', unit: 'PIECE', min: 300, reorder: 800, rate: 145 },
    { name: 'Adjustable Telescopic MS Shuttering Props 2m to 3.5m Extension', cat: 'Formwork, Shuttering & Scaffolding', unit: 'PIECE', min: 100, reorder: 300, rate: 1250 },
    { name: 'MS Acrow Span Shuttering Beams 2.5m x 4.0m Heavy Load', cat: 'Formwork, Shuttering & Scaffolding', unit: 'PIECE', min: 50, reorder: 150, rate: 2400 },
  ];

  // Generate more materials to exceed 115 materials
  let extraMatIdx = 1;
  const unitList = ['BAG', 'KG', 'TONNE', 'LITRE', 'METER', 'PIECE', 'BOX'];
  while (materialSpecs.length < 118) {
    const cat = pick(categoryNames);
    const unit = pick(unitList);
    materialSpecs.push({
      name: `${cat.split(' ')[0]} Site Specification Item #${extraMatIdx} (Grade A)`,
      cat,
      unit,
      min: randomInt(20, 100),
      reorder: randomInt(100, 400),
      rate: randomInt(100, 2500),
    });
    extraMatIdx++;
  }

  const materialsInDb = [];
  let skuCounter = 100;
  for (const m of materialSpecs) {
    skuCounter++;
    const sku = `MAT-${skuCounter}`;
    const category = categoryMap.get(m.cat);
    let mat = await prisma.material.findUnique({
      where: { organizationId_sku: { organizationId: ORG_ID, sku } },
    });
    if (!mat) {
      mat = await prisma.material.create({
        data: {
          organizationId: ORG_ID,
          categoryId: category ? category.id : null,
          sku,
          name: m.name,
          unitCode: m.unit,
          minStockQty: m.min,
          reorderQty: m.reorder,
          active: true,
        },
      });
    }
    materialsInDb.push({ ...mat, unitRate: m.rate });
  }

  const allMaterials = await prisma.material.findMany({ where: { organizationId: ORG_ID } });
  console.log(`✓ Materials total in DB: ${allMaterials.length}`);

  // Seed 125+ Stock Movements
  console.log('  Seeding 125+ Stock Movements...');
  const currentMovements = await prisma.stockMovement.count({ where: { organizationId: ORG_ID } });
  const movementsNeeded = Math.max(125 - currentMovements, 0);

  const movementTypes = ['RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT'];
  const vendors = allParties.filter(p => p.partyType === 'VENDOR' || p.partyType === 'BOTH');

  for (let i = 0; i < movementsNeeded; i++) {
    const mat = pick(materialsInDb);
    const store = pick(allStores);
    const proj = pick(allProjects);
    const mType = i % 4 === 0 ? 'ISSUE' : (i % 7 === 0 ? 'TRANSFER_IN' : 'RECEIPT');
    const isOut = mType === 'ISSUE' || mType === 'TRANSFER_OUT';
    const qty = randomInt(5, 120);
    const delta = isOut ? -qty : qty;
    const vendor = vendors.length > 0 ? pick(vendors) : null;
    const date = randomDate(45, 1);

    await prisma.stockMovement.create({
      data: {
        organizationId: ORG_ID,
        materialId: mat.id,
        storeId: store.id,
        movementType: mType,
        quantityDelta: delta,
        unitCode: mat.unitCode,
        unitRate: mat.unitRate || randomInt(200, 1500),
        movementAt: date,
        vendorPartyId: isOut ? null : (vendor ? vendor.id : null),
        projectId: proj.id,
        referenceDoc: mType === 'RECEIPT' ? `GRN-2026-${1000 + i}` : (mType === 'ISSUE' ? `MRN-ISSUE-${2000 + i}` : `TRF-${3000 + i}`),
        notes: `${mType} of ${qty} ${mat.unitCode} for ${proj.name} at ${store.name}`,
        createdBy: adminId,
        createdAt: date,
      },
    });

    // Also update or create stock balance for store & material
    const balance = await prisma.stockBalance.findUnique({
      where: {
        materialId_storeId: {
          materialId: mat.id,
          storeId: store.id,
        },
      },
    });
    if (balance) {
      await prisma.stockBalance.update({
        where: { id: balance.id },
        data: { quantityOnHand: Math.max(0, balance.quantityOnHand + delta) },
      });
    } else {
      await prisma.stockBalance.create({
        data: {
          storeId: store.id,
          materialId: mat.id,
          quantityOnHand: Math.max(0, delta),
        },
      });
    }
  }

  const allMovements = await prisma.stockMovement.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Stock Movements total in DB: ${allMovements}`);

  // -------------------------------------------------------------
  // MODULE 3: TASKS & WORK - TARGET: 115+
  // -------------------------------------------------------------
  console.log('\n--- Seeding Tasks & Work ---');

  const taskTitles = [
    'Level 4 Raft Reinforcement Checking & Cover Block Spacers Verification',
    'Pouring M35 Grade Self-Compacting RMC for Shear Wall SW-3 & Column C-12',
    'De-shuttering and Curing of 3rd Floor Slab Beam B4 & Soffit Inspection',
    'Laying 25mm Heavy Duty PVC Conduits for Electrical Distribution Board #4',
    'Hydrostatic Pressure Testing of Main 4-inch Firefighting Riser Line at 10 Bar',
    'Installation of Fire Rated Flush Doors on Level 2 Service Corridor',
    'Internal Gypsum Plastering in Flat 402 & 403 Living Area and Kitchen',
    'External Double Coat Sand-Faced Plaster on East Elevation Grid Line 8-12',
    'Granite Cladding on Main Entrance Foyer Pillars & Portico Coping',
    'Laying 600x600 Vitrified Flooring Tiles in Flat 301 Master Bedroom',
    'Waterproofing Application on Podium Deck using Polyurethane Coating',
    'Cube Testing for 7-Day Compressive Strength of Column Batch #14 (Lab Report)',
    'Installation of Copper Refrigerant Piping for VRV HVAC Units Level 5',
    'Fixing Toughened Glass Railings on Tower A Balconies & Verandas',
    'Final Touchup Painting with Apex Ultima Weatherproof Emulsion Wing B',
    'Bar Bending & Binding for Footing F-08 & F-09 as per Structural Drawing S-104',
    'Installation of Earthing Pit & Copper Bus Bar in Main Substation Room',
    'Boundary Wall Brickwork & Coping Concrete Pouring along North Boundary',
    'Fixing SS304 Sink & Sanitary Fixtures in Kitchen Units Cluster 2',
    'Stormwater Drain Excavation & Precast Hume Pipe Laying at Entrance Ramp',
    'Erection of Cuplock Scaffolding for Tower A External Glazing Façade',
    'Basement 1 Retaining Wall Waterproofing with Bentonite Geosynthetic Sheet',
    'Soil Compaction Testing for Road Sub-base using Core Cutter Method',
    'Fixing Concealed Diverter Valves for Bathrooms in Tower B 6th Floor',
    'Main Electrical LT Panel Cable Termination and Megger Insulation Test',
    'Installation of 8-Passenger Kone Elevator Guiding Rails & Counterweights',
    'Thermal Insulation of HVAC Chilled Water Supply and Return Pipes',
    'Applying Epoxy Primer on Basement Parking Floor for VDF Hardener Coat',
    'Cast-in-situ RCC Parapet Wall Concreting at Terrace Level (Roof Level)',
    'Rainwater Harvesting Filtration Pit Grit Cleaning and Mesh Installation',
    'Installation of MS Rolling Shutter with Motorized Gear at Material Gate',
    'Core Cutting for MEP Sleeve Openings through Shear Wall Level 3',
    'Installation of LED Batten Fixtures & Sensor Lights in Fire Stairwells',
    'Survey and Alignment Check of Plinth Beams using Total Station Leica',
    'Structural Steel Truss Welding for Clubhouse Badminton Court Roof',
    'Pre-pour Inspection of Slab Post-Tensioning High-Tensile Strands',
    'Application of Anti-Termite Soil Treatment along Foundation Trench Periphery',
    'Fixing UPVC Double Glazed Sliding Windows with Mosquito Mesh Tower 1',
    'Overhead Water Tank Food-Grade Epoxy Coating and Disinfection Wash',
    'Fixing Acoustic Paneling and False Ceiling Grid in Banquet Hall',
  ];

  const priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const statuses = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'VERIFIED'];

  const currentTasksCount = await prisma.task.count({ where: { organizationId: ORG_ID } });
  const tasksNeeded = Math.max(115 - currentTasksCount, 0);

  console.log(`Current Tasks count: ${currentTasksCount}. Seeding ${tasksNeeded} additional Tasks...`);

  for (let i = 0; i < tasksNeeded; i++) {
    const baseTitle = taskTitles[i % taskTitles.length];
    const seq = currentTasksCount + i + 1;
    const title = `${baseTitle} (Area ${String.fromCharCode(65 + (i % 6))}-${randomInt(10, 99)})`;
    const proj = pick(allProjects);
    const priority = pick(priorities);
    const status = pick(statuses);
    const isCompleted = status === 'COMPLETED' || status === 'VERIFIED';

    // Set some tasks overdue to test past due badges
    const isOverdue = !isCompleted && i % 5 === 0;
    const dueDate = isOverdue ? randomDate(14, 1) : randomDate(0, -25);

    await prisma.task.create({
      data: {
        organizationId: ORG_ID,
        projectId: proj.id,
        title,
        description: `Execute ${title} strictly as per architect specification, IS code guidelines and QA/QC checklist. Maintain daily log.`,
        priority,
        status,
        assigneeUserId: adminId,
        dueAt: dueDate,
        completedAt: isCompleted ? randomDate(10, 1) : null,
        completedById: isCompleted ? adminId : null,
        taskType: 'STANDARD',
        createdBy: adminId,
        createdAt: randomDate(30, 2),
      },
    });
  }

  const allTasks = await prisma.task.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Tasks total in DB: ${allTasks}`);

  // -------------------------------------------------------------
  // MODULE 4: MEASUREMENT BOOK ENTRIES - TARGET: 110+
  // -------------------------------------------------------------
  console.log('\n--- Seeding Measurement Book Entries ---');

  const mbItemTemplates = [
    { desc: 'Earthwork excavation in foundation trenches in all classes of soil with mechanical excavator, lift up to 1.5m and lead up to 50m', unit: 'CUM', rate: 18500, l: 12.5, b: 8.0, d: 2.2 },
    { desc: 'Providing and laying Plain Cement Concrete 1:4:8 (1 cement : 4 sand : 8 graded stone aggregate 40mm) under foundation footings', unit: 'CUM', rate: 465000, l: 10.0, b: 6.5, d: 0.15 },
    { desc: 'Reinforced Cement Concrete M30 design mix for RCC columns including batching, vibrating and curing', unit: 'CUM', rate: 745000, l: 4.0, b: 0.6, d: 3.2 },
    { desc: 'Reinforced Cement Concrete M35 design mix in suspended slabs, beams and lintels including pumping and curing', unit: 'CUM', rate: 785000, l: 14.2, b: 9.8, d: 0.15 },
    { desc: 'Thermo-mechanically treated (TMT) Fe-550D steel reinforcement cutting, bending, binding with 18G annealed wire and placing in position', unit: 'TONNE', rate: 7200000, l: 1.0, b: null, d: null, count: 1 },
    { desc: 'Centering and shuttering with film faced waterproof shuttering plywood 12mm including strutting and propping up to 4.5m height', unit: 'SQM', rate: 42500, l: 15.0, b: 10.5, d: null },
    { desc: 'Brickwork with common burnt clay modular bricks of class designation 7.5 in cement mortar 1:6 in superstructure above plinth level', unit: 'CUM', rate: 585000, l: 18.0, b: 0.23, d: 3.0 },
    { desc: 'Autoclaved Aerated Concrete (AAC) block masonry with approved polymer thin bed mortar 3mm thickness', unit: 'CUM', rate: 465000, l: 22.0, b: 0.15, d: 3.0 },
    { desc: '12mm thick cement plaster 1:4 (1 cement : 4 fine sand) on rough side of single brick wall finished smooth with float', unit: 'SQM', rate: 21500, l: 24.0, b: 3.0, d: null },
    { desc: '15mm thick double coat sand faced exterior cement plaster 1:4 finished with sponge texture', unit: 'SQM', rate: 29500, l: 30.0, b: 3.2, d: null },
    { desc: 'Providing and fixing 600x600mm vitrified floor tiles laid on 20mm thick cement mortar bed 1:4 with polymer additive', unit: 'SQM', rate: 94500, l: 8.5, b: 6.2, d: null },
    { desc: 'Providing and laying 18mm thick polished granite stone slab in treads and risers of steps over 20mm cement bed', unit: 'SQM', rate: 245000, l: 12.0, b: 0.3, d: null, count: 18 },
    { desc: 'Waterproofing treatment on sunken portions of WCs and bathrooms with two coats of polymer modified slurry', unit: 'SQM', rate: 68500, l: 6.0, b: 4.5, d: null },
    { desc: 'Providing and fixing CPVC pipe lines 25mm outer dia for hot and cold water distribution including brass fittings and clamps', unit: 'RMT', rate: 38500, l: 45.0, b: null, d: null },
    { desc: 'Providing and fixing 110mm dia SWR PVC soil and waste discharge pipe including rubber ring joint and MS holder bats', unit: 'RMT', rate: 56500, l: 32.0, b: null, d: null },
    { desc: 'Wiring for light point / fan point / exhaust point with 1.5 sq mm FRLS copper wire in concealed rigid PVC conduit', unit: 'NOS', rate: 65000, l: 1.0, b: null, d: null, count: 24 },
    { desc: 'Supplying and applying two coats of exterior weather proof acrylic emulsion paint over one coat of exterior primer', unit: 'SQM', rate: 16500, l: 35.0, b: 6.0, d: null },
  ];

  const mbStatuses = ['SUBMITTED', 'VERIFIED', 'APPROVED', 'BILLED', 'DRAFT'];
  const currentMbCount = await prisma.measurementBookEntry.count({ where: { organizationId: ORG_ID } });
  const mbNeeded = Math.max(110 - currentMbCount, 0);

  console.log(`Current MB count: ${currentMbCount}. Seeding ${mbNeeded} additional Measurement Book Entries...`);

  const contractors = allParties.filter(p => p.partyType === 'CONTRACTOR' || p.partyType === 'BOTH');

  for (let i = 0; i < mbNeeded; i++) {
    const tmpl = mbItemTemplates[i % mbItemTemplates.length];
    const proj = pick(allProjects);
    const contractor = contractors.length > 0 ? pick(contractors) : allParties[0];
    const status = pick(mbStatuses);
    const count = tmpl.count || randomInt(1, 4);
    const length = tmpl.l * (randomInt(8, 14) / 10);
    const breadth = tmpl.b ? tmpl.b * (randomInt(9, 12) / 10) : null;
    const depth = tmpl.d ? tmpl.d * (randomInt(9, 12) / 10) : null;

    let qty = count * length;
    if (breadth) qty *= breadth;
    if (depth) qty *= depth;
    qty = Math.round(qty * 100) / 100;

    const unitRate = tmpl.rate; // in paise
    const totalAmount = Math.round(qty * unitRate);
    const date = randomDate(40, 1);

    await prisma.measurementBookEntry.create({
      data: {
        organizationId: ORG_ID,
        projectId: proj.id,
        partyId: contractor.id,
        itemDescription: `${tmpl.desc} - Grid Ref [R${i + 1}/C${(i % 5) + 1}]`,
        unit: tmpl.unit,
        count,
        length: Math.round(length * 100) / 100,
        breadth: breadth ? Math.round(breadth * 100) / 100 : null,
        depth: depth ? Math.round(depth * 100) / 100 : null,
        quantity: qty,
        unitRate,
        totalAmount,
        status,
        notes: `Recorded on site by Site Engineer. Certified by Quality Inspector for ${proj.name}.`,
        createdBy: adminId,
        createdByName: 'System Super Admin',
        approvedBy: (status === 'APPROVED' || status === 'BILLED') ? adminId : null,
        createdAt: date,
      },
    });
  }

  const allMbEntries = await prisma.measurementBookEntry.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Measurement Book Entries total in DB: ${allMbEntries}`);

  // -------------------------------------------------------------
  // MODULE 5: WORKFORCE & ATTENDANCE - TARGET: 115+ Workers, 140+ Attendance
  // -------------------------------------------------------------
  console.log('\n--- Seeding Workforce & Attendance ---');

  const workerNames = [
    { name: 'Rameshwar Lal Sharma', type: 'FOREMAN', wage: 1200 },
    { name: 'Mohammad Aslam Sheikh', type: 'MASON', wage: 850 },
    { name: 'Rajesh Kumar Meena', type: 'MASON', wage: 850 },
    { name: 'Dinesh Chandra Solanki', type: 'CARPENTER', wage: 900 },
    { name: 'Sunil Gujjar', type: 'ELECTRICIAN', wage: 950 },
    { name: 'Kishan Lal Verma', type: 'PLUMBER', wage: 900 },
    { name: 'Mukesh Bhati', type: 'MASON', wage: 850 },
    { name: 'Santosh Devi Bairwa', type: 'HELPER', wage: 650 },
    { name: 'Pappu Ram Gurjar', type: 'HELPER', wage: 650 },
    { name: 'Bhawani Singh Rathore', type: 'SITE_ENGINEER', wage: 1500 },
    { name: 'Suraj Bhan Prajapat', type: 'CARPENTER', wage: 900 },
    { name: 'Gopal Das Bairwa', type: 'HELPER', wage: 650 },
    { name: 'Harpal Singh Saini', type: 'MASON', wage: 850 },
    { name: 'Dharmendra Jatav', type: 'HELPER', wage: 650 },
    { name: 'Manoj Kumar Suthar', type: 'CARPENTER', wage: 900 },
    { name: 'Kailash Chand Lohar', type: 'MASON', wage: 850 },
    { name: 'Vikram Jeet Rawat', type: 'ELECTRICIAN', wage: 950 },
    { name: 'Bhagwan Sahay Regar', type: 'HELPER', wage: 650 },
    { name: 'Anita Devi Gurjar', type: 'HELPER', wage: 650 },
    { name: 'Manju Bai Meena', type: 'HELPER', wage: 650 },
    { name: 'Suresh Chandra Sharma', type: 'PLUMBER', wage: 900 },
    { name: 'Jagdish Prasad Verma', type: 'MASON', wage: 850 },
    { name: 'Lalit Kumar Mali', type: 'HELPER', wage: 650 },
    { name: 'Nathu Ram Regar', type: 'HELPER', wage: 650 },
    { name: 'Praveen Tak', type: 'ELECTRICIAN', wage: 950 },
    { name: 'Hemant Joshi', type: 'FOREMAN', wage: 1200 },
    { name: 'Mahendra Kumar Kumhar', type: 'MASON', wage: 850 },
    { name: 'Deepak Sen', type: 'CARPENTER', wage: 900 },
    { name: 'Shyam Sunder Jangid', type: 'CARPENTER', wage: 900 },
    { name: 'Raju Ram Bheel', type: 'HELPER', wage: 650 },
  ];

  const currentWfCount = await prisma.workforceMember.count({ where: { organizationId: ORG_ID } });
  const wfNeeded = Math.max(115 - currentWfCount, 0);
  console.log(`Current Workforce count: ${currentWfCount}. Seeding ${wfNeeded} additional Workforce Members...`);

  let wfCodeSeq = 2000 + currentWfCount;
  for (let i = 0; i < wfNeeded; i++) {
    wfCodeSeq++;
    const empCode = `WF-${wfCodeSeq}`;
    const baseWorker = workerNames[i % workerNames.length];
    const name = i < workerNames.length ? baseWorker.name : `${baseWorker.name.split(' ')[0]} ${baseWorker.name.split(' ')[1] || 'Kumar'} (${wfCodeSeq})`;
    const site = pick(allSites);

    await prisma.workforceMember.create({
      data: {
        organizationId: ORG_ID,
        employeeCode: empCode,
        name,
        workerType: baseWorker.type,
        phone: `+91 97801 ${String(wfCodeSeq).padStart(5, '0')}`,
        defaultSiteId: site.id,
        dailyWageRate: baseWorker.wage,
        active: true,
      },
    });
  }

  const allWorkforce = await prisma.workforceMember.findMany({ where: { organizationId: ORG_ID } });
  console.log(`✓ Workforce Members total in DB: ${allWorkforce.length}`);

  // Seed 145+ Attendance Sessions across multiple past work dates
  console.log('  Seeding 145+ Attendance Sessions...');
  const recentWorkDates = [];
  for (let d = 0; d < 10; d++) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    recentWorkDates.push(formatDateStr(dt));
  }

  let attSessionsCreated = 0;
  for (const wDate of recentWorkDates) {
    for (const worker of allWorkforce) {
      if (attSessionsCreated >= 160) break;
      // Probabilistic attendance (e.g. 80% attendance)
      if (Math.random() < 0.25) continue;

      const siteId = worker.defaultSiteId || allSites[0].id;
      const proj = allProjects.find(p => p.siteId === siteId) || allProjects[0];

      const existing = await prisma.attendanceSession.findUnique({
        where: {
          organizationId_workforceMemberId_siteId_workDate: {
            organizationId: ORG_ID,
            workforceMemberId: worker.id,
            siteId,
            workDate: wDate,
          },
        },
      });

      if (!existing) {
        const checkIn = new Date(`${wDate}T08:15:00.000Z`);
        const checkOut = new Date(`${wDate}T17:30:00.000Z`);
        await prisma.attendanceSession.create({
          data: {
            organizationId: ORG_ID,
            workforceMemberId: worker.id,
            siteId,
            projectId: proj.id,
            workDate: wDate,
            checkInAt: checkIn,
            checkOutAt: checkOut,
            status: Math.random() > 0.85 ? 'OVERTIME' : 'PRESENT',
            notes: `Biometric site attendance verified. Shift general.`,
            createdBy: adminId,
          },
        });
        attSessionsCreated++;
      }
    }
  }

  const allAttendance = await prisma.attendanceSession.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Attendance Sessions total in DB: ${allAttendance}`);

  // -------------------------------------------------------------
  // MODULE 6: WORKFORCE HEADCOUNT MUSTER (Day Book) - TARGET: 105+
  // -------------------------------------------------------------
  console.log('\n--- Seeding Workforce Headcount Muster Logs ---');
  const currentHeadcounts = await prisma.workforceHeadcount.count({ where: { organizationId: ORG_ID } });
  const headcountsNeeded = Math.max(105 - currentHeadcounts, 0);

  console.log(`Current Headcounts: ${currentHeadcounts}. Seeding ${headcountsNeeded} additional records...`);

  const musterDates = [];
  for (let d = 0; d < 35; d++) {
    const dt = new Date();
    dt.setDate(dt.getDate() - d);
    musterDates.push(formatDateStr(dt));
  }

  let hcCreated = 0;
  for (const mDate of musterDates) {
    for (const site of allSites) {
      if (hcCreated >= headcountsNeeded) break;
      const shifts = ['GENERAL', 'DAY', 'NIGHT'];
      for (const shift of shifts) {
        if (hcCreated >= headcountsNeeded) break;

        const artisan = randomInt(10, 25);
        const craftsman = randomInt(6, 18);
        const labMale = randomInt(20, 50);
        const labFemale = randomInt(8, 20);
        const labTotal = labMale + labFemale;
        const grandTotal = artisan + craftsman + labTotal;

        await prisma.workforceHeadcount.create({
          data: {
            organizationId: ORG_ID,
            siteId: site.id,
            siteName: site.name,
            date: mDate,
            shift,
            artisanCount: artisan,
            craftsmanCount: craftsman,
            laborerMale: labMale,
            laborerFemale: labFemale,
            laborerTotal: labTotal,
            grandTotal,
            contractorName: 'Composite Site Gangs & Subcontractors',
            notes: `Muster roll certified by shift supervisor. Direct + external labor accounted.`,
            supervisorId: adminId,
            supervisorName: 'System Super Admin',
            createdById: adminId,
          },
        });
        hcCreated++;
      }
    }
  }

  const allHeadcounts = await prisma.workforceHeadcount.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Workforce Headcount Muster total in DB: ${allHeadcounts}`);

  // -------------------------------------------------------------
  // MODULE 7: DAILY SITE REPORTS (Reports & Day Book) - TARGET: 110+
  // -------------------------------------------------------------
  console.log('\n--- Seeding Daily Site Reports ---');

  const currentReportsCount = await prisma.dailySiteReport.count({ where: { organizationId: ORG_ID } });
  const reportsNeeded = Math.max(110 - currentReportsCount, 0);
  console.log(`Current Daily Reports: ${currentReportsCount}. Seeding ${reportsNeeded} additional reports...`);

  const progressSnippets = [
    'Concreting of 5th floor suspended slab grid 4-10 completed (68 CUM M35 RMC). 14 bar benders engaged in Level 6 column cage fabrication.',
    'Excavation for storm drainage trench adjacent to Tower B completed up to invert level. Laying 450mm dia RCC Hume pipes underway.',
    'Completed internal single coat plastering in 6 residential units on 3rd floor. Curing maintained on all external exposed surfaces.',
    'Erected Cuplock heavy duty scaffolding for external glass facade on North-East elevation up to 35m height. Safety harness verified.',
    'Completed hydraulic pressure testing of main firefighting wet riser at 12 bar pressure for 2 hours with zero pressure drop recorded.',
    'Laying 600x600 vitrified floor tiles completed in corridor and 4 flats. Kitchen granite counter stone fixing in progress.',
    'Backfilling and pneumatic compaction of foundation pit behind retaining wall completed in 200mm layers with optimal moisture content.',
    'Substation transformer room LT panel cable trays installed. Earthing copper tape grid termination completed with test pit.',
    'Terrace floor dual layer polymer waterproofing application completed with ponding water test initiated for 72-hour leak inspection.',
    'Tower A 8-passenger high speed elevator counterweight and guide rail alignment certified by Kone technical commissioning team.',
  ];

  const blockerSnippets = [
    'Brief delay of 35 minutes in morning due to transit mixer traffic diversion on main highway. Compensated in afternoon shift.',
    'Intermittent rain shower caused 1 hour pause in external plastering. Workforce redeployed to internal tiling and conduit works.',
    'Awaiting structural consultant approval for minor duct opening near column C-18. Issue resolved via RFI response.',
    'Tower crane electrical slip-ring maintenance required 45 minutes shutdown. Resumed normal lifting operations smoothly.',
    'None. Work proceeded strictly as per master construction schedule.',
  ];

  const safetySnippets = [
    'Conducted 15-minute morning toolbox talk on working at heights, mandatory 100% harness tie-off, and edge barricades. 0 incidents.',
    'Daily safety round completed by HSE manager. Inspected scaffolding tags, PPE compliance, and fire extinguisher readiness. Clean record.',
    'Safety briefing on electrical isolation and Lockout/Tagout (LOTO) procedures conducted for MEP subcontractors. Zero violations.',
    'Hot work safety permit issued for structural steel welding. Fire blanket and CO2 extinguishers positioned on site.',
    'All scaffolding couplers and toe boards checked following morning wind gusts. Safe for climbing certified.',
  ];

  for (let i = 0; i < reportsNeeded; i++) {
    const proj = pick(allProjects);
    const date = randomDate(60, 1);
    const dateStr = formatDateStr(date);

    await prisma.dailySiteReport.create({
      data: {
        organizationId: ORG_ID,
        projectId: proj.id,
        reportDate: dateStr,
        progress: pick(progressSnippets),
        blockers: pick(blockerSnippets),
        safetyNotes: pick(safetySnippets),
        createdBy: adminId,
        createdAt: date,
      },
    });
  }

  const allReports = await prisma.dailySiteReport.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Daily Site Reports total in DB: ${allReports}`);

  // -------------------------------------------------------------
  // MODULE 8: FINANCE - BILLS & PAYMENTS - TARGET: 110+ Bills, 110+ Payments
  // -------------------------------------------------------------
  console.log('\n--- Seeding Finance (Bills & Payments) ---');

  const currentBillsCount = await prisma.bill.count({ where: { organizationId: ORG_ID } });
  const billsNeeded = Math.max(110 - currentBillsCount, 0);
  console.log(`Current Bills: ${currentBillsCount}. Seeding ${billsNeeded} additional Bills...`);

  const createdBills = [];
  for (let i = 0; i < billsNeeded; i++) {
    const party = pick(allParties);
    const proj = pick(allProjects);
    const billSeq = currentBillsCount + i + 101;
    const billNumber = `INV-2026-${String(billSeq).padStart(4, '0')}`;
    const billDate = randomDate(60, 5);
    const dueDate = new Date(billDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const totalAmount = randomInt(25, 450) * 10000; // in Rupees / Currency minor units

    // Check if unique constraint violated
    const existingBill = await prisma.bill.findUnique({
      where: {
        organizationId_partyId_billNumber: {
          organizationId: ORG_ID,
          partyId: party.id,
          billNumber,
        },
      },
    });

    if (!existingBill) {
      const b = await prisma.bill.create({
        data: {
          organizationId: ORG_ID,
          partyId: party.id,
          projectId: proj.id,
          billNumber,
          billDate,
          dueDate,
          totalAmount,
          status: 'POSTED',
          notes: `Tax invoice for supply and site execution at ${proj.name}. Verified by Site Accounts.`,
          createdBy: adminId,
          postedAt: billDate,
          createdAt: billDate,
          lines: {
            create: [
              {
                description: `Progress Billing Stage Milestone #${randomInt(1, 6)} - Work / Supply at ${proj.name}`,
                quantity: 1,
                unitRate: totalAmount,
                lineTotal: totalAmount,
              },
            ],
          },
        },
      });
      createdBills.push(b);
    }
  }

  const allBills = await prisma.bill.findMany({ where: { organizationId: ORG_ID } });
  console.log(`✓ Bills total in DB: ${allBills.length}`);

  // Seed 115+ Payments
  const currentPaymentsCount = await prisma.payment.count({ where: { organizationId: ORG_ID } });
  const paymentsNeeded = Math.max(115 - currentPaymentsCount, 0);
  console.log(`Current Payments: ${currentPaymentsCount}. Seeding ${paymentsNeeded} additional Payments...`);

  const bankAccounts = [
    'HDFC Bank Operating A/C - 0021009182',
    'ICICI Bank Escrow Project A/C - 639105021',
    'State Bank of India Corporate A/C - 302194810',
    'Kotak Mahindra Project Disbursement A/C',
    'Site Petty Cash Operating Fund',
  ];

  const paymentMethods = ['BANK_TRANSFER', 'NEFT_RTGS', 'UPI', 'CHEQUE', 'CASH'];

  for (let i = 0; i < paymentsNeeded; i++) {
    const party = pick(allParties);
    const proj = pick(allProjects);
    const paySeq = currentPaymentsCount + i + 101;
    const idempotencyKey = `PAY-IDEMP-2026-${String(paySeq).padStart(4, '0')}`;
    const pDate = randomDate(45, 1);
    const method = pick(paymentMethods);
    const amount = randomInt(15, 280) * 10000;
    const refNum = method === 'UPI' ? `UPI/${randomInt(100000, 999999)}/BOTHRA` : (method === 'CHEQUE' ? `CHQ-${randomInt(100000, 999999)}` : `UTR-HDFC${randomInt(10000000, 99999999)}`);

    const existingPayment = await prisma.payment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: ORG_ID,
          idempotencyKey,
        },
      },
    });

    if (!existingPayment) {
      await prisma.payment.create({
        data: {
          organizationId: ORG_ID,
          partyId: party.id,
          recipientType: party.partyType === 'CONTRACTOR' ? 'CONTRACTOR' : 'VENDOR',
          recipientName: party.name,
          payingAccount: pick(bankAccounts),
          approvalQuery: `Disbursement approved by Super Admin against verified GST bill and store inspection certificate.`,
          approvedBy: adminId,
          approvedAt: pDate,
          projectId: proj.id,
          paymentDate: pDate,
          amount,
          currency: 'INR',
          method,
          referenceNumber: refNum,
          status: 'POSTED',
          idempotencyKey,
          notes: `Vendor payment released via ${method} for ${party.name}. Ref: ${refNum}`,
          createdBy: adminId,
          createdAt: pDate,
        },
      });
    }
  }

  const allPayments = await prisma.payment.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Payments total in DB: ${allPayments}`);

  // -------------------------------------------------------------
  // MODULE 9: AUDIT LOGS - TARGET: 125+
  // -------------------------------------------------------------
  console.log('\n--- Seeding Audit Events ---');

  const currentAuditCount = await prisma.auditEvent.count({ where: { organizationId: ORG_ID } });
  const auditNeeded = Math.max(125 - currentAuditCount, 0);
  console.log(`Current Audit Events: ${currentAuditCount}. Seeding ${auditNeeded} additional Audit Events...`);

  const auditActions = [
    { action: 'PAYMENT_POSTED', type: 'PAYMENT', reason: 'Disbursement authorized after site measurement verification' },
    { action: 'STOCK_ADJUSTMENT', type: 'STOCK_MOVEMENT', reason: 'Physical stock reconciliation audit against system ledger' },
    { action: 'MATERIAL_RECEIPT', type: 'STOCK_MOVEMENT', reason: 'Consignment gate entry cleared with weighbridge slip' },
    { action: 'ATTENDANCE_CORRECTED', type: 'ATTENDANCE', reason: 'Biometric punch sync error resolved by site supervisor' },
    { action: 'MB_ENTRY_APPROVED', type: 'MEASUREMENT_BOOK', reason: 'Raft concrete measurements cross-checked with drawings' },
    { action: 'BILL_POSTED', type: 'BILL', reason: 'Vendor tax invoice verified with purchase order & delivery challan' },
    { action: 'TASK_COMPLETED', type: 'TASK', reason: 'Quality inspection passed with non-destructive rebound hammer test' },
    { action: 'ROLE_CHANGED', type: 'USER', reason: 'Project Manager permissions provisioned for Phase 2 expansion' },
    { action: 'PROJECT_BUDGET_UPDATED', type: 'PROJECT', reason: 'Annual contingency allocation adjusted for steel indexation' },
  ];

  for (let i = 0; i < auditNeeded; i++) {
    const tmpl = pick(auditActions);
    const date = randomDate(60, 1);

    await prisma.auditEvent.create({
      data: {
        organizationId: ORG_ID,
        actorUserId: adminId,
        action: tmpl.action,
        entityType: tmpl.type,
        entityId: `ENT-${randomInt(10000, 99999)}`,
        beforeJson: JSON.stringify({ status: 'PENDING_VERIFICATION', updatedBy: 'Site Engineer' }),
        afterJson: JSON.stringify({ status: 'APPROVED_AND_POSTED', verifiedBy: 'Super Admin', timestamp: date.toISOString() }),
        reason: tmpl.reason,
        createdAt: date,
      },
    });
  }

  const allAudit = await prisma.auditEvent.count({ where: { organizationId: ORG_ID } });
  console.log(`✓ Audit Events total in DB: ${allAudit}`);

  console.log('\n======================================================');
  console.log('🎉 ALL 12 MODULES SEEDED WITH 100+ ENTRIES SUCCESSFULLY!');
  console.log('======================================================');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
