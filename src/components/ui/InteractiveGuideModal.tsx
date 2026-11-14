"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  HelpCircle,
  X,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  ArrowRight,
  ExternalLink,
  Search,
  Sparkles,
  Info,
  CalendarDays,
  Clock,
  Boxes,
  DollarSign,
  Users,
  Building2,
  CheckSquare,
  FileText,
  MessageSquare,
  Settings,
  ShieldCheck,
  LayoutDashboard,
  Receipt,
  ClipboardCheck,
  UserCog,
  ShieldAlert,
  PackagePlus,
  Layers,
  Wallet,
  Landmark,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";

interface StepGuide {
  number: number;
  titleEn: string;
  titleHi: string;
  descEn: string;
  descHi: string;
}

interface JargonTerm {
  term: string;
  meaningEn: string;
  meaningHi: string;
}

interface PageGuideContent {
  icon: any;
  titleEn: string;
  titleHi: string;
  subtitleEn: string;
  subtitleHi: string;
  whoUsesEn: string;
  whoUsesHi: string;
  summaryEn: string;
  summaryHi: string;
  steps: StepGuide[];
  jargon: JargonTerm[];
  proTipsEn: string[];
  proTipsHi: string[];
  actionLink?: string;
  actionLabelEn?: string;
  actionLabelHi?: string;
}

