import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { regenerateMcpToken } from "@/app/actions/settings";
import { getBaseUrl } from "@/lib/utils";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings — Settlewise" };

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, businessName: true, mcpToken: true },
  });
  if (!user) redirect("/login");

  const appUrl = getBaseUrl();
  const mcpUrl = `${appUrl}/api/mcp?key=${user.mcpToken}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Account */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold uppercase text-gray-400 mb-4">Account</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Name</dt>
            <dd className="text-gray-900">{user.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-gray-500 w-32">Email</dt>
            <dd className="text-gray-900">{user.email}</dd>
          </div>
          {user.businessName && (
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32">Business</dt>
              <dd className="text-gray-900">{user.businessName}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* MCP */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold uppercase text-gray-400 mb-1">
          Claude MCP URL
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Paste this URL into Claude&apos;s MCP settings so Claude can create
          and manage your invoices. Keep it private — it authenticates as you.
        </p>

        <div className="flex items-center gap-2 rounded-md border border-gray-300 bg-gray-50 px-3 py-2">
          <span className="flex-1 font-mono text-xs text-gray-800 break-all">
            {mcpUrl}
          </span>
          <CopyButton text={mcpUrl} />
        </div>

        <form action={regenerateMcpToken} className="mt-4">
          <button
            type="submit"
            className="text-sm text-red-600 hover:text-red-800 hover:underline"
          >
            Regenerate token (invalidates current URL)
          </button>
        </form>
      </section>
    </div>
  );
}
