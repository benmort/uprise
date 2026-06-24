'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import {
  Calendar,
  MessageCircle,
  Link2,
  SlidersHorizontal,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import AddTaskModal from '@/components/prog/tasks/AddTaskModal';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TaskStatus = 'todo' | 'in_progress' | 'completed';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  tag?: { label: string; color: 'brand' | 'success' | 'orange' | 'gray' };
  dueDate: string;
  comments?: number;
  links?: number;
  avatar: string;
}

const mockTasks: Task[] = [
  {
    id: '1',
    title: 'Finish user onboarding',
    status: 'todo',
    dueDate: 'Tomorrow',
    comments: 1,
    avatar: 'FC',
  },
  {
    id: '2',
    title: 'Solve the Dribbble prioritisation issue with the team',
    status: 'todo',
    tag: { label: 'Marketing', color: 'brand' },
    dueDate: 'Jan 8, 2027',
    comments: 2,
    links: 1,
    avatar: 'KG',
  },
  {
    id: '3',
    title: 'Change license and remove products',
    status: 'todo',
    tag: { label: 'Dev', color: 'gray' },
    dueDate: 'Jan 8, 2027',
    avatar: 'AS',
  },
  {
    id: '4',
    title: 'Work In Progress (WIP) Dashboard',
    status: 'in_progress',
    dueDate: 'Today',
    comments: 1,
    avatar: 'WD',
  },
  {
    id: '5',
    title: 'Kanban Flow Manager',
    status: 'in_progress',
    tag: { label: 'Template', color: 'success' },
    dueDate: 'Feb 12, 2027',
    comments: 8,
    links: 2,
    avatar: 'KF',
  },
  {
    id: '6',
    title: 'Product Update - Q4 2024',
    status: 'in_progress',
    description: 'Dedicated form for a category of users that will perform actions.',
    dueDate: 'Feb 12, 2027',
    comments: 8,
    avatar: 'PU',
  },
  {
    id: '7',
    title: 'Make figbot send comment when ticket is auto-moved back to inbox',
    status: 'in_progress',
    dueDate: 'Mar 08, 2027',
    comments: 1,
    avatar: 'MF',
  },
  {
    id: '8',
    title: 'Manage internal feedback',
    status: 'completed',
    dueDate: 'Tomorrow',
    comments: 1,
    avatar: 'MI',
  },
  {
    id: '9',
    title: 'Do some projects on React Native with Flutter',
    status: 'completed',
    tag: { label: 'Development', color: 'orange' },
    dueDate: 'Jan 8, 2027',
    avatar: 'DP',
  },
  {
    id: '10',
    title: 'Design marketing assets',
    status: 'completed',
    tag: { label: 'Marketing', color: 'brand' },
    dueDate: 'Jan 8, 2027',
    comments: 2,
    links: 1,
    avatar: 'DM',
  },
  {
    id: '11',
    title: 'Kanban Flow Manager',
    status: 'completed',
    tag: { label: 'Template', color: 'success' },
    dueDate: 'Feb 12, 2027',
    comments: 8,
    avatar: 'KF',
  },
];

type TaskFilter = 'All' | 'Todo' | 'InProgress' | 'Completed';

const LANE_IDS: TaskStatus[] = ['todo', 'in_progress', 'completed'];

function ColumnDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="text-gray-700 dark:text-gray-400">
        <MoreHorizontal className="w-6 h-6" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 w-[140px] space-y-1 rounded-2xl border border-gray-200 bg-white p-2 shadow-md dark:border-gray-800 dark:bg-gray-900">
          <button className="flex w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
            Edit
          </button>
          <button className="flex w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
            Delete
          </button>
          <button className="flex w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
            Clear All
          </button>
        </div>
      )}
    </div>
  );
}

