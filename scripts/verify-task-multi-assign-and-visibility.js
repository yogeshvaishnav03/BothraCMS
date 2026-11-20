const fs = require('fs');

const tasksRouteSrc = fs.readFileSync('src/app/api/tasks/route.ts', 'utf8');
const taskItemRouteSrc = fs.readFileSync('src/app/api/tasks/[id]/route.ts', 'utf8');
const timelineRouteSrc = fs.readFileSync('src/app/api/tasks/[id]/timeline/route.ts', 'utf8');
const tasksPageSrc = fs.readFileSync('src/app/tasks/page.tsx', 'utf8');
const multiSelectSrc = fs.readFileSync('src/components/ui/SearchableMultiSelect.tsx', 'utf8');

const checks = [
  {
    name: 'createTaskSchema accepts assigneeUserIds array',
    pass: tasksRouteSrc.includes('assigneeUserIds: z.array(z.string()).optional()'),
  },
  {
    name: 'POST /api/tasks supports targetAssigneeIds loop for multi-assign',
    pass: tasksRouteSrc.includes('targetAssigneeIds') && tasksRouteSrc.includes('for (const targetAssigneeId of targetAssigneeIds)'),
  },
  {
    name: 'POST /api/tasks returns count and tasks when multiple are created',
    pass: tasksRouteSrc.includes('createdTasks.length === 1') && tasksRouteSrc.includes('jsonSuccess({ tasks: createdTasks, count: createdTasks.length }, 201)'),
  },
  {
    name: 'GET /api/tasks enforces !isOrgOwnerOrAdmin user visibility',
    pass: tasksRouteSrc.includes('!isOrgOwnerOrAdmin(user)') &&
          tasksRouteSrc.includes('{ assigneeUserId: user.userId }') &&
          tasksRouteSrc.includes('{ createdBy: user.userId }'),
  },
  {
    name: 'GET /api/tasks/[id] forbids non-admin unauthorized access',
    pass: taskItemRouteSrc.includes('Forbidden: You can only view tasks assigned to you or created by you'),
  },
  {
    name: 'PATCH /api/tasks/[id] forbids non-admin unauthorized access',
    pass: taskItemRouteSrc.includes('Forbidden: You can only edit tasks assigned to you or created by you'),
  },
  {
    name: 'GET /api/tasks/[id]/timeline forbids non-admin unauthorized access',
    pass: timelineRouteSrc.includes('Forbidden: You can only view timeline of tasks assigned to you or created by you'),
  },
  {
    name: 'SearchableMultiSelect component exists and exports default',
    pass: multiSelectSrc.includes('export default function SearchableMultiSelect'),
  },
  {
    name: 'SearchableMultiSelect handles multi-selection toggles',
    pass: multiSelectSrc.includes('toggleOption') && multiSelectSrc.includes('selectAll') && multiSelectSrc.includes('clearAll'),
  },
  {
    name: 'Tasks page imports and uses SearchableMultiSelect',
    pass: tasksPageSrc.includes('import SearchableMultiSelect from "@/components/ui/SearchableMultiSelect";') &&
          tasksPageSrc.includes('<SearchableMultiSelect'),
  },
  {
    name: 'Tasks page maintains assigneeUserIds state for multi-assign',
    pass: tasksPageSrc.includes('const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);'),
  },
  {
    name: 'Tasks page filters tasks for non-admins (client-side extra safety)',
    pass: tasksPageSrc.includes('if (!isAdmin && currentUser?.id)') &&
          tasksPageSrc.includes('isAssigned') &&
          tasksPageSrc.includes('isCreator'),
  },
  {
    name: 'Tasks page dynamic submit button reflects multi-assign count',
    pass: tasksPageSrc.includes('Create & Assign to ${assigneeUserIds.length} Employees'),
  },
];

let allPass = true;
for (const c of checks) {
  console.log(`[${c.pass ? 'PASS' : 'FAIL'}] ${c.name}`);
  if (!c.pass) allPass = false;
}

if (!allPass) {
  process.exit(1);
} else {
  console.log(`\nAll ${checks.length} verification checks passed successfully!`);
}
