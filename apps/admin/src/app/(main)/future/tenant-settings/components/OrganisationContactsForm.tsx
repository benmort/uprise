'use client';

import * as React from 'react';
import {
  FormSectionCard,
  FormInput,
  FormPhoneInput,
  FormSelect,
  FormToggle,
} from '@/components/prog/shared/forms';
import { OrganisationContactFormValues } from '../types';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Button } from '@uprise/ui';

const CONTACT_TYPE_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical', label: 'Technical' },
  { value: 'support', label: 'Support' },
  { value: 'other', label: 'Other' },
];

const ROLE_OPTIONS = [
  { value: 'ceo', label: 'CEO' },
  { value: 'treasurer', label: 'Treasurer' },
  { value: 'secretary', label: 'Secretary' },
  { value: 'board_member', label: 'Board Member' },
  { value: 'chair', label: 'Chair' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'member', label: 'Member' },
  { value: 'other', label: 'Other' },
];

const ROLE_VALUES = new Set(ROLE_OPTIONS.map((o) => o.value));

import type { ContactsFormErrors } from '../validation/contacts-validation';

export interface OrganisationContactsFormProps {
  contacts: OrganisationContactFormValues[];
  onChange: (contacts: OrganisationContactFormValues[]) => void;
  errors?: ContactsFormErrors;
  disabled?: boolean;
  /** When true, show green check in card header (step complete). */
  completed?: boolean;
}

const EMPTY_CONTACT: OrganisationContactFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  mobilePhone: '',
  title: '',
  role: '',
  contactType: 'general',
  isPrimaryContact: false,
  isAuthorizedSignatory: false,
};

