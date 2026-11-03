export interface UnitOption {
  code: string;
  name: string;
  label: string;
  system: "IMPERIAL" | "METRIC" | "SITE";
  systemLabel: string;
  dimUnit: string;
  formula: "AREA" | "VOLUME" | "LENGTH" | "QUANTITY";
  description: string;
  badgeBg: string;
}

export const MEASUREMENT_UNIT_GROUPS: {
  category: string;
  system: "IMPERIAL" | "METRIC" | "SITE";
  badge: string;
  color: string;
  units: UnitOption[];
}[] = [
  {
    category: "Imperial / FPS System",
    system: "IMPERIAL",
    badge: "Feet & Inches",
    color: "amber",
    units: [
      {
        code: "SQFT",
        name: "Square Feet",
        label: "SQFT (Square Feet / Sq. Ft)",
        system: "IMPERIAL",
        systemLabel: "Imperial (FPS)",
        dimUnit: "ft",
        formula: "AREA",
        description: "Area in square feet (ft × ft). Flooring, plaster, painting, shuttering.",
        badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      },
      {
        code: "INCH",
        name: "Inches",
        label: "INCH (Linear Inches / in)",
        system: "IMPERIAL",
        systemLabel: "Imperial (FPS)",
        dimUnit: "in",
        formula: "LENGTH",
        description: "Linear inches. Frames, pipes, small structural thickness.",
        badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      },
      {
        code: "SQINCH",
        name: "Square Inches",
        label: "SQ.INCH (Square Inches / sq.in)",
        system: "IMPERIAL",
        systemLabel: "Imperial (FPS)",
        dimUnit: "in",
        formula: "AREA",
        description: "Surface area in square inches (in × in). Openings, small cutouts.",
        badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      },
      {
        code: "CFT",
        name: "Cubic Feet",
        label: "CFT (Cubic Feet / Cu. Ft)",
        system: "IMPERIAL",
        systemLabel: "Imperial (FPS)",
        dimUnit: "ft",
        formula: "VOLUME",
        description: "Volume in cubic feet (ft × ft × ft). Sand, aggregate, excavation, timber.",
        badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      },
      {
        code: "RFT",
        name: "Running Feet",
        label: "RFT (Running Feet / Linear Feet)",
        system: "IMPERIAL",
        systemLabel: "Imperial (FPS)",
        dimUnit: "ft",
        formula: "LENGTH",
        description: "Linear running feet. Skirting, railings, pipes, boundary fencing.",
        badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
      },
    ],
  },
  {
    category: "Metric System (MKS / SI)",
    system: "METRIC",
    badge: "Meters & Millimeters",
    color: "blue",
    units: [
      {
        code: "MM",
        name: "Millimeters",
        label: "MM (Linear Millimeter / mm)",
        system: "METRIC",
        systemLabel: "Metric (SI)",
        dimUnit: "mm",
        formula: "LENGTH",
        description: "Linear millimeters. Architectural drawings, rebar, steel sections.",
        badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
      },
      {
        code: "SQMM",
        name: "Square Millimeters",
        label: "SQ.MM (Square Millimeter / sq.mm)",
        system: "METRIC",
        systemLabel: "Metric (SI)",
        dimUnit: "mm",
        formula: "AREA",
        description: "Square millimeters. Precision sections, steel bar cross-sections.",
        badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
      },
      {
        code: "SQM",
        name: "Square Meter",
        label: "SQM (Square Meter / Sq. M)",
        system: "METRIC",
        systemLabel: "Metric (SI)",
        dimUnit: "m",
        formula: "AREA",
        description: "Area in square meters (m × m). Civil masonry, plaster, flooring.",
        badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
      },
      {
        code: "CUM",
        name: "Cubic Meter",
        label: "CUM (Cubic Meter / Cu. M)",
        system: "METRIC",
        systemLabel: "Metric (SI)",
        dimUnit: "m",
        formula: "VOLUME",
        description: "Volume in cubic meters (m × m × m). RCC concrete, bulk earthwork.",
        badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
      },
      {
        code: "RMT",
        name: "Running Meter",
        label: "RMT (Running Meter / Linear Meter)",
        system: "METRIC",
        systemLabel: "Metric (SI)",
        dimUnit: "m",
        formula: "LENGTH",
        description: "Linear running meters. Electrical conduits, plumbing, kerb stones.",
        badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
      },
    ],
  },
  {
    category: "Counts, Bulk & Site Units",
    system: "SITE",
    badge: "Quantities & Site Loads",
    color: "emerald",
    units: [
      {
        code: "NOS",
        name: "Numbers",
        label: "NOS (Numbers / Pieces / Units)",
        system: "SITE",
        systemLabel: "Count",
        dimUnit: "qty",
        formula: "QUANTITY",
        description: "Piece/Unit count. Precast items, doors, windows, sanitary fixtures.",
        badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      },
      {
        code: "BAG",
        name: "Bags",
        label: "BAG (Bags - Cement / Putty)",
        system: "SITE",
        systemLabel: "Count",
        dimUnit: "bags",
        formula: "QUANTITY",
        description: "Standard 50kg bags. Cement, wall putty, tile adhesive.",
        badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      },
      {
        code: "BRASS",
        name: "Brass",
        label: "BRASS (100 Cu. Ft - Bulk Sand / Aggregate)",
        system: "SITE",
        systemLabel: "Bulk Volume",
        dimUnit: "brass",
        formula: "VOLUME",
        description: "Traditional site bulk volume (1 Brass = 100 CFT = 2.83 CUM).",
        badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      },
      {
        code: "TONNE",
        name: "Metric Tonne",
        label: "TONNE (Metric Tonne / MT - Steel)",
        system: "SITE",
        systemLabel: "Weight",
        dimUnit: "tonne",
        formula: "QUANTITY",
        description: "Metric tonne (1,000 kg). TMT reinforcement steel, bulk supply.",
        badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      },
      {
        code: "KG",
        name: "Kilograms",
        label: "KG (Kilograms)",
        system: "SITE",
        systemLabel: "Weight",
        dimUnit: "kg",
        formula: "QUANTITY",
        description: "Kilograms. Binding wire, hardware, small metal fabrications.",
        badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      },
      {
        code: "LOT",
        name: "Lot / Job",
        label: "LOT (Lump Sum / Job Contract)",
        system: "SITE",
        systemLabel: "Lump Sum",
        dimUnit: "lot",
        formula: "QUANTITY",
        description: "Lump sum subcontract package or turnkey work phase.",
        badgeBg: "bg-emerald-100 text-emerald-900 border-emerald-300",
      },
    ],
  },
];

