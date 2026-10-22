"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export type LanguageCode = "en" | "hi";

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
    region: "Default Interface",
    badge: "Default",
  },
  {
    code: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    region: "हिन्दी इंटरफेस",
    badge: "लोकप्रिय",
  },
];

export const translations: Record<LanguageCode, Record<string, string>> = {
  en: {
    // Navigation & Menus
    "nav.group.overview": "Overview",
    "nav.group.siteWork": "Site work",
    "nav.group.money": "Money",
    "nav.group.people": "People",
    "nav.group.admin": "Admin",
    "nav.allSites": "All sites (overview)",
    "nav.noSites": "No sites yet",
    "cc.title": "Command Center",
    "nav.team": "Team & Access",
    "nav.myDay": "Daily Work",
    "nav.materialRequests": "Material Requests",
    "nav.dashboard": "Dashboard",
    "nav.dayBook": "Day Book",
    "nav.projects": "Projects",
    "nav.tasks": "Tasks & Work",
    "nav.materials": "Materials & Stock",
    "nav.measurementBook": "Measurement Book",
    "nav.parties": "Vendors & Contractors",
    "nav.finance": "Finance & Bills",
    "nav.workforce": "Workforce",
    "nav.attendance": "Attendance",
    "nav.reports": "Reports & Analytics",
    "nav.audit": "Audit Logs",
    "nav.settings": "Settings",
    "nav.superAdmin": "Super Admin",
    "nav.chat": "Messages",
    "nav.logout": "Logout",
    "nav.home": "Home",
    "nav.menu": "Menu Navigation",
    "nav.activeSite": "Active Site",
    "nav.alerts": "Operational Alerts",
    "nav.loading": "Loading Bothra CMS…",
    "nav.language": "Language",
    "nav.switchLanguage": "Switch Language",
    "nav.noAlerts": "No active operational alerts. All site systems normal!",

    // Common Actions
    "action.save": "Save Changes",
    "action.saving": "Saving...",
    "action.cancel": "Cancel",
    "action.edit": "Edit",
    "action.delete": "Delete",
    "action.search": "Search...",
    "action.filter": "Filter",
    "action.export": "Export CSV",
    "action.print": "Print",
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

    // Purchase Orders & Vendor Notifications
    "order.placeOrder": "Place Order",
    "order.placeOrderToVendor": "Place Order to Vendor",
    "order.vendorNotification": "Vendor Order Notification",
    "order.sendWhatsApp": "Send WhatsApp to Vendor",
    "order.sendEmail": "Send Email",
    "order.copyText": "Copy Order Details",
    "order.recentOrders": "Purchase Orders to Vendors",
    "order.status": "Order Status",
    "order.expectedDelivery": "Expected Delivery",
    "order.quantity": "Order Quantity",
    "order.vendor": "Select Vendor",
    "order.unitRate": "Unit Rate (₹)",
    "order.totalAmount": "Estimated Total",
    "order.deliveryStore": "Delivery Store / Yard",
    "order.notes": "Instructions / Site Notes",
    "order.successTitle": "Order Placed Successfully",
    "order.pendingApproval": "Pending Super Admin Approval",
    "order.approved": "Approved by Super Admin",
    "order.rejected": "Rejected",
    "order.approve": "Approve Order",
    "order.reject": "Reject Order",
    "order.approvalQuery": "Approval Query / Justification",
    "order.queryRaised": "Order Query Raised to Super Admin",
    "order.superAdminApprovalRequired": "Super Admin approval required before vendor dispatch",

    // Chat & Team Messaging
    "chat.title": "Team Messages",
    "chat.subtitle": "Direct communication with employees and management",
    "chat.directChats": "Direct Chats",
    "chat.groups": "Groups",
    "chat.allEmployees": "All Employees",
    "chat.startChat": "Start Direct Chat",
    "chat.newGroup": "Create Group",
    "chat.superAdminOnly": "Super Admin Only",
    "chat.createGroupTitle": "Create Team Chat Group",
    "chat.groupName": "Group Name",
    "chat.groupDescription": "Description (Optional)",
    "chat.selectMembers": "Select Employees to Include",
    "chat.createGroupBtn": "Create Group",
    "chat.typeMessage": "Type your message...",
    "chat.send": "Send",
    "chat.noConversations": "No conversations yet. Pick an employee to start chatting!",
    "chat.noGroups": "No groups created yet. Groups are created only by Super Admin upon request.",
    "chat.selectConversation": "Select an employee or group to view messages.",
    "chat.groupCreatedNotice": "Groups can only be created by Super Admin upon request.",
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
    "kpi.quickTask": "Quick Task",
    "kpi.quickCheckIn": "Worker Check-in",
    "kpi.quickMaterialIn": "Receive Stock",
    "kpi.quickIssue": "Material Issue",
    "kpi.dailyProgress": "Daily Site Progress",
    "kpi.urgentAlerts": "Urgent Operational Alerts",

    // Day Book
    "daybook.title": "Daily Site Day Book",
    "daybook.subtitle": "Consolidated chronological register of financial transactions, material movements, labour attendance, and daily work.",
    "daybook.addEntry": "+ Log Day Entry",
    "daybook.filterByDate": "Select Date",
    "daybook.financialTransactions": "Financial Transactions",
    "daybook.materialMovements": "Material Movements",
    "daybook.workforceAttendance": "Workforce & Attendance",
    "daybook.tasksProgress": "Tasks & Work Progress",
    "daybook.allEntries": "All Activity",
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
    "finance.payingAccount": "Paying Account / Source",
    "finance.recipientCategory": "Payee Category",
    "finance.vendor": "Vendor",
    "finance.contractor": "Contractor",
    "finance.employee": "Employee",
    "finance.approvalQuery": "Approval Reason / Query",
    "finance.pendingApproval": "Pending Super Admin Approval",
    "finance.confirmApprove": "Confirm & Approve",
    "finance.reject": "Reject Query",
    "finance.approvalQueriesTitle": "Payment Approval Queries & Confirmations",

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
    "settings.securityTitle": "Account Security & Change Password",
    "settings.securitySubtitle": "Update your password regularly to protect your account and data.",
    "action.changePassword": "Change Password",

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
    // Navigation & Menus
    "nav.group.overview": "ओवरव्यू",
    "nav.group.siteWork": "साइट का काम",
    "nav.group.money": "पैसा",
    "nav.group.people": "लोग",
    "nav.group.admin": "एडमिन",
    "nav.allSites": "सभी साइट्स (ओवरव्यू)",
    "nav.noSites": "अभी कोई साइट नहीं",
    "cc.title": "कमांड सेंटर",
    "nav.team": "टीम और एक्सेस",
    "nav.myDay": "दैनिक कार्य",
    "nav.materialRequests": "सामग्री मांग",
    "nav.dashboard": "डैशबोर्ड",
    "nav.dayBook": "डे बुक",
    "nav.projects": "प्रोजेक्ट्स",
    "nav.tasks": "कार्य और प्रगति",
    "nav.materials": "सामग्री और स्टॉक",
    "nav.measurementBook": "माप पुस्तिका (MB)",
    "nav.parties": "विक्रेता व ठेकेदार",
    "nav.finance": "वित्त और बिल",
    "nav.workforce": "कार्यबल (श्रमिक)",
    "nav.attendance": "उपस्थिति (हाजिरी)",
    "nav.reports": "रिपोर्ट्स और विश्लेषण",
    "nav.audit": "ऑडिट लॉग्स",
    "nav.settings": "सेटिंग्स",
    "nav.superAdmin": "सुपर एडमिन",
    "nav.chat": "संदेश",
    "nav.logout": "लॉग आउट",
    "nav.home": "होम",
    "nav.menu": "मेनू नेविगेशन",
    "nav.activeSite": "सक्रिय साइट",
    "nav.alerts": "साइट सूचनाएं",
    "nav.loading": "बोथरा CMS लोड हो रहा है…",
    "nav.language": "भाषा",
    "nav.switchLanguage": "भाषा चुनें",
    "nav.noAlerts": "कोई सक्रिय अलर्ट नहीं है। सभी साइट सिस्टम सामान्य हैं!",

    // Common Actions
    "action.save": "परिवर्तन सहेजें",
    "action.saving": "सहेजा जा रहा है...",
    "action.cancel": "रद्द करें",
    "action.edit": "संपादित करें",
    "action.delete": "हटाएं",
    "action.search": "खोजें...",
    "action.filter": "फ़िल्टर",
    "action.export": "CSV डाउनलोड करें",
    "action.print": "प्रिंट करें",
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

    // Purchase Orders & Vendor Notifications
    "order.placeOrder": "ऑर्डर प्लेस करें",
    "order.placeOrderToVendor": "विक्रेता को ऑर्डर दें",
    "order.vendorNotification": "विक्रेता ऑर्डर सूचना",
    "order.sendWhatsApp": "विक्रेता को व्हाट्सएप भेजें",
    "order.sendEmail": "ईमेल भेजें",
    "order.copyText": "विवरण कॉपी करें",
    "order.recentOrders": "विक्रेताओं को दिए गए आपूर्ति ऑर्डर",
    "order.status": "ऑर्डर स्थिति",
    "order.expectedDelivery": "अपेक्षित डिलीवरी",
    "order.quantity": "ऑर्डर मात्रा",
    "order.vendor": "विक्रेता चुनें",
    "order.unitRate": "दर प्रति इकाई (₹)",
    "order.totalAmount": "अनुमानित कुल राशि",
    "order.deliveryStore": "डिलीवरी स्टोर / यार्ड",
    "order.notes": "निर्देश / साइट नोट्स",
    "order.successTitle": "ऑर्डर सफलतापूर्वक दर्ज हुआ",
    "order.pendingApproval": "सुपर एडमिन स्वीकृति लंबित",
    "order.approved": "सुपर एडमिन द्वारा स्वीकृत",
    "order.rejected": "अस्वीकृत",
    "order.approve": "ऑर्डर स्वीकृत करें",
    "order.reject": "ऑर्डर अस्वीकार करें",
    "order.approvalQuery": "स्वीकृति हेतु विवरण / कारण",
    "order.queryRaised": "सुपर एडमिन को ऑर्डर स्वीकृति प्रश्न भेजा गया",
    "order.superAdminApprovalRequired": "वेंडर को भेजने से पहले सुपर एडमिन की स्वीकृति आवश्यक है",
    "order.pendingQueries": "लंबित ऑर्डर स्वीकृति प्रश्न",

    // Chat & Team Messaging
    "chat.title": "टीम संदेश",
    "chat.subtitle": "कर्मचारियों और प्रबंधन के साथ सीधा संवाद",
    "chat.directChats": "सीधे संदेश (1-ऑन-1)",
    "chat.groups": "समूह (ग्रुप्स)",
    "chat.allEmployees": "सभी कर्मचारी",
    "chat.startChat": "सीधी बातचीत शुरू करें",
    "chat.newGroup": "नया समूह बनाएं",
    "chat.superAdminOnly": "केवल सुपर एडमिन",
    "chat.createGroupTitle": "टीम चैट समूह बनाएं",
    "chat.groupName": "समूह का नाम",
    "chat.groupDescription": "विवरण (वैकल्पिक)",
    "chat.selectMembers": "शामिल करने के लिए कर्मचारी चुनें",
    "chat.createGroupBtn": "समूह बनाएं",
    "chat.typeMessage": "अपना संदेश टाइप करें...",
    "chat.send": "भेजें",
    "chat.noConversations": "अभी कोई बातचीत नहीं है। बातचीत शुरू करने के लिए किसी कर्मचारी को चुनें!",
    "chat.noGroups": "अभी कोई समूह नहीं बनाया गया है। समूह केवल सुपर एडमिन द्वारा बनाए जा सकते हैं।",
    "chat.selectConversation": "संदेश देखने के लिए किसी कर्मचारी या समूह का चयन करें।",
    "chat.groupCreatedNotice": "ग्रुप केवल सुपर एडमिन द्वारा आवश्यकता पड़ने पर ही बनाए जाते हैं।",

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
    "kpi.criticalMaterials": "कम स्टॉक सामग्री",
    "kpi.financialSnapshot": "वित्तीय स्थिति",
    "kpi.totalReceivable": "कुल प्राप्य राशि",
    "kpi.totalPayable": "कुल देय राशि",
    "kpi.netPosition": "शुद्ध वित्तीय स्थिति",
    "kpi.quickTask": "नया कार्य",
    "kpi.quickCheckIn": "श्रमिक हाजिरी",
    "kpi.quickMaterialIn": "माल आवक",
    "kpi.quickIssue": "सामग्री निकासी",
    "kpi.dailyProgress": "दैनिक साइट प्रगति",
    "kpi.urgentAlerts": "तत्काल सूचनाएं",

    // Day Book
    "daybook.title": "दैनिक साइट डे बुक",
    "daybook.subtitle": "वित्तीय लेन-देन, सामग्री आवाजाही, श्रमिक उपस्थिति और दैनिक कार्य की समेकित तिथि-वार बही।",
    "daybook.addEntry": "+ डे बुक प्रविष्टि जोड़ें",
    "daybook.filterByDate": "दिनांक चुनें",
    "daybook.financialTransactions": "वित्तीय लेन-देन",
    "daybook.materialMovements": "सामग्री आवागमन",
    "daybook.workforceAttendance": "कार्यबल उपस्थिति",
    "daybook.tasksProgress": "कार्य व प्रगति",
    "daybook.allEntries": "सभी गतिविधियां",
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
    "finance.payingAccount": "भुगतान खाता / स्रोत बैंक",
    "finance.recipientCategory": "प्राप्तकर्ता श्रेणी",
    "finance.vendor": "विक्रेता",
    "finance.contractor": "ठेकेदार",
    "finance.employee": "कर्मचारी",
    "finance.approvalQuery": "भुगतान का कारण / स्वीकृति अनुरोध",
    "finance.pendingApproval": "सुपर एडमिन स्वीकृति लंबित",
    "finance.confirmApprove": "पुष्टि करें और स्वीकृत करें",
    "finance.reject": "अस्वीकार करें",
    "finance.approvalQueriesTitle": "भुगतान स्वीकृति अनुरोध एवं पुष्टिकरण",

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
    "settings.securityTitle": "खाता सुरक्षा एवं पासवर्ड बदलें",
    "settings.securitySubtitle": "अपने खाते और डेटा की सुरक्षा के लिए पासवर्ड नियमित रूप से बदलें।",
    "action.changePassword": "पासवर्ड बदलें",

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

function getSavedLanguage(): LanguageCode {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("buildtrack_language");
      if (stored === "hi") return "hi";
      if (stored === "en") return "en";
    } catch {}
  }
  return "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(getSavedLanguage);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("buildtrack_language");
      if (stored === "hi" || stored === "en") {
        setLanguageState(stored);
      }

      const handleLangEvent = (e: any) => {
        const newLang = e.detail?.language;
        if (newLang === "hi" || newLang === "en") {
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
      try {
        localStorage.setItem("buildtrack_language", lang);
        document.cookie = `buildtrack_language=${lang}; path=/; max-age=31536000; SameSite=Lax`;
        window.dispatchEvent(new CustomEvent("languageChanged", { detail: { language: lang } }));
      } catch {}
    }
  };

  const t = (key: string, fallback?: string): string => {
    const dict = translations[language];
    if (dict && dict[key]) {
      return dict[key];
    }
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
