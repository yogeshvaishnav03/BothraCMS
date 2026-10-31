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
        titleEn: "Click '+ Add Entry'",
        titleHi: "'+ Add Entry' पर क्लिक करें",
        descEn: "Press the yellow button at the top right to open the entry form.",
        descHi: "ऊपर दाईं ओर पीले बटन को दबाकर नया लेन-देन फॉर्म खोलें।",
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
        descEn: "Press the submit button. Today's master roll and wage calculation are automatically updated.",
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
    summaryEn: "Never run out of cement or steel! When raw materials arrive at site on trucks, log the Goods Receipt Note (GRN). When material is handed to masons or contractors, record the Issue slip.",
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
        titleEn: "Log Incoming Truck (Receive Material)",
        titleHi: "आया हुआ माल दर्ज करें (GRN)",
        descEn: "Click '+ Receive Material', choose supplier name, enter vehicle/truck number and received quantity.",
        descHi: "'+ Receive Material' दबाएं, सप्लायर का नाम, ट्रक नंबर और आई हुई मात्रा भरें।",
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
        descEn: "Click '+ New Bill', select Vendor or Contractor, enter invoice number, total amount, and due date.",
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
        meaningEn: "Income tax deducted on contractor payments as required by Indian tax law.",
        meaningHi: "आयकर नियम अनुसार ठेकेदार के भुगतान में से काटा गया सरकारी टैक्स।",
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
    titleEn: "Vendors & Contractors (Parties)",
    titleHi: "वेंडर और ठेकेदार (पार्टी डायरेक्टरी)",
    subtitleEn: "Suppliers of cement, steel, bricks & labor subcontractors",
    subtitleHi: "सीमेंट-सरिया सप्लायर और लेबर ठेकेदारों की सूची",
    whoUsesEn: "Procurement, Project Managers, Accountants",
    whoUsesHi: "परचेज मैनेजर, प्रोजेक्ट हेड, अकाउंटेंट",
    summaryEn: "Store and manage every company or contractor you do business with. Save their GSTIN, bank details, contact person, credit limits, and view their full ledger balance in one click.",
    summaryHi: "उन सभी सप्लायर और ठेकेदारों की सूची जिनसे आप सामान खरीदते हैं या काम करवाते हैं। उनका जीएसटी नंबर, बैंक खाता, मोबाइल नंबर और बकाया हिसाब यहाँ देखें।",
    steps: [
      {
        number: 1,
        titleEn: "Add New Vendor or Contractor",
        titleHi: "नया वेंडर या ठेकेदार जोड़ें",
        descEn: "Click '+ Add Party', enter company name, contact person name, and phone number.",
        descHi: "'+ Add Party' दबाएं, फर्म का नाम, मालिक का नाम और मोबाइल नंबर भरें।",
      },
      {
        number: 2,
        titleEn: "Enter GSTIN & Bank Details",
        titleHi: "जीएसटी (GSTIN) और बैंक खाता भरें",
        descEn: "Save their bank account and IFSC code so payments can be wired without errors.",
        descHi: "बैंक खाता और IFSC कोड दर्ज करें ताकि भुगतान करते समय कोई गलती न हो।",
      },
      {
        number: 3,
        titleEn: "View Party Ledger",
        titleHi: "पार्टी का पूरा खाता (लेजर) देखें",
        descEn: "Click any party name to open their statement: all materials supplied, bills raised, and payments made.",
        descHi: "किसी भी पार्टी के नाम पर क्लिक करके उसका पूरा खाता देखें: कुल कितना माल आया और कितना पैसा दिया।",
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
      "Filter by Type (Vendor vs Contractor) to isolate material suppliers from labor contractors.",
      "Click party phone numbers to make a direct phone call from your mobile browser.",
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

  // Find the closest matching guide
  const activeKey =
    Object.keys(PAGE_GUIDES).find((k) => k !== "/" && pathname.startsWith(k)) ||
    (pathname === "/" ? "/" : "/day-book");

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
            className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200"
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
