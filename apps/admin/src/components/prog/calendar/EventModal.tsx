'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/prog/ui/modal';

export type EventColor = 'danger' | 'success' | 'primary' | 'warning';

export interface EventFormData {
  id?: string;
  title: string;
  startDate: string;
  endDate: string;
  color: EventColor;
}

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'add' | 'edit';
  eventData?: EventFormData;
  onSave: (data: EventFormData) => void;
}

const colorOptions: { value: EventColor; label: string }[] = [
  { value: 'danger', label: 'Danger' },
  { value: 'success', label: 'Success' },
  { value: 'primary', label: 'Primary' },
  { value: 'warning', label: 'Warning' },
];

const colorMap: Record<EventColor, { ring: string; dot: string }> = {
  danger: {
    ring: 'border-red-500',
    dot: 'bg-red-500',
  },
  success: {
    ring: 'border-emerald-500',
    dot: 'bg-emerald-500',
  },
  primary: {
    ring: 'border-brand-500',
    dot: 'bg-brand-500',
  },
  warning: {
    ring: 'border-amber-500',
    dot: 'bg-amber-500',
  },
};

const initialFormState: EventFormData = {
  title: '',
  startDate: '',
  endDate: '',
  color: 'primary',
};

const inputClasses =
  'h-11 w-full appearance-none rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800';

function CalendarIcon() {
  return (
    <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
      <svg className="fill-gray-700 dark:fill-gray-400" width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M4.33317 0.0830078C4.74738 0.0830078 5.08317 0.418794 5.08317 0.833008V1.24967H8.9165V0.833008C8.9165 0.418794 9.25229 0.0830078 9.6665 0.0830078C10.0807 0.0830078 10.4165 0.418794 10.4165 0.833008V1.24967L11.3332 1.24967C12.2997 1.24967 13.0832 2.03318 13.0832 2.99967V4.99967V11.6663C13.0832 12.6328 12.2997 13.4163 11.3332 13.4163H2.6665C1.70001 13.4163 0.916504 12.6328 0.916504 11.6663V4.99967V2.99967C0.916504 2.03318 1.70001 1.24967 2.6665 1.24967L3.58317 1.24967V0.833008C3.58317 0.418794 3.91896 0.0830078 4.33317 0.0830078ZM4.33317 2.74967H2.6665C2.52843 2.74967 2.4165 2.8616 2.4165 2.99967V4.24967H11.5832V2.99967C11.5832 2.8616 11.4712 2.74967 11.3332 2.74967H9.6665H4.33317ZM11.5832 5.74967H2.4165V11.6663C2.4165 11.8044 2.52843 11.9163 2.6665 11.9163H11.3332C11.4712 11.9163 11.5832 11.8044 11.5832 11.6663V5.74967Z" fill="" />
      </svg>
    </span>
  );
}

export default function EventModal({ isOpen, onClose, mode, eventData, onSave }: EventModalProps) {
  const [formData, setFormData] = useState<EventFormData>(initialFormState);

  useEffect(() => {
    if (isOpen) {
      setFormData(eventData ?? initialFormState);
    }
  }, [isOpen, eventData]);

  const handleClose = () => {
    setFormData(initialFormState);
    onClose();
  };

  const handleSave = () => {
    onSave(formData);
    setFormData(initialFormState);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} className="max-w-[600px] m-4">
      <div className="no-scrollbar relative w-full overflow-y-auto rounded-3xl bg-white p-6 dark:bg-gray-900 lg:p-11">
        <div className="flex flex-col px-2 overflow-y-auto custom-scrollbar">
          {/* Header */}
          <div>
            <h5 className="mb-2 text-xl font-semibold text-gray-800 lg:text-2xl dark:text-white/90">
              {mode === 'edit' ? 'Edit Event' : 'Add Event'}
            </h5>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Plan your next big moment: schedule or edit an event to stay on track
            </p>
          </div>

          {/* Form */}
          <div className="mt-8">
            {/* Event Title */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Event Title
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Enter event title"
                className={inputClasses}
              />
            </div>

            {/* Event Color */}
            <div className="mt-6">
              <label className="mb-4 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Event Color
              </label>
              <div className="flex flex-wrap items-center gap-4 sm:gap-5">
                {colorOptions.map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center text-sm text-gray-700 dark:text-gray-400"
                  >
                    <span className="relative mr-2">
                      <input
                        type="radio"
                        name="event-color"
                        value={option.value}
                        checked={formData.color === option.value}
                        onChange={() => setFormData({ ...formData, color: option.value })}
                        className="sr-only"
                      />
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                          formData.color === option.value
                            ? colorMap[option.value].ring
                            : 'border-gray-300 dark:border-gray-700'
                        }`}
                      >
                        <span
                          className={`h-2 w-2 rounded-full transition-colors ${
                            formData.color === option.value
                              ? colorMap[option.value].dot
                              : 'bg-transparent'
                          }`}
                        />
                      </span>
                    </span>
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Start Date */}
            <div className="mt-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Enter Start Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className={`${inputClasses} pr-11`}
                />
                <CalendarIcon />
              </div>
            </div>

            {/* End Date */}
            <div className="mt-6">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
                Enter End Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className={`${inputClasses} pr-11`}
                />
                <CalendarIcon />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center gap-3 sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="flex w-full justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] sm:w-auto"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex w-full justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 sm:w-auto"
            >
              {mode === 'edit' ? 'Update Changes' : 'Add Event'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
