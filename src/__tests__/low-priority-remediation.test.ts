import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { formatFileSize, formatCurrency, formatDate, formatDateTime, formatQuantity } from "../lib/formatters";

describe("Low-Priority Remediation & Accessibility Verification", () => {
  describe("Item 1: Remove Recent Site Photos Modal from Dashboard", () => {
    const pageContent = fs.readFileSync(path.join(__dirname, "../app/page.tsx"), "utf8");

    it("does not contain lightboxPhoto state in dashboard page", () => {
      expect(pageContent).not.toContain("const [lightboxPhoto, setLightboxPhoto]");
      expect(pageContent).not.toContain("setLightboxPhoto(");
    });

    it("does not render the lightbox modal overlay markup on the dashboard", () => {
      expect(pageContent).not.toContain("{lightboxPhoto && (");
      expect(pageContent).not.toContain("Lightbox Modal for Recent Site Photos");
    });

    it("preserves gallery display and provides direct external link for full resolution view", () => {
      expect(pageContent).toContain("displayedPhotos.map");
      expect(pageContent).toContain("Open photo in new tab");
      expect(pageContent).toContain("handleDashboardPhotoReplace");
      expect(pageContent).toContain("handleDashboardPhotoDelete");
    });

    it("preserves AttachmentManager and authorized photo viewing across other modules", () => {
      const attManager = fs.readFileSync(path.join(__dirname, "../components/attachments/AttachmentManager.tsx"), "utf8");
      expect(attManager).toContain("AttachmentManager");
      expect(attManager).toContain("loadAttachments");
      expect(attManager).toContain("uploadSingleFile");
    });
  });

  describe("Item 2: Day Book Modal Explanatory Guidance", () => {
    const dayBookContent = fs.readFileSync(path.join(__dirname, "../app/day-book/page.tsx"), "utf8");

    it("defines clear guidance metadata for PAYMENT, BILL, WORKFORCE, and DSR modes", () => {
      expect(dayBookContent).toContain("modalModeGuidance");
      expect(dayBookContent).toContain("Log Payment Out (Cash / Bank Disbursement)");
      expect(dayBookContent).toContain("Enter Incoming Bill / Tax Invoice");
      expect(dayBookContent).toContain("Record Daily Workforce Headcount");
      expect(dayBookContent).toContain("Submit Daily Site Report (DSR)");
    });

    it("renders the explanatory guidance banner inside the Day Book entry modal", () => {
      expect(dayBookContent).toContain("Modal Explanatory Guidance Banner");
      expect(dayBookContent).toContain("modalModeGuidance[modalMode].description");
      expect(dayBookContent).toContain("modalModeGuidance[modalMode].requiredFields");
      expect(dayBookContent).toContain("modalModeGuidance[modalMode].expectedAction");
    });

    it("handles keyboard Escape key and locks body scrolling when modal is active", () => {
      expect(dayBookContent).toContain('if (e.key === "Escape")');
      expect(dayBookContent).toContain("setShowLogModal(false)");
      expect(dayBookContent).toContain('document.body.style.overflow = "hidden"');
      expect(dayBookContent).toContain('document.body.style.overflow = ""');
    });

    it("includes accessible dialog attributes and accessible close button", () => {
      expect(dayBookContent).toContain('role="dialog"');
      expect(dayBookContent).toContain('aria-modal="true"');
      expect(dayBookContent).toContain('aria-labelledby="daybook-modal-title"');
      expect(dayBookContent).toContain('aria-label="Close Day Book entry modal"');
    });
  });

  describe("Phase 2: Project-Wide UI, Typography & Formatter Verification", () => {
    it("formats file sizes correctly across units using formatFileSize", () => {
      expect(formatFileSize(0)).toBe("0 B");
      expect(formatFileSize(500)).toBe("500 B");
      expect(formatFileSize(1024)).toBe("1.0 KB");
      expect(formatFileSize(1024 * 50)).toBe("50 KB");
      expect(formatFileSize(1024 * 1024 * 2.5)).toBe("2.5 MB");
      expect(formatFileSize(1024 * 1024 * 1024 * 1.5)).toBe("1.5 GB");
    });

    it("maintains consistent formatting for currency, dates, and quantities", () => {
      expect(formatCurrency(5000000)).toBe("₹50,000.00");
      expect(formatCurrency(0)).toBe("₹0.00");
      expect(formatQuantity(120.5, "SQM")).toBe("120.50 SQM");
      expect(formatQuantity(10, "BAGS")).toBe("10 BAGS");
      expect(formatDate("2026-10-28")).toMatch(/2026/);
    });

    it("enforces title case consistency across navigation and headers", () => {
      const shellContent = fs.readFileSync(path.join(__dirname, "../components/layout/Shell.tsx"), "utf8");
      expect(shellContent).toContain('label: "Site Work"');
      expect(shellContent).toContain('defaultLabel: "Accounts Export"');
      expect(shellContent).toContain('defaultLabel: "WhatsApp Inbox"');

      const i18nContent = fs.readFileSync(path.join(__dirname, "../lib/i18n.tsx"), "utf8");
      expect(i18nContent).toContain('"nav.group.siteWork": "Site Work"');
      expect(i18nContent).toContain('"nav.exports": "Accounts Export"');
      expect(i18nContent).toContain('"nav.whatsapp": "WhatsApp Inbox"');
    });

    it("enforces Escape key listener and body scroll locking in shared Modal component", () => {
      const modalContent = fs.readFileSync(path.join(__dirname, "../components/ui/Modal.tsx"), "utf8");
      expect(modalContent).toContain('if (e.key === "Escape")');
      expect(modalContent).toContain("onClose();");
      expect(modalContent).toContain('document.body.style.overflow = "hidden"');
      expect(modalContent).toContain('document.body.style.overflow = ""');
      expect(modalContent).toContain('role="dialog"');
      expect(modalContent).toContain('aria-modal="true"');
    });

    it("enforces Escape key listener and body scroll lock across major feature pages", () => {
      const financeContent = fs.readFileSync(path.join(__dirname, "../app/finance/page.tsx"), "utf8");
      expect(financeContent).toContain('if (e.key === "Escape")');
      expect(financeContent).toContain('document.body.style.overflow = "hidden"');

      const projectsContent = fs.readFileSync(path.join(__dirname, "../app/projects/page.tsx"), "utf8");
      expect(projectsContent).toContain('if (e.key === "Escape")');
      expect(projectsContent).toContain('document.body.style.overflow = "hidden"');

      const tasksContent = fs.readFileSync(path.join(__dirname, "../app/tasks/page.tsx"), "utf8");
      expect(tasksContent).toContain('if (e.key === "Escape")');
      expect(tasksContent).toContain('document.body.style.overflow = "hidden"');

      const materialsContent = fs.readFileSync(path.join(__dirname, "../app/materials/page.tsx"), "utf8");
      expect(materialsContent).toContain('if (e.key === "Escape")');
      expect(materialsContent).toContain('document.body.style.overflow = "hidden"');

      const attendanceContent = fs.readFileSync(path.join(__dirname, "../app/attendance/page.tsx"), "utf8");
      expect(attendanceContent).toContain('if (e.key === "Escape")');
      expect(attendanceContent).toContain('document.body.style.overflow = "hidden"');
    });
  });
});