function TagBadge({ label, color }: { label: string; color: 'brand' | 'success' | 'orange' | 'gray' }) {
  const colorClasses = {
    brand: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    orange: 'bg-orange-400/10 text-orange-400',
    gray: 'bg-gray-100 text-gray-700 dark:bg-white/[0.03] dark:text-white/80',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses[color]}`}>
      {label}
    </span>
  );
}

function KanbanCardContent({ task }: { task: Task }) {
  return (
    <>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h4 className="mb-5 text-base text-gray-800 dark:text-white/90">
            {task.title}
          </h4>

          {task.description && (
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="h-4 w-4" />
              {task.dueDate}
            </span>

            {task.comments !== undefined && (
              <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <MessageCircle className="h-4 w-4" />
                {task.comments}
              </span>
            )}

            {task.links !== undefined && (
              <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                <Link2 className="h-4 w-4" />
                {task.links}
              </span>
            )}
          </div>

          {task.tag && (
            <div className="mt-3">
              <TagBadge label={task.tag.label} color={task.tag.color} />
            </div>
          )}
        </div>

        <div className="flex h-6 w-6 min-w-6 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300">
          {task.avatar.charAt(0)}
        </div>
      </div>
    </>
  );
}

function SortableKanbanCard({ task }: { task: Task }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`cursor-grab rounded-xl border bg-white p-5 shadow-sm active:cursor-grabbing dark:bg-white/5 ${
        isDragging
          ? 'border-brand-300 dark:border-brand-700 ring-2 ring-brand-500/20'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <KanbanCardContent task={task} />
    </div>
  );
}

interface KanbanColumnProps {
  id: TaskStatus;
  title: string;
  badgeClass: string;
  tasks: Task[];
  borderClass?: string;
}

