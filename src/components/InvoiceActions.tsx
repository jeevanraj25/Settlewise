"use client";

import { useTransition } from "react";
import { cancelInvoiceAction, deleteInvoiceAction } from "@/app/actions/invoices";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface InvoiceActionsProps {
  invoiceId: string;
  invoiceNumber: string;
  state: string;
}

export default function InvoiceActions({
  invoiceId,
  invoiceNumber,
  state,
}: InvoiceActionsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleCancel = () => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel invoice ${invoiceNumber}?\n\nThis will mark the invoice as Cancelled. Clients viewing the public link will see it as Cancelled.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await cancelInvoiceAction(invoiceId);
      if (res?.error) {
        alert(res.error);
      }
    });
  };

  const handleDeleteDraft = () => {
    const confirmed = window.confirm(
      `Are you sure you want to permanently delete draft ${invoiceNumber}?\n\nThis action cannot be undone.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const res = await deleteInvoiceAction(invoiceId);
      if (res?.error) {
        alert(res.error);
      } else {
        router.push("/invoices");
      }
    });
  };

  const isCancelled = state === "cancelled";
  const isDraft = state === "draft";

  return (
    <div className="flex items-center gap-2">
      {/* Edit button */}
      {!isCancelled && (
        <Link
          href={`/invoices/${invoiceId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-xs"
        >
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          Edit
        </Link>
      )}

      {/* Cancel button — only for non-cancelled invoices */}
      {!isCancelled && (
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-300 disabled:opacity-50 transition-colors shadow-xs"
        >
          Cancel Invoice
        </button>
      )}

      {/* Delete Draft button — Rule 2: ONLY allowed for drafts */}
      {isDraft && (
        <button
          type="button"
          onClick={handleDeleteDraft}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors shadow-xs"
        >
          Delete Draft
        </button>
      )}
    </div>
  );
}
