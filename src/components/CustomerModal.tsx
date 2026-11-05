"use client";

import { useState, useTransition } from "react";
import { createCustomerAction, updateCustomerAction, CustomerFormState } from "@/app/actions/customers";

interface CustomerModalProps {
  customer?: {
    id: string;
    name: string;
    companyName: string;
    email: string;
    phone: string;
    billingAddress: string;
  };
  triggerLabel?: string;
  triggerClassName?: string;
  onSuccess?: () => void;
}

export default function CustomerModal({
  customer,
  triggerLabel,
  triggerClassName,
  onSuccess,
}: CustomerModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<CustomerFormState | undefined>();

  const isEditing = Boolean(customer);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      let res: CustomerFormState;
      if (isEditing && customer) {
        res = await updateCustomerAction(customer.id, undefined, formData);
      } else {
        res = await createCustomerAction(undefined, formData);
      }

      setState(res);
      if (res.success) {
        setIsOpen(false);
        setState(undefined);
        onSuccess?.();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setState(undefined);
          setIsOpen(true);
        }}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-indigo-700 transition-colors"
        }
      >
        {!isEditing && (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        )}
        {triggerLabel ?? (isEditing ? "Edit Customer" : "Add Customer")}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-900">
                {isEditing ? "Edit Customer" : "New Customer"}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {state?.message && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                  {state.message}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Contact Name *
                  </label>
                  <input
                    name="name"
                    type="text"
                    required
                    defaultValue={customer?.name ?? ""}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {state?.errors?.name && (
                    <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Company Name
                  </label>
                  <input
                    name="companyName"
                    type="text"
                    defaultValue={customer?.companyName ?? ""}
                    placeholder="e.g. Acme Tech Studio"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Email Address *
                  </label>
                  <input
                    name="email"
                    type="email"
                    required
                    defaultValue={customer?.email ?? ""}
                    placeholder="rahul@example.com"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {state?.errors?.email && (
                    <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                    Phone Number
                  </label>
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={customer?.phone ?? ""}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Billing Address
                </label>
                <textarea
                  name="billingAddress"
                  rows={2}
                  defaultValue={customer?.billingAddress ?? ""}
                  placeholder="Street, City, State, PIN"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-xs"
                >
                  {isPending ? "Saving..." : isEditing ? "Save Changes" : "Create Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