export const MEASUREMENT_TYPE_GROUPS = [
  {
    category: "Structural Elements",
    types: [
      { code: "SLAB", name: "Slab / Roof Slab", label: "Slab / Roof Slab (RCC)", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "BEAM", name: "Beam / Plinth Beam", label: "Beam / Plinth Beam / Tie Beam", defaultUnit: "CFT", defaultFormula: "VOLUME" },
      { code: "COLUMN", name: "Column / Pillar", label: "Column / Pillar (RCC)", defaultUnit: "CFT", defaultFormula: "VOLUME" },
      { code: "FOOTING", name: "Footing / Foundation", label: "Footing / Foundation / Raft", defaultUnit: "CFT", defaultFormula: "VOLUME" },
      { code: "LINTEL", name: "Lintel / Chhajja", label: "Lintel / Chhajja / Sunshade", defaultUnit: "RFT", defaultFormula: "LENGTH" },
      { code: "STAIRCASE", name: "Staircase / Steps", label: "Staircase / Steps / Waist Slab", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "RETAINING_WALL", name: "Retaining Wall", label: "Retaining Wall / Shear Wall", defaultUnit: "SQFT", defaultFormula: "AREA" },
    ],
  },
  {
    category: "Masonry & Civil Works",
    types: [
      { code: "WALL", name: "Brick Wall", label: "Brick Wall (9\" / 4.5\" Masonry)", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "BLOCK_MASONRY", name: "Block Masonry", label: "AAC Block / Concrete Block Masonry", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "STONE_MASONRY", name: "Stone Masonry", label: "Stone / Rubble Masonry", defaultUnit: "CFT", defaultFormula: "VOLUME" },
      { code: "EXCAVATION", name: "Excavation", label: "Earthwork / Trench Excavation", defaultUnit: "CFT", defaultFormula: "VOLUME" },
      { code: "BACKFILLING", name: "Backfilling / Earthwork", label: "Backfilling / Earth Compaction", defaultUnit: "CFT", defaultFormula: "VOLUME" },
      { code: "CONCRETE", name: "PCC Concrete", label: "Plain Cement Concrete (PCC)", defaultUnit: "CUM", defaultFormula: "VOLUME" },
      { code: "RCC", name: "RCC Concrete", label: "Reinforced Cement Concrete (RCC)", defaultUnit: "CUM", defaultFormula: "VOLUME" },
      { code: "DPC", name: "DPC", label: "Damp Proof Course (DPC)", defaultUnit: "SQFT", defaultFormula: "AREA" },
    ],
  },
  {
    category: "Finishing & Architectural",
    types: [
      { code: "PLASTERING", name: "Plastering", label: "Plastering (Internal / External 12mm/20mm)", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "FLOORING", name: "Flooring", label: "Flooring (Tile / Marble / Granite / IPS)", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "WALL_TILING", name: "Wall Tiling / Dado", label: "Wall Tiling / Dado Work", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "SKIRTING", name: "Skirting", label: "Skirting (Border Tiles / Marble)", defaultUnit: "RFT", defaultFormula: "LENGTH" },
      { code: "PAINTING", name: "Painting & Putty", label: "Painting / Putty / Primer / Texture", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "CEILING", name: "Ceiling / False Ceiling", label: "Ceiling / False Ceiling (Gypsum / POP)", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "WATERPROOFING", name: "Waterproofing", label: "Waterproofing (Terrace / Toilets / Basement)", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "DOORS_WINDOWS", name: "Doors & Windows", label: "Doors, Windows & Frame Joinery", defaultUnit: "SQFT", defaultFormula: "AREA" },
    ],
  },
  {
    category: "Steel, Formwork & Fabrication",
    types: [
      { code: "STEEL_REBAR", name: "Rebar / TMT Steel", label: "Reinforcement Steel / TMT Rebar", defaultUnit: "TONNE", defaultFormula: "QUANTITY" },
      { code: "SHUTTERING", name: "Shuttering / Formwork", label: "Shuttering / Centering / Formwork", defaultUnit: "SQFT", defaultFormula: "AREA" },
      { code: "FABRICATION", name: "MS Fabrication / Grills", label: "MS Fabrication / Grills / Railings", defaultUnit: "RFT", defaultFormula: "LENGTH" },
      { code: "STRUCTURAL_STEEL", name: "Structural Steel", label: "Structural Steel / Trusses / Purlins", defaultUnit: "KG", defaultFormula: "QUANTITY" },
    ],
  },
  {
    category: "MEP & Infrastructure",
    types: [
      { code: "PLUMBING", name: "Plumbing & Sanitary", label: "Plumbing / Sanitary / Water Supply Lines", defaultUnit: "RMT", defaultFormula: "LENGTH" },
      { code: "ELECTRICAL", name: "Electrical & Conduits", label: "Electrical Conduits / Wiring / Points", defaultUnit: "RMT", defaultFormula: "LENGTH" },
      { code: "DRAINAGE", name: "Drainage & Sewerage", label: "Drainage / Storm Water / Sewer Line", defaultUnit: "RMT", defaultFormula: "LENGTH" },
      { code: "ROAD_PAVING", name: "Road & Paving", label: "Paver Blocks / Road Work / Kerb Stones", defaultUnit: "SQM", defaultFormula: "AREA" },
      { code: "FENCING", name: "Boundary & Fencing", label: "Boundary Wall / Compound / Wire Fencing", defaultUnit: "RFT", defaultFormula: "LENGTH" },
      { code: "OTHER", name: "Other / Misc Work", label: "Other / Miscellaneous Work", defaultUnit: "NOS", defaultFormula: "QUANTITY" },
    ],
  },
];