const PAGE_GUIDES: Record<string, PageGuideContent> = {
  "/": {
    icon: LayoutDashboard,
    titleEn: "Dashboard & Site Overview",
    titleHi: "डैशबोर्ड और मुख्य जानकारी",
    subtitleEn: "Your construction bird's-eye view",
    subtitleHi: "आपकी साइट का संपूर्ण सार",
    whoUsesEn: "Project Managers, Owners, Supervisors, Engineers",
    whoUsesHi: "प्रोजेक्ट मैनेजर, मालिक, सुपरवाइज़र, इंजीनियर",
    summaryEn: "The Dashboard brings together all live updates from your construction sites into one screen: today's worker headcount, cash balances, critical safety alerts, active tasks, and inventory health.",
    summaryHi: "डैशबोर्ड आपकी सभी निर्माण साइटों की ताज़ा स्थिति एक ही जगह दिखाता है: आज कितने मजदूर उपस्थित हैं, रोकड़ में कितना पैसा बचा है, सामग्री की स्थिति और आज के जरूरी काम।",
    steps: [
      {
        number: 1,
        titleEn: "Check Top Metrics",
        titleHi: "मुख्य आंकड़े देखें",
        descEn: "Look at the big cards at the top for today's present workers, cash balance, and pending tasks.",
        descHi: "स्क्रीन के सबसे ऊपर बड़े कार्ड्स में आज की हाजिरी, रोकड़ बाकी और बाकी काम देखें।",
      },
      {
        number: 2,
        titleEn: "Select Your Site",
        titleHi: "अपनी साइट चुनें",
        descEn: "Use the site selector in the sidebar to see numbers for one specific site or all sites combined.",
        descHi: "बाईं तरफ दिए गए 'Active Site' मेन्यू से अपनी साइट चुनकर उसी का हिसाब देखें।",
      },
      {
        number: 3,
        titleEn: "Take Action on Alerts",
        titleHi: "अलर्ट्स पर ध्यान दें",
        descEn: "Click on any red warning (low cement stock, overdue tasks) to fix it immediately.",
        descHi: "लाल चेतावनी (जैसे सीमेंट कम होना या बिल पेंडिंग) पर क्लिक करके तुरंत कार्रवाई करें।",
      },
    ],
    jargon: [
      {
        term: "Headcount",
        meaningEn: "Total number of workers and staff present on site today.",
        meaningHi: "आज साइट पर उपस्थित कुल कारीगरों और मजदूरों की संख्या।",
      },
      {
        term: "Petty Cash",
        meaningEn: "Small cash kept on site for daily minor expenses (tea, petrol, nails).",
        meaningHi: "साइट पर रोजमर्रा के छोटे खर्चों (चाय, पेट्रोल, कीलें आदि) के लिए रखा गया नकद।",
      },
    ],
    proTipsEn: [
      "Click the Bell icon in the top right to check urgent notifications anytime.",
      "Click on any chart to see detailed breakdown reports.",
    ],
    proTipsHi: [
      "घंटी (Bell) आइकन पर क्लिक करके जरूरी सूचनाएं कभी भी देख सकते हैं।",
      "किसी भी चार्ट पर क्लिक करके उसका विस्तृत विवरण देख सकते हैं।",
    ],
  },

  "/day-book": {
    icon: CalendarDays,
    titleEn: "Day Book (Daily Cash Register)",
    titleHi: "डे बुक (दैनिक रोकड़ बही / खाता)",
    subtitleEn: "Track every single rupee in & out of site",
    subtitleHi: "साइट के एक-एक रुपये का दैनिक हिसाब",
    whoUsesEn: "Site Supervisors, Field Clerks, Cashiers, Munshi Ji",
    whoUsesHi: "साइट सुपरवाइज़र, मुंशी जी, फील्ड क्लर्क, कैशियर",
    summaryEn: "Think of this as your digital cash diary. Whenever cash arrives at the site (from head office) or cash is spent on diesel, tea, local hardware, or daily labor wages, record it here immediately.",
    summaryHi: "इसे अपनी डिजिटल रोकड़ डायरी समझें। जब भी हेड ऑफिस से पैसा आए, या डीजल, चाय-नाश्ता, लोकल हार्डवेयर या दिहाड़ी पर खर्च हो, तो तुरंत यहाँ दर्ज करें।",
    steps: [
      {
        number: 1,
        titleEn: "Choose What to Record",
        titleHi: "क्या दर्ज करना है चुनें",
        descEn: "Pick Record Cash, Enter Bill, Workers Muster Roll, or Daily Site Report from the top buttons or '+ Add Entry'.",
        descHi: "ऊपर दिए गए बटन (रोकड़, बिल, मस्टर रोल या साइट रिपोर्ट) या '+ Add Entry' दबाएं।",
      },
      {
        number: 2,
        titleEn: "Choose Cash In or Cash Out",
        titleHi: "पैसा आया (Cash In) या गया (Cash Out) चुनें",
        descEn: "If head office sent cash, pick Cash In. If you spent money on site, pick Cash Out.",
        descHi: "अगर ऑफिस से पैसा मिला तो 'Cash In' चुनें। अगर साइट पर खर्च हुआ तो 'Cash Out' चुनें।",
      },
      {
        number: 3,
        titleEn: "Enter Amount, Purpose & Save",
        titleHi: "रकम और खर्च की वजह लिखकर सुरक्षित करें",
        descEn: "Type the rupee amount, mention who was paid, optionally add voucher number or photo, then tap Save.",
        descHi: "रुपये डालें, किसको भुगतान किया लिखें और 'Save' बटन दबाएं। हिसाब तुरंत अपडेट हो जाएगा।",
      },
    ],
    jargon: [
      {
        term: "Cash In (आवक)",
        meaningEn: "Money received by the site (e.g. from Head Office or client).",
        meaningHi: "साइट पर आया हुआ पैसा (जैसे हेड ऑफिस या मालिक से मिला कैश)।",
      },
      {
        term: "Cash Out (जावक / खर्च)",
        meaningEn: "Money spent on site (diesel, repair, chai, local materials).",
        meaningHi: "साइट से खर्च हुआ पैसा (डीजल, चाय, रिपेयरिंग, लोकल सामान)।",
      },
      {
        term: "Voucher No.",
        meaningEn: "The paper slip or bill receipt number given for the expense.",
        meaningHi: "खर्च की कच्ची या पक्की रसीद / पर्ची का नंबर।",
      },
      {
        term: "Closing Balance",
        meaningEn: "Cash remaining in your physical pocket or site cash box at the end of the day.",
        meaningHi: "दिन के अंत में साइट के कैश बॉक्स या आपकी जेब में बचा हुआ कुल नकद।",
      },
    ],
    proTipsEn: [
      "Use Excel Filter on the table columns to quickly see only 'Cash Out' or only expenses above ₹5,000.",
      "Export to Excel anytime using the green Excel button for CA or boss verification.",
    ],
    proTipsHi: [
      "टेबल के कॉलम पर फिल्टर बटन दबाकर सिर्फ 'खर्च' या सिर्फ बड़े भुगतान आसानी से छाँट सकते हैं।",
      "हरा 'Export to Excel' बटन दबाकर कभी भी पूरा हिसाब एक्सेल शीट में डाउनलोड कर सकते हैं।",
    ],
  },

  "/attendance": {
    icon: Clock,
    titleEn: "Site Attendance & Daily Check-in",
    titleHi: "हाजिरी और दैनिक उपस्थिति",
    subtitleEn: "Mark worker and staff presence in seconds",
    subtitleHi: "कारीगरों और मजदूरों की हाजिरी आसानी से लगाएं",
    whoUsesEn: "Site Supervisors, Time Keepers, HR, Workers",
    whoUsesHi: "साइट सुपरवाइज़र, टाइम कीपर, मुंशी, मजदूर",
    summaryEn: "Track who came to work today, what time they arrived, and their shift status (Full Day, Half Day, Overtime, or Absent). Supervisors can mark entire gangs in a few clicks.",
    summaryHi: "आज कौन-कौन काम पर आया, कितने बजे आया और पूरा दिन था या आधा दिन—यह सब यहाँ आसानी से दर्ज करें। सुपरवाइज़र पूरी गैंग की हाजिरी 1 मिनट में लगा सकते हैं।",
    steps: [
      {
        number: 1,
        titleEn: "Select Date & Site",
        titleHi: "तारीख और साइट चुनें",
        descEn: "Make sure today's date is active. You can also review past dates by picking from calendar.",
        descHi: "आज की तारीख चुनें। आप पुरानी तारीख की हाजिरी भी कैलेंडर से देख सकते हैं।",
      },
      {
        number: 2,
        titleEn: "Tap Status for Each Person",
        titleHi: "प्रत्येक व्यक्ति के नाम के आगे स्टेटस दबाएं",
        descEn: "Click 'P' for Present, 'HD' for Half Day, 'A' for Absent, or 'OT' for Overtime.",
        descHi: "हाजिर के लिए 'P', आधे दिन के लिए 'HD', गैरहाजिर के लिए 'A' पर क्लिक करें।",
      },
      {
        number: 3,
        titleEn: "Click 'Save Attendance'",
        titleHi: "हाजिरी सुरक्षित (Save) करें",
        descEn: "Press the submit button. Today's attendance record and wage calculations update automatically.",
        descHi: "सेव बटन दबाएं। आज का मास्टर रोल और मजदूरी का हिसाब अपने-आप जुड़ जाएगा।",
      },
    ],
    jargon: [
      {
        term: "Present (P / उपस्थित)",
        meaningEn: "Worked full shift (usually 8 hours). Full daily wage calculated.",
        meaningHi: "पूरे दिन काम किया (आमतौर पर 8 घंटे)। पूरी दिहाड़ी मिलेगी।",
      },
      {
        term: "Half Day (HD / आधा दिन)",
        meaningEn: "Worked 4 hours or left early. 50% daily wage calculated.",
        meaningHi: "आधे दिन काम किया (4 घंटे)। आधी दिहाड़ी जुड़ेगी।",
      },
      {
        term: "Overtime (OT / अतिरिक्त समय)",
        meaningEn: "Extra hours worked beyond standard 8-hour shift.",
        meaningHi: "8 घंटे की सामान्य शिफ्ट के बाद अतिरिक्त काम किए गए घंटे।",
      },
      {
        term: "Geofence Check-in",
        meaningEn: "Phone GPS verifies the person is physically standing inside the construction site boundary.",
        meaningHi: "मोबाइल जीपीएस से साबित होता है कि कर्मचारी वास्तव में साइट पर मौजूद है।",
      },
    ],
    proTipsEn: [
      "Use 'Mark All Present' button if the entire gang attended, then quickly change only the 1 or 2 absentees.",
      "Filter by Contractor to mark one subcontractor's team at a time.",
    ],
    proTipsHi: [
      "अगर पूरी टीम आई है तो 'Mark All Present' दबाएं, फिर केवल गैरहाजिर लोगों को 'A' कर दें—समय बचेगा!",
      "ठेकेदार के नाम से फिल्टर करके एक समय में एक ही ठेकेदार की टीम की हाजिरी लगाएं।",
    ],
  },

  "/materials": {
    icon: Boxes,
    titleEn: "Materials & Inventory (Store)",
    titleHi: "सामग्री और गोदाम (स्टोर / माल)",
    subtitleEn: "Manage cement, steel, bricks, sand & stock",
    subtitleHi: "सीमेंट, सरिया, ईंट, रेत व अन्य सामान का हिसाब",
    whoUsesEn: "Storekeepers, Site Engineers, Procurement, Supervisors",
    whoUsesHi: "स्टोरकीपर, साइट इंजीनियर, परचेज टीम, सुपरवाइज़र",
    summaryEn: "Never run out of cement or steel! When materials arrive at the site, record them under Materials Received. When items are given to masons or contractors, record Materials Issued.",
    summaryHi: "साइट पर कभी सीमेंट या सरिया खत्म न हो! जब भी ट्रक से माल आए तो उसकी प्राप्ति (GRN) दर्ज करें। जब काम के लिए मिस्त्री या ठेकेदार को सामान दें तो निकासी (Issue) दर्ज करें।",
    steps: [
      {
        number: 1,
        titleEn: "Check Current Stock",
        titleHi: "गोदाम में बचा माल देखें",
        descEn: "View available quantities of Cement (Bags), TMT Steel (Tons), Aggregate (CFT), and Bricks.",
        descHi: "सीमेंट, टीएमटी सरिया, रोड़ी और ईंटों का बचा हुआ स्टॉक टेबल में चेक करें।",
      },
      {
        number: 2,
        titleEn: "Record Incoming Materials",
        titleHi: "आया हुआ माल दर्ज करें",
        descEn: "Click 'Receive Materials', choose vendor, enter challan or truck number, and enter received quantity.",
        descHi: "'Receive Materials' दबाएं, सप्लायर का नाम, चालान या ट्रक नंबर और आई हुई मात्रा भरें।",
      },
      {
        number: 3,
        titleEn: "Issue to Contractor or Work Area",
        titleHi: "ठेकेदार को माल जारी करें (Issue)",
        descEn: "Deduct items given for today's slab casting, brickwork, or plastering so stock balance stays accurate.",
        descHi: "छत ढलाई या चिनाई के लिए जो कट्टे दिए गए हैं, उन्हें दर्ज करें ताकि गोदाम का बैलेंस सही रहे।",
      },
    ],
    jargon: [
      {
        term: "GRN (Goods Receipt Note)",
        meaningEn: "Official proof that materials delivered by supplier arrived and were verified at site.",
        meaningHi: "सामान प्राप्ति रसीद — यह पक्का सबूत कि सप्लायर का माल साइट पर आ चुका है।",
      },
      {
        term: "CFT (Cubic Feet)",
        meaningEn: "Measurement unit for bulk sand, grit, and aggregates in dumpers.",
        meaningHi: "क्यूबिक फीट (घन फीट) — रेत, बजरी और डस्ट को नापने की इकाई।",
      },
      {
        term: "Safety / Reorder Stock",
        meaningEn: "Minimum level of material. When stock dips below this, you get an automatic red alert to reorder.",
        meaningHi: "न्यूनतम स्टॉक सीमा। इससे कम होते ही लाल चेतावनी आती है ताकि नया ऑर्डर दिया जा सके।",
      },
    ],
    proTipsEn: [
      "Filter by status 'Low Stock' to see everything that needs urgent ordering today.",
      "Click on any material row to see its full history of who received it and where it was consumed.",
    ],
    proTipsHi: [
      "फिल्टर में 'Low Stock' चुनकर तुरंत देखें कि आज कौन-सा सामान मंगाना जरूरी है।",
      "किसी भी सामान पर क्लिक करके देखें कि वह कब आया और किस काम में खर्च हुआ।",
    ],
  },

  "/measurement-book": {
    icon: BookOpen,
    titleEn: "Measurement Book (MB)",
    titleHi: "माप पुस्तिका (Measurement Book / MB)",
    subtitleEn: "Record physical work done on site (L × B × D)",
    subtitleHi: "किए गए काम की लंबाई, चौड़ाई और मोटाई (L × B × D) का नाप",
    whoUsesEn: "Site Engineers, Quantity Surveyors, Contractors, Supervisors",
    whoUsesHi: "साइट इंजीनियर, सर्वेयर, पेटी-ठेकेदार, सुपरवाइज़र",
    summaryEn: "The Measurement Book is the legal and technical backbone of construction billing. When a contractor completes excavation, brickwork, or tiling, enter the dimensions (Length, Breadth, Depth) here to calculate total quantity and bill amount.",
    summaryHi: "माप पुस्तिका (MB) निर्माण कार्य के बिलिंग की रीढ़ है। जब ठेकेदार खुदाई, चिनाई, प्लास्टर या टाइल का काम पूरा करे, तो उसकी लंबाई, चौड़ाई और गहराई नापकर यहाँ दर्ज करें ताकि सही बिल बन सके।",
    steps: [
      {
        number: 1,
        titleEn: "Click '+ New Measurement'",
        titleHi: "'+ New Measurement' पर क्लिक करें",
        descEn: "Select the project, contractor name, and specific work item (e.g. Brickwork 9\" or RCC Slab).",
        descHi: "प्रोजेक्ट, ठेकेदार का नाम और काम का प्रकार (जैसे ईंट चिनाई या आरसीसी स्लैब) चुनें।",
      },
      {
        number: 2,
        titleEn: "Fill Dimensions (L × B × D × No)",
        titleHi: "नाप भरें (लंबाई × चौड़ाई × गहराई × संख्या)",
        descEn: "Enter Number of units, Length, Breadth, and Depth/Height. The app automatically multiplies the cubic or square meters.",
        descHi: "संख्या, लंबाई, चौड़ाई और मोटाई भरें। ऐप अपने-आप कुल मात्रा (Sq.ft या Cu.m) निकाल देगा।",
      },
      {
        number: 3,
        titleEn: "Add Deduction (if any) & Save",
        titleHi: "कटौती (Deduction) घटाएं और सुरक्षित करें",
        descEn: "Subtract door/window openings, then click Save. The measurement is now ready for contractor bill certification.",
        descHi: "दरवाजे या खिड़की का खाली हिस्सा घटाएं और सेव करें। यह नाप बिल बनाने के लिए तैयार है।",
      },
    ],
    jargon: [
      {
        term: "L × B × D",
        meaningEn: "Length (लंबाई) × Breadth/Width (चौड़ाई) × Depth/Thickness (गहराई या मोटाई).",
        meaningHi: "लंबाई × चौड़ाई × गहराई (दीवार या स्लैब का नाप लेने का वैज्ञानिक तरीका)।",
      },
      {
        term: "Deduction (कटौती)",
        meaningEn: "Hollow openings like doors and windows subtracted from total wall masonry.",
        meaningHi: "दीवार में छोड़े गए दरवाजे या खिड़की का हिस्सा जिसे कुल चिनाई में से घटाया जाता है।",
      },
      {
        term: "R.A. Bill (Running Account Bill)",
        meaningEn: "Interim bill paid to contractor based on approved measurement book entries.",
        meaningHi: "ठेकेदार को काम की प्रगति के आधार पर दिया जाने वाला रनिंग बिल।",
      },
    ],
    proTipsEn: [
      "Use Excel Filter on 'Contractor' to verify all measurements claimed by a single contractor before paying.",
      "Export certified measurements directly into Excel to attach with client payment certificates.",
    ],
    proTipsHi: [
      "ठेकेदार के नाम से फिल्टर करके भुगतान से पहले उसके द्वारा नापे गए सभी कामों की जाँच करें।",
      "एक्सेल में एक्सपोर्ट करके क्लाइंट या आर्किटेक्ट को बिल के साथ प्रमाण के रूप में भेजें।",
    ],
  },

  "/finance": {
    icon: DollarSign,
    titleEn: "Finance, Bills & Payments",
    titleHi: "हिसाब-किताब, बिल और भुगतान",
    subtitleEn: "Manage vendor invoices, sub-contractor bills & payments",
    subtitleHi: "वेंडर के बिल, ठेकेदारों के भुगतान और बैंक ट्रांजेक्शन",
    whoUsesEn: "Accountants, Project Managers, Owners, Finance Officers",
    whoUsesHi: "अकाउंटेंट, प्रोजेक्ट हेड, मुनीम, मालिक",
    summaryEn: "Keep complete control over construction finances. Record vendor purchase bills, verify contractor running bills, apply GST/TDS, track retention money, and record bank payments with UTR numbers.",
    summaryHi: "प्रोजेक्ट के पूरे पैसों का सुरक्षित हिसाब रखें। सप्लायर के बिल जोड़ें, ठेकेदारों के रनिंग बिल पास करें, जीएसटी/टीडीएस काटें, और बैंक पेमेंट का यूटीआर (UTR) नंबर दर्ज करें।",
    steps: [
      {
        number: 1,
        titleEn: "Record Inward Bill (Invoice)",
        titleHi: "आया हुआ बिल (Invoice) दर्ज करें",
        descEn: "Click 'Record Bill', select a Vendor or Contractor, enter the invoice number, amount, GST, and optional due date.",
        descHi: "'+ New Bill' दबाएं, वेंडर या ठेकेदार चुनें, बिल नंबर, रकम और भुगतान की अंतिम तारीख भरें।",
      },
      {
        number: 2,
        titleEn: "Record Payment Made",
        titleHi: "किया गया भुगतान (Payment) दर्ज करें",
        descEn: "Click 'Record Payment', choose payment method (Bank Transfer, Cheque, UPI, Cash) and enter UTR reference.",
        descHi: "'Record Payment' दबाएं, भुगतान का तरीका (NEFT/RTGS, चेक, यूपीआई) और यूटीआर नंबर लिखें।",
      },
      {
        number: 3,
        titleEn: "Track Pending Balances",
        titleHi: "बकाया राशि (Pending Balance) ट्रैक करें",
        descEn: "Use the Pending filter to see who needs to be paid this week to avoid material delivery delays.",
        descHi: "'Pending' फिल्टर लगाकर देखें कि इस हफ्ते किस-किसका भुगतान बाकी है।",
      },
    ],
    jargon: [
      {
        term: "UTR Number",
        meaningEn: "Unique Transaction Reference generated by bank for NEFT/RTGS/IMPS payments. Essential for proof.",
        meaningHi: "बैंक द्वारा दिया गया ट्रांजेक्शन नंबर — बैंक से पैसा जाने का पक्का डिजिटल सबूत।",
      },
      {
        term: "Retention Money (सुरक्षा जमा)",
        meaningEn: "Usually 5% held back from contractor bill until warranty period finishes defect-free.",
        meaningHi: "ठेकेदार के बिल में से रोकी गई 5% रकम जो काम सही-सलामत पूरा होने के बाद दी जाती है।",
      },
      {
        term: "TDS (Tax Deducted at Source)",
        meaningEn: "Income tax deducted from vendor or contractor bills under Indian tax rules and deposited with the government.",
        meaningHi: "आयकर नियम अनुसार ठेकेदार या वेंडर के बिल से काटा गया सरकारी टैक्स।",
      },
      {
        term: "GST Input Tax Credit (ITC)",
        meaningEn: "Eligible GST paid on business purchases that reduces the GST your company owes.",
        meaningHi: "खरीद बिलों पर दिया गया जीएसटी जिसका क्रेडिट कंपनी अपने टैक्स में ले सकती है।",
      },
      {
        term: "Reverse Charge (RCM)",
        meaningEn: "Bills where your company pays GST directly to the government instead of the supplier paying it.",
        meaningHi: "ऐसे बिल जहाँ सप्लायर की बजाय कंपनी सीधे सरकार को जीएसटी जमा करती है।",
      },
    ],
    proTipsEn: [
      "Filter by 'Payment Status: PENDING' to make a weekly payment list in 2 seconds.",
      "Green Excel button generates CA-ready bill ledgers with GST and TDS columns.",
    ],
    proTipsHi: [
      "फिल्टर में 'PENDING' चुनकर 2 सेकंड में इस हफ्ते के भुगतान की लिस्ट तैयार करें।",
      "एक्सेल बटन दबाकर सीए (CA) को भेजने लायक जीएसटी और टीडीएस की शीट डाउनलोड करें।",
    ],
  },

  "/workforce": {
    icon: Users,
    titleEn: "Workers Directory & Wage Rates",
    titleHi: "कारीगर व मजदूर डायरेक्टरी (श्रमिक)",
    subtitleEn: "Manage all site staff, daily wagers & skilled masons",
    subtitleHi: "सभी मिस्त्री, मजदूर, सुपरवाइज़र और उनकी दैनिक मजदूरी",
    whoUsesEn: "Supervisors, HR, Timekeepers, Contractors",
    whoUsesHi: "सुपरवाइज़र, मुंशी, ठेकेदार, एचआर",
    summaryEn: "A complete master phonebook of everyone working at your construction site. Store Aadhaar numbers, emergency contacts, trade skills (Mason, Carpenter, Helper, Electrician), and daily wage rates.",
    summaryHi: "साइट पर काम करने वाले हर व्यक्ति का फोन नंबर, आधार कार्ड, पद (मिस्त्री, हेल्पर, बढ़ई, इलेक्ट्रीशियन) और उनकी तय दैनिक मजदूरी (दिहाड़ी) यहाँ सुरक्षित रहती है।",
    steps: [
      {
        number: 1,
        titleEn: "Click '+ Add Worker'",
        titleHi: "'+ Add Worker' पर क्लिक करें",
        descEn: "Enter full name, mobile number, emergency contact, and photo/ID if available.",
        descHi: "नाम, मोबाइल नंबर, घर का इमरजेंसी नंबर और आधार कार्ड विवरण भरें।",
      },
      {
        number: 2,
        titleEn: "Set Role & Daily Wage Rate",
        titleHi: "पद और दैनिक दिहाड़ी दर तय करें",
        descEn: "Choose role (Skilled Mason, Unskilled Helper, Supervisor) and enter daily wage (e.g. ₹600/day).",
        descHi: "कारीगर का प्रकार (कुशल मिस्त्री, हेल्पर) और दैनिक मजदूरी (जैसे ₹600 प्रतिदिन) दर्ज करें।",
      },
      {
        number: 3,
        titleEn: "Assign to Site / Contractor",
        titleHi: "साइट या ठेकेदार से जोड़ें",
        descEn: "Tag the worker to their active site or labor contractor so attendance sheets load correctly.",
        descHi: "मजदूर को उसकी साइट या ठेकेदार से जोड़ें ताकि हाजिरी में उसका नाम तुरंत दिखे।",
      },
    ],
    jargon: [
      {
        term: "Skilled (कारीगर / मिस्त्री)",
        meaningEn: "Experienced tradesperson like Mason, Carpenter, Welder, Bar-bender.",
        meaningHi: "अनुभवी हुनरमंद जैसे राजमिस्त्री, कारपेंटर, वेल्डर या सरिया बांधने वाला।",
      },
      {
        term: "Unskilled (हेल्पर / मजदूर)",
        meaningEn: "General site laborers assisting with loading, mixing, carrying bricks and mortar.",
        meaningHi: "सामान उठाने, मसाला मिलाने और ईंट ढोने में मदद करने वाले सामान्य मजदूर।",
      },
      {
        term: "Dihaadi / Daily Wage",
        meaningEn: "The fixed amount paid for 1 full shift of 8 hours of labor.",
        meaningHi: "एक पूरे दिन (8 घंटे) के काम के लिए तय की गई मजदूरी।",
      },
    ],
    proTipsEn: [
      "Search workers instantly by phone number or Aadhaar in the search bar.",
      "Filter by Skill Type to see how many masons vs helpers you have on payroll.",
    ],
    proTipsHi: [
      "सर्च बॉक्स में मोबाइल नंबर लिखकर किसी भी मजदूर का रिकॉर्ड तुरंत खोजें।",
      "फिल्टर में 'Skill' चुनकर देखें कि आपके पास कुल कितने मिस्त्री और कितने हेल्पर हैं।",
    ],
  },

  "/parties": {
    icon: Building2,
    titleEn: "Vendors & Contractors",
    titleHi: "वेंडर और ठेकेदार",
    subtitleEn: "Suppliers of cement, steel, bricks & labor contractors",
    subtitleHi: "सीमेंट-सरिया सप्लायर और लेबर ठेकेदारों की सूची",
    whoUsesEn: "Procurement, Project Managers, Accountants",
    whoUsesHi: "परचेज मैनेजर, प्रोजेक्ट हेड, अकाउंटेंट",
    summaryEn: "Store and manage every supplier or contractor you work with. Save their GSTIN, PAN (for TDS), bank details, and open their complete account ledger anytime.",
    summaryHi: "उन सभी सप्लायर और ठेकेदारों की सूची जिनसे आप सामान खरीदते हैं या काम करवाते हैं। उनका जीएसटी, पैन, बैंक खाता और बकाया हिसाब यहाँ देखें।",
    steps: [
      {
        number: 1,
        titleEn: "Add a Vendor or Contractor",
        titleHi: "नया वेंडर या ठेकेदार जोड़ें",
        descEn: "Click 'Add Vendor / Contractor', enter the firm name, contact name, phone number, and choose Vendor or Contractor.",
        descHi: "'Add Vendor / Contractor' दबाएं, फर्म का नाम, संपर्क व्यक्ति और मोबाइल नंबर भरें।",
      },
      {
        number: 2,
        titleEn: "Enter Tax & Bank Details",
        titleHi: "टैक्स (GSTIN/PAN) और बैंक खाता भरें",
        descEn: "Save their GSTIN, PAN, TDS section (like 194C), and bank account + IFSC so bills and payments stay accurate.",
        descHi: "जीएसटी नंबर, पैन कार्ड, टीडीएस नियम और बैंक खाता दर्ज करें ताकि बिल और भुगतान सही रहें।",
      },
      {
        number: 3,
        titleEn: "Open Account Ledger",
        titleHi: "पूरा खाता (लेजर) देखें",
        descEn: "Click any vendor or contractor name to view their ledger: bills recorded, payments made, TDS deducted, and remaining balance.",
        descHi: "किसी भी नाम पर क्लिक करके उसका पूरा खाता देखें: कुल बिल, भुगतान, काटा गया टीडीएस और बकाया।",
      },
    ],
    jargon: [
      {
        term: "GSTIN",
        meaningEn: "15-digit Goods & Services Tax Identification Number required for GST tax invoices.",
        meaningHi: "15 अंकों का जीएसटी नंबर जो पक्के टैक्स बिलों के लिए अनिवार्य है।",
      },
      {
        term: "Sub-Contractor (पेटी-ठेकेदार)",
        meaningEn: "Specialist contractor handling specific tasks (e.g. Tile work, Electrical, Shuttering).",
        meaningHi: "विशेष काम का ठेका लेने वाला व्यक्ति (जैसे टाइल ठेकेदार, शटरिंग ठेकेदार, बिजली ठेकेदार)।",
      },
    ],
    proTipsEn: [
      "Filter by Type (Vendor vs Contractor) to separate material suppliers from labor contractors.",
      "Click a phone number to call directly from your phone.",
    ],
    proTipsHi: [
      "टाइप फिल्टर लगाकर सामान सप्लायर और लेबर ठेकेदारों को अलग-अलग देख सकते हैं।",
      "फोन नंबर पर क्लिक करके मोबाइल से सीधा कॉल लगा सकते हैं।",
    ],
  },

  "/projects": {
    icon: LayoutDashboard,
    titleEn: "Projects & Construction Sites",
    titleHi: "प्रोजेक्ट्स और निर्माण साइट्स",
    subtitleEn: "Manage budgets, locations, timelines & site teams",
    subtitleHi: "बजट, साइट लोकेशन, समय-सीमा और साइट टीम",
    whoUsesEn: "Project Heads, General Contractors, Directors, Clients",
    whoUsesHi: "प्रोजेक्ट डायरेक्टर, जनरल कांट्रेक्टर, इंजीनियर",
    summaryEn: "View and organize all your construction projects. Track total budget spent vs allocated, milestone progress percentages, site addresses, and designated site managers.",
    summaryHi: "अपने सभी निर्माण प्रोजेक्ट्स की स्थिति देखें। कुल बजट में से कितना खर्च हुआ, कितने प्रतिशत काम पूरा हुआ और किस साइट का इंचार्ज कौन है, सब यहाँ दर्ज होता है।",
    steps: [
      {
        number: 1,
        titleEn: "Browse Project Cards",
        titleHi: "प्रोजेक्ट कार्ड्स देखें",
        descEn: "See live progress bars, remaining budget, and site health at a glance.",
        descHi: "प्रगति बार, बचा हुआ बजट और साइट की ताज़ा स्थिति एक नजर में देखें।",
      },
      {
        number: 2,
        titleEn: "Switch Active Site",
        titleHi: "सक्रिय साइट बदलें",
        descEn: "Select a project to filter all subsequent screens (Day Book, Attendance, Materials) to that site only.",
        descHi: "किसी भी प्रोजेक्ट को चुनकर पूरा सॉफ्टवेयर उसी साइट के डेटा पर सेट कर सकते हैं।",
      },
      {
        number: 3,
        titleEn: "View Project Analytics",
        titleHi: "प्रोजेक्ट विश्लेषण देखें",
        descEn: "Click on any project to see detailed financial breakdown and contractor commitments.",
        descHi: "विस्तृत खर्च, ठेकेदारों के बिल और काम की स्थिति देखने के लिए प्रोजेक्ट पर क्लिक करें।",
      },
    ],
    jargon: [
      {
        term: "Estimated Cost vs Actual",
        meaningEn: "Planned tender cost compared to actual rupees spent so far on materials and labor.",
        meaningHi: "टेंडर के समय तय किया गया अनुमानित खर्च बनाम अब तक हुआ वास्तविक खर्च।",
      },
    ],
    proTipsEn: [
      "Keep your project's active site selected in the sidebar to work focused on one building at a time.",
    ],
    proTipsHi: [
      "साइडबार में अपनी साइट चुनकर रखें ताकि सिर्फ उसी बिल्डिंग का हिसाब स्क्रीन पर दिखे।",
    ],
  },

  "/tasks": {
    icon: CheckSquare,
    titleEn: "Tasks & Site Work Orders",
    titleHi: "कार्य व वर्क ऑर्डर (Tasks)",
    subtitleEn: "Assign, schedule & inspect daily site activities",
    subtitleHi: "साइट के दैनिक कामों का आवंटन और निरीक्षण",
    whoUsesEn: "Site Engineers, Supervisors, Foremen",
    whoUsesHi: "साइट इंजीनियर, सुपरवाइज़र, फोरमैन",
    summaryEn: "Make sure no job is forgotten or delayed. Create daily task tickets (e.g. 'Pour 2nd floor columns', 'Fix plumbing lines'), assign them to supervisors or contractors, and mark done when inspected.",
    summaryHi: "साइट का कोई भी काम छूटे नहीं! रोज के कामों की सूची बनाएं (जैसे 'दूसरी मंजिल के पिलर भरना', 'प्लंबिंग पाइप डालना'), सुपरवाइज़र को सौंपें और पूरा होने पर 'Done' मार्क करें।",
    steps: [
      {
        number: 1,
        titleEn: "Click '+ New Task'",
        titleHi: "'+ New Task' पर क्लिक करें",
        descEn: "Give task a simple name, set deadline date and priority (Low, Medium, Urgent).",
        descHi: "काम का नाम लिखें, पूरा करने की अंतिम तारीख और प्राथमिकता (जरूरी/सामान्य) चुनें।",
      },
      {
        number: 2,
        titleEn: "Assign to Person or Team",
        titleHi: "जिम्मेदार व्यक्ति को सौंपें",
        descEn: "Choose which supervisor or subcontractor is in charge of getting it done.",
        descHi: "चुनें कि यह काम किस सुपरवाइज़र या ठेकेदार को पूरा करवाना है।",
      },
      {
        number: 3,
        titleEn: "Update Status to 'Completed'",
        titleHi: "काम पूरा होने पर 'Completed' करें",
        descEn: "Once physically inspected on site, tap Completed to keep everyone updated.",
        descHi: "साइट पर काम की जांच करने के बाद स्टेटस 'Completed' कर दें।",
      },
    ],
    jargon: [
      {
        term: "Priority (प्राथमिकता)",
        meaningEn: "How urgent the task is. Urgent tasks appear highlighted in red.",
        meaningHi: "काम कितना जरूरी है। अति आवश्यक काम लाल रंग में सबसे ऊपर दिखते हैं।",
      },
    ],
    proTipsEn: [
      "Filter by 'My Tasks' or 'Status: IN_PROGRESS' to see what needs your immediate attention today.",
    ],
    proTipsHi: [
      "फिल्टर में 'IN_PROGRESS' चुनकर आज चल रहे कामों पर नजर रखें।",
    ],
  },

  "/reports": {
    icon: FileText,
    titleEn: "Reports & Financial Statements",
    titleHi: "रिपोर्ट्स और वित्तीय विवरण",
    subtitleEn: "Audit-ready summaries for owners, CAs & clients",
    subtitleHi: "मालिक, सीए और क्लाइंट को भेजने लायक पूरी रिपोर्ट",
    whoUsesEn: "Accountants, Project Directors, Auditors, Owners",
    whoUsesHi: "अकाउंटेंट, डायरेक्टर, ऑडिटर, मुनीम",
    summaryEn: "Generate professional summaries with one click. Download complete Day Book cash reports, Material consumption sheets, Worker master rolls, and Contractor billing summaries in Excel format.",
    summaryHi: "एक क्लिक में पूरी रिपोर्ट तैयार करें। डे बुक का रोकड़ हिसाब, गोदाम से निकला सामान, मजदूरों का मास्टर रोल और ठेकेदारों के बिल की पूरी एक्सेल शीट डाउनलोड करें।",
    steps: [
      {
        number: 1,
        titleEn: "Select Report Type & Date Range",
        titleHi: "रिपोर्ट का प्रकार और तारीख चुनें",
        descEn: "Pick whether you want Day Book, Materials, Attendance, or Finance, and choose date range (This Month, Last 30 Days).",
        descHi: "चुनें कि आपको डे बुक, सामग्री या हाजिरी की रिपोर्ट चाहिए और तारीख का दायरा तय करें।",
      },
      {
        number: 2,
        titleEn: "Review On-Screen Summary",
        titleHi: "स्क्रीन पर मुख्य आंकड़े देखें",
        descEn: "See grand totals, net cash balances, and verified numbers.",
        descHi: "कुल खर्च, शुद्ध बचत और वेरिफाइड आंकड़ों का सारांश देखें।",
      },
      {
        number: 3,
        titleEn: "Download Excel File",
        titleHi: "एक्सेल (Excel) फाइल डाउनलोड करें",
        descEn: "Click 'Export to Excel' to save a clean spreadsheet you can WhatsApp or email to your CA.",
        descHi: "'Export to Excel' दबाएं और फाइल को अपने सीए या मालिक को व्हाट्सएप या ईमेल पर भेजें।",
      },
    ],
    jargon: [
      {
        term: "CSV / Excel Export",
        meaningEn: "A file compatible with Microsoft Excel, Google Sheets, or mobile office apps.",
        meaningHi: "माइक्रोसॉफ्ट एक्सेल या गूगल शीट्स में खुलने वाली फाइल।",
      },
    ],
    proTipsEn: [
      "All Excel sheets are formatted with clear headers and proper currency columns.",
    ],
    proTipsHi: [
      "सभी एक्सेल फाइलें सुंदर फॉर्मेट और रुपये के चिन्ह के साथ तैयार होती हैं।",
    ],
  },

  "/chat": {
    icon: MessageSquare,
    titleEn: "Site Messages & Field Chat",
    titleHi: "साइट संदेश और बातचीत (चैट)",
    subtitleEn: "Instant coordination between site and office",
    subtitleHi: "साइट और ऑफिस के बीच तुरंत बातचीत व फोटो शेयरिंग",
    whoUsesEn: "Everyone: Supervisors, Engineers, Managers, Staff",
    whoUsesHi: "सभी: सुपरवाइज़र, इंजीनियर, मैनेजर, स्टाफ",
    summaryEn: "Keep all construction communication in one official place instead of losing important decisions in WhatsApp personal chats. Discuss material arrivals, concrete pours, safety questions, and share updates.",
    summaryHi: "व्हाट्सएप पर जरूरी बातें खो जाने के बजाय सारी बातचीत यहीं सुरक्षित रखें। सीमेंट आया या नहीं, स्लैब कब डलेगी, किसी समस्या की जानकारी—सब यहाँ तुरंत साझा करें।",
    steps: [
      {
        number: 1,
        titleEn: "Select Channel or Person",
        titleHi: "चैनल या व्यक्ति का नाम चुनें",
        descEn: "Pick the general site chat room or message a specific colleague directly.",
        descHi: "सामान्य साइट ग्रुप चुनें या किसी साथी के नाम पर क्लिक करके व्यक्तिगत मैसेज करें।",
      },
      {
        number: 2,
        titleEn: "Type Message or Note",
        titleHi: "मैसेज टाइप करें",
        descEn: "Share what is happening at the site gate or work area.",
        descHi: "साइट पर क्या चल रहा है या क्या परेशानी है, लिखकर भेजें।",
      },
      {
        number: 3,
        titleEn: "Get Real-Time Notification",
        titleHi: "तुरंत सूचना (Notification) पाएं",
        descEn: "Team members receive instant pop-up alerts with sound on their screens.",
        descHi: "सामने वाले की स्क्रीन पर तुरंत पॉप-अप नोटिफिकेशन जाता है।",
      },
    ],
    jargon: [
      {
        term: "Channels (चैनल)",
        meaningEn: "Topic-based discussion rooms (e.g. #general, #site-updates, #urgent).",
        meaningHi: "विषय के अनुसार बनाए गए चैट ग्रुप।",
      },
    ],
    proTipsEn: [
      "Click the chat toast notification at the bottom right anytime to jump straight to the conversation.",
    ],
    proTipsHi: [
      "स्क्रीन पर आने वाले पीले चैट नोटिफिकेशन पर क्लिक करके सीधा मैसेज पर पहुँच सकते हैं।",
    ],
  },

  "/settings": {
    icon: Settings,
    titleEn: "Settings & Profile Security",
    titleHi: "सेटिंग्स और पासवर्ड सुरक्षा",
    subtitleEn: "Manage your password, language & organization details",
    subtitleHi: "अपना पासवर्ड बदलें, भाषा चुनें और कंपनी विवरण देखें",
    whoUsesEn: "All Users, Admins, Supervisors",
    whoUsesHi: "सभी यूजर, एडमिन, सुपरवाइज़र",
    summaryEn: "Personalize your experience. Change your login password securely, switch interface language between English and हिन्दी, and view your assigned role and company details.",
    summaryHi: "अपनी सुरक्षा सुनिश्चित करें। यहाँ से अपना लॉगिन पासवर्ड आसानी से बदलें, हिंदी या इंग्लिश भाषा चुनें और अपनी कंपनी की जानकारी देखें।",
    steps: [
      {
        number: 1,
        titleEn: "Change Password",
        titleHi: "पासवर्ड बदलें",
        descEn: "Click the 'Change Password' button, type your current password, your new password twice, and save.",
        descHi: "'Change Password' पर क्लिक करें, पुराना पासवर्ड डालें और नया पासवर्ड दो बार लिखकर सुरक्षित करें।",
      },
      {
        number: 2,
        titleEn: "Switch Language",
        titleHi: "भाषा बदलें",
        descEn: "Choose English or हिन्दी. The entire application will immediately translate for you.",
        descHi: "इंग्लिश या हिन्दी में से चुनें। पूरा सॉफ्टवेयर तुरंत आपकी पसंदीदा भाषा में दिखने लगेगा।",
      },
    ],
    jargon: [
      {
        term: "Password Strength",
        meaningEn: "Make sure your password has at least 8 characters with a mix of letters and numbers.",
        meaningHi: "मजबूत पासवर्ड के लिए कम से कम 8 अक्षर और नंबरों का इस्तेमाल करें।",
      },
    ],
    proTipsEn: [
      "You can also switch language instantly from the top-right button 'EN | हिन्दी' without visiting Settings.",
    ],
    proTipsHi: [
      "आप ऊपर दाईं ओर दिए गए 'EN | हिन्दी' बटन से भी 1 सेकंड में भाषा बदल सकते हैं।",
    ],
  },

  "/attendance/muster": {
    icon: ClipboardCheck,
    titleEn: "Workers Muster Roll",
    titleHi: "श्रमिक मस्टर रोल (दैनिक हाजिरी)",
    subtitleEn: "Mark daily attendance for registered site workers & contractor gangs",
    subtitleHi: "मजदूरों और कारीगरों की रोज की हाजिरी और दिहाड़ी दर्ज करें",
    whoUsesEn: "Site Supervisors, Timekeepers, Project Managers",
    whoUsesHi: "साइट सुपरवाइज़र, मुंशी, प्रोजेक्ट मैनेजर",
    summaryEn: "Mark today's attendance once for your entire site team. Marked workers and wage totals flow automatically into Payroll, Day Book summaries, and monthly muster exports.",
    summaryHi: "पूरी साइट की टीम की हाजिरी एक साथ लगाएं। यहाँ दर्ज की गई हाजिरी सीधे पेरोल और मासिक मस्टर रोल रिपोर्ट में जुड़ जाती है।",
    steps: [
      {
        number: 1,
        titleEn: "Pick Project Site & Date",
        titleHi: "साइट और तारीख चुनें",
        descEn: "Select the site and date at the top, or turn on the toggle to show workers registered under all sites.",
        descHi: "ऊपर प्रोजेक्ट और तारीख चुनें। दूसरे प्रोजेक्ट के मजदूर देखने के लिए 'All sites' टॉगल चालू करें।",
      },
      {
        number: 2,
        titleEn: "Tap Present, Half Day, Absent, or Holiday",
        titleHi: "हाजिरी (P / HD / A / Paid) चुनें",
        descEn: "Tap status buttons per worker, or click 'Mark Remaining Present' to mark all unmarked workers in one tap.",
        descHi: "हर मजदूर के आगे बटन दबाएं, या बचे हुए सभी मजदूरों को एक साथ हाजिर करने के लिए 'Mark Remaining Present' दबाएं।",
      },
      {
        number: 3,
        titleEn: "Save Muster Roll",
        titleHi: "मस्टर रोल सेव करें",
        descEn: "Click 'Save Muster Roll'. Wages calculate automatically based on each worker's daily rate.",
        descHi: "'Save Muster Roll' दबाएं। हर मजदूर की दिहाड़ी अपने-आप जुड़ जाएगी।",
      },
    ],
    jargon: [
      {
        term: "Muster Roll",
        meaningEn: "Official daily register showing which skilled trades and helpers worked on site and how many hours/days count toward pay.",
        meaningHi: "रोजगार व दिहाड़ी का आधिकारिक रजिस्टर जिसमें रोज़ काम करने वाले सभी श्रमिकों की हाजिरी दर्ज होती है।",
      },
      {
        term: "Paid Holiday (H)",
        meaningEn: "Worker stays home on a festival or sanctioned holiday while still receiving full daily wage.",
        meaningHi: "सरकारी या घोषित छुट्टी जिस दिन काम बंद रहने पर भी मजदूर को पूरी दिहाड़ी मिलती है।",
      },
    ],
    proTipsEn: [
      "Add new workers anytime under People -> Workers before marking their attendance here.",
      "Once saved, changes appear immediately on the Dashboard crew summary.",
    ],
    proTipsHi: [
      "नए मजदूर जोड़ने के लिए Workers पेज पर जाएं, फिर यहाँ उनकी हाजिरी दिखेगी।",
      "सेव करते ही डैशबोर्ड पर आज की श्रमिक संख्या तुरंत अपडेट हो जाती है।",
    ],
  },

  "/expenses": {
    icon: Receipt,
    titleEn: "Cash Expenses",
    titleHi: "नकद खर्च (Cash Expenses)",
    subtitleEn: "Submit cash site expenses with receipt photos for reimbursement",
    subtitleHi: "साइट नकद खर्च की रसीद सहित एंट्री करें",
    whoUsesEn: "Site Supervisors, Storekeepers, Accountants, Admins",
    whoUsesHi: "साइट सुपरवाइज़र, स्टोरकीपर, अकाउंटेंट, एडमिन",
    summaryEn: "Use this when a staff member pays cash on site (travel, emergency hardware, food, fuel) and needs the company to record or reimburse them after checking the bill photo.",
    summaryHi: "जब कोई कर्मचारी साइट का नकद खर्च करे (यात्रा, पेट्रोल, इमरजेंसी सामान), तो रसीद फोटो के साथ यहाँ एंट्री दर्ज करें।",
    steps: [
      {
        number: 1,
        titleEn: "Click 'Add Site Expense'",
        titleHi: "'Add Site Expense' दबाएं",
        descEn: "Choose the project site, expense category, date, and enter the rupee amount you paid.",
        descHi: "प्रोजेक्ट साइट, खर्च की श्रेणी, तारीख और खर्च की गई रकम भरें।",
      },
      {
        number: 2,
        titleEn: "Attach Bill / Receipt Photo",
        titleHi: "बिल या रसीद की फोटो लगाएं",
        descEn: "Upload a clear photo or PDF of the receipt (under 10 MB) so management can verify it.",
        descHi: "रसीद की साफ फोटो या PDF अपलोड करें ताकि एडमिन उसे आसानी से पास कर सके।",
      },
      {
        number: 3,
        titleEn: "Track Approval Status",
        titleHi: "स्वीकृति स्टेटस देखें",
        descEn: "Watch status move from Pending -> Approved for Reimbursement. Approved claims are paid in Payroll or Finance.",
        descHi: "स्टेटस Pending से Approved होने पर भुगतान पेरोल या फाइनेंस से किया जाता है।",
      },
    ],
    jargon: [
      {
        term: "Reimbursement",
        meaningEn: "Paying back an employee for company expenses they paid with their own money.",
        meaningHi: "कर्मचारी द्वारा कंपनी के काम में अपनी जेब से खर्च किए गए पैसे वापस लौटाना।",
      },
      {
        term: "Approved for Reimbursement",
        meaningEn: "Expense has been checked and approved by an Admin; payment can now be released.",
        meaningHi: "खर्च एडमिन द्वारा पास कर दिया गया है और अब इसका पैसा दिया जा सकता है।",
      },
    ],
    proTipsEn: [
      "Always write the specific purpose (e.g. 'Auto fare for PVC fittings') so approvals happen faster.",
    ],
    proTipsHi: [
      "खर्च का साफ विवरण लिखें (जैसे 'प्लंबिंग फिटिंग के लिए ऑटो किराया') ताकि स्वीकृति जल्दी मिले।",
    ],
  },

  "/exports": {
    icon: Landmark,
    titleEn: "Accounts Export (Tally & CA Ready)",
    titleHi: "अकाउंट्स एक्सपोर्ट (टैली और सीए रिपोर्ट)",
    subtitleEn: "Download clean CSV spreadsheets ready for Tally, Excel, or your Chartered Accountant",
    subtitleHi: "टैली, एक्सेल या अपने सीए (CA) के लिए तैयार डेटा डाउनलोड करें",
    whoUsesEn: "Accountants, Owners, Admin Staff",
    whoUsesHi: "अकाउंटेंट, मालिक, ऑफिस एडमिन",
    summaryEn: "Pick a date range or financial year to download bills, payments, GST input credit registers, and TDS schedules in CSV format that opens cleanly in Excel or imports into Tally.",
    summaryHi: "किसी भी तारीख या वित्त वर्ष के लिए खरीद बिल, भुगतान, जीएसटी रजिस्टर और टीडीएस रिपोर्ट एक क्लिक में डाउनलोड करें।",
    steps: [
      {
        number: 1,
        titleEn: "Choose Date Range & Project",
        titleHi: "तारीख और प्रोजेक्ट चुनें",
        descEn: "Pick the From/To dates (or quick financial year buttons) and optionally filter by one site or vendor.",
        descHi: "तारीख या वित्त वर्ष चुनें। चाहें तो किसी एक साइट या वेंडर का डेटा भी अलग कर सकते हैं।",
      },
      {
        number: 2,
        titleEn: "Download the Required Register",
        titleHi: "जरूरी रजिस्टर डाउनलोड करें",
        descEn: "Pick Purchase Register for GSTR-2B matching, Payments Register for bank reconciliation, or TDS Register.",
        descHi: "जीएसटी मिलान के लिए Purchase Register, बैंक मिलान के लिए Payments और टैक्स के लिए TDS फाइल डाउनलोड करें।",
      },
    ],
    jargon: [
      {
        term: "Bank Reconciliation",
        meaningEn: "Matching payments recorded in Bothra CMS against your bank statement (net of TDS deducted).",
        meaningHi: "बैंक स्टेटमेंट से कटने वाले असली पैसे (टीडीएस काटने के बाद) और ऐप की एंट्री का मिलान करना।",
      },
      {
        term: "GSTR-2B Matching",
        meaningEn: "Checking your Purchase Register against GST portal data so your company claims valid Input Tax Credit.",
        meaningHi: "खरीद बिलों का जीएसटी पोर्टल से मिलान ताकि जीएसटी टैक्स छूट (ITC) सही मिल सके।",
      },
    ],
    proTipsEn: [
      "Use 'Only ITC Eligible' when sending files for monthly GST filing.",
    ],
    proTipsHi: [
      "मासिक जीएसटी रिटर्न के लिए 'Only ITC Eligible' विकल्प से फाइल निकालें।",
    ],
  },

  "/payroll": {
    icon: Wallet,
    titleEn: "Staff Payroll & Payslips",
    titleHi: "स्टाफ पेरोल और सैलरी स्लिप",
    subtitleEn: "Calculate monthly salaries, PF/ESIC/TDS deductions, and issue payslips",
    subtitleHi: "मासिक वेतन, पीएफ/ईएसआईसी/टीडीएस कटौती और सैलरी स्लिप तैयार करें",
    whoUsesEn: "Owners, HR, Accountants",
    whoUsesHi: "मालिक, एचआर, अकाउंटेंट",
    summaryEn: "Run monthly salary in 3 clear stages: Calculate Draft -> Approve Payroll -> Pay & Lock Month. Salary structures include basic pay, allowances, PF, ESIC, and monthly TDS.",
    summaryHi: "मासिक सैलरी तीन आसान चरणों में बनाएं: ड्राफ्ट गणना -> स्वीकृति -> भुगतान व लॉक। इसमें बेसिक सैलरी, भत्ते, PF, ESIC और TDS अपने-आप जुड़ते हैं।",
    steps: [
      {
        number: 1,
        titleEn: "Review Employee Salary Details",
        titleHi: "कर्मचारी वेतन विवरण जांचें",
        descEn: "Make sure each employee's basic pay, PAN, UAN (PF), ESIC, and Tax Declaration are saved.",
        descHi: "पक्का करें कि हर कर्मचारी की बेसिक सैलरी, पैन, UAN और टैक्स विकल्प दर्ज हैं।",
      },
      {
        number: 2,
        titleEn: "Calculate Draft & Approve",
        titleHi: "वेतन गणना करें और स्वीकृत करें",
        descEn: "Click Calculate Payroll to preview take-home pay and deductions, then Approve once checked.",
        descHi: "Calculate Payroll दबाकर हाथ में आने वाली सैलरी जांचें, फिर Approve करें।",
      },
      {
        number: 3,
        titleEn: "Release Payment & Download Payslips",
        titleHi: "भुगतान दर्ज करें और स्लिप डाउनलोड करें",
        descEn: "Record payment and open 24Q / Form 16 under Statutory Tax when filing quarterly TDS.",
        descHi: "भुगतान दर्ज करने के बाद हर कर्मचारी की पे-स्लिप और टैक्स रिपोर्ट डाउनलोड कर सकते हैं।",
      },
    ],
    jargon: [
      {
        term: "UAN (Universal Account Number)",
        meaningEn: "12-digit Provident Fund (PF) number issued to salaried employees.",
        meaningHi: "कर्मचारी का 12 अंकों का पीएफ (PF) खाता नंबर।",
      },
      {
        term: "New vs Old Tax Regime",
        meaningEn: "India income tax options: New Regime has lower default slabs; Old Regime allows HRA, 80C, and insurance deductions.",
        meaningHi: "टैक्स गणना के दो विकल्प: नई व्यवस्था में सीधे कम दरें, पुरानी व्यवस्था में 80C व किराया छूट मिलती है।",
      },
    ],
    proTipsEn: [
      "Leave salary in Draft status until all attendance and advance adjustments for the month are finished.",
    ],
    proTipsHi: [
      "पूरे महीने की हाजिरी और एडवांस जांचने के बाद ही पेरोल को फाइनल लॉक करें।",
    ],
  },

  "/payroll/tds-return": {
    icon: ShieldCheck,
    titleEn: "TDS Returns (Form 24Q & 26Q)",
    titleHi: "टीडीएस रिटर्न (फॉर्म 24Q और 26Q)",
    subtitleEn: "Prepare quarterly salary (24Q) and vendor/contractor (26Q) TDS filing data",
    subtitleHi: "तिमाही सैलरी (24Q) और वेंडर/ठेकेदार (26Q) टीडीएस फाइलिंग डेटा तैयार करें",
    whoUsesEn: "Accountants, Owners, CA Team",
    whoUsesHi: "अकाउंटेंट, मालिक, सीए टीम",
    summaryEn: "Review deducted TDS per quarter, add bank Challan (CIN/BSR) details after paying the government on the Income Tax portal, and export clean CSV/TXT files for NSDL RPU / TRACES.",
    summaryHi: "तिमाही टीडीएस कटौती देखें, सरकार को जमा चालान (BSR/Challan) की जानकारी जोड़ें और NSDL RPU या सीए को भेजने के लिए डेटा डाउनलोड करें।",
    steps: [
      {
        number: 1,
        titleEn: "Select Financial Year, Quarter & Form",
        titleHi: "वित्त वर्ष, तिमाही और फॉर्म चुनें",
        descEn: "Pick 24Q for employee salary TDS or 26Q for vendor/contractor TDS, then choose Quarter (Q1–Q4).",
        descHi: "स्टाफ सैलरी टीडीएस के लिए 24Q और वेंडर/ठेकेदार के लिए 26Q तथा तिमाही (Q1–Q4) चुनें।",
      },
      {
        number: 2,
        titleEn: "Add Deposited Challan Details",
        titleHi: "जमा चालान विवरण जोड़ें",
        descEn: "After paying TDS on the tax portal, enter BSR code, deposit date, and Challan serial number so shortfalls become zero.",
        descHi: "पोर्टल पर टैक्स भरने के बाद BSR कोड, तारीख और चालान नंबर भरें।",
      },
      {
        number: 3,
        titleEn: "Export for RPU / Generate Form 16 & 16A",
        titleHi: "RPU एक्सपोर्ट और फॉर्म 16/16A निकालें",
        descEn: "Download filing files for your CA's NSDL RPU/FVU tool or print summary certificates.",
        descHi: "सीए के सॉफ्टवेयर (RPU/FVU) के लिए फाइल डाउनलोड करें या फॉर्म 16/16A प्रिंट करें।",
      },
    ],
    jargon: [
      {
        term: "Form 24Q vs Form 26Q",
        meaningEn: "24Q reports TDS deducted on employee salaries; 26Q reports TDS deducted on vendor & contractor bills.",
        meaningHi: "24Q कर्मचारी वेतन के टीडीएस के लिए है; 26Q सप्लायर व ठेकेदारों के बिल पर कटे टीडीएस के लिए।",
      },
      {
        term: "RPU / FVU (TRACES)",
        meaningEn: "Official Indian government utilities your CA uses to validate quarterly TDS files before generating final Form 16/16A.",
        meaningHi: "सरकारी टैक्स सॉफ्टवेयर (NSDL/TRACES) जिससे सीए तिमाही रिटर्न सत्यापित करते हैं।",
      },
    ],
    proTipsEn: [
      "Always verify supplier PAN numbers under Vendors & Contractors before filing—missing PAN causes 20% higher TDS.",
    ],
    proTipsHi: [
      "रिटर्न से पहले सभी वेंडर व कर्मचारियों के PAN नंबर जांच लें—PAN न होने पर 20% टैक्स कटता है।",
    ],
  },

  "/material-requests": {
    icon: PackagePlus,
    titleEn: "Site Material Requests",
    titleHi: "साइट सामग्री मांग (Material Requests)",
    subtitleEn: "Request cement, steel, or supplies from site, approve quantities, and create orders",
    subtitleHi: "साइट से सामान की मांग भेजें, मात्रा पास करें और वेंडर ऑर्डर बनाएं",
    whoUsesEn: "Site Supervisors, Storekeepers, Project Managers, Procurement",
    whoUsesHi: "साइट सुपरवाइज़र, स्टोरकीपर, प्रोजेक्ट हेड, परचेज टीम",
    summaryEn: "Replace phone/WhatsApp guesswork with a clear 3-step material request flow: Site raises a request -> Admin/PM approves exact quantities -> Purchase orders go to vendors.",
    summaryHi: "साइट पर जरूरी सामान की मांग अब व्यवस्थित 3 चरणों में करें: साइट से मांग -> मैनेजर द्वारा मात्रा स्वीकृति -> वेंडर को ऑर्डर।",
    steps: [
      {
        number: 1,
        titleEn: "Raise Request from Site",
        titleHi: "साइट से नई मांग भेजें",
        descEn: "Pick project site, select needed materials, quantities, and required-by date.",
        descHi: "साइट, जरूरी सामान, मात्रा और कब तक चाहिए यह तारीख चुनकर मांग भेजें।",
      },
      {
        number: 2,
        titleEn: "Approve or Adjust Quantities",
        titleHi: "मांग जांचें और स्वीकृत करें",
        descEn: "Review pending requests and enter approved quantity (set to 0 to skip any item not needed).",
        descHi: "मांगी गई मात्रा जांचें (किसी आइटम को छोड़ना हो तो स्वीकृत मात्रा 0 रखें) और पास करें।",
      },
      {
        number: 3,
        titleEn: "Convert Approved Items into Orders",
        titleHi: "स्वीकृत सामान का ऑर्डर बनाएं",
        descEn: "Turn approved items into a vendor purchase order so stock arrives at site on time.",
        descHi: "पास किए गए सामान के लिए वेंडर को ऑर्डर भेजें ताकि काम न रुके।",
      },
    ],
    jargon: [
      {
        term: "Partial Approval",
        meaningEn: "Approving some items now and setting unneeded items to 0 so work continues without delay.",
        meaningHi: "पूरी सूची में से अभी केवल जरूरी सामान को पास करना और बाकी को 0 या बाद के लिए रखना।",
      },
    ],
    proTipsEn: [
      "Mention exact brand or grade in notes (e.g. 'Fe550D 12mm TMT') to avoid wrong deliveries.",
    ],
    proTipsHi: [
      "नोट्स में सही ग्रेड या ब्रांड लिखें (जैसे 'Fe550D 12mm सरिया') ताकि गलत माल न आए।",
    ],
  },

  "/drawings": {
    icon: Layers,
    titleEn: "Site Drawings & Revisions",
    titleHi: "साइट ड्राइंग्स और नक्शे (Revisions)",
    subtitleEn: "Keep the latest structural & architectural drawings organized with version history",
    subtitleHi: "आर्किटेक्ट और स्ट्रक्चरल ड्राइंग का नवीनतम संस्करण सुरक्षित रखें",
    whoUsesEn: "Engineers, Architects, Site Supervisors, Contractors",
    whoUsesHi: "साइट इंजीनियर, आर्किटेक्ट, सुपरवाइज़र, ठेकेदार",
    summaryEn: "Ensure the site never builds from an outdated blueprint. Upload new versions (R0, R1, GFC), compare changes side-by-side, and share approved versions clearly.",
    summaryHi: "सुनिश्चित करें कि साइट पर हमेशा सही और नया नक्शा ही इस्तेमाल हो। पुराने व नए संस्करणों (R0, R1, GFC) की तुलना करें।",
    steps: [
      {
        number: 1,
        titleEn: "Upload Drawing Set",
        titleHi: "नया नक्शा / ड्राइंग अपलोड करें",
        descEn: "Select project, enter sheet title (e.g. Ground Floor Column Layout), discipline, and upload PDF or image.",
        descHi: "प्रोजेक्ट चुनें, ड्राइंग का नाम (जैसे कॉलम लेआउट) लिखें और PDF या फोटो अपलोड करें।",
      },
      {
        number: 2,
        titleEn: "Upload Updated Revisions & Compare",
        titleHi: "नया संशोधन (Revision) जोड़ें और तुलना करें",
        descEn: "Upload revised versions on the same sheet so old versions stay archived and can be compared side-by-side.",
        descHi: "उसी शीट में नया संशोधन अपलोड करें ताकि पुराना व नया नक्शा आमने-सामने मिलाकर देखा जा सके।",
      },
    ],
    jargon: [
      {
        term: "R0 / R1 / R2 (Revision)",
        meaningEn: "R0 is the first version issued; R1, R2 are updated versions. Always build using the highest active revision.",
        meaningHi: "R0 पहला नक्शा होता है; बाद में बदलाव होने पर R1, R2 जारी होते हैं।",
      },
      {
        term: "GFC (Good for Construction)",
        meaningEn: "Final approved drawing stamped ready for actual construction work on site.",
        meaningHi: "अंतिम स्वीकृत ड्राइंग जिसके अनुसार साइट पर असली निर्माण कार्य किया जाना है।",
      },
    ],
    proTipsEn: [
      "Mark older drawings Superseded when uploading a new GFC sheet so contractors never confuse versions.",
    ],
    proTipsHi: [
      "नया GFC नक्शा अपलोड करते समय पुराने को Superseded (रद्द) मार्क कर दें।",
    ],
  },

  "/team": {
    icon: UserCog,
    titleEn: "Team Members & Permissions",
    titleHi: "टीम सदस्य और अधिकार (Team & Access)",
    subtitleEn: "Create login accounts for staff and choose what each role can view or edit",
    subtitleHi: "कर्मचारियों के लॉगिन बनाएं और तय करें कि कौन क्या देख या बदल सकता है",
    whoUsesEn: "Super Admins, Company Admins",
    whoUsesHi: "सुपर एडमिन, कंपनी एडमिन",
    summaryEn: "Invite engineers, supervisors, accountants, and storekeepers with role-based logins. You can reset forgotten passwords or pause an employee's login anytime.",
    summaryHi: "इंजीनियर, सुपरवाइज़र, मुनीम और स्टोरकीपर के सुरक्षित लॉगिन बनाएं। जरूरत पड़ने पर आप किसी का पासवर्ड बदल सकते हैं या खाता बंद कर सकते हैं।",
    steps: [
      {
        number: 1,
        titleEn: "Add a Team Member",
        titleHi: "नया टीम सदस्य जोड़ें",
        descEn: "Click 'Add Team Member', enter full name, work email (login ID), password, and pick their job role.",
        descHi: "'Add Team Member' दबाएं, पूरा नाम, ईमेल (लॉगिन आईडी), पासवर्ड और भूमिका (Role) चुनें।",
      },
      {
        number: 2,
        titleEn: "Assign Role & Site Access",
        titleHi: "भूमिका और अधिकार चुनें",
        descEn: "Give Accountants finance permissions and Supervisors site attendance & materials access while protecting sensitive records.",
        descHi: "अकाउंटेंट को हिसाब और सुपरवाइज़र को साइट व सामग्री के अधिकार दें।",
      },
    ],
    jargon: [
      {
        term: "Role-Based Access",
        meaningEn: "Automatically limits menus and actions based on each team member's job role (e.g. Accountant vs Site Supervisor).",
        meaningHi: "हर व्यक्ति को उसके काम के अनुसार ही मेन्यू और डेटा देखने-बदलने की अनुमति मिलना।",
      },
    ],
    proTipsEn: [
      "Share login credentials securely and ask new staff to change their password under Settings once signed in.",
    ],
    proTipsHi: [
      "नए सदस्य को पहली बार लॉगिन करने के बाद Settings में अपना पासवर्ड बदलने को कहें।",
    ],
  },

  "/audit": {
    icon: ShieldCheck,
    titleEn: "Activity Log",
    titleHi: "गतिविधि लॉग (Activity Log)",
    subtitleEn: "See a permanent timeline of every record created, updated, approved, or deleted",
    subtitleHi: "सॉफ्टवेयर में कब, किसने क्या जोड़ा, बदला या हटाया — पूरा रिकॉर्ड देखें",
    whoUsesEn: "Super Admins, Auditors, Owners",
    whoUsesHi: "सुपर एडमिन, ऑडिटर, मालिक",
    summaryEn: "Every important change across bills, payments, stock, and user accounts is saved automatically with user name, timestamp, and exact before/after changes.",
    summaryHi: "बिल, भुगतान, स्टॉक और यूज़र खातों में होने वाला हर बदलाव तारीख और व्यक्ति के नाम के साथ हमेशा के लिए दर्ज रहता है।",
    steps: [
      {
        number: 1,
        titleEn: "Filter by User, Action, or Module",
        titleHi: "व्यक्ति, कार्य या सेक्शन से खोजें",
        descEn: "Use the filters at the top to find who changed a bill, approved an order, or reversed a payment.",
        descHi: "ऊपर दिए गए फिल्टर से देखें कि किसने कौन-सा बिल बदला या भुगतान पास किया।",
      },
      {
        number: 2,
        titleEn: "Click Any Row to View What Changed",
        titleHi: "बदलाव देखने के लिए किसी भी लाइन पर क्लिक करें",
        descEn: "Inspect exact old vs new field values to verify financial and site accuracy.",
        descHi: "पुराने और नए डेटा का पूरा अंतर साफ शब्दों में देखें।",
      },
    ],
    jargon: [
      {
        term: "Permanent Activity Log",
        meaningEn: "Tamper-proof change history kept for internal review and financial compliance. Entries cannot be deleted.",
        meaningHi: "बदलावों का स्थायी रिकॉर्ड जिसे कोई हटा नहीं सकता — ऑडिट और सुरक्षा के लिए जरूरी।",
      },
    ],
    proTipsEn: [
      "Filter by Action: Delete or Reverse to review high-risk changes quickly.",
    ],
    proTipsHi: [
      "बड़े बदलाव जांचने के लिए Delete या Reverse एक्शन फिल्टर का उपयोग करें।",
    ],
  },

  "/admin": {
    icon: ShieldAlert,
    titleEn: "Super Admin Console",
    titleHi: "सुपर एडमिन कंसोल",
    subtitleEn: "Manage companies, platform settings, sample setup, and final payment approvals",
    subtitleHi: "कंपनियों का प्रबंधन, अंतिम भुगतान स्वीकृति और सिस्टम नियंत्रण",
    whoUsesEn: "Super Admins only",
    whoUsesHi: "केवल सुपर एडमिन",
    summaryEn: "Switch or create company workspaces, pause inactive accounts, review approval requests sent by staff, and oversee system health in one protected screen.",
    summaryHi: "कंपनी वर्कस्पेस जोड़ें या प्रबंधित करें, स्टाफ द्वारा भेजे गए स्वीकृति अनुरोध पास करें और सिस्टम का नियंत्रण करें।",
    steps: [
      {
        number: 1,
        titleEn: "Review Pending Approval Requests",
        titleHi: "लंबित स्वीकृति अनुरोध जांचें",
        descEn: "Check payment or order approval requests raised by accountants and managers, then Approve or Reject with a note.",
        descHi: "स्टाफ द्वारा भेजे गए बिल या ऑर्डर अनुरोध जांचें और स्वीकृत या अस्वीकार करें।",
      },
      {
        number: 2,
        titleEn: "Manage Company Workspaces",
        titleHi: "कंपनी खाते प्रबंधित करें",
        descEn: "Add new companies or pause access cleanly without deleting historical project records.",
        descHi: "नई कंपनी जोड़ें या पुराने डेटा को सुरक्षित रखते हुए किसी कंपनी का एक्सेस रोकें।",
      },
    ],
    jargon: [
      {
        term: "Company Workspace",
        meaningEn: "Separate protected company environment with its own projects, staff, stock, and accounting books.",
        meaningHi: "हर कंपनी का अलग सुरक्षित खाता जिसमें उसके अपने प्रोजेक्ट, स्टाफ और हिसाब-किताब रहते हैं।",
      },
    ],
    proTipsEn: [
      "Always write a clear note when rejecting a payment request so your team knows how to fix and resubmit it.",
    ],
    proTipsHi: [
      "किसी अनुरोध को अस्वीकार करते समय कारण जरूर लिखें ताकि टीम उसे सुधार कर दोबारा भेज सके।",
    ],
  },

  "/finance/form-16a": {
    icon: FileText,
    titleEn: "Form 16A — Vendor TDS Certificate",
    titleHi: "फॉर्म 16A — वेंडर व ठेकेदार टीडीएस प्रमाणपत्र",
    subtitleEn: "View and print quarterly TDS summary certificates for contractors & suppliers",
    subtitleHi: "ठेकेदारों और सप्लायरों के लिए तिमाही टीडीएस प्रमाणपत्र देखें और प्रिंट करें",
    whoUsesEn: "Accountants, Owners",
    whoUsesHi: "अकाउंटेंट, मालिक",
    summaryEn: "Summarizes total bills booked, TDS deducted section-wise (such as 194C or 194J), and tax deposited for one vendor or contractor in a financial year.",
    summaryHi: "इसमें एक वित्त वर्ष में किसी वेंडर/ठेकेदार के कुल बिल, कटा टीडीएस और जमा टैक्स का पूरा सारांश दिखता है।",
    steps: [
      {
        number: 1,
        titleEn: "Verify Party PAN & Deposited Challans",
        titleHi: "PAN और चालान विवरण जांचें",
        descEn: "Confirm vendor PAN and challan BSR details match your quarterly 26Q return before sharing.",
        descHi: "साझा करने से पहले वेंडर का PAN और जमा चालान नंबर जांच लें।",
      },
      {
        number: 2,
        titleEn: "Print or Save as PDF",
        titleHi: "प्रिंट करें या PDF सेव करें",
        descEn: "Use the Print button to save a clean summary copy. Official TRACES certificates are issued after 26Q filing.",
        descHi: "प्रिंट बटन से सारांश कॉपी सेव करें। आधिकारिक प्रमाणपत्र 26Q रिटर्न के बाद TRACES से निकलता है।",
      },
    ],
    jargon: [
      {
        term: "FY vs AY (Assessment Year)",
        meaningEn: "FY (Financial Year) is when money was earned/paid (e.g. Apr 2025–Mar 2026). AY is the following year when taxes are filed (2026–27).",
        meaningHi: "FY वह वर्ष है जिसमें काम व भुगतान हुआ; AY उसके अगले वर्ष को कहते हैं जिसमें टैक्स रिटर्न दाखिल होता है।",
      },
    ],
    proTipsEn: [
      "Share Form 16A summaries at year-end so vendors can verify TDS credits in their AIS/26AS.",
    ],
    proTipsHi: [
      "वित्तीय वर्ष के अंत में वेंडर के साथ यह विवरण साझा करें ताकि वे अपने 26AS में मिलान कर सकें।",
    ],
  },

  "/portal": {
    icon: Users,
    titleEn: "Customer / Buyer Portal",
    titleHi: "ग्राहक पोर्टल (Buyer Portal)",
    subtitleEn: "View booked flat/unit details, payment schedule, receipts & construction updates",
    subtitleHi: "बुक किए गए फ्लैट/यूनिट की किस्तें, रसीदें और काम की प्रगति देखें",
    whoUsesEn: "Property Buyers, Sales Team, Admins",
    whoUsesHi: "खरीदार (ग्राहक), सेल्स टीम, एडमिन",
    summaryEn: "Gives property buyers transparent access to their payment milestones, paid receipts, GST invoices, and upcoming installments.",
    summaryHi: "ग्राहक यहाँ अपनी बुकिंग, भुगतान की गई किस्तों की रसीदें, जीएसटी बिल और बकाया राशि देख सकते हैं।",
    steps: [
      {
        number: 1,
        titleEn: "Check Upcoming Payment Milestones",
        titleHi: "अगली भुगतान किस्त जांचें",
        descEn: "See how much is paid, when the next milestone is due, and any bank clearance status.",
        descHi: "देखें कि कुल कितना भुगतान हो चुका है और अगली किस्त कब देय है।",
      },
      {
        number: 2,
        titleEn: "Download Payment Receipts & Invoices",
        titleHi: "रसीद व बिल डाउनलोड करें",
        descEn: "Click any completed payment to open or print an official payment receipt.",
        descHi: "किसी भी भुगतान पर क्लिक करके आधिकारिक रसीद प्रिंट या सेव करें।",
      },
    ],
    jargon: [
      {
        term: "Subject to Bank Clearance",
        meaningEn: "Cheque or NEFT payments become final once funds settle in the company's bank account.",
        meaningHi: "चेक या ट्रांसफर का पैसा कंपनी के बैंक खाते में जमा होने पर ही भुगतान पक्का माना जाता है।",
      },
    ],
    proTipsEn: [
      "Keep receipt numbers handy if you contact the accounts desk about any installment.",
    ],
    proTipsHi: [
      "किसी भी किस्त के बारे में पूछने के लिए अपनी रसीद संख्या पास रखें।",
    ],
  },

  "/settings/attendance": {
    icon: Settings,
    titleEn: "Attendance Location (Geofence) Settings",
    titleHi: "हाजिरी लोकेशन (Geofence) सेटिंग्स",
    subtitleEn: "Set office or site GPS coordinates and allowed check-in radius",
    subtitleHi: "साइट या ऑफिस की GPS लोकेशन और हाजिरी का दायरा तय करें",
    whoUsesEn: "Super Admins, Company Admins",
    whoUsesHi: "सुपर एडमिन, कंपनी एडमिन",
    summaryEn: "Configure the GPS coordinates and radius (in meters) around your site or office so mobile check-ins confirm staff are physically on location.",
    summaryHi: "साइट या ऑफिस का नक्शा बिंदु (Lat/Lng) और मीटर दायरा सेट करें ताकि मोबाइल हाजिरी से सही स्थान की पुष्टि हो सके।",
    steps: [
      {
        number: 1,
        titleEn: "Enter Site Latitude & Longitude",
        titleHi: "साइट की Latitude और Longitude भरें",
        descEn: "Stand on site and click Use My Location, or right-click / long-press your site pin on Google Maps to copy Lat, Lng.",
        descHi: "साइट पर खड़े होकर 'Use My Location' दबाएं या Google Maps से पिन दबाकर Lat, Lng कॉपी करें।",
      },
      {
        number: 2,
        titleEn: "Choose Allowed Radius (Meters) & Save",
        titleHi: "दायरा (मीटर) चुनें और सेव करें",
        descEn: "Typical site radius is 150–300 meters to account for mobile GPS accuracy.",
        descHi: "सामान्य साइट के लिए 150 से 300 मीटर का दायरा पर्याप्त रहता है।",
      },
    ],
    jargon: [
      {
        term: "Geofence Radius",
        meaningEn: "Invisible circle (in meters) around the site GPS pin where normal check-ins count as On-Site.",
        meaningHi: "साइट के चारों ओर का तय दायरा जिसके भीतर होने पर हाजिरी साइट पर मानी जाती है।",
      },
    ],
    proTipsEn: [
      "Always save changes after filling Lat/Lng; staff will see the new boundary on their next check-in.",
    ],
    proTipsHi: [
      "सेव करते ही अगली हाजिरी से नई लोकेशन सीमा लागू हो जाती है।",
    ],
  },

  "/settings/messages": {
    icon: MessageSquare,
    titleEn: "WhatsApp & SMS Setup",
    titleHi: "व्हाट्सएप और SMS सेटअप",
    subtitleEn: "Connect Meta WhatsApp Business or SMS gateway to send order alerts & buyer OTPs",
    subtitleHi: "ऑर्डर सूचना और OTP भेजने के लिए WhatsApp Business या SMS जोड़ें",
    whoUsesEn: "Company Admins, IT / Developers",
    whoUsesHi: "कंपनी एडमिन, आईटी / डेवलपर",
    summaryEn: "Link your Meta WhatsApp Business API or Indian DLT SMS provider to automatically message vendors, buyers, and supervisors. Test safely using the built-in test button.",
    summaryHi: "वेंडर, ग्राहकों और टीम को स्वचालित संदेश भेजने के लिए WhatsApp Business या SMS विवरण भरें।",
    steps: [
      {
        number: 1,
        titleEn: "Enter API Credentials from Meta / SMS Provider",
        titleHi: "Meta या SMS प्रोवाइडर की जानकारी भरें",
        descEn: "Ask your IT partner or developer for the Phone Number ID, Access Token, or DLT Template ID.",
        descHi: "अपने डेवलपर या प्रोवाइडर से मिले ID, टोकन और DLT टेम्पलेट विवरण यहाँ दर्ज करें।",
      },
      {
        number: 2,
        titleEn: "Send a Test Message",
        titleHi: "टेस्ट संदेश भेजकर जांचें",
        descEn: "Enter a mobile number with country code (e.g. 919876543210) and test delivery before turning live notifications on.",
        descHi: "कंट्री कोड के साथ नंबर डालें (जैसे 919876543210) और टेस्ट संदेश भेजकर जांचें।",
      },
    ],
    jargon: [
      {
        term: "Webhook",
        meaningEn: "A secure web link where Meta sends delivery confirmations back to Bothra CMS automatically.",
        meaningHi: "एक सुरक्षित लिंक जिससे व्हाट्सएप डिलीवरी की सूचना अपने-आप ऐप तक पहुँचती है।",
      },
    ],
    proTipsEn: [
      "Without live WhatsApp API keys, Bothra CMS still lets you share orders with one click via WhatsApp Web/App.",
    ],
    proTipsHi: [
      "API न होने पर भी आप ऐप से सीधे व्हाट्सएप बटन द्वारा वेंडर को ऑर्डर भेज सकते हैं।",
    ],
  },

  "/settings/payments": {
    icon: DollarSign,
    titleEn: "Online Payment Gateway (Razorpay)",
    titleHi: "ऑनलाइन पेमेंट गेटवे (Razorpay) सेटिंग्स",
    subtitleEn: "Accept online buyer installments safely and match receipts automatically",
    subtitleHi: "ग्राहकों से ऑनलाइन किस्त स्वीकार करें और रसीद अपने-आप बनाएं",
    whoUsesEn: "Company Admins, Accountants, Developers",
    whoUsesHi: "कंपनी एडमिन, अकाउंटेंट, डेवलपर",
    summaryEn: "Connect your Razorpay merchant keys so property buyers can pay installments through UPI, netbanking, or card with instant receipt updates.",
    summaryHi: "ग्राहक पोर्टल पर UPI, कार्ड या नेटबैंकिंग से भुगतान लेने के लिए Razorpay विवरण जोड़ें।",
    steps: [
      {
        number: 1,
        titleEn: "Save Merchant Key ID & Secret",
        titleHi: "Razorpay Key ID और Secret सेव करें",
        descEn: "Paste your Razorpay Key ID and Key Secret (starts with rzp_test_ for testing or rzp_live_ for real money).",
        descHi: "Razorpay डैशबोर्ड से Key ID और Secret कॉपी करके यहाँ सेव करें।",
      },
      {
        number: 2,
        titleEn: "Set Up Webhook Confirmation",
        titleHi: "ऑटो रसीद (Webhook) जोड़ें",
        descEn: "Add the shown Webhook URL in Razorpay so failed or delayed UPI confirmations resolve automatically.",
        descHi: "Razorpay में दिखाया गया Webhook URL जोड़ें ताकि हर भुगतान की रसीद अपने-आप पक्की हो जाए।",
      },
    ],
    jargon: [
      {
        term: "Paid, Not Booked",
        meaningEn: "Money left the buyer's bank/UPI, waiting for final confirmation. Use the retry check or webhook to post the receipt.",
        meaningHi: "ग्राहक के खाते से पैसा कट चुका है लेकिन अंतिम पुष्टि बाकी है — रिफ्रेश या Webhook से यह ठीक हो जाता है।",
      },
    ],
    proTipsEn: [
      "Always verify Key ID mode (Test vs Live) before enabling buyer payments.",
    ],
    proTipsHi: [
      "असली भुगतान शुरू करने से पहले पक्का करें कि Live Key सक्रिय है।",
    ],
  },

  "/settings/storage": {
    icon: Boxes,
    titleEn: "Document & Photo Storage Settings",
    titleHi: "दस्तावेज़ और फोटो स्टोरेज सेटिंग्स",
    subtitleEn: "Keep uploaded bills, drawings, and site photos permanently safe in the cloud",
    subtitleHi: "अपलोड किए गए बिल, ड्राइंग और साइट फोटो को क्लाउड में सुरक्षित रखें",
    whoUsesEn: "Company Admins, IT / Developers",
    whoUsesHi: "कंपनी एडमिन, आईटी / डेवलपर",
    summaryEn: "Shows whether uploaded receipts, drawings, and work photos are safely backed up to permanent cloud storage (recommended for production) or local temporary disk.",
    summaryHi: "यहाँ दिखता है कि आपके बिल, रसीदें और ड्राइंग स्थायी क्लाउड स्टोरेज में सुरक्षित हो रही हैं या नहीं।",
    steps: [
      {
        number: 1,
        titleEn: "Check Active Storage Health",
        titleHi: "स्टोरेज स्थिति जांचें",
        descEn: "If the status shows local/temporary disk, share the setup instructions below with your IT developer to connect Vercel Blob or Amazon S3.",
        descHi: "अगर स्थिति स्थायी क्लाउड नहीं दिखाती, तो नीचे दी जानकारी अपने आईटी डेवलपर को दें।",
      },
    ],
    jargon: [
      {
        term: "Cloud Storage (Vercel Blob / S3)",
        meaningEn: "Permanent online file storage so site photos and PDFs are never lost during app updates or server restarts.",
        meaningHi: "स्थायी ऑनलाइन स्टोरेज जहाँ सॉफ्टवेयर अपडेट होने पर भी आपके बिल और फोटो कभी नहीं मिटते।",
      },
    ],
    proTipsEn: [
      "Keep all uploaded bills under 10 MB in PDF, JPG, PNG, or WebP format.",
    ],
    proTipsHi: [
      "सारे बिल और फोटो 10 MB से छोटे और PDF, JPG या PNG फॉर्मेट में अपलोड करें।",
    ],
  },
};

