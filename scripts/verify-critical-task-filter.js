const fs = require('fs');

console.log('==================================================================');
console.log('VERIFYING PROJECT CRITICAL TASK & STATUS FILTER LOGIC');
console.log('==================================================================');

const projectPageCode = fs.readFileSync('src/app/projects/[id]/page.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  PASS: ${message}`);
}

assert(projectPageCode.includes('if (taskStatusFilter === "CRITICAL")'), 'Project page explicitly handles CRITICAL filter');
assert(projectPageCode.includes('normalizePriority(t.priority) !== "CRITICAL"'), 'Project page checks normalizePriority for CRITICAL tasks');
assert(projectPageCode.includes('t.status !== "COMPLETED" && t.status !== "VERIFIED"'), 'Project page includes both COMPLETED and VERIFIED tasks');

// Simulate the exact filtering logic
function normalizePriority(priority) {
  if (!priority) return "GENERAL";
  const p = String(priority).toUpperCase();
  if (p === "CRITICAL" || p === "URGENT") return "CRITICAL";
  if (p === "HIGH" || p === "IMPORTANT") return "HIGH";
  return "GENERAL";
}

const mockTasks = [
  { id: 1, title: "KINDLY APPROVE THE CEMENT REQUEST", status: "TODO", priority: "CRITICAL" },
  { id: 2, title: "Steel layout inspection", status: "TODO", priority: "HIGH" },
  { id: 3, title: "Core wall shuttering", status: "IN_PROGRESS", priority: "CRITICAL" },
  { id: 4, title: "Safety barricading", status: "COMPLETED", priority: "CRITICAL" },
  { id: 5, title: "Site clearing", status: "VERIFIED", priority: "GENERAL" },
];

function filterTasks(tasks, taskStatusFilter, taskSearch = "") {
  return tasks.filter((t) => {
    if (taskStatusFilter === "CRITICAL") {
      if (normalizePriority(t.priority) !== "CRITICAL") return false;
    } else if (taskStatusFilter === "COMPLETED") {
      if (t.status !== "COMPLETED" && t.status !== "VERIFIED") return false;
    } else if (taskStatusFilter !== "ALL" && t.status !== taskStatusFilter) {
      return false;
    }
    if (taskSearch.trim()) {
      const q = taskSearch.toLowerCase();
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q);
      const matchAssignee = t.assignee?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchAssignee) return false;
    }
    return true;
  });
}

const allTasks = filterTasks(mockTasks, "ALL");
assert(allTasks.length === 5, `ALL filter returns 5 tasks (got ${allTasks.length})`);

const todoTasks = filterTasks(mockTasks, "TODO");
assert(todoTasks.length === 2, `TODO filter returns 2 tasks (got ${todoTasks.length})`);

const inProgressTasks = filterTasks(mockTasks, "IN_PROGRESS");
assert(inProgressTasks.length === 1, `IN_PROGRESS filter returns 1 task (got ${inProgressTasks.length})`);

const criticalTasks = filterTasks(mockTasks, "CRITICAL");
assert(criticalTasks.length === 3, `CRITICAL filter returns 3 tasks (got ${criticalTasks.length})`);
assert(criticalTasks.map(t => t.id).join(',') === '1,3,4', 'CRITICAL filter returned correct task IDs');

const completedTasks = filterTasks(mockTasks, "COMPLETED");
assert(completedTasks.length === 2, `COMPLETED filter returns 2 tasks (got ${completedTasks.length})`);

console.log('==================================================================');
console.log('ALL CRITICAL TASK FILTER CHECKS PASSED SUCCESSFULLY!');
console.log('==================================================================');