export function getUnitMetadata(unitCode: string): UnitOption {
  const code = (unitCode || "").toUpperCase().trim();
  for (const group of MEASUREMENT_UNIT_GROUPS) {
    const found = group.units.find((u) => u.code === code);
    if (found) return found;
  }
  // Dynamic inference for arbitrary unit codes
  if (code.includes("SQFT") || code.includes("SQ.FT") || code.includes("SQUARE FEET") || code.includes("SFT") || code.includes("SQ FEET")) {
    return {
      code,
      name: "Square Feet",
      label: `${code} (Sq. Ft)`,
      system: "IMPERIAL",
      systemLabel: "Imperial (FPS)",
      dimUnit: "ft",
      formula: "AREA",
      description: "Imperial surface area in square feet",
      badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
    };
  }
  if (code === "INCH" || code === "IN" || code.includes("INCH")) {
    return {
      code,
      name: "Inches",
      label: `${code} (Inches)`,
      system: "IMPERIAL",
      systemLabel: "Imperial (FPS)",
      dimUnit: "in",
      formula: "LENGTH",
      description: "Imperial linear inches",
      badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
    };
  }
  if (code === "MM" || code.includes("MILLI")) {
    return {
      code,
      name: "Millimeters",
      label: `${code} (mm)`,
      system: "METRIC",
      systemLabel: "Metric (SI)",
      dimUnit: "mm",
      formula: "LENGTH",
      description: "Metric linear millimeters",
      badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
    };
  }
  if (code.includes("FT") || code.includes("FEET") || code.includes("FOOT")) {
    return {
      code,
      name: code,
      label: code,
      system: "IMPERIAL",
      systemLabel: "Imperial (FPS)",
      dimUnit: "ft",
      formula: code.includes("C") ? "VOLUME" : "LENGTH",
      description: "Imperial measurement in feet",
      badgeBg: "bg-amber-100 text-amber-900 border-amber-300",
    };
  }
  if (code.includes("M")) {
    return {
      code,
      name: code,
      label: code,
      system: "METRIC",
      systemLabel: "Metric (SI)",
      dimUnit: "m",
      formula: code.includes("CU") ? "VOLUME" : "AREA",
      description: "Metric measurement in meters",
      badgeBg: "bg-blue-100 text-blue-900 border-blue-300",
    };
  }
  return {
    code,
    name: code,
    label: code,
    system: "SITE",
    systemLabel: "Count/Qty",
    dimUnit: "qty",
    formula: "QUANTITY",
    description: "Standard quantity measurement",
    badgeBg: "bg-slate-100 text-slate-900 border-slate-300",
  };
}
