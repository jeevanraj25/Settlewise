"use client";

import { useState, useTransition } from "react";
import { deleteCustomerAction } from "@/app/actions/customers";
import { useRouter } from "next/navigation";

export default function DeleteCustomerButton({
  customerId,
  customerName,
  invoiceCount,
  redirectOnSuccess,
}: {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  redirectOnSuccess?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = () => {
    setErrorMsg(null);
    if (invoiceCount > 0) {
      alert(
        `Cannot delete "${customerName}".\n\nThis customer has ${invoiceCount} linked invoice(s). To maintain accurate billing records, customers with invoices cannot be deleted.`
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete customer "${customerName}"? This action cannot be undone.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await deleteCustomerAction(customerId);
      if (res?.error) {
        setErrorMsg(res.error);
        alert(res.error);
      } else if (redirectOnSuccess) {
        router.push("/customers");
      }
    });
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        title={invoiceCount > 0 ? "Cannot delete customer with invoices" : "Delete customer"}
        className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
          invoiceCount > 0
            ? "text-gray-400 bg-gray-50 border border-gray-200 cursor-not-allowed"
            : "text-red-600 hover:text-red-800 hover:bg-red-50 border border-red-200"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
        {isPending ? "Deleting..." : "Delete"}
      </button>
      {errorMsg && <p className="mt-1 text-xs text-red-600">{errorMsg}</p>}
    </div>
  );
}
