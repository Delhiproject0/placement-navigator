import { Link } from "react-router-dom";
import { BookmarkX } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { CompanyTable } from "@/components/companies/CompanyTable";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useBookmarks } from "@/hooks/queries";
import type { Company } from "@/types/database";

const Bookmarks = () => {
  const { data: bookmarks = [], isPending } = useBookmarks(true);

  // The API returns the join row; the table wants companies. A bookmark whose
  // company was deleted is filtered out rather than rendered as a blank row.
  const companies = bookmarks
    .map((bookmark) => bookmark.companies)
    .filter((company): company is Company => Boolean(company));

  return (
    <Layout>
      <div className="container py-8 md:py-10">
        <div className="mb-7">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Saved companies</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isPending
              ? "Loading"
              : `${companies.length} ${companies.length === 1 ? "company" : "companies"} saved`}
          </p>
        </div>

        <CompanyTable
          companies={companies}
          loading={isPending}
          empty={
            <EmptyState
              variant="bookmarks"
              title="Nothing saved yet"
              description="Save a company from its page and it will show up here, so you can keep an eye on its deadline."
              action={
                <Button asChild>
                  <Link to="/companies">Browse companies</Link>
                </Button>
              }
            />
          }
        />

        {companies.length > 0 && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <BookmarkX className="h-3.5 w-3.5" />
            Unsave from a company's own page.
          </p>
        )}
      </div>
    </Layout>
  );
};

export default Bookmarks;
