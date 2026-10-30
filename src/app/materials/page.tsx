"use client";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import React, { useEffect, useState, useRef, useMemo } from "react";
import { useExcelTable, ExcelColumnHeader, ExcelTableToolbar, ExcelColumn } from "@/components/ui/ExcelTable";
import Link from "next/link";
import Shell from "@/components/layout/Shell";
import PlaceOrderModal from "@/components/materials/PlaceOrderModal";
import { formatCurrency, formatQuantity } from "@/lib/formatters";
import {
  Boxes,
  Plus,
  PackagePlus,
  PackageMinus,
  Search,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  X,
  CheckCircle2,
  Trash2,
  ShoppingCart,
  ChevronDown,
  Check,
  Sparkles,
  Filter,
} from "lucide-react";
import { canUser } from "@/lib/permissions";

interface StandardMaterialPreset {
  name: string;
  unit: string;
  sku: string;
  min: number;
  reorder: number;
}

interface StandardMaterialCategory {
  category: string;
  items: StandardMaterialPreset[];
}

const STANDARD_CONSTRUCTION_MATERIALS: StandardMaterialCategory[] = [
  {
    category: "Cement & Binders",
    items: [
      { name: "UltraTech Super Cement OPC 53 Grade", unit: "BAG", sku: "CEM-OPC-53", min: 50, reorder: 200 },
      { name: "UltraTech Cement PPC (50kg)", unit: "BAG", sku: "CEM-PPC-50", min: 100, reorder: 250 },
      { name: "Ambuja Cement PPC (50kg)", unit: "BAG", sku: "CEM-AMB-50", min: 50, reorder: 200 },
      { name: "ACC Gold Water Shield Cement", unit: "BAG", sku: "CEM-ACC-50", min: 50, reorder: 200 },
      { name: "Shree Cement OPC 43 Grade", unit: "BAG", sku: "CEM-SHR-43", min: 50, reorder: 200 },
      { name: "Birla White Portland Cement (50kg)", unit: "BAG", sku: "CEM-WHT-50", min: 20, reorder: 50 },
      { name: "JK Super Cement PPC (50kg)", unit: "BAG", sku: "CEM-JKS-50", min: 50, reorder: 200 },
    ],
  },
  {
    category: "Aggregates, Sand & Concrete",
    items: [
      { name: "Coarse Washed River Sand", unit: "TONNE", sku: "AGG-SND-CRS", min: 20, reorder: 50 },
      { name: "M-Sand (Manufactured Sand)", unit: "TONNE", sku: "AGG-MSAND", min: 25, reorder: 60 },
      { name: "Crushed Stone Aggregate 10mm (Gitti)", unit: "TONNE", sku: "AGG-10MM", min: 15, reorder: 40 },
      { name: "Crushed Stone Aggregate 20mm (Gitti)", unit: "TONNE", sku: "AGG-20MM", min: 20, reorder: 50 },
      { name: "Crushed Stone Aggregate 40mm", unit: "TONNE", sku: "AGG-40MM", min: 15, reorder: 30 },
      { name: "Quarry Dust / Stone Dust", unit: "TONNE", sku: "AGG-DUST", min: 10, reorder: 30 },
      { name: "Ready Mix Concrete (RMC) M25", unit: "TONNE", sku: "RMC-M25", min: 10, reorder: 25 },
      { name: "Ready Mix Concrete (RMC) M30", unit: "TONNE", sku: "RMC-M30", min: 10, reorder: 25 },
    ],
  },
  {
    category: "Steel & Structural Metal",
    items: [
      { name: "Tata Tiscon Fe550D TMT Rebar 8mm", unit: "TONNE", sku: "STL-TMT-8", min: 5, reorder: 15 },
      { name: "Tata Tiscon Fe550D TMT Rebar 10mm", unit: "TONNE", sku: "STL-TMT-10", min: 8, reorder: 20 },
      { name: "Tata Tiscon Fe550D TMT Rebar 12mm", unit: "TONNE", sku: "STL-TMT-12", min: 10, reorder: 25 },
      { name: "Tata Tiscon Fe550D TMT Rebar 16mm", unit: "TONNE", sku: "STL-TMT-16", min: 10, reorder: 25 },
      { name: "Tata Tiscon Fe550D TMT Rebar 20mm", unit: "TONNE", sku: "STL-TMT-20", min: 8, reorder: 20 },
      { name: "Tata Tiscon Fe550D TMT Rebar 25mm", unit: "TONNE", sku: "STL-TMT-25", min: 5, reorder: 15 },
      { name: "Jindal Panther Fe550D TMT Rebar 12mm", unit: "TONNE", sku: "STL-JND-12", min: 10, reorder: 25 },
      { name: "Binding Wire (18 Gauge Galvanized)", unit: "KG", sku: "STL-BND-18", min: 50, reorder: 100 },
      { name: "MS Structural Angle 50x50x6mm", unit: "KG", sku: "STL-ANG-50", min: 100, reorder: 300 },
      { name: "MS Channel 100x50mm", unit: "KG", sku: "STL-CHN-100", min: 100, reorder: 300 },
    ],
  },
  {
    category: "Bricks, Blocks & Masonry",
    items: [
      { name: "Red Clay Kiln Bricks (Standard 9x4x3)", unit: "PIECE", sku: "BRK-RED-STD", min: 2000, reorder: 5000 },
      { name: "Fly Ash Bricks Class 1", unit: "PIECE", sku: "BRK-FLY-ASH", min: 1500, reorder: 4000 },
      { name: "AAC Lightweight Blocks (600x200x150mm)", unit: "PIECE", sku: "BLK-AAC-150", min: 300, reorder: 800 },
      { name: "AAC Lightweight Blocks (600x200x200mm)", unit: "PIECE", sku: "BLK-AAC-200", min: 300, reorder: 800 },
      { name: "Block Jointing Chemical Mortar (40kg)", unit: "BAG", sku: "MOR-AAC-40", min: 25, reorder: 60 },
    ],
  },
  {
    category: "Paints, Putty & Waterproofing",
    items: [
      { name: "Asian Paints Apex Ultima White (20L)", unit: "LITRE", sku: "PNT-APX-WHT", min: 20, reorder: 50 },
      { name: "Asian Paints Tractor Emulsion (20L)", unit: "LITRE", sku: "PNT-TRC-20L", min: 15, reorder: 40 },
      { name: "Dr. Fixit 101 LW+ Waterproofing (20L)", unit: "LITRE", sku: "CHM-DFX-101", min: 10, reorder: 30 },
      { name: "Dr. Fixit Fastflex 2K Waterproofing (12kg)", unit: "KG", sku: "CHM-DFX-FFX", min: 10, reorder: 25 },
      { name: "Birla White Wall Care Putty (40kg)", unit: "BAG", sku: "PTY-WCR-40", min: 30, reorder: 75 },
      { name: "Exterior Acrylic Wall Primer (20L)", unit: "LITRE", sku: "PRM-EXT-20L", min: 15, reorder: 30 },
    ],
  },
  {
    category: "Plumbing & Drainage",
    items: [
      { name: "Astral CPVC Pro Pipe 1 inch (3m SDR 11)", unit: "PIECE", sku: "PLB-CPVC-1IN", min: 30, reorder: 80 },
      { name: "Astral CPVC Pro Pipe 3/4 inch (3m SDR 11)", unit: "PIECE", sku: "PLB-CPVC-34IN", min: 40, reorder: 100 },
      { name: "Supreme PVC SWR Drainage Pipe 110mm (4 inch)", unit: "PIECE", sku: "PLB-SWR-110", min: 20, reorder: 50 },
      { name: "CPVC Heavy Duty Solvent Cement (500ml)", unit: "PIECE", sku: "PLB-SLV-500", min: 10, reorder: 25 },
    ],
  },
  {
    category: "Electrical & Wiring",
    items: [
      { name: "Finolex 1.5 sq mm FR Wire (90m coil)", unit: "BOX", sku: "ELC-FNL-15", min: 10, reorder: 25 },
      { name: "Finolex 2.5 sq mm FR Wire (90m coil)", unit: "BOX", sku: "ELC-FNL-25", min: 15, reorder: 35 },
      { name: "Finolex 4.0 sq mm FR Wire (90m coil)", unit: "BOX", sku: "ELC-FNL-40", min: 10, reorder: 20 },
      { name: "PVC Electrical Conduit Pipe 25mm (3m)", unit: "PIECE", sku: "ELC-CND-25", min: 50, reorder: 150 },
    ],
  },
  {
    category: "Tiles, Granite & Adhesive",
    items: [
      { name: "Vitrified Floor Tiles 600x600mm Double Charged", unit: "BOX", sku: "TLS-VIT-600", min: 40, reorder: 100 },
      { name: "Granite Slab Black Galaxy (18mm)", unit: "PIECE", sku: "STN-GRN-BLK", min: 10, reorder: 25 },
      { name: "Polymer Modified Tile Adhesive (20kg)", unit: "BAG", sku: "ADH-TLS-20K", min: 20, reorder: 50 },
    ],
  },
];

