import type { OrganisationContactFormValues } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactsFormErrors = Record<number, Partial<Record<keyof OrganisationContactFormValues, string>>>;

export function validateContactsForm(contacts: OrganisationContactFormValues[]): ContactsFormErrors {
  const errors: ContactsFormErrors = {};

  contacts.forEach((contact, index) => {
    const contactErrors: Partial<Record<keyof OrganisationContactFormValues, string>> = {};

    const firstName = (contact.firstName ?? '').trim();
    if (firstName.length === 0) {
      contactErrors.firstName = 'First name is required';
    }

    const lastName = (contact.lastName ?? '').trim();
    if (lastName.length === 0) {
      contactErrors.lastName = 'Last name is required';
    }

    const email = (contact.email ?? '').trim();
    if (email.length === 0) {
      contactErrors.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(email)) {
      contactErrors.email = 'Please enter a valid email address';
    }

    const phone = (contact.phone ?? '').trim();
    const mobilePhone = (contact.mobilePhone ?? '').trim();
    const phoneError = 'At least one of Phone or Mobile Phone is required';
    if (phone.length === 0 && mobilePhone.length === 0) {
      contactErrors.phone = phoneError;
      contactErrors.mobilePhone = phoneError;
    }

    const title = (contact.title ?? '').trim();
    if (title.length === 0) {
      contactErrors.title = 'Title is required';
    }

    const role = (contact.role ?? '').trim();
    if (role.length === 0 || role === 'other') {
      contactErrors.role = 'Role is required';
    }

    const contactType = (contact.contactType ?? '').trim();
    if (contactType.length === 0) {
      contactErrors.contactType = 'Contact type is required';
    }

    if (Object.keys(contactErrors).length > 0) {
      errors[index] = contactErrors;
    }
  });

  return errors;
}
