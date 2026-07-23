'use client';

import { useState } from 'react';
import { Modal } from "@/components/ui/modal";
import { Plus, X } from 'lucide-react';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask?: (task: NewTaskData) => void;
}

export interface NewTaskData {
  title: string;
  dueDate: string;
  status: 'todo' | 'in_progress' | 'completed';
  tag: 'marketing' | 'template' | 'development' | '';
  assignee: string;
  description: string;
}

const initialFormState: NewTaskData = {
  title: '',
  dueDate: '',
  status: 'todo',
  tag: '',
  assignee: '',
  description: '',
};

interface Attachment {
  id: string;
  name: string;
  type: string;
  icon: 'pdf' | 'drive';
}

const defaultAttachments: Attachment[] = [
  { id: '1', name: 'Guidelines.pdf', type: 'PDF', icon: 'pdf' },
  { id: '2', name: 'Branding Assets', type: 'Media', icon: 'drive' },
];

function PdfIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-500/10">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2v6h6M9 15h6M9 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function DriveIcon() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-500 dark:bg-blue-500/10">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 19.5h20L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 13l4 6.5L22 7M2 19.5L8 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function SelectChevron() {
  return (
    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
      <svg className="stroke-current" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3.8335 5.9165L8.00016 10.0832L12.1668 5.9165" stroke="" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const inputClasses =
  'h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800';

const selectClasses =
  'h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 pr-11 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800';

export default function AddTaskModal({ isOpen, onClose, onCreateTask }: AddTaskModalProps) {
  const [formData, setFormData] = useState<NewTaskData>(initialFormState);
  const [attachments, setAttachments] = useState<Attachment[]>(defaultAttachments);

  const handleClose = () => {
    setFormData(initialFormState);
    onClose();
  };

  const handleCreate = () => {
    onCreateTask?.(formData);
    setFormData(initialFormState);
    onClose();
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[700px] m-4">
      <div className="no-scrollbar relative w-full overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 lg:p-11">
        <div className="px-2">
          <h4 className="mb-2 text-2xl font-semibold text-gray-800 dark:text-white/90">
            Add a new task
          </h4>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400 lg:mb-7">
            Effortlessly manage your to-do list: add a new task
          </p>
        </div>

        <form className="flex flex-col" onSubmit={(e) => e.preventDefault()}>
          <div className="custom-scrollbar max-h-[450px] overflow-y-auto px-2">
            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {/* Task Title */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Task Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter task title"
                  className={inputClasses}
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Due Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className={`${inputClasses} pr-11`}
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
                    <svg className="fill-gray-700 dark:fill-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" clipRule="evenodd" d="M4.33317 0.0830078C4.74738 0.0830078 5.08317 0.418794 5.08317 0.833008V1.24967H8.9165V0.833008C8.9165 0.418794 9.25229 0.0830078 9.6665 0.0830078C10.0807 0.0830078 10.4165 0.418794 10.4165 0.833008V1.24967L11.3332 1.24967C12.2997 1.24967 13.0832 2.03318 13.0832 2.99967V4.99967V11.6663C13.0832 12.6328 12.2997 13.4163 11.3332 13.4163H2.6665C1.70001 13.4163 0.916504 12.6328 0.916504 11.6663V4.99967V2.99967C0.916504 2.03318 1.70001 1.24967 2.6665 1.24967L3.58317 1.24967V0.833008C3.58317 0.418794 3.91896 0.0830078 4.33317 0.0830078ZM4.33317 2.74967H2.6665C2.52843 2.74967 2.4165 2.8616 2.4165 2.99967V4.24967H11.5832V2.99967C11.5832 2.8616 11.4712 2.74967 11.3332 2.74967H9.6665H4.33317ZM11.5832 5.74967H2.4165V11.6663C2.4165 11.8044 2.52843 11.9163 2.6665 11.9163H11.3332C11.4712 11.9163 11.5832 11.8044 11.5832 11.6663V5.74967Z" fill="" />
                    </svg>
                  </span>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Status
                </label>
                <div className="relative">
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as NewTaskData['status'] })
                    }
                    className={selectClasses}
                  >
                    <option value="todo" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">To Do</option>
                    <option value="in_progress" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">In Progress</option>
                    <option value="completed" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Completed</option>
                  </select>
                  <SelectChevron />
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Tags
                </label>
                <div className="relative">
                  <select
                    value={formData.tag}
                    onChange={(e) =>
                      setFormData({ ...formData, tag: e.target.value as NewTaskData['tag'] })
                    }
                    className={selectClasses}
                  >
                    <option value="" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Select tag</option>
                    <option value="marketing" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Marketing</option>
                    <option value="template" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Template</option>
                    <option value="development" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Development</option>
                  </select>
                  <SelectChevron />
                </div>
              </div>

              {/* Assignees */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Assignees
                </label>
                <div className="relative">
                  <select
                    value={formData.assignee}
                    onChange={(e) => setFormData({ ...formData, assignee: e.target.value })}
                    className={selectClasses}
                  >
                    <option value="" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Select assignee</option>
                    <option value="mayad" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Mayad Ahmed</option>
                    <option value="juhan" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Juhan Ahamed</option>
                    <option value="mahim" className="text-gray-700 dark:bg-gray-900 dark:text-gray-400">Mahim Ahmed</option>
                  </select>
                  <SelectChevron />
                </div>
              </div>

              {/* Description */}
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                  Description
                </label>
                <textarea
                  rows={6}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter task description"
                  className="w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800"
                />
              </div>
            </div>

            {/* Attachments */}
            <div className="relative mt-6 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900 sm:p-5">
              <div className="mb-5 flex items-center gap-3">
                <span className="text-lg font-medium text-gray-800 dark:text-white/90">
                  Attachments
                </span>
                <span className="block h-4 w-px bg-gray-200 dark:bg-gray-800" />
                <span className="cursor-pointer text-sm font-medium text-brand-500">
                  Upload file
                </span>
              </div>

              <div className="flex flex-col items-center gap-3 sm:flex-row">
                {attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="group relative flex w-full cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white py-2.5 pl-3 pr-5 dark:border-gray-800 dark:bg-white/5 sm:w-auto"
                  >
                    <button
                      type="button"
                      onClick={() => removeAttachment(attachment.id)}
                      className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 opacity-0 group-hover:opacity-100 dark:border-gray-800 dark:bg-gray-900"
                    >
                      <X className="h-3 w-3" />
                    </button>

                    {attachment.icon === 'pdf' ? <PdfIcon /> : <DriveIcon />}

                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                        {attachment.name}
                      </p>
                      <span className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {attachment.type}
                        </span>
                        <span className="inline-block h-1 w-1 rounded-full bg-gray-400" />
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Download
                        </span>
                      </span>
                    </div>
                  </div>
                ))}

                <div className="flex h-[60px] w-full cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-white/5 dark:text-gray-400 sm:w-[60px]">
                  <Plus className="h-6 w-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-6 px-2 sm:flex-row sm:justify-between">
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <p className="text-sm text-gray-700 dark:text-gray-400">Viewers:</p>
              <div className="flex -space-x-2">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white bg-brand-100 text-xs font-medium text-brand-600 dark:border-gray-900 dark:bg-brand-500/20 dark:text-brand-400">
                  MA
                </div>
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white bg-emerald-100 text-xs font-medium text-emerald-600 dark:border-gray-900 dark:bg-emerald-500/20 dark:text-emerald-400">
                  JA
                </div>
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-white bg-orange-100 text-xs font-medium text-orange-600 dark:border-gray-900 dark:bg-orange-500/20 dark:text-orange-400">
                  MH
                </div>
              </div>
            </div>

            <div className="flex w-full items-center gap-3 sm:w-auto">
              <button
                type="button"
                onClick={handleClose}
                className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto"
              >
                Create Task
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
}
