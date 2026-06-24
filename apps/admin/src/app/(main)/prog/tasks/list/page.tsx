'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Breadcrumbs from '@/components/prog/shared/breadcrumbs';
import {
  GripVertical,
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
  status: TaskStatus;
  checked: boolean;
  tag?: { label: string; color: 'brand' | 'success' | 'orange' };
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
    checked: false,
    tag: { label: 'Marketing', color: 'brand' },
    dueDate: 'Tomorrow',
    comments: 1,
    avatar: 'FC',
  },
  {
    id: '2',
    title: 'Solve the Dribbble prioritisation issue with the team',
    status: 'todo',
    checked: true,
    dueDate: 'Jan 8, 2027',
    comments: 2,
    links: 1,
    avatar: 'KG',
  },
  {
    id: '3',
    title: 'Change license and remove products',
    status: 'todo',
    checked: true,
    tag: { label: 'Marketing', color: 'brand' },
    dueDate: 'Feb 12, 2027',
    links: 1,
    avatar: 'AS',
  },
  {
    id: '4',
    title: 'Work In Progress (WIP) Dashboard',
    status: 'in_progress',
    checked: false,
    dueDate: 'Today',
    comments: 1,
    avatar: 'WD',
  },
  {
    id: '5',
    title: 'Kanban Flow Manager',
    status: 'in_progress',
    checked: false,
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
    checked: false,
    dueDate: 'Feb 12, 2027',
    comments: 8,
    avatar: 'PU',
  },
  {
    id: '7',
    title: 'Make figbot send comment when ticket is auto-moved back to inbox',
    status: 'in_progress',
    checked: false,
    dueDate: 'Mar 08, 2027',
    comments: 1,
    avatar: 'MF',
  },
  {
    id: '8',
    title: 'Manage internal feedback',
    status: 'completed',
    checked: false,
    dueDate: 'Tomorrow',
    comments: 1,
    avatar: 'MI',
  },
  {
    id: '9',
    title: 'Do some projects on React Native with Flutter',
    status: 'completed',
    checked: false,
    tag: { label: 'Development', color: 'orange' },
    dueDate: 'Jan 8, 2027',
    avatar: 'DP',
  },
  {
    id: '10',
    title: 'Design marketing assets',
    status: 'completed',
    checked: false,
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
    checked: false,
    tag: { label: 'Template', color: 'success' },
    dueDate: 'Feb 12, 2027',
    comments: 8,
    avatar: 'KF',
  },
];

type TaskFilter = 'All' | 'Todo' | 'InProgress' | 'Completed';

const LANE_IDS: TaskStatus[] = ['todo', 'in_progress', 'completed'];

function TaskGroupDropdown() {
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

function TagBadge({ label, color }: { label: string; color: 'brand' | 'success' | 'orange' }) {
  const colorClasses = {
    brand: 'bg-brand-50 text-brand-500 dark:bg-brand-500/15 dark:text-brand-400',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    orange: 'bg-orange-400/10 text-orange-400',
  };

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colorClasses[color]}`}>
      {label}
    </span>
  );
}

function TaskCheckbox({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`flex h-5 w-5 min-w-5 cursor-pointer items-center justify-center rounded-md border ${
        checked
          ? 'border-brand-500 bg-brand-500'
          : 'border-gray-300 dark:border-gray-700'
      }`}
    >
      {checked && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.6668 3.5L5.25016 9.91667L2.3335 7" stroke="white" strokeWidth="1.94437" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function TaskItemContent({ task }: { task: Task }) {
  return (
    <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="flex w-full items-start gap-4">
        <span className="text-gray-400 cursor-grab active:cursor-grabbing">
          <GripVertical className="h-5 w-5" />
        </span>

        <div className="flex w-full items-start gap-3">
          <div
            className={`flex h-5 w-5 min-w-5 items-center justify-center rounded-md border ${
              task.checked
                ? 'border-brand-500 bg-brand-500'
                : 'border-gray-300 dark:border-gray-700'
            }`}
          >
            {task.checked && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.6668 3.5L5.25016 9.91667L2.3335 7" stroke="white" strokeWidth="1.94437" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <p className={`-mt-0.5 text-base ${task.checked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white/90'}`}>
            {task.title}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col-reverse items-start justify-end gap-3 xl:flex-row xl:items-center xl:gap-5">
        {task.tag && <TagBadge label={task.tag.label} color={task.tag.color} />}

        <div className="flex w-full items-center justify-between gap-5 xl:w-auto xl:justify-normal">
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

          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300">
            {task.avatar.charAt(0)}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableTaskItem({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
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
      className={`rounded-xl border bg-white p-5 shadow-sm dark:bg-white/5 ${
        isDragging
          ? 'border-brand-300 dark:border-brand-700 ring-2 ring-brand-500/20'
          : 'border-gray-200 dark:border-gray-800'
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full items-start gap-4">
          <span
            className="text-gray-400 cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-5 w-5" />
          </span>

          <div className="flex w-full items-start gap-3">
            <TaskCheckbox checked={task.checked} onChange={() => onToggle(task.id)} />
            <p className={`-mt-0.5 text-base ${task.checked ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white/90'}`}>
              {task.title}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col-reverse items-start justify-end gap-3 xl:flex-row xl:items-center xl:gap-5">
          {task.tag && <TagBadge label={task.tag.label} color={task.tag.color} />}

          <div className="flex w-full items-center justify-between gap-5 xl:w-auto xl:justify-normal">
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

            <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full border border-gray-200 bg-gray-100 text-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300">
              {task.avatar.charAt(0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SwimLaneProps {
  id: TaskStatus;
  title: string;
  badgeClass: string;
  tasks: Task[];
  onToggle: (id: string) => void;
}

function SwimLane({ id, title, badgeClass, tasks, onToggle }: SwimLaneProps) {
  const taskIds = tasks.map((t) => t.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-3 text-base font-medium text-gray-800 dark:text-white/90">
          {title}
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
            {tasks.length}
          </span>
        </h3>
        <TaskGroupDropdown />
      </div>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy} id={id}>
        <div className="flex flex-col gap-4 min-h-[60px]">
          {tasks.map((task) => (
            <SortableTaskItem key={task.id} task={task} onToggle={onToggle} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function TaskListPage() {
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

  const handleToggle = (id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t))
    );
  };

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
      const activeItems = prev.filter((t) => t.status === activeContainer);
      const overItems = prev.filter((t) => t.status === overContainer);

      const activeIndex = activeItems.findIndex((t) => t.id === active.id);
      const overIndex = overItems.findIndex((t) => t.id === over.id);

      const newIndex = over.id === overContainer
        ? overItems.length
        : overIndex >= 0
          ? overIndex
          : overItems.length;

      const movedTask = activeItems[activeIndex];
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

  const lanes: {
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

  return (
    <div className="p-4 mx-auto max-w-screen-2xl md:p-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Task List</h2>
        <Breadcrumbs
          items={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Task List' },
          ]}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        {/* Task header */}
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

        {/* Task swim lanes with drag and drop */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-8 border-t border-gray-200 p-4 dark:border-gray-800 xl:p-6">
            {lanes.map(
              (lane) =>
                lane.visible && (
                  <SwimLane
                    key={lane.id}
                    id={lane.id}
                    title={lane.title}
                    badgeClass={lane.badgeClass}
                    tasks={lane.tasks}
                    onToggle={handleToggle}
                  />
                )
            )}
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="rounded-xl border border-brand-300 bg-white p-5 shadow-lg ring-2 ring-brand-500/20 dark:border-brand-700 dark:bg-gray-900">
                <TaskItemContent task={activeTask} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      <AddTaskModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
