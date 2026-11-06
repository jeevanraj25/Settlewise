"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { formatPaise } from "@/lib/money";
import { InvoiceStatus, STATUS_META } from "@/lib/invoice-status";

export interface InvoiceRow {
  id: string;
  number: string;
  customerName: string;
  customerCompany: string;
  customerId: string;
  dueDate: string; // ISO
  dueDateFormatted: string;
  invoiceDate: string;
  createdAt: string;
  totalPaise: number;
  paidPaise: number;
  currency: string;
  status: InvoiceStatus;
}

type SortField = "createdAt" | "dueDate" | "totalPaise" | "number";
type SortOrder = "asc" | "desc";

const STATUS_FILTERS: Array<{ id: string; label: string }> = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "partially_paid", label: "Partial" },
  { id: "sent", label: "Sent" },
  { id: "viewed", label: "Viewed" },
  { id: "paid", label: "Paid" },
  { id: "draft", label: "Draft" },
  { id: "cancelled", label: "Cancelled" },
];

export default function InvoicesTable({
  invoices,
  initialStatus = "all",
}: {
  invoices: InvoiceRow[];
  initialStatus?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus || "all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Filter & Search
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Status filter
      if (statusFilter !== "all" && inv.status !== statusFilter) {
        return false;
      }

      // 2. Text search query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchNumber = inv.number.toLowerCase().includes(q);
        const matchName = inv.customerName.toLowerCase().includes(q);
        const matchCompany = inv.customerCompany.toLowerCase().includes(q);
        if (!matchNumber && !matchName && !matchCompany) {
          return false;
        }
      }

      return true;
    });
  }, [invoices, statusFilter, searchQuery]);

  // Sort
  const sortedInvoices = useMemo(() => {
    return [...filteredInvoices].sort((a, b) => {
      let cmp = 0;
      if (sortField === "createdAt") {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === "dueDate") {
        cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      } else if (sortField === "totalPaise") {
        cmp = a.totalPaise - b.totalPaise;
      } else if (sortField === "number") {
        cmp = a.number.localeCompare(b.number);
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [filteredInvoices, sortField, sortOrder]);

  // Counts for tabs
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: invoices.length };
    for (const inv of invoices) {
      map[inv.status] = (map[inv.status] || 0) + 1;
    }
    return map;
  }, [invoices]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Sort Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by invoice #, customer, or company…"
            className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        {/* Sort selector */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="shrink-0 font-medium">Sort by:</span>
          <select
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [f, o] = e.target.value.split("-") as [SortField, SortOrder];
              setSortField(f);
              setSortOrder(o);
            }}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none"
          >
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
            <option value="dueDate-asc">Due Date (Earliest First)</option>
            <option value="dueDate-desc">Due Date (Latest First)</option>
            <option value="totalPaise-desc">Amount (Highest First)</option>
            <option value="totalPaise-asc">Amount (Lowest First)</option>
            <option value="number-asc">Invoice # (Ascending)</option>
            <option value="number-desc">Invoice # (Descending)</option>
          </select>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {STATUS_FILTERS.map((tab) => {
          const count = counts[tab.id] || 0;
          const isActive = statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                    isActive ? "bg-indigo-800 text-indigo-100" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {sortedInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-semibold text-gray-900">No matching invoices found</p>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Try adjusting your search query or status filter.
          </p>
          {(searchQuery || statusFilter !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              Reset all filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => toggleSort("number")}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-900"
                  >
                    Invoice # {sortField === "number" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Customer
                  </th>
                  <th
                    onClick={() => toggleSort("dueDate")}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-900"
                  >
                    Due Date {sortField === "dueDate" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th
                    onClick={() => toggleSort("totalPaise")}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-900"
                  >
                    Total {sortField === "totalPaise" && (sortOrder === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {sortedInvoices.map((inv) => {
                  const meta = STATUS_META[inv.status];
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${inv.id}`}
                          className="font-mono text-sm font-semibold text-indigo-600 hover:underline"
                        >
                          {inv.number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        <Link
                          href={`/customers/${inv.customerId}`}
                          className="hover:underline hover:text-indigo-600 font-medium"
                        >
                          {inv.customerName}
                        </Link>
                        {inv.customerCompany && (
                          <span className="text-xs text-gray-400 block">{inv.customerCompany}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{inv.dueDateFormatted}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 font-mono">
                        {formatPaise(inv.totalPaise, inv.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
