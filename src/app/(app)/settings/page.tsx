import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getBaseUrl } from "@/lib/utils";
import CopyButton from "@/components/CopyButton";
import RegenerateTokenButton from "@/components/RegenerateTokenButton";
import BusinessSettingsForm from "@/components/BusinessSettingsForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Settlewise" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, businessSettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, businessName: true, mcpToken: true },
    }),
    prisma.businessSettings.findUnique({
      where: { userId: session.user.id },
    }),
  ]);
  if (!user) redirect("/login");

  // Automatically detect the live domain from request headers, falling back to getBaseUrl()
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const appUrl = host ? `${proto}://${host}` : getBaseUrl();
  const mcpUrl = `${appUrl}/api/mcp?key=${user.mcpToken}`;

  const initialSettings = {
    businessName: businessSettings?.businessName || user.businessName || "",
    businessEmail: businessSettings?.businessEmail || user.email || "",
    address: businessSettings?.address || "",
    taxInfo: businessSettings?.taxInfo || "",
    defaultCurrency: businessSettings?.defaultCurrency || "INR",
    paymentInstructions: businessSettings?.paymentInstructions || "",
    remindersEnabled: businessSettings?.remindersEnabled ?? true,
    reminderSchedule: businessSettings?.reminderSchedule || "-3,0,3,7,14",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Manage your business profile, payment instructions, and AI assistant connections.
        </p>
      </div>

      {/* Account Info */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
          Account Profile
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500 text-xs">Logged In User</dt>
            <dd className="text-gray-900 font-medium mt-0.5">{user.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500 text-xs">Login Email</dt>
            <dd className="text-gray-900 font-medium mt-0.5">{user.email}</dd>
          </div>
        </dl>
      </section>

      {/* Business Details & Payment Instructions Form (Requirement 4) */}
      <section className="space-y-4">
        <BusinessSettingsForm initialSettings={initialSettings} />
      </section>

      {/* Claude MCP Integration Card */}
      <section id="mcp" className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs scroll-mt-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              Claude MCP Integration
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-4 leading-relaxed">
          Paste this endpoint URL into Claude&apos;s custom connector settings so Claude can automatically create invoices, check outstanding balances, and retrieve customer records for you.
        </p>

        {/* MCP URL Bar */}
        <div className="space-y-1.5 mb-6">
          <label className="text-xs font-medium text-gray-700">Your Personal MCP Endpoint</label>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50/70 p-2 text-xs">
            <span className="flex-1 font-mono text-gray-800 break-all select-all px-1">
              {mcpUrl}
            </span>
            <CopyButton text={mcpUrl} />
          </div>
          <p className="text-xs text-gray-400">
            Keep this URL private. It contains your personal authentication token.
          </p>
        </div>

        {/* Token Security / Rotation Section */}
        <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-gray-800">Token Security</h3>
            <p className="text-xs text-gray-500">
              If your URL was exposed, rotate your token to immediately invalidate it.
            </p>
          </div>
          <RegenerateTokenButton />
        </div>
      </section>
    </div>
  );
}
