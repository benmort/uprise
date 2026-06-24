'use client';

import { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { EventInput } from '@fullcalendar/core';

interface FullCalendarComponentProps {
  events?: EventInput[];
  onDateSelect?: (selectInfo: Record<string, unknown>) => void;
  onEventClick?: (clickInfo: Record<string, unknown>) => void;
  onEventChange?: (changeInfo: Record<string, unknown>) => void;
  onAddEventClick?: () => void;
  initialView?: string;
  height?: string | number;
  className?: string;
}

export default function FullCalendarComponent({
  events = [],
  onDateSelect,
  onEventClick,
  onEventChange,
  onAddEventClick,
  initialView = 'dayGridMonth',
  height = 'auto',
  className = ''
}: FullCalendarComponentProps) {
  const calendarRef = useRef<FullCalendar>(null);

  // FullCalendar CSS classes are handled by the component itself

  return (
    <div className={`fullcalendar-container ${className}`}>
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={initialView}
        height={height}
        headerToolbar={{
          left: 'prev,next addEventButton',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        customButtons={{
          addEventButton: {
            text: 'Add Event +',
            click: () => {
              onAddEventClick?.();
            }
          }
        }}
        events={events}
        selectable={true}
        selectMirror={true}
        dayMaxEvents={true}
        weekends={true}
        select={onDateSelect ? (arg) => onDateSelect(arg as unknown as Record<string, unknown>) : undefined}
        eventClick={onEventClick ? (arg) => onEventClick(arg as unknown as Record<string, unknown>) : undefined}
        eventChange={onEventChange ? (arg) => onEventChange(arg as unknown as Record<string, unknown>) : undefined}
        editable={true}
        droppable={true}
        eventResizableFromStart={true}
        eventDurationEditable={true}
        eventStartEditable={true}
        eventDisplay="block"
        eventTextColor="#ffffff"
        eventBackgroundColor="#3b82f6"
        eventBorderColor="#3b82f6"
        dayHeaderFormat={{ weekday: 'short' }}
        buttonText={{
          today: 'Today',
          month: 'Month',
          week: 'Week',
          day: 'Day'
        }}
        // Custom styling for better Tailwind integration
        dayCellClassNames={(arg) => {
          const classes = [];
          if (arg.isToday) classes.push('fc-day-today');
          if (arg.isOther) classes.push('fc-day-other');
          return classes;
        }}
        eventClassNames={(arg) => {
          const classes = ['fc-event'];
          if (arg.event.extendedProps?.color) {
            classes.push(`fc-event-${arg.event.extendedProps.color}`);
          }
          return classes;
        }}
        eventContent={(eventInfo) => {
          const colorClass = eventInfo.event.extendedProps?.color || 'primary';
          return {
            html: `
              <div class="event-fc-color flex fc-event-main fc-bg-${colorClass} p-1 rounded-sm">
                <div class="fc-daygrid-event-dot"></div>
                <div class="fc-event-time"></div>
                <div class="fc-event-title">${eventInfo.event.title}</div>
              </div>
            `
          };
        }}

      />
    </div>
  );
}
