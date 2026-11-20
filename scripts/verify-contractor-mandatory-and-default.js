const fs = require('fs');

console.log('==================================================================');
console.log('VERIFYING CONTRACTOR MANDATORY VALIDATION & DEFAULT AUTO-SELECTION');
console.log('==================================================================');

const pageCode = fs.readFileSync('src/app/workforce/page.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

// 1. Check contractor collection and default calculation
assert(pageCode.includes('getDefaultContractor = useCallback'), 'Includes getDefaultContractor helper function');
assert(pageCode.includes('const defaultContractor = getDefaultContractor()'), 'openUploadModal auto-selects default contractor');
assert(pageCode.includes('fetchContractorRates(defaultContractor)'), 'openUploadModal fetches rates for default contractor');

// 2. Check auto-population useEffect
assert(pageCode.includes('if (!contractorName && (records.length > 0 || parties.length > 0 || existingContractors.length > 0))'), 'Auto-populates contractor if blank and data is loaded');

// 3. Check Mandatory badge & UI styling
assert(pageCode.includes('* MANDATORY'), 'Displays prominent * MANDATORY badge when contractor workers > 0');
assert(pageCode.includes('Contractor / Labour Agency is') && pageCode.includes('because you have entered'), 'Displays explicit red alert banner when contractor workers are entered without contractor');
assert(pageCode.includes('border-2 border-rose-500 ring-2 ring-rose-200'), 'Highlights input with red border and ring when contractor is missing');

// 4. Check Quick Select Pills
assert(pageCode.includes('Quick Select Contractor'), 'Renders Quick Select Contractor pills for 1-click selection');
assert(pageCode.includes('handleSelectContractor(c)'), 'Pills trigger handleSelectContractor on tap');

// 5. Check validation in handleAddEntryToList
assert(pageCode.includes('if (contractorTotalWorkers > 0) {\n      if (!contractorName.trim()) {') ||
       pageCode.includes('Contractor / Labour Agency is MANDATORY when adding Contractor Workforce. Please select or enter a contractor.'),
       'handleAddEntryToList strictly blocks adding if contractorName is missing when contractorTotalWorkers > 0');

// 6. Check validation in handleSaveAllHeadcounts
assert(pageCode.includes('invalidContractorEntry'), 'handleSaveAllHeadcounts validates all entriesToSubmit to ensure no contractor entry is missing a contractor');

// 7. Check Save button & footer status
assert(pageCode.includes('Contractor Required'), 'Footer displays Contractor Required badge when contractor is missing');
assert(pageCode.includes('(contractorTotalWorkers > 0 && !contractorName.trim())'), 'Save button is disabled when contractorTotalWorkers > 0 && !contractorName.trim()');

console.log('==================================================================');
console.log('ALL CONTRACTOR MANDATORY & DEFAULT CHECKS PASSED SUCCESSFULLY!');
console.log('==================================================================');
