'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import FullCalendarComponent from '@/components/prog/full-calendar';
import { EventInput } from '@fullcalendar/core';
import EventModal, { type EventFormData, type EventColor } from '@/components/prog/calendar/EventModal';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  color: EventColor;
}

const colorToHex: Record<EventColor, { bg: string; border: string }> = {
  danger: { bg: '#ef4444', border: '#dc2626' },
  success: { bg: '#22c55e', border: '#16a34a' },
  primary: { bg: '#3b82f6', border: '#2563eb' },
  warning: { bg: '#f59e0b', border: '#d97706' },
};

const mockEvents: CalendarEvent[] = [
  { id: '1', title: 'Event Conf.', date: '2025-01-15', color: 'danger' },
  { id: '2', title: 'Meeting', date: '2025-01-16', color: 'success' },
  { id: '3', title: 'Workshop', date: '2025-01-17', color: 'primary' },
];

function calendarEventToFullCalendar(event: CalendarEvent): EventInput {
  return {
    id: event.id,
    title: event.title,
    start: event.date,
    backgroundColor: colorToHex[event.color].bg,
    borderColor: colorToHex[event.color].border,
    extendedProps: { color: event.color },
  };
}

const fullCalendarEvents: EventInput[] = mockEvents.map(calendarEventToFullCalendar);

export default function CommunicationsCalendarPage() {
  const [events, setEvents] = useState<EventInput[]>(fullCalendarEvents);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [editingEvent, setEditingEvent] = useState<EventFormData | undefined>(undefined);

  const openAddModal = useCallback((startDate = '', endDate = '') => {
    setModalMode('add');
    setEditingEvent({
      title: '',
      startDate,
      endDate,
      color: 'primary',
    });
    setModalOpen(true);
  }, []);

  const handleDateSelect = useCallback(
    (selectInfo: Record<string, unknown>) => {
      const calendarApi = (selectInfo.view as { calendar: { unselect: () => void } }).calendar;
      calendarApi.unselect();

      openAddModal(
        selectInfo.startStr as string,
        selectInfo.endStr as string
      );
    },
    [openAddModal]
  );

  const handleEventClick = useCallback((clickInfo: Record<string, unknown>) => {
    const event = clickInfo.event as {
      id: string;
      title: string;
      startStr: string;
      endStr: string;
      extendedProps: { color?: EventColor };
    };

    setModalMode('edit');
    setEditingEvent({
      id: event.id,
      title: event.title,
      startDate: event.startStr,
      endDate: event.endStr,
      color: event.extendedProps?.color ?? 'primary',
    });
    setModalOpen(true);
  }, []);

  const handleEventChange = useCallback((changeInfo: Record<string, unknown>) => {
    const event = changeInfo.event as { id: string; startStr: string; endStr: string };
    setEvents((prev) =>
      prev.map((e) =>
        e.id === event.id
          ? { ...e, start: event.startStr, end: event.endStr }
          : e
      )
    );
  }, []);

  const handleSave = useCallback((data: EventFormData) => {
    const colors = colorToHex[data.color];

    if (modalMode === 'edit' && data.id) {
      setEvents((prev) =>
        prev.map((e) =>
          e.id === data.id
            ? {
                ...e,
                title: data.title,
                start: data.startDate,
                end: data.endDate,
                backgroundColor: colors.bg,
                borderColor: colors.border,
                extendedProps: { color: data.color },
              }
            : e
        )
      );
    } else {
      const newEvent: EventInput = {
        id: Date.now().toString(),
        title: data.title,
        start: data.startDate,
        end: data.endDate || undefined,
        allDay: true,
        backgroundColor: colors.bg,
        borderColor: colors.border,
        extendedProps: { color: data.color },
      };
      setEvents((prev) => [...prev, newEvent]);
    }
  }, [modalMode]);

  return (
    <div className="p-4 mx-auto max-w-7xl md:p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">Calendar</h2>
          <nav>
            <ol className="flex items-center gap-1.5">
              <li>
                <Link
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400"
                  href="/"
                >
                  Home
                  <svg className="stroke-current" width="17" height="16" viewBox="0 0 17 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.0765 12.667L10.2432 8.50033L6.0765 4.33366" stroke="" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </li>
              <li className="text-sm text-gray-800 dark:text-white/90">Calendar</li>
            </ol>
          </nav>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <FullCalendarComponent
            events={events}
            onDateSelect={handleDateSelect}
            onEventClick={handleEventClick}
            onEventChange={handleEventChange}
            onAddEventClick={() => openAddModal()}
            initialView="dayGridMonth"
            height="auto"
            className="w-full"
          />
        </div>
      </div>

      <EventModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        eventData={editingEvent}
        onSave={handleSave}
      />
    </div>
  );
}