export default function InteractiveGuideModal() {
  const pathname = usePathname();
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isHi = language === "hi";

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut listener: Escape closes the modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      // Lock body scroll to prevent underlying page from scrolling
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Find the closest matching guide (longest path match wins; unknown paths fall back to Dashboard overview)
  const activeKey =
    Object.keys(PAGE_GUIDES)
      .filter((k) => k !== "/")
      .sort((a, b) => b.length - a.length)
      .find((k) => pathname === k || pathname.startsWith(k + "/")) ||
    "/";

  const guide = PAGE_GUIDES[activeKey] || PAGE_GUIDES["/"];
  const Icon = guide.icon;

  return (
    <>
      {/* Trigger Button - Accessible on desktop header and sticky helper */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 text-xs font-bold transition shadow-xs cursor-pointer group"
        title={isHi ? "इस पेज का उपयोग कैसे करें? (सरल गाइड)" : "How to use this page? (Interactive Guide)"}
        aria-label={isHi ? "गाइड / सहायता" : "How to Use"}
      >
        <HelpCircle className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
        <span className="hidden sm:inline">
          {isHi ? "गाइड / सहायता" : "How to Use"}
        </span>
        <span className="sm:hidden">{isHi ? "मदद" : "Help"}</span>
      </button>

      {/* Interactive Modal */}
      {mounted && isOpen && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92dvh] flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-modal-title"
          >
            {/* Header */}
            <div className="bg-slate-900 text-white p-3.5 sm:p-5 flex items-center justify-between gap-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    <h2 id="guide-modal-title" className="text-sm sm:text-base md:text-lg font-bold text-white truncate">
                      {isHi ? guide.titleHi : guide.titleEn}
                    </h2>
                    <span className="hidden xs:inline-block px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30 whitespace-nowrap">
                      {isHi ? "सरल गाइड" : "Interactive Guide"}
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                    {isHi ? guide.subtitleHi : guide.subtitleEn}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                {/* 1-Click language toggle inside modal */}
                <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setLanguage("en")}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold transition ${
                      !isHi ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setLanguage("hi")}
                    className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold transition ${
                      isHi ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    हिन्दी
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 sm:p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition touch-manipulation focus:outline-none focus:ring-2 focus:ring-amber-500"
                  aria-label={isHi ? "गाइड बंद करें" : "Close Guide"}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-5 text-slate-800 break-words">
              {/* Summary Box */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 sm:p-4 text-xs sm:text-sm text-slate-800 leading-relaxed flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold text-amber-900 mb-1">
                    {isHi ? "यह पेज क्या करता है? (सरल भाषा में)" : "What does this page do?"}
                  </div>
                  <p className="leading-relaxed">{isHi ? guide.summaryHi : guide.summaryEn}</p>
                  <div className="mt-2 text-xs text-amber-800 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span className="text-amber-900">{isHi ? "उपयोगकर्ता:" : "Who uses this:"}</span>
                    <span>{isHi ? guide.whoUsesHi : guide.whoUsesEn}</span>
                  </div>
                </div>
              </div>

              {/* 3 Easy Steps */}
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {isHi ? "3 आसान चरणों में समझें (काम कैसे करें)" : "How to use in 3 Easy Steps"}
                  </span>
                </h3>

                <div className="space-y-2.5">
                  {guide.steps.map((st) => (
                    <div
                      key={st.number}
                      className="flex items-start gap-3 p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition"
                    >
                      <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                        {st.number}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                          {isHi ? st.titleHi : st.titleEn}
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5 leading-normal">
                          {isHi ? st.descHi : st.descEn}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Jargon Buster */}
              {guide.jargon && guide.jargon.length > 0 && (
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>
                      {isHi ? "कठिन शब्दों का सरल अर्थ (शब्दावली)" : "Jargon Buster (Simple Dictionary)"}
                    </span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {guide.jargon.map((j, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-slate-200 bg-white shadow-xs"
                      >
                        <div className="text-xs font-bold text-blue-700">{j.term}</div>
                        <p className="text-xs text-slate-600 mt-1 leading-normal">
                          {isHi ? j.meaningHi : j.meaningEn}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pro Tips */}
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>{isHi ? "सुझाव व शॉर्टकट" : "Helpful Tips & Tricks"}</span>
                </h3>
                <ul className="space-y-2">
                  {(isHi ? guide.proTipsHi : guide.proTipsEn).map((tip, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-700 bg-slate-100/80 px-3 py-2 rounded-lg flex items-start gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span className="leading-snug">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-500 font-medium truncate pr-2">
                {isHi ? "💡 कभी भी पूछने के लिए यह बटन दबाएं" : "💡 Click Help anytime you need guidance"}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0"
              >
                {isHi ? "समझ गया, बंद करें" : "Got it, Close (Esc)"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
