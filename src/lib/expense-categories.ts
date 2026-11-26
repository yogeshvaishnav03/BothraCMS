export interface ExpenseCategoryOption {
  value: string;
  label: string;
  group?: string;
}

export const EXPENSE_CATEGORY_GROUPS = [
  {
    group: "Construction & Building Materials",
    options: [
      { value: "CEMENT_BINDING", label: "Cement & Binding Materials" },
      { value: "SAND_AGGREGATES", label: "Sand & Aggregates" },
      { value: "STEEL_REINFORCEMENT", label: "Steel & Reinforcement" },
      { value: "BRICKS_BLOCKS", label: "Bricks & Blocks" },
      { value: "SHUTTERING_SCAFFOLDING", label: "Shuttering & Scaffolding" },
      { value: "WATERPROOFING_CHEMICALS", label: "Waterproofing & Chemicals" },
      { value: "FLOORING_STONE", label: "Flooring & Stone" },
      { value: "PLUMBING_MATERIALS", label: "Plumbing Materials" },
      { value: "ELECTRICAL_MATERIALS", label: "Electrical Materials" },
      { value: "DOORS_WINDOWS_HARDWARE", label: "Doors, Windows & Hardware" },
      { value: "PAINTING_FINISHING", label: "Painting & Finishing" },
      { value: "ROOFING_CEILING", label: "Roofing & Ceiling" },
      { value: "MISC_CONSUMABLES", label: "Miscellaneous & Consumables" },
      { value: "MATERIALS", label: "General Materials & Hardware" },
    ],
  },
  {
    group: "Site Operations & Running Expenses",
    options: [
      { value: "EQUIPMENT", label: "Fuel & Generator Diesel" },
      { value: "TRANSPORT", label: "Transport & Delivery / Auto / Tempo" },
      { value: "LABOUR", label: "Labour Tea & Refreshments" },
      { value: "SITE_OFFICE", label: "Site Office & Consumables" },
      { value: "REPAIRS", label: "Minor Repairs & Tools" },
      { value: "OTHER", label: "Other Site Expense" },
    ],
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  // Construction & Building Materials
  CEMENT_BINDING: "Cement & Binding Materials",
  SAND_AGGREGATES: "Sand & Aggregates",
  STEEL_REINFORCEMENT: "Steel & Reinforcement",
  BRICKS_BLOCKS: "Bricks & Blocks",
  SHUTTERING_SCAFFOLDING: "Shuttering & Scaffolding",
  WATERPROOFING_CHEMICALS: "Waterproofing & Chemicals",
  FLOORING_STONE: "Flooring & Stone",
  PLUMBING_MATERIALS: "Plumbing Materials",
  ELECTRICAL_MATERIALS: "Electrical Materials",
  DOORS_WINDOWS_HARDWARE: "Doors, Windows & Hardware",
  PAINTING_FINISHING: "Painting & Finishing",
  ROOFING_CEILING: "Roofing & Ceiling",
  MISC_CONSUMABLES: "Miscellaneous & Consumables",

  // Aliases for flexibility
  CEMENT: "Cement & Binding Materials",
  PLUMBING: "Plumbing Materials",
  ELECTRICAL: "Electrical Materials",
  DOORS_WINDOWS: "Doors, Windows & Hardware",

  // Operational & Site Running Expenses
  MATERIALS: "Materials & Hardware",
  EQUIPMENT: "Fuel & Generator Diesel",
  TRANSPORT: "Transport & Delivery",
  LABOUR: "Labour Tea & Refreshments",
  SITE_OFFICE: "Site Office & Consumables",
  REPAIRS: "Minor Repairs & Tools",
  OTHER: "Other Site Expense",
};

export function formatExpenseCategory(cat?: string | null): string {
  if (!cat) return "Other Site Expense";
  if (CATEGORY_LABELS[cat]) return CATEGORY_LABELS[cat];
  const upper = cat.toUpperCase();
  if (CATEGORY_LABELS[upper]) return CATEGORY_LABELS[upper];
  return cat;
}
