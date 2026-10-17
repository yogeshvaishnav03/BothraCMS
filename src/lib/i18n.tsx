"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type LanguageCode = "en" | "hi" | "gu" | "mr";

export interface LanguageInfo {
  code: LanguageCode;
  name: string;
  nativeName: string;
  region: string;
  badge?: string;
  direction?: "ltr" | "rtl";
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  {
    code: "en",
    name: "English",
    nativeName: "English",
    region: "Default / Pan-India",
    badge: "Default",
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    region: "North & Central India",
    badge: "Popular",
  },
  {
    code: "gu",
    name: "Gujarati",
    nativeName: "ગુજરાતી",
    region: "Gujarat & Western India",
    badge: "Regional",
  },
  {
    code: "mr",
    name: "Marathi",
    nativeName: "मराठी",
    region: "Maharashtra & Goa",
    badge: "Regional",
  },
];

export const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    // Navigation
    "nav.dashboard": "Dashboard",
    "nav.dayBook": "Day Book",
    "nav.projects": "Projects",
    "nav.tasks": "Tasks & Work",
    "nav.materials": "Materials & Stock",
    "nav.measurementBook": "Measurement Book",
    "nav.parties": "Vendors & Contractors",
    "nav.finance": "Finance & Bills",
    "nav.attendance": "Workforce & Attendance",
    "nav.reports": "Reports & Analytics",
    "nav.audit": "Audit Logs",
    "nav.settings": "Settings",
    "nav.superAdmin": "Super Admin",
    "nav.logout": "Logout",
    "nav.home": "Home",
    "nav.menu": "Menu Navigation",
    "nav.activeSite": "Active Site",
    "nav.alerts": "Operational Alerts",
    "nav.loading": "Loading Build Track Pro...",
    "nav.language": "Language",
    "nav.switchLanguage": "Switch Language",

    // Common Actions
    "action.save": "Save Changes",
    "action.saving": "Saving...",
    "action.cancel": "Cancel",
    "action.edit": "Edit",
    "action.delete": "Delete",
    "action.search": "Search...",
    "action.filter": "Filter",
    "action.export": "Export",
    "action.submit": "Submit",
    "action.addNew": "Add New",
    "action.back": "Back",
    "action.view": "View",
    "action.actions": "Actions",
    "action.confirm": "Confirm",
    "action.close": "Close",
    "action.dismiss": "Dismiss",
    "action.refresh": "Refresh",
    "action.download": "Download",
    "action.viewDetails": "View Details",
    "action.quickAction": "Quick Actions",
    "action.createNew": "Create New",
    "action.apply": "Apply",
    "action.reset": "Reset",

    // Common Labels
    "label.date": "Date",
    "label.time": "Time",
    "label.status": "Status",
    "label.amount": "Amount",
    "label.total": "Total",
    "label.balance": "Balance",
    "label.site": "Site",
    "label.project": "Project",
    "label.category": "Category",
    "label.description": "Description",
    "label.notes": "Notes",
    "label.name": "Name",
    "label.email": "Email",
    "label.phone": "Phone",
    "label.role": "Role",
    "label.quantity": "Quantity",
    "label.unit": "Unit",
    "label.rate": "Rate",
    "label.party": "Party / Vendor",
    "label.worker": "Worker",
    "label.contractor": "Contractor",
    "label.allSites": "All Sites",
    "label.allProjects": "All Projects",
    "label.allStatuses": "All Statuses",
    "label.noData": "No records found.",

    // Dashboard KPIs
    "kpi.activeProjects": "Active Projects",
    "kpi.tasksToday": "Tasks Today",
    "kpi.workersOnSite": "Workers on Site",
    "kpi.unpaidBills": "Unpaid Bills",
    "kpi.criticalMaterials": "Critical Materials",
    "kpi.financialSnapshot": "Financial Snapshot",
    "kpi.totalReceivable": "Total Receivables",
    "kpi.totalPayable": "Total Payables",
    "kpi.netPosition": "Net Position",
    "kpi.quickTask": "+ New Task",
    "kpi.quickCheckIn": "+ Worker Check-in",
    "kpi.quickMaterialIn": "+ Material In",
    "kpi.quickIssue": "+ Material Issue",
    "kpi.dailyProgress": "Daily Site Progress",
    "kpi.urgentAlerts": "Urgent Operational Alerts",

    // Day Book
    "daybook.title": "Daily Site Day Book",
    "daybook.subtitle": "Consolidated chronological register of financial transactions, material movements, labour attendance, and daily work.",
    "daybook.addEntry": "+ Add Day Book Entry",
    "daybook.filterByDate": "Select Date",
    "daybook.financialTransactions": "Financial Transactions",
    "daybook.materialMovements": "Material Movements",
    "daybook.workforceAttendance": "Workforce & Attendance",
    "daybook.tasksProgress": "Tasks & Work Progress",
    "daybook.allEntries": "All Chronological Records",
    "daybook.noEntries": "No entries recorded for this date and site.",
    "daybook.openingBalance": "Opening Balance",
    "daybook.closingBalance": "Closing Balance",
    "daybook.inflow": "Cash / Bank Inflow",
    "daybook.outflow": "Cash / Bank Outflow",

    // Finance & Bills
    "finance.title": "Finance & Bill Ledger",
    "finance.subtitle": "Manage supplier invoices, contractor billings, payments, and payment vouchers.",
    "finance.bills": "Bills & Invoices",
    "finance.payments": "Payments & Disbursements",
    "finance.recordPayment": "+ Record Payment",
    "finance.createBill": "+ Create Bill",

    // Materials & Stock
    "materials.title": "Materials & Inventory",
    "materials.subtitle": "Track stock levels, material receipts (GRN), site issues, and stock transfers.",
    "materials.stockOnHand": "Current Stock on Hand",
    "materials.receipts": "Material Receipts",
    "materials.issues": "Material Issues",
    "materials.transfers": "Stock Transfers",
    "materials.lowStockAlert": "Low Stock Warning",

    // Attendance & Workforce
    "attendance.title": "Workforce & Attendance",
    "attendance.subtitle": "Daily muster roll, biometric & supervisor check-ins, overtime, and contractor worker counts.",
    "attendance.markAttendance": "+ Mark Attendance",
    "attendance.present": "Present",
    "attendance.absent": "Absent",
    "attendance.halfDay": "Half Day",
    "attendance.overtime": "Overtime",

    // Measurement Book
    "mb.title": "Measurement Book (MB)",
    "mb.subtitle": "Authoritative engineering quantity measurement entries, approvals, and contractor billing tie-ins.",
    "mb.newEntry": "+ New Measurement Entry",

    // Settings
    "settings.title": "Organization Settings",
    "settings.subtitle": "Manage company profile, currency formatting, tax registration, display language, and active users.",
    "settings.languageTitle": "Platform Display Language / भाषा चुनें",
    "settings.languageDesc": "Choose your personal interface language for all screens, navigation, and reports.",
    "settings.quickSwitcher": "Quick Language Switcher",
    "settings.quickSwitcherDesc": "Switch platform display language instantly:",

    // Statuses
    "status.todo": "To Do",
    "status.inProgress": "In Progress",
    "status.completed": "Completed",
    "status.blocked": "Blocked",
    "status.active": "Active",
    "status.inactive": "Inactive",
    "status.pending": "Pending",
    "status.approved": "Approved",
    "status.rejected": "Rejected",
    "status.paid": "Paid",
    "status.unpaid": "Unpaid",
    "status.partial": "Partial",
  },
  hi: {
    // Navigation
    "nav.dashboard": "डैशबोर्ड",
    "nav.dayBook": "डे बुक (दैनिक बही)",
    "nav.projects": "परियोजनाएं (प्रोजेक्ट्स)",
    "nav.tasks": "कार्य और प्रगति",
    "nav.materials": "सामग्री और स्टॉक",
    "nav.measurementBook": "माप पुस्तिका (MB)",
    "nav.parties": "विक्रेता व ठेकेदार",
    "nav.finance": "वित्त और बिल",
    "nav.attendance": "कर्मचारी व उपस्थिति",
    "nav.reports": "रिपोर्ट्स और विश्लेषण",
    "nav.audit": "ऑडिट लॉग्स",
    "nav.settings": "सेटिंग्स",
    "nav.superAdmin": "सुपर एडमिन",
    "nav.logout": "लॉग आउट",
    "nav.home": "मुख्य पृष्ठ",
    "nav.menu": "मेनू नेविगेशन",
    "nav.activeSite": "सक्रिय साइट",
    "nav.alerts": "साइट सूचनाएं",
    "nav.loading": "बिल्ड ट्रैक प्रो लोड हो रहा है...",
    "nav.language": "भाषा",
    "nav.switchLanguage": "भाषा बदलें",

    // Common Actions
    "action.save": "परिवर्तन सहेजें",
    "action.saving": "सहेजा जा रहा है...",
    "action.cancel": "रद्द करें",
    "action.edit": "संपादित करें",
    "action.delete": "हटाएं",
    "action.search": "खोजें...",
    "action.filter": "फ़िल्टर",
    "action.export": "निर्यात (एक्सपोर्ट)",
    "action.submit": "जमा करें",
    "action.addNew": "+ नया जोड़ें",
    "action.back": "वापस जाएं",
    "action.view": "देखें",
    "action.actions": "क्रियाएं",
    "action.confirm": "पुष्टि करें",
    "action.close": "बंद करें",
    "action.dismiss": "खारिज करें",
    "action.refresh": "रिफ्रेश करें",
    "action.download": "डाउनलोड करें",
    "action.viewDetails": "विवरण देखें",
    "action.quickAction": "त्वरित क्रियाएं",
    "action.createNew": "नया बनाएं",
    "action.apply": "लागू करें",
    "action.reset": "रीसेट करें",

    // Common Labels
    "label.date": "दिनांक",
    "label.time": "समय",
    "label.status": "स्थिति",
    "label.amount": "राशि",
    "label.total": "कुल",
    "label.balance": "शेष राशि",
    "label.site": "साइट",
    "label.project": "प्रोजेक्ट",
    "label.category": "श्रेणी",
    "label.description": "विवरण",
    "label.notes": "टिप्पणी",
    "label.name": "नाम",
    "label.email": "ईमेल",
    "label.phone": "फ़ोन",
    "label.role": "पद / भूमिका",
    "label.quantity": "मात्रा",
    "label.unit": "इकाई",
    "label.rate": "दर (रेट)",
    "label.party": "पार्टी / विक्रेता",
    "label.worker": "श्रमिक / कारीगर",
    "label.contractor": "ठेकेदार",
    "label.allSites": "सभी साइट्स",
    "label.allProjects": "सभी प्रोजेक्ट्स",
    "label.allStatuses": "सभी स्थितियां",
    "label.noData": "कोई रिकॉर्ड उपलब्ध नहीं है।",

    // Dashboard KPIs
    "kpi.activeProjects": "सक्रिय प्रोजेक्ट्स",
    "kpi.tasksToday": "आज के कार्य",
    "kpi.workersOnSite": "साइट पर उपस्थित श्रमिक",
    "kpi.unpaidBills": "बकाया बिल",
    "kpi.criticalMaterials": "महत्वपूर्ण सामग्री कमी",
    "kpi.financialSnapshot": "वित्तीय स्थिति",
    "kpi.totalReceivable": "कुल प्राप्य राशि",
    "kpi.totalPayable": "कुल देय राशि",
    "kpi.netPosition": "शुद्ध वित्तीय स्थिति",
    "kpi.quickTask": "+ नया कार्य",
    "kpi.quickCheckIn": "+ श्रमिक हाजिरी",
    "kpi.quickMaterialIn": "+ माल आवक",
    "kpi.quickIssue": "+ सामग्री निकासी",
    "kpi.dailyProgress": "दैनिक साइट प्रगति",
    "kpi.urgentAlerts": "तत्काल सूचनाएं",

    // Day Book
    "daybook.title": "दैनिक साइट डे बुक (Day Book)",
    "daybook.subtitle": "वित्तीय लेन-देन, सामग्री आवाजाही, श्रमिक उपस्थिति और दैनिक प्रगति की समेकित तिथि-वार बही।",
    "daybook.addEntry": "+ डे बुक प्रविष्टि जोड़ें",
    "daybook.filterByDate": "दिनांक चुनें",
    "daybook.financialTransactions": "वित्तीय लेन-देन",
    "daybook.materialMovements": "सामग्री आवागमन",
    "daybook.workforceAttendance": "कार्यबल उपस्थिति",
    "daybook.tasksProgress": "कार्य व प्रगति",
    "daybook.allEntries": "सभी तिथि-वार रिकॉर्ड",
    "daybook.noEntries": "इस दिनांक और साइट के लिए कोई प्रविष्टि नहीं मिली।",
    "daybook.openingBalance": "प्रारंभिक शेष (Opening)",
    "daybook.closingBalance": "अंतिम शेष (Closing)",
    "daybook.inflow": "नकद / बैंक आवक (+)",
    "daybook.outflow": "नकद / बैंक जावक (-)",

    // Finance & Bills
    "finance.title": "वित्त और बिल बहीखाता",
    "finance.subtitle": "आपूर्तिकर्ता बिल, ठेकेदार बिलिंग, भुगतान वाउचर और भुगतान रिवर्सल का प्रबंधन करें।",
    "finance.bills": "बिल और चालान",
    "finance.payments": "भुगतान और निकासी",
    "finance.recordPayment": "+ भुगतान दर्ज करें",
    "finance.createBill": "+ नया बिल बनाएं",

    // Materials & Stock
    "materials.title": "सामग्री और इन्वेंटरी",
    "materials.subtitle": "स्टॉक स्तर, सामग्री रसीदें (GRN), साइट निकासी और ट्रांसफर को ट्रैक करें।",
    "materials.stockOnHand": "मौजूदा उपलब्ध स्टॉक",
    "materials.receipts": "सामग्री आवक",
    "materials.issues": "सामग्री जावक",
    "materials.transfers": "स्टॉक ट्रांसफर",
    "materials.lowStockAlert": "कम स्टॉक चेतावनी",

    // Attendance & Workforce
    "attendance.title": "कार्यबल और उपस्थिति",
    "attendance.subtitle": "दैनिक मस्टर रोल, बायोमेट्रिक व सुपरवाइजर हाजिरी, ओवरटाइम और ठेकेदार श्रमिक गणना।",
    "attendance.markAttendance": "+ हाजिरी लगाएं",
    "attendance.present": "उपस्थित",
    "attendance.absent": "अनुपस्थित",
    "attendance.halfDay": "आधा दिन",
    "attendance.overtime": "ओवरटाइम",

    // Measurement Book
    "mb.title": "माप पुस्तिका (Measurement Book)",
    "mb.subtitle": "इंजीनियरिंग कार्य माप, अनुमोदन और ठेकेदार बिलिंग प्रविष्टियां।",
    "mb.newEntry": "+ नई माप प्रविष्टि",

    // Settings
    "settings.title": "संस्था सेटिंग्स",
    "settings.subtitle": "कंपनी प्रोफाइल, मुद्रा प्रारूप, टैक्स पंजीकरण, भाषा प्राथमिकता और सक्रिय उपयोगकर्ताओं का प्रबंधन करें।",
    "settings.languageTitle": "प्लेटफ़ॉर्म प्रदर्शन भाषा / भाषा चुनें",
    "settings.languageDesc": "सभी स्क्रीन, नेविगेशन और रिपोर्ट्स के लिए अपनी व्यक्तिगत भाषा चुनें।",
    "settings.quickSwitcher": "त्वरित भाषा परिवर्तक",
    "settings.quickSwitcherDesc": "1-क्लिक में तुरंत प्लेटफ़ॉर्म भाषा बदलें:",

    // Statuses
    "status.todo": "लंबित",
    "status.inProgress": "प्रगति पर",
    "status.completed": "पूर्ण",
    "status.blocked": "अवरुद्ध",
    "status.active": "सक्रिय",
    "status.inactive": "निष्क्रिय",
    "status.pending": "प्रतीक्षारत",
    "status.approved": "स्वीकृत",
    "status.rejected": "अस्वीकृत",
    "status.paid": "भुगतान किया",
    "status.unpaid": "बकाया",
    "status.partial": "आंशिक",
  },
  gu: {
    // Navigation
    "nav.dashboard": "ડેશબોર્ડ",
    "nav.dayBook": "ડે બુક (દૈનિક વહી)",
    "nav.projects": "પ્રોજેક્ટ્સ",
    "nav.tasks": "કામ અને પ્રગતિ",
    "nav.materials": "મટીરીયલ અને સ્ટોક",
    "nav.measurementBook": "માપ પુસ્તિકા (MB)",
    "nav.parties": "વેપારીઓ અને કોન્ટ્રાક્ટરો",
    "nav.finance": "હિસાબ અને બિલ",
    "nav.attendance": "હાજરી અને સ્ટાફ",
    "nav.reports": "રિપોર્ટ્સ અને વિશ્લેષણ",
    "nav.audit": "ઓડિટ લોગ્સ",
    "nav.settings": "સેટિંગ્સ",
    "nav.superAdmin": "સુપર એડમિન",
    "nav.logout": "લૉગ આઉટ",
    "nav.home": "મુખ્ય પૃષ્ઠ",
    "nav.menu": "મેનુ નેવિગેશન",
    "nav.activeSite": "સક્રિય સાઇટ",
    "nav.alerts": "સાઇટ સૂચનાઓ",
    "nav.loading": "બિલ્ડ ટ્રેક પ્રો લોડ થઈ રહ્યું છે...",
    "nav.language": "ભાષા",
    "nav.switchLanguage": "ભાષા બદલો",

    // Common Actions
    "action.save": "ફેરફારો સાચવો",
    "action.saving": "સાચવી રહ્યું છે...",
    "action.cancel": "રદ કરો",
    "action.edit": "સુધારો કરો",
    "action.delete": "કાઢી નાખો",
    "action.search": "શોધો...",
    "action.filter": "ફિલ્ટર",
    "action.export": "નિકાસ (એક્સપોર્ટ)",
    "action.submit": "સબમિટ કરો",
    "action.addNew": "+ નવું ઉમેરો",
    "action.back": "પાછા જાઓ",
    "action.view": "જુઓ",
    "action.actions": "ક્રિયાઓ",
    "action.confirm": "ખાતરી કરો",
    "action.close": "બંધ કરો",
    "action.dismiss": "કાઢી નાખો",
    "action.refresh": "રિફ્રેશ કરો",
    "action.download": "ડાઉનલોડ કરો",
    "action.viewDetails": "વિગતો જુઓ",
    "action.quickAction": "ઝડપી ક્રિયાઓ",
    "action.createNew": "નવું બનાવો",
    "action.apply": "લાગુ કરો",
    "action.reset": "રીસેટ કરો",

    // Common Labels
    "label.date": "તારીખ",
    "label.time": "સમય",
    "label.status": "સ્થિતિ",
    "label.amount": "રકમ",
    "label.total": "કુલ",
    "label.balance": "બાકી રકમ",
    "label.site": "સાઇટ",
    "label.project": "પ્રોજેક્ટ",
    "label.category": "શ્રેણી",
    "label.description": "વિગત",
    "label.notes": "નોંધ",
    "label.name": "નામ",
    "label.email": "ઇમેઇલ",
    "label.phone": "ફોન",
    "label.role": "હોદ્દો / ભૂમિકા",
    "label.quantity": "જથ્થો",
    "label.unit": "એકમ (યુનિટ)",
    "label.rate": "ભાવ / દર",
    "label.party": "પાર્ટી / વેપારી",
    "label.worker": "કારીગર / મજૂર",
    "label.contractor": "કોન્ટ્રાક્ટર",
    "label.allSites": "તમામ સાઇટ્સ",
    "label.allProjects": "તમામ પ્રોજેક્ટ્સ",
    "label.allStatuses": "તમામ સ્થિતિઓ",
    "label.noData": "કોઈ રેકોર્ડ મળ્યો નથી.",

    // Dashboard KPIs
    "kpi.activeProjects": "સક્રિય પ્રોજેક્ટ્સ",
    "kpi.tasksToday": "આજના કામ",
    "kpi.workersOnSite": "સાઇટ પર હાજર મજૂરો",
    "kpi.unpaidBills": "બાકી બિલો",
    "kpi.criticalMaterials": "ઓછો સ્ટોક મટીરીયલ",
    "kpi.financialSnapshot": "નાણાકીય સ્થિતિ",
    "kpi.totalReceivable": "કુલ લેવાના નાણાં",
    "kpi.totalPayable": "કુલ ચૂકવવાના નાણાં",
    "kpi.netPosition": "ચોખ્ખી સ્થિતિ",
    "kpi.quickTask": "+ નવું કામ",
    "kpi.quickCheckIn": "+ હાજરી નોંધો",
    "kpi.quickMaterialIn": "+ સામગ્રી આવક",
    "kpi.quickIssue": "+ સામગ્રી જાવક",
    "kpi.dailyProgress": "દૈનિક સાઇટ પ્રગતિ",
    "kpi.urgentAlerts": "જરૂરી સૂચનાઓ",

    // Day Book
    "daybook.title": "દૈનિક સાઇટ ડે બુક (Day Book)",
    "daybook.subtitle": "નાણાકીય વ્યવહારો, મટીરીયલ આવક-જાવક, હાજરી અને દૈનિક કાર્યની સમન્વયિત તારીખવાર વહી.",
    "daybook.addEntry": "+ ડે બુક એન્ટ્રી ઉમેરો",
    "daybook.filterByDate": "તારીખ પસંદ કરો",
    "daybook.financialTransactions": "નાણાકીય વ્યવહારો",
    "daybook.materialMovements": "મટીરીયલ આવક-જાવક",
    "daybook.workforceAttendance": "મજૂર હાજરી",
    "daybook.tasksProgress": "કામની પ્રગતિ",
    "daybook.allEntries": "તમામ તારીખવાર રેકોર્ડ્સ",
    "daybook.noEntries": "આ તારીખ અને સાઇટ માટે કોઈ એન્ટ્રી નથી.",
    "daybook.openingBalance": "શરૂઆતની બાકી (Opening)",
    "daybook.closingBalance": "આખર બાકી (Closing)",
    "daybook.inflow": "રોકડ / બેંક આવક (+)",
    "daybook.outflow": "રોકડ / બેંક જાવક (-)",

    // Finance & Bills
    "finance.title": "હિસાબ અને બિલ બહી",
    "finance.subtitle": "વેપારી બિલો, કોન્ટ્રાક્ટર બિલિંગ, ચૂકવણી અને વાઉચર મેનેજમેન્ટ.",
    "finance.bills": "બિલો અને ઇનવોઇસ",
    "finance.payments": "ચૂકવણી અને ઉપાડ",
    "finance.recordPayment": "+ પેમેન્ટ નોંધો",
    "finance.createBill": "+ નવું બિલ બનાવો",

    // Materials & Stock
    "materials.title": "મટીરીયલ અને ઇન્વેન્ટરી",
    "materials.subtitle": "સ્ટોક લેવલ, મટીરીયલ રિસીપ્ટ (GRN), સાઇટ ઇશ્યુ અને ટ્રાન્સફર ટ્રેક કરો.",
    "materials.stockOnHand": "હાલનો ઉપલબ્ધ સ્ટોક",
    "materials.receipts": "સામગ્રી આવક",
    "materials.issues": "સામગ્રી જાવક",
    "materials.transfers": "સ્ટોક ટ્રાન્સફર",
    "materials.lowStockAlert": "ઓછા સ્ટોકની ચેતવણી",

    // Attendance & Workforce
    "attendance.title": "સ્ટાફ અને હાજરી",
    "attendance.subtitle": "દૈનિક હાજરી, બાયોમેટ્રિક ચેક-ઇન, ઓવરટાઇમ અને મજૂર ગણતરી.",
    "attendance.markAttendance": "+ હાજરી નોંધો",
    "attendance.present": "હાજર",
    "attendance.absent": "ગેરહાજર",
    "attendance.halfDay": "અડધો દિવસ",
    "attendance.overtime": "ઓવરટાઇમ",

    // Measurement Book
    "mb.title": "માપ પુસ્તિકા (Measurement Book)",
    "mb.subtitle": "એન્જિનિયરિંગ માપણી, મંજૂરી અને કોન્ટ્રાક્ટર બિલિંગ રેકોર્ડ્સ.",
    "mb.newEntry": "+ નવું માપ ઉમેરો",

    // Settings
    "settings.title": "સંસ્થા સેટિંગ્સ",
    "settings.subtitle": "કંપની પ્રોફાઇલ, કરન્સી, ટેક્સ રજીસ્ટ્રેશન, ભાષા પસંદગી અને સભ્યોનું સંચાલન.",
    "settings.languageTitle": "ડિસ્પ્લે ભાષા / ભાષા પસંદ કરો",
    "settings.languageDesc": "તમામ સ્ક્રીન, નેવિગેશન અને રિપોર્ટ્સ માટે તમારી વ્યક્તિગત ભાષા પસંદ કરો.",
    "settings.quickSwitcher": "ઝડપી ભાષા સ્વિચર",
    "settings.quickSwitcherDesc": "1-ક્લિકમાં તરત ભાષા બદલો:",

    // Statuses
    "status.todo": "બાકી",
    "status.inProgress": "ચાલુ છે",
    "status.completed": "પૂર્ણ",
    "status.blocked": "અટકાયેલ",
    "status.active": "સક્રિય",
    "status.inactive": "નિષ્ક્રિય",
    "status.pending": "બાકી",
    "status.approved": "મંજૂર",
    "status.rejected": "નામંજૂર",
    "status.paid": "ચૂકવેલ",
    "status.unpaid": "બાકી",
    "status.partial": "અંશતઃ ચૂકવેલ",
  },
  mr: {
    // Navigation
    "nav.dashboard": "डॅशबोर्ड",
    "nav.dayBook": "डे बुक (दैनिक वही)",
    "nav.projects": "प्रकल्प (प्रोजेक्ट्स)",
    "nav.tasks": "कामे आणि प्रगती",
    "nav.materials": "साहित्य आणि साठा",
    "nav.measurementBook": "माप पुस्तिका (MB)",
    "nav.parties": "विक्रेते आणि कंत्राटदार",
    "nav.finance": "वित्त आणि बिले",
    "nav.attendance": "कामगार आणि हजेरी",
    "nav.reports": "अहवाल आणि विश्लेषण",
    "nav.audit": "ऑडिट नोंदी",
    "nav.settings": "सेटिंग्ज",
    "nav.superAdmin": "सुपर अ‍ॅडमिन",
    "nav.logout": "लॉग आउट",
    "nav.home": "मुख्य पृष्ठ",
    "nav.menu": "मेनू नेव्हिगेशन",
    "nav.activeSite": "सक्रिय साइट",
    "nav.alerts": "साइट सूचना",
    "nav.loading": "बिल्ड ट्रॅक प्रो लोड होत आहे...",
    "nav.language": "भाषा",
    "nav.switchLanguage": "भाषा बदला",

    // Common Actions
    "action.save": "बदल जतन करा",
    "action.saving": "जतन होत आहे...",
    "action.cancel": "रद्द करा",
    "action.edit": "संपादित करा",
    "action.delete": "हटवा",
    "action.search": "शोधा...",
    "action.filter": "फिल्टर",
    "action.export": "निर्यात (एक्स्पोर्ट)",
    "action.submit": "सादर करा",
    "action.addNew": "+ नवीन जोडा",
    "action.back": "मागे जा",
    "action.view": "पहा",
    "action.actions": "क्रिया",
    "action.confirm": "नक्की करा",
    "action.close": "बंद करा",
    "action.dismiss": "काढून टाका",
    "action.refresh": "रिफ्रेश करा",
    "action.download": "डाउनलोड करा",
    "action.viewDetails": "तपशील पहा",
    "action.quickAction": "त्वरित क्रिया",
    "action.createNew": "नवीन तयार करा",
    "action.apply": "लागू करा",
    "action.reset": "रीसेट करा",

    // Common Labels
    "label.date": "दिनांक",
    "label.time": "वेळ",
    "label.status": "स्थिती",
    "label.amount": "रक्कम",
    "label.total": "एकूण",
    "label.balance": "शिल्लक",
    "label.site": "साइट",
    "label.project": "प्रकल्प",
    "label.category": "वर्ग",
    "label.description": "वर्णन",
    "label.notes": "नोंद",
    "label.name": "नाव",
    "label.email": "ईमेल",
    "label.phone": "फोन",
    "label.role": "भूमिका / पद",
    "label.quantity": "प्रमाण",
    "label.unit": "एकक (युनिट)",
    "label.rate": "दर",
    "label.party": "पार्टी / विक्रेता",
    "label.worker": "कामगार / कारागीर",
    "label.contractor": "कंत्राटदार",
    "label.allSites": "सर्व साइट्स",
    "label.allProjects": "सर्व प्रकल्प",
    "label.allStatuses": "सर्व स्थिती",
    "label.noData": "कोणताही रेकॉर्ड आढळला नाही.",

    // Dashboard KPIs
    "kpi.activeProjects": "सक्रिय प्रकल्प",
    "kpi.tasksToday": "आजची कामे",
    "kpi.workersOnSite": "साइटवरील कामगार",
    "kpi.unpaidBills": "थकबाकी बिले",
    "kpi.criticalMaterials": "कमी साठा साहित्य",
    "kpi.financialSnapshot": "वित्तीय स्थिती",
    "kpi.totalReceivable": "एकूण येणे रक्कम",
    "kpi.totalPayable": "एकूण देणे रक्कम",
    "kpi.netPosition": "निव्वळ स्थिती",
    "kpi.quickTask": "+ नवीन काम",
    "kpi.quickCheckIn": "+ कामगार हजेरी",
    "kpi.quickMaterialIn": "+ साहित्य आवक",
    "kpi.quickIssue": "+ साहित्य जावक",
    "kpi.dailyProgress": "दैनिक साइट प्रगती",
    "kpi.urgentAlerts": "तातडीच्या सूचना",

    // Day Book
    "daybook.title": "दैनिक साइट डे बुक (Day Book)",
    "daybook.subtitle": "वित्तीय व्यवहार, साहित्य हालचाल, कामगार हजेरी आणि दैनंदिन कामाची एकत्रित नोंदवही.",
    "daybook.addEntry": "+ डे बुक नोंद जोडा",
    "daybook.filterByDate": "दिनांक निवडा",
    "daybook.financialTransactions": "वित्तीय व्यवहार",
    "daybook.materialMovements": "साहित्य आवक-जावक",
    "daybook.workforceAttendance": "कामगार हजेरी",
    "daybook.tasksProgress": "कामे आणि प्रगती",
    "daybook.allEntries": "सर्व दिनांकवार नोंदी",
    "daybook.noEntries": "या तारखेसाठी आणि साइटसाठी कोणतीही नोंद आढळली नाही.",
    "daybook.openingBalance": "सुरुवातीची शिल्लक (Opening)",
    "daybook.closingBalance": "अखेरची शिल्लक (Closing)",
    "daybook.inflow": "रोख / बँक आवक (+)",
    "daybook.outflow": "रोख / बँक जावक (-)",

    // Finance & Bills
    "finance.title": "वित्त आणि बिले नोंदवही",
    "finance.subtitle": "पुरवठादार बिले, कंत्राटदार बिलिंग, देयके आणि व्हाउचर व्यवस्थापन.",
    "finance.bills": "बिले आणि पावत्या",
    "finance.payments": "देयके आणि विनिमय",
    "finance.recordPayment": "+ देयक नोंदवा",
    "finance.createBill": "+ नवीन बिल तयार करा",

    // Materials & Stock
    "materials.title": "साहित्य आणि साठा",
    "materials.subtitle": "साठा पातळी, साहित्य पावती (GRN), साइट जावक आणि हस्तांतरण ट्रॅक करा.",
    "materials.stockOnHand": "सध्या उपलब्ध साठा",
    "materials.receipts": "साहित्य आवक",
    "materials.issues": "साहित्य जावक",
    "materials.transfers": "साठा हस्तांतरण",
    "materials.lowStockAlert": "कमी साठा इशारा",

    // Attendance & Workforce
    "attendance.title": "कामगार आणि हजेरी",
    "attendance.subtitle": "दैनिक हजेरी पत्रक, बायोमेट्रिक व पर्यवेक्षक हजेरी, जादा वेळ आणि कामगार गणना.",
    "attendance.markAttendance": "+ हजेरी नोंदवा",
    "attendance.present": "हजर",
    "attendance.absent": "गैरहजर",
    "attendance.halfDay": "अर्धा दिवस",
    "attendance.overtime": "जादा वेळ",

    // Measurement Book
    "mb.title": "माप पुस्तिका (Measurement Book)",
    "mb.subtitle": "अभियांत्रिकी कार्य मापे, मंजुरी आणि कंत्राटदार बिलिंग नोंदी.",
    "mb.newEntry": "+ नवीन माप नोंदवा",

    // Settings
    "settings.title": "संस्था सेटिंग्ज",
    "settings.subtitle": "कंपनी प्रोफाइल, चलन स्वरूप, कर नोंदणी, भाषा प्राधान्य आणि वापरकर्ते व्यवस्थापित करा.",
    "settings.languageTitle": "प्लॅटफॉर्म प्रदर्शन भाषा / भाषा निवडा",
    "settings.languageDesc": "सर्व स्क्रीन, नेव्हिगेशन आणि अहवालांसाठी तुमची वैयक्तिक भाषा निवडा.",
    "settings.quickSwitcher": "त्वरित भाषा परिवर्तक",
    "settings.quickSwitcherDesc": "1-क्लिकमध्ये ताबडतोब भाषा बदला:",

    // Statuses
    "status.todo": "लंबित",
    "status.inProgress": "प्रगतीपथावर",
    "status.completed": "पूर्ण",
    "status.blocked": "अडथळा",
    "status.active": "सक्रिय",
    "status.inactive": "निष्क्रिय",
    "status.pending": "प्रलंबित",
    "status.approved": "मंजूर",
    "status.rejected": "नाकारले",
    "status.paid": "भरले",
    "status.unpaid": "थकबाकी",
    "status.partial": "अंशतः भरले",
  },
};

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, fallback?: string) => string;
  languages: LanguageInfo[];
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key: string, fallback?: string) => fallback || key,
  languages: SUPPORTED_LANGUAGES,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("buildtrack_language") as LanguageCode | null;
      if (stored && (stored === "en" || stored === "hi" || stored === "gu" || stored === "mr")) {
        setLanguageState(stored);
      }

      const handleLangEvent = (e: any) => {
        const newLang = e.detail?.language as LanguageCode;
        if (newLang && (newLang === "en" || newLang === "hi" || newLang === "gu" || newLang === "mr")) {
          setLanguageState(newLang);
        }
      };

      window.addEventListener("languageChanged", handleLangEvent);
      return () => window.removeEventListener("languageChanged", handleLangEvent);
    }
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    if (typeof window !== "undefined") {
      localStorage.setItem("buildtrack_language", lang);
      document.cookie = `buildtrack_language=${lang}; path=/; max-age=31536000; SameSite=Lax`;
      window.dispatchEvent(new CustomEvent("languageChanged", { detail: { language: lang } }));
    }
  };

  const t = (key: string, fallback?: string): string => {
    const dict = translations[language];
    if (dict && dict[key]) {
      return dict[key];
    }
    // Fallback to English dictionary if key missing in current language
    const enDict = translations["en"];
    if (enDict && enDict[key]) {
      return enDict[key];
    }
    return fallback !== undefined ? fallback : key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: SUPPORTED_LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export const useTranslation = useLanguage;