export default function MaterialsPage() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [materials, setMaterials] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Role & Permission Checks
  const canAddMaterial = canUser(currentUser, "inventory:adjust");
  const canReceiveGoods = canUser(currentUser, "inventory:receipt");
  const canIssueStock = canUser(currentUser, "inventory:issue");
  const canTransferStock = canUser(currentUser, "inventory:transfer");
  const canDeleteMaterial = canUser(currentUser, "inventory:adjust");
  const canPlaceOrder =
    canUser(currentUser, "inventory:receipt") ||
    canUser(currentUser, "inventory:adjust") ||
    canUser(currentUser, "projects:write") ||
    (currentUser?.role &&
      ["SUPER_ADMIN", "ORG_ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR", "STOREKEEPER"].includes(
        currentUser.role
      ));

  // Place Order Modal state
  const [showPlaceOrderModal, setShowPlaceOrderModal] = useState(false);
  const [orderModalMaterial, setOrderModalMaterial] = useState<any | null>(null);

  // Create Material Modal state
  const [showCreateMaterialModal, setShowCreateMaterialModal] = useState(false);
  const [newMatName, setNewMatName] = useState("");
  const [newMatSku, setNewMatSku] = useState("");
  const [newMatUnit, setNewMatUnit] = useState("BAG");
  const [newMatMinStock, setNewMatMinStock] = useState("");
  const [newMatReorder, setNewMatReorder] = useState("");
  const [selectedMaterialPreset, setSelectedMaterialPreset] = useState("");
  const [isCustomMaterialName, setIsCustomMaterialName] = useState(false);
  const [isMaterialDropdownOpen, setIsMaterialDropdownOpen] = useState(false);
  const materialDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        materialDropdownRef.current &&
        !materialDropdownRef.current.contains(event.target as Node)
      ) {
        setIsMaterialDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSelectPreset = (preset: StandardMaterialPreset) => {
    setNewMatName(preset.name);
    setNewMatUnit(preset.unit);
    setNewMatMinStock(preset.min ? String(preset.min) : "");
    setNewMatReorder(preset.reorder ? String(preset.reorder) : "");
    setNewMatSku(`${preset.sku}-${Math.floor(100 + Math.random() * 900)}`);
    setSelectedMaterialPreset(preset.name);
    setIsCustomMaterialName(false);
    setIsMaterialDropdownOpen(false);
  };

  const handleSelectCustomName = (nameToUse: string) => {
    const trimmed = nameToUse.trim();
    if (!trimmed) return;
    setNewMatName(trimmed);
    setSelectedMaterialPreset("__CUSTOM__");
    setIsCustomMaterialName(true);
    const cleaned = trimmed
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join("-");
    if (cleaned) {
      setNewMatSku(`MAT-${cleaned}-${Math.floor(100 + Math.random() * 900)}`);
    }
    setIsMaterialDropdownOpen(false);
  };

  const handleSearchInputChange = (val: string) => {
    setNewMatName(val);
    setIsMaterialDropdownOpen(true);

    // Look for exact catalog match
    let found: StandardMaterialPreset | null = null;
    for (const group of STANDARD_CONSTRUCTION_MATERIALS) {
      const match = group.items.find(
        (i) => i.name.toLowerCase() === val.trim().toLowerCase()
      );
      if (match) {
        found = match;
        break;
      }
    }

    if (found) {
      setNewMatUnit(found.unit);
      setNewMatMinStock(found.min ? String(found.min) : "");
      setNewMatReorder(found.reorder ? String(found.reorder) : "");
      setNewMatSku(`${found.sku}-${Math.floor(100 + Math.random() * 900)}`);
      setSelectedMaterialPreset(found.name);
      setIsCustomMaterialName(false);
    } else {
      setSelectedMaterialPreset("__CUSTOM__");
      setIsCustomMaterialName(true);
      const cleaned = val
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, "")
        .trim()
        .split(/\s+/)
        .slice(0, 3)
        .join("-");
      if (cleaned) {
        setNewMatSku(`MAT-${cleaned}-${Math.floor(100 + Math.random() * 900)}`);
      }
    }
  };

  const filteredMaterialGroups = STANDARD_CONSTRUCTION_MATERIALS.map((group) => {
    const q = newMatName.trim().toLowerCase();
    if (!q) return group;
    const matchingItems = group.items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        group.category.toLowerCase().includes(q)
    );
    return {
      ...group,
      items: matchingItems,
    };
  }).filter((group) => group.items.length > 0);

  const totalMatchingMaterials = filteredMaterialGroups.reduce(
    (acc, g) => acc + g.items.length,
    0
  );

  // Modal states
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [parties, setParties] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitRate, setUnitRate] = useState("");
  const [vendorPartyId, setVendorPartyId] = useState("");
  const [referenceDoc, setReferenceDoc] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [notes, setNotes] = useState("");

  // Transfer Form states
  const [transferSourceStoreId, setTransferSourceStoreId] = useState("");
  const [transferTargetStoreId, setTransferTargetStoreId] = useState("");
  const [transferMaterialId, setTransferMaterialId] = useState("");
  const [transferQty, setTransferQty] = useState("");
  const [transferRefDoc, setTransferRefDoc] = useState("");
  const [transferNotes, setTransferNotes] = useState("");

  const loadMaterials = () => {
    setLoading(true);
    fetch("/api/materials")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setMaterials(res.data || []);
        }
      })
      .catch((err) => {
        console.error("Authoritative materials load failed:", err);
      })
      .finally(() => setLoading(false));
  };

  const loadStores = () => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setStores(res.data);
          setSelectedStoreId((prev) => (prev && res.data.some((s: any) => s.id === prev) ? prev : res.data[0].id));
          setTransferSourceStoreId((prev) => (prev && res.data.some((s: any) => s.id === prev) ? prev : res.data[0].id));
          if (res.data.length > 1) {
            setTransferTargetStoreId((prev) =>
              prev && res.data.some((s: any) => s.id === prev && s.id !== res.data[0].id) ? prev : res.data[1].id
            );
          } else {
            setTransferTargetStoreId(res.data[0].id);
          }
        }
      })
      .catch((err) => {
        console.error("Authoritative stores load failed:", err);
      });
  };

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data?.user) {
          setCurrentUser(res.data.user);
        }
      })
      .catch(() => {});
    loadMaterials();
    loadStores();
    fetch("/api/parties?type=VENDOR")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setParties(res.data || []);
      });
    fetch("/api/projects")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setProjects(res.data || []);
      });
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setTasks(res.data || []);
      });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowReceiveModal(false);
        setShowIssueModal(false);
        setShowTransferModal(false);
        setShowCreateMaterialModal(false);
        setShowPlaceOrderModal(false);
      }
    };
    if (showReceiveModal || showIssueModal || showTransferModal || showCreateMaterialModal || showPlaceOrderModal) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showReceiveModal, showIssueModal, showTransferModal, showCreateMaterialModal, showPlaceOrderModal]);

  useEffect(() => {
    if (stores.length > 0) {
      if (!selectedStoreId || !stores.some((s) => s.id === selectedStoreId)) {
        setSelectedStoreId(stores[0].id);
      }
      if (!transferSourceStoreId || !stores.some((s) => s.id === transferSourceStoreId)) {
        setTransferSourceStoreId(stores[0].id);
      }
      if (!transferTargetStoreId || !stores.some((s) => s.id === transferTargetStoreId)) {
        setTransferTargetStoreId(stores.length > 1 ? stores[1].id : stores[0].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  const handleCreateMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: newMatSku.trim().toUpperCase(),
          name: newMatName.trim(),
          unitCode: newMatUnit,
          minStockQty: newMatMinStock ? parseFloat(newMatMinStock) : 0,
          reorderQty: newMatReorder ? parseFloat(newMatReorder) : 0,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to create material");
      } else {
        setStatusMessage(`Material "${data.data.name}" added to master inventory!`);
        setShowCreateMaterialModal(false);
        setNewMatName("");
        setNewMatSku("");
        setNewMatMinStock("");
        setNewMatReorder("");
        setSelectedMaterialPreset("");
        setIsCustomMaterialName(false);
        setIsMaterialDropdownOpen(false);
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during material creation");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteMaterial = async (id: string) => {
    if (!confirm("Are you sure you want to remove this material from inventory?")) return;
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/materials?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to remove material");
        return;
      }
      setStatusMessage("Material removed successfully.");
      loadMaterials();
    } catch (err: any) {
      setErrorMessage(`Network error: ${err.message || "Failed to delete material"}`);
    }
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const storeToUse = selectedStoreId || (stores.length > 0 ? stores[0].id : "");
    if (!storeToUse) {
      setErrorMessage("Please select a store to receive goods.");
      setActionLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeToUse,
          vendorPartyId: vendorPartyId || undefined,
          projectId: projectId || undefined,
          referenceDoc: referenceDoc || undefined,
          notes: notes || undefined,
          items: [
            {
              materialId: selectedMaterialId,
              quantity: parseFloat(quantity),
              unitRate: unitRate ? parseFloat(unitRate) * 100 : undefined, // store paise
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to receive goods");
      } else {
        setStatusMessage("Goods received and authoritative ledger updated successfully!");
        setShowReceiveModal(false);
        setQuantity("");
        setUnitRate("");
        setReferenceDoc("");
        setNotes("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during receipt");
    } finally {
      setActionLoading(false);
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    const storeToUse = selectedStoreId || (stores.length > 0 ? stores[0].id : "");
    if (!storeToUse) {
      setErrorMessage("Please select a store to issue goods from.");
      setActionLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/inventory/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: storeToUse,
          materialId: selectedMaterialId,
          quantity: parseFloat(quantity),
          projectId: projectId || undefined,
          taskId: taskId || undefined,
          notes: notes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to issue material");
      } else {
        setStatusMessage("Material issued and project consumption logged successfully!");
        setShowIssueModal(false);
        setQuantity("");
        setNotes("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during issue");
    } finally {
      setActionLoading(false);
    }
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (transferSourceStoreId === transferTargetStoreId) {
      setErrorMessage("Source store and destination store cannot be the same");
      return;
    }
    const qtyNum = parseFloat(transferQty);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setErrorMessage("Transfer quantity must be greater than zero");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceStoreId: transferSourceStoreId,
          targetStoreId: transferTargetStoreId,
          materialId: transferMaterialId || (materials.length > 0 ? materials[0].id : ""),
          quantity: qtyNum,
          referenceDoc: transferRefDoc || undefined,
          notes: transferNotes || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error?.message || "Failed to transfer material");
      } else {
        setStatusMessage("Material transferred successfully across stores!");
        setShowTransferModal(false);
        setTransferQty("");
        setTransferRefDoc("");
        setTransferNotes("");
        loadMaterials();
      }
    } catch {
      setErrorMessage("Network error during transfer");
    } finally {
      setActionLoading(false);
    }
  };

  const filteredMaterials = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.sku.toLowerCase().includes(search.toLowerCase())
  );

  const materialColumns: ExcelColumn<any>[] = useMemo(
    () => [
      {
        key: "name",
        label: "Material / SKU",
        accessor: (m) => `${m.name} ${m.sku}`,
        type: "text",
      },
      {
        key: "category",
        label: "Category",
        accessor: (m) => m.category?.name || "General",
        type: "text",
      },
      {
        key: "unitCode",
        label: "Unit",
        accessor: (m) => m.unitCode,
        type: "text",
      },
      {
        key: "totalStock",
        label: "Current Stock",
        accessor: (m) => Number(m.totalStock) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "minStockQty",
        label: "Min Threshold",
        accessor: (m) => Number(m.minStockQty) || 0,
        type: "number",
        align: "right",
      },
      {
        key: "status",
        label: "Status",
        accessor: (m) => (m.isZeroStock ? "Out of Stock" : m.isLowStock ? "Low Stock" : "Adequate"),
        type: "text",
        align: "center",
      },
    ],
    []
  );

  const excelMaterials = useExcelTable({
    data: filteredMaterials,
    columns: materialColumns,
  });

  return (
    <Shell>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader icon={Boxes} title="Materials Master & Site Inventory" subtitle="Authoritative stock ledger per store. Click any material to open its running balance ledger.">

          <div className="flex items-center gap-2 flex-wrap">
            {canPlaceOrder && (
              <button
                onClick={() => {
                  setOrderModalMaterial(null);
                  setShowPlaceOrderModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-sm transition-all cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Place Order</span>
              </button>
            )}
            {canAddMaterial && (
              <button
                onClick={() => {
                  setNewMatName("");
                  setNewMatSku("");
                  setNewMatMinStock("");
                  setNewMatReorder("");
                  setSelectedMaterialPreset("");
                  setIsCustomMaterialName(false);
                  setIsMaterialDropdownOpen(false);
                  setShowCreateMaterialModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>+ Add Material</span>
              </button>
            )}
            {canReceiveGoods && (
              <button
                onClick={() => {
                  loadStores();
                  if (materials.length > 0) setSelectedMaterialId(materials[0].id);
                  setShowReceiveModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <PackagePlus className="w-4 h-4" />
                <span>+ Goods Receipt</span>
              </button>
            )}
            {canIssueStock && (
              <button
                onClick={() => {
                  loadStores();
                  if (materials.length > 0) setSelectedMaterialId(materials[0].id);
                  setShowIssueModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <PackageMinus className="w-4 h-4" />
                <span>- Issue Stock</span>
              </button>
            )}
            {canTransferStock && (
              <button
                onClick={() => {
                  loadStores();
                  if (materials.length > 0) setTransferMaterialId(materials[0].id);
                  if (stores.length > 0) setTransferSourceStoreId(stores[0].id);
                  if (stores.length > 1) setTransferTargetStoreId(stores[1].id);
                  setShowTransferModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition-all cursor-pointer"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>⇄ Transfer Stock</span>
              </button>
            )}
          </div>
        </PageHeader>

        {/* Feedback alerts */}
        {statusMessage && <Alert tone="success">{statusMessage}</Alert>}
        {errorMessage && <Alert tone="error">{errorMessage}</Alert>}

        {/* Filter bar */}
        <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by material name or SKU code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Materials Table & Cards */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-200/60 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredMaterials.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
            <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="text-sm font-bold text-slate-700">No materials found</div>
            <div className="text-xs text-slate-400 mt-1">Try clearing your search query.</div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <ExcelTableToolbar
              table={excelMaterials}
              columns={materialColumns}
              tableName="materials"
              showSearch={true}
              showExport={true}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-slate-900 text-slate-200 text-xs uppercase tracking-wider font-semibold">
                  <tr>
                    {materialColumns.map((col) => (
                      <ExcelColumnHeader
                        key={col.key}
                        column={col}
                        table={excelMaterials}
                        theme="darkHeader"
                      />
                    ))}
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {excelMaterials.filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={materialColumns.length + 1} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Filter className="w-8 h-8 text-slate-300" />
                          <p className="font-semibold text-slate-700">No materials match selected filters</p>
                          <p className="text-xs text-slate-400">Try clearing or adjusting column filters.</p>
                          <button
                            type="button"
                            onClick={excelMaterials.clearAllFilters}
                            className="mt-2 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs"
                          >
                            Reset Filters
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    excelMaterials.filteredData.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-amber-50/40 transition-colors group cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <Link href={`/materials/${m.id}`} className="block">
                          <div className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                            {m.name}
                          </div>
                          <div className="text-xs text-slate-400 font-mono">{m.sku}</div>
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        {m.category?.name || "General"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                          {m.unitCode}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-black text-slate-900 tabular-nums">
                        {formatQuantity(m.totalStock, m.unitCode)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-500 tabular-nums">
                        {formatQuantity(m.minStockQty, m.unitCode)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {m.isZeroStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800" title={m.alertReason}>
                            <AlertTriangle className="w-3 h-3 text-rose-600" /> Out of Stock
                          </span>
                        ) : m.isLowStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800" title={m.alertReason}>
                            <AlertTriangle className="w-3 h-3 text-amber-600" /> Low Stock
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800" title={m.alertReason}>
                            Adequate
                          </span>
                        )}
                        {m.alertReason && m.isLowStock && (
                          <div className="text-[10px] text-slate-500 mt-0.5 break-words whitespace-normal mx-auto font-medium" title={m.alertReason}>
                            {m.alertReason}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2.5">
                          {canPlaceOrder && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOrderModalMaterial({
                                  id: m.id,
                                  name: m.name,
                                  sku: m.sku,
                                  unitCode: m.unitCode,
                                  minStockQty: m.minStockQty,
                                  reorderQty: m.reorderQty,
                                  currentStock: m.totalStock,
                                });
                                setShowPlaceOrderModal(true);
                              }}
                              className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition cursor-pointer ${
                                m.isLowStock
                                  ? "bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-xs"
                                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                              }`}
                              title="Place Order to Vendor"
                            >
                              <ShoppingCart className="w-3.5 h-3.5" />
                              <span>Order</span>
                            </button>
                          )}
                          <Link
                            href={`/materials/${m.id}`}
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 hover:underline"
                          >
                            <span>Ledger</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          {canDeleteMaterial && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMaterial(m.id);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                              title="Delete Material"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: Goods Receipt */}
        {showReceiveModal && canReceiveGoods && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <PackagePlus className="w-5 h-5 text-emerald-600" />
                  <span>Receive Goods into Site Store</span>
                </div>
                <button
                  onClick={() => setShowReceiveModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="receive-goods-modal-form" onSubmit={handleReceiveSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Material
                  </label>
                  <select
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.sku}) — {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      Receiving Store / Yard
                    </label>
                    {stores.length === 0 && (
                      <span className="text-[11px] text-amber-600 font-semibold animate-pulse">Loading stores...</span>
                    )}
                  </div>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {stores.length === 0 ? (
                      <option value="">Loading stores...</option>
                    ) : (
                      stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.site?.name || "General Yard"})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Received Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 50"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Unit Rate (₹ per unit)
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="e.g. 380"
                      value={unitRate}
                      onChange={(e) => setUnitRate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Vendor / Supplier
                    </label>
                    <select
                      value={vendorPartyId}
                      onChange={(e) => setVendorPartyId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Vendor (Optional)</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Delivery Challan #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. DC-9901"
                      value={referenceDoc}
                      onChange={(e) => setReferenceDoc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Allocated Project
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  >
                    <option value="">Other / General Central Store (Not allocated to specific project)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} - {p.name} {p.site ? `(${p.site.name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    placeholder="Batch inspection passed, gate entry verified"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="receive-goods-modal-form"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {actionLoading ? "Receiving..." : "Confirm Goods Receipt"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Issue Material */}
        {showIssueModal && canIssueStock && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <PackageMinus className="w-5 h-5 text-amber-500" />
                  <span>Issue Material to Project / Task</span>
                </div>
                <button
                  onClick={() => setShowIssueModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="issue-material-modal-form" onSubmit={handleIssueSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Material to Issue
                  </label>
                  <select
                    value={selectedMaterialId}
                    onChange={(e) => setSelectedMaterialId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} — Current Stock: {m.totalStock} {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      Issuing Store / Yard
                    </label>
                    {stores.length === 0 && (
                      <span className="text-[11px] text-amber-600 font-semibold animate-pulse">Loading stores...</span>
                    )}
                  </div>
                  <select
                    value={selectedStoreId}
                    onChange={(e) => setSelectedStoreId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {stores.length === 0 ? (
                      <option value="">Loading stores...</option>
                    ) : (
                      stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.site?.name || "General Yard"})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Issue Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    placeholder="e.g. 10"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Project
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Project (Optional)</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Target Task
                    </label>
                    <select
                      value={taskId}
                      onChange={(e) => setTaskId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    >
                      <option value="">Select Task (Optional)</option>
                      {tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Purpose / Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Issued to sub-contractor for 5th floor casting"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="issue-material-modal-form"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {actionLoading ? "Issuing..." : "Confirm Material Issue"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Transfer Material */}
        {showTransferModal && canTransferStock && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <ArrowRightLeft className="w-5 h-5 text-sky-600" />
                  <span>Transfer Stock Across Stores</span>
                </div>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="transfer-material-modal-form" onSubmit={handleTransferSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 uppercase">
                        Source Store (From)
                      </label>
                      {stores.length === 0 && (
                        <span className="text-[11px] text-amber-600 font-semibold animate-pulse">Loading...</span>
                      )}
                    </div>
                    <select
                      value={transferSourceStoreId}
                      onChange={(e) => setTransferSourceStoreId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      {stores.length === 0 ? (
                        <option value="">Loading stores...</option>
                      ) : (
                        stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.site?.name || "General Yard"})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-slate-700 uppercase">
                        Target Store (To)
                      </label>
                      {stores.length === 0 && (
                        <span className="text-[11px] text-amber-600 font-semibold animate-pulse">Loading...</span>
                      )}
                    </div>
                    <select
                      value={transferTargetStoreId}
                      onChange={(e) => setTransferTargetStoreId(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      {stores.length === 0 ? (
                        <option value="">Loading stores...</option>
                      ) : (
                        stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.site?.name || "General Yard"})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Select Material
                  </label>
                  <select
                    value={transferMaterialId}
                    onChange={(e) => setTransferMaterialId(e.target.value)}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                  >
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.sku}) — Available: {m.totalStock} {m.unitCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Transfer Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      placeholder="e.g. 20"
                      value={transferQty}
                      onChange={(e) => setTransferQty(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Gate Pass / Challan #
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. TR-2026-001"
                      value={transferRefDoc}
                      onChange={(e) => setTransferRefDoc(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Transfer Notes
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Inter-site surplus redistribution"
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm"
                  />
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="transfer-material-modal-form"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {actionLoading ? "Transferring..." : "Confirm Stock Transfer"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create Material */}
        {showCreateMaterialModal && canAddMaterial && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
            <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-scale-in">
              <div className="p-5 pb-3 border-b border-slate-100 shrink-0 bg-white flex items-center justify-between">
                <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-amber-500" />
                  <span>Add Master Material</span>
                </div>
                <button
                  onClick={() => setShowCreateMaterialModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form id="create-material-modal-form" onSubmit={handleCreateMaterial} className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="relative" ref={materialDropdownRef}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700 uppercase">
                      Material Name *
                    </label>
                    {newMatName.trim() && (
                      <span className="text-[11px] text-slate-500">
                        {selectedMaterialPreset && selectedMaterialPreset !== "__CUSTOM__" ? (
                          <span className="text-emerald-700 font-bold inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                            <Check className="w-3 h-3 text-emerald-600" /> Catalog Preset Selected
                          </span>
                        ) : (
                          <span className="text-amber-700 font-bold inline-flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                            <Sparkles className="w-3 h-3 text-amber-600" /> Custom Material
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Search Combobox Input */}
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="text"
                      required
                      placeholder="Type to search material (e.g. Cement, 12mm TMT, Sand, Paint)..."
                      value={newMatName}
                      onChange={(e) => handleSearchInputChange(e.target.value)}
                      onFocus={() => setIsMaterialDropdownOpen(true)}
                      className="w-full pl-9 pr-16 bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-0.5">
                      {newMatName && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewMatName("");
                            setSelectedMaterialPreset("");
                            setIsCustomMaterialName(false);
                            setIsMaterialDropdownOpen(true);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                          title="Clear input"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setIsMaterialDropdownOpen((prev) => !prev)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                        title="Toggle materials list"
                      >
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            isMaterialDropdownOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Search Autocomplete Dropdown List */}
                  {isMaterialDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white rounded-xl shadow-2xl border border-slate-200 max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {/* Option to use typed text as custom material */}
                      {newMatName.trim() && (
                        <div
                          onClick={() => handleSelectCustomName(newMatName)}
                          className="p-2.5 bg-amber-50/70 hover:bg-amber-100/90 cursor-pointer flex items-center justify-between transition-colors border-b border-amber-100"
                        >
                          <div className="flex items-center gap-2">
                            <Plus className="w-4 h-4 text-amber-600 shrink-0" />
                            <div className="text-xs text-amber-900 font-medium">
                              Use <strong className="font-bold text-amber-950">&quot;{newMatName.trim()}&quot;</strong> as custom material name
                            </div>
                          </div>
                          <span className="text-[10px] font-bold uppercase bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-full shrink-0">
                            Custom
                          </span>
                        </div>
                      )}

                      {/* Header summary */}
                      <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[11px] font-semibold text-slate-500">
                        <span>
                          {newMatName.trim()
                            ? `Found ${totalMatchingMaterials} matching standard material${
                                totalMatchingMaterials === 1 ? "" : "s"
                              }`
                            : "Standard Construction Catalog (Click to select)"}
                        </span>
                        <span className="text-[10px] text-slate-400">Auto-fills unit &amp; thresholds</span>
                      </div>

                      {/* Filtered items */}
                      {filteredMaterialGroups.length > 0 ? (
                        filteredMaterialGroups.map((group) => (
                          <div key={group.category} className="py-1">
                            <div className="px-3 py-1 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                              {group.category}
                            </div>
                            {group.items.map((item) => {
                              const isSelected = newMatName === item.name;
                              return (
                                <div
                                  key={item.name}
                                  onClick={() => handleSelectPreset(item)}
                                  className={`px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors ${
                                    isSelected
                                      ? "bg-amber-50 font-bold text-amber-900"
                                      : "hover:bg-slate-50 text-slate-800"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    {isSelected ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    ) : (
                                      <div className="w-3.5 h-3.5 shrink-0" />
                                    )}
                                    <div>
                                      <div className="text-xs font-semibold text-slate-800">
                                        {item.name}
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        SKU: {item.sku} • Min: {item.min} • Reorder: {item.reorder} {item.unit}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                                    {item.unit}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center">
                          <p className="text-xs text-slate-500">
                            No catalog materials matching &quot;{newMatName}&quot;
                          </p>
                          <button
                            type="button"
                            onClick={() => handleSelectCustomName(newMatName)}
                            className="mt-2 text-xs font-bold text-amber-600 hover:text-amber-700 underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Use &quot;{newMatName}&quot; as custom material
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="mt-1 text-[11px] text-slate-500">
                    Type to quickly search materials (e.g. &quot;Cement&quot;, &quot;12mm&quot;, &quot;Sand&quot;, &quot;Paint&quot;) or enter any custom name.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      SKU / Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MAT-CEM-53"
                      value={newMatSku}
                      onChange={(e) => setNewMatSku(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Unit of Measure *
                    </label>
                    <select
                      value={newMatUnit}
                      onChange={(e) => setNewMatUnit(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-medium"
                    >
                      <option value="BAG">BAG (Bags)</option>
                      <option value="KG">KG (Kilograms)</option>
                      <option value="TONNE">TONNE (Metric Tonnes)</option>
                      <option value="LITRE">LITRE (Litres)</option>
                      <option value="METER">METER (Meters)</option>
                      <option value="PIECE">PIECE (Pieces)</option>
                      <option value="BOX">BOX (Boxes)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Min Stock Threshold
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 50"
                      value={newMatMinStock}
                      onChange={(e) => setNewMatMinStock(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                      Reorder Quantity
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 200"
                      value={newMatReorder}
                      onChange={(e) => setNewMatReorder(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm font-mono"
                    />
                  </div>
                </div>

              </form>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateMaterialModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-material-modal-form"
                  disabled={actionLoading}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-sm disabled:opacity-50 transition"
                >
                  {actionLoading ? "Saving..." : "Add to Inventory"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Place Order to Vendor Modal */}
      <PlaceOrderModal
        isOpen={showPlaceOrderModal && canPlaceOrder}
        onClose={() => setShowPlaceOrderModal(false)}
        onOrderPlaced={() => loadMaterials()}
        initialMaterial={orderModalMaterial}
      />
    </Shell>
  );
}