export function OrganisationContactsForm({ contacts, onChange, errors = {}, disabled, completed }: OrganisationContactsFormProps) {
  const [lastAddedIndex, setLastAddedIndex] = React.useState<number | null>(null);
  const prevContactsLength = React.useRef(contacts.length);
  React.useEffect(() => {
    if (contacts.length < prevContactsLength.current) {
      setLastAddedIndex(null);
    }
    prevContactsLength.current = contacts.length;
  }, [contacts.length]);
  const getContactErrors = (index: number) => errors[index] ?? {};

  const updateContact = (index: number, updates: Partial<OrganisationContactFormValues>) => {
    const next = contacts.map((c, i) => ({ ...c }));
    next[index] = { ...next[index], ...updates };
    // Only one primary contact at a time: when setting primary to true, clear others
    if (updates.isPrimaryContact === true) {
      next.forEach((c, i) => {
        if (i !== index) c.isPrimaryContact = false;
      });
    }
    onChange(next);
  };

  const addContact = () => {
    const newIndex = contacts.length;
    setLastAddedIndex(newIndex);
    onChange([...contacts, { ...EMPTY_CONTACT }]);
  };

  const removeContact = (index: number) => {
    const wasPrimary = contacts[index]?.isPrimaryContact ?? false;
    const next = contacts.filter((_, i) => i !== index);
    // If we removed the primary contact, make the first remaining contact primary
    if (wasPrimary && next.length > 0) {
      next[0] = { ...next[0], isPrimaryContact: true };
    }
    onChange(next);
  };

  return (
    <FormSectionCard
      title="Organisation Contacts"
      description="Contact persons for the organisation"
      icon={<Users className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
      completed={completed}
    >
      <div className="space-y-6">
        {contacts.map((contact, index) => (
          <FormSectionCard
            key={contact.id ?? index}
            title={`Contact ${index + 1}`}
            collapsible
            defaultCollapsed={!(index === 0 || index === lastAddedIndex)}
          >
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormInput
                  label="First Name"
                  value={contact.firstName}
                  onChange={(e) => updateContact(index, { firstName: e.target.value })}
                  placeholder="First name"
                  required
                  error={getContactErrors(index).firstName}
                  state={getContactErrors(index).firstName ? 'error' : 'default'}
                  disabled={disabled}
                />
                <FormInput
                  label="Last Name"
                  value={contact.lastName}
                  onChange={(e) => updateContact(index, { lastName: e.target.value })}
                  placeholder="Last name"
                  required
                  error={getContactErrors(index).lastName}
                  state={getContactErrors(index).lastName ? 'error' : 'default'}
                  disabled={disabled}
                />
              </div>
              <FormInput
                label="Email"
                type="text"
                inputMode="email"
                value={contact.email}
                onChange={(e) => updateContact(index, { email: e.target.value })}
                placeholder="email@example.com"
                required
                error={getContactErrors(index).email}
                state={getContactErrors(index).email ? 'error' : 'default'}
                disabled={disabled}
              />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormPhoneInput
                  label="Phone"
                  value={contact.phone}
                  onChange={(v) => updateContact(index, { phone: v })}
                  error={getContactErrors(index).phone}
                  state={getContactErrors(index).phone ? 'error' : 'default'}
                />
                <FormPhoneInput
                  label="Mobile Phone"
                  value={contact.mobilePhone}
                  onChange={(v) => updateContact(index, { mobilePhone: v })}
                  error={getContactErrors(index).mobilePhone}
                  state={getContactErrors(index).mobilePhone ? 'error' : 'default'}
                />
              </div>
              <FormInput
                label="Title"
                value={contact.title}
                onChange={(e) => updateContact(index, { title: e.target.value })}
                placeholder="Job title"
                required
                error={getContactErrors(index).title}
                state={getContactErrors(index).title ? 'error' : 'default'}
                disabled={disabled}
              />
              <div>
                <FormSelect
                  label="Role"
                  options={ROLE_OPTIONS}
                  value={
                    (contact.role ?? '') && ROLE_VALUES.has(contact.role ?? '')
                      ? (contact.role ?? '')
                      : (contact.role ?? '')
                        ? 'other'
                        : ''
                  }
                  onChange={(v) =>
                    updateContact(index, {
                      role: v === 'other' ? 'other' : v,
                    })
                  }
                  placeholder="Select role"
                  required={!contact.role || contact.role === 'other'}
                  error={getContactErrors(index).role}
                  state={getContactErrors(index).role ? 'error' : 'default'}
                />
                {((contact.role ?? '') === 'other' || ((contact.role ?? '') && !ROLE_VALUES.has(contact.role ?? ''))) && (
                  <FormInput
                    label=""
                    value={(contact.role ?? '') === 'other' ? '' : (contact.role ?? '')}
                    onChange={(e) => updateContact(index, { role: e.target.value || 'other' })}
                    placeholder="Specify role (when Other selected)"
                    error={getContactErrors(index).role}
                    state={getContactErrors(index).role ? 'error' : 'default'}
                    disabled={disabled}
                    className="mt-2"
                  />
                )}
              </div>
              <FormSelect
                label="Contact Type"
                options={CONTACT_TYPE_OPTIONS}
                value={contact.contactType ?? 'general'}
                onChange={(v) => updateContact(index, { contactType: v })}
                placeholder="Select type"
                required
                error={getContactErrors(index).contactType}
                state={getContactErrors(index).contactType ? 'error' : 'default'}
              />
              <div className="flex flex-wrap items-center gap-6">
                <FormToggle
                  id={`contact-${index}-primary`}
                  label="Primary contact"
                  checked={contact.isPrimaryContact ?? false}
                  onChange={(v) => updateContact(index, { isPrimaryContact: v })}
                  disabled={disabled}
                  variant="brand"
                />
                <FormToggle
                  id={`contact-${index}-signatory`}
                  label="Authorized signatory"
                  checked={contact.isAuthorizedSignatory ?? false}
                  onChange={(v) => updateContact(index, { isAuthorizedSignatory: v })}
                  disabled={disabled}
                  variant="brand"
                />
              </div>
              {contacts.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => removeContact(index)}
                  disabled={disabled}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove contact
                </Button>
              )}
            </div>
          </FormSectionCard>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={addContact}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add contact
        </Button>
      </div>
    </FormSectionCard>
  );
}
