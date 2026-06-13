import { PageFooter, PageHeader } from "@/app/components/PageHeader";

// Shared layout for the legal pages (/privacy, /terms): white + forest-green
// styling, readable measure, consistent typography.
export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col">
      <PageHeader showUser={false} />
      <article className="flex-1 w-full max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-black text-brand-950 mb-2">{title}</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {lastUpdated}</p>
        <div className="legal-prose space-y-4 text-[15px] leading-relaxed text-gray-700">
          {children}
        </div>
      </article>
      <PageFooter />
    </main>
  );
}

export function LegalH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-bold text-brand-900 pt-6 border-t border-brand-900/10 mt-8">
      {children}
    </h2>
  );
}

export function LegalH3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold text-gray-900 pt-2">{children}</h3>;
}