function KanbanColumn({ id, title, badgeClass, tasks, borderClass = '' }: KanbanColumnProps) {
  const taskIds = tasks.map((t) => t.id);

  return (
    <div className={`flex flex-col gap-5 p-4 xl:p-6 ${borderClass}`}>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="flex items-center gap-3 text-base font-medium text-gray-800 dark:text-white/90">
          {title}
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
            {tasks.length}
          </span>
        </h3>
        <ColumnDropdown />
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy} id={id}>
        <div className="flex flex-col gap-5 min-h-[80px]">
          {tasks.map((task) => (
            <SortableKanbanCard key={task.id} task={task} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function KanbanPage() {
  const [selectedFilter, setSelectedFilter] = useState<TaskFilter>('All');
  const [tasks, setTasks] = useState(mockTasks);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilter(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const getTasksByStatus = useCallback(
    (status: TaskStatus) => tasks.filter((t) => t.status === status),
    [tasks]
  );

  const todoTasks = getTasksByStatus('todo');
  const inProgressTasks = getTasksByStatus('in_progress');
  const completedTasks = getTasksByStatus('completed');

  const findContainer = (id: string): TaskStatus | undefined => {
    if (LANE_IDS.includes(id as TaskStatus)) return id as TaskStatus;
    const task = tasks.find((t) => t.id === id);
    return task?.status;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setTasks((prev) => {
      const overItems = prev.filter((t) => t.status === overContainer);
      const overIndex = overItems.findIndex((t) => t.id === over.id);

      const newIndex = over.id === overContainer
        ? overItems.length
        : overIndex >= 0
          ? overIndex
          : overItems.length;

      const movedTask = prev.find((t) => t.id === active.id);
      if (!movedTask) return prev;

      const remaining = prev.filter((t) => t.id !== active.id);
      const updatedTask = { ...movedTask, status: overContainer };

      const result: Task[] = [];
      let inserted = false;
      let positionInLane = 0;

      for (const t of remaining) {
        if (t.status === overContainer) {
          if (positionInLane === newIndex && !inserted) {
            result.push(updatedTask);
            inserted = true;
          }
          positionInLane++;
        }
        result.push(t);
      }

      if (!inserted) result.push(updatedTask);

      return result;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer) return;

    if (activeContainer === overContainer) {
      const containerTasks = tasks.filter((t) => t.status === activeContainer);
      const activeIndex = containerTasks.findIndex((t) => t.id === active.id);
      const overIndex = containerTasks.findIndex((t) => t.id === over.id);

      if (activeIndex !== overIndex) {
        const reordered = arrayMove(containerTasks, activeIndex, overIndex);
        setTasks((prev) => {
          const otherTasks = prev.filter((t) => t.status !== activeContainer);
          return [...otherTasks, ...reordered];
        });
      }
    }
  };

  const filterConfig: { key: TaskFilter; label: string; count: number }[] = [
    { key: 'All', label: 'All Tasks', count: tasks.length },
    { key: 'Todo', label: 'To do', count: todoTasks.length },
    { key: 'InProgress', label: 'In Progress', count: inProgressTasks.length },
    { key: 'Completed', label: 'Completed', count: completedTasks.length },
  ];

  const showTodo = selectedFilter === 'All' || selectedFilter === 'Todo';
  const showInProgress = selectedFilter === 'All' || selectedFilter === 'InProgress';
  const showCompleted = selectedFilter === 'All' || selectedFilter === 'Completed';

  const columns: {
    id: TaskStatus;
    title: string;
    badgeClass: string;
    tasks: Task[];
    visible: boolean;
  }[] = [
    {
      id: 'todo',
      title: 'To Do',
      badgeClass: 'bg-gray-100 text-gray-700 dark:bg-white/[0.03] dark:text-white/80',
      tasks: todoTasks,
      visible: showTodo,
    },
    {
      id: 'in_progress',
      title: 'In Progress',
      badgeClass: 'bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-orange-400',
      tasks: inProgressTasks,
      visible: showInProgress,
    },
    {
      id: 'completed',
      title: 'Completed',
      badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
      tasks: completedTasks,
      visible: showCompleted,
    },
  ];

  const visibleColumns = columns.filter((c) => c.visible);

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Kanban</h2>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Kanban' },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {/* Header */}
        <div className="flex flex-col items-center px-4 py-5 xl:px-6 xl:py-6">
          <div className="flex w-full flex-col gap-5 sm:justify-between xl:flex-row xl:items-center">
            {/* Filter tabs */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900">
              {filterConfig.map((filter) => (
                <button
                  key={filter.key}
                  className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium group hover:text-gray-900 dark:hover:text-white ${
                    selectedFilter === filter.key
                      ? 'bg-white text-gray-900 dark:bg-gray-800 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                  onClick={() => setSelectedFilter(filter.key)}
                >
                  {filter.label}
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium leading-normal group-hover:bg-brand-50 group-hover:text-brand-500 dark:group-hover:bg-brand-500/15 dark:group-hover:text-brand-400 ${
                      selectedFilter === filter.key
                        ? 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400'
                        : 'bg-white dark:bg-white/[0.03]'
                    }`}
                  >
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-3 xl:justify-end">
              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setShowFilter(!showFilter)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.03]"
                >
                  <SlidersHorizontal className="h-5 w-5" />
                  Filter &amp; Sort
                </button>
                {showFilter && (
                  <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-gray-200 bg-white p-4 shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <div className="mb-5">
                      <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Tag</label>
                      <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search tag..." />
                    </div>
                    <div className="mb-5">
                      <label className="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">Assignee</label>
                      <input type="text" className="h-10 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800" placeholder="Search assignee..." />
                    </div>
                    <button onClick={() => setShowFilter(false)} className="h-10 w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">Apply</button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-600"
              >
                Add New Task
                <Plus className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Kanban columns */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div
            className="grid border-t border-gray-200 dark:border-gray-800"
            style={{
              gridTemplateColumns: `repeat(${visibleColumns.length}, minmax(0, 1fr))`,
            }}
          >
            {visibleColumns.map((col, idx) => (
              <KanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                badgeClass={col.badgeClass}
                tasks={col.tasks}
                borderClass={
                  idx > 0 && idx < visibleColumns.length
                    ? 'border-l border-gray-200 dark:border-gray-800'
                    : ''
                }
              />
            ))}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="rounded-xl border border-brand-300 bg-white p-5 shadow-lg ring-2 ring-brand-500/20 dark:border-brand-700 dark:bg-gray-900">
                <KanbanCardContent task={activeTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <AddTaskModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
