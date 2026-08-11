import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMyContributions } from "@/hooks/queries";
import { formatInISTHuman } from "@/lib/utils";

const Contributions = () => {
  const { data, isPending } = useMyContributions(true);
  const experiences = data?.experiences ?? [];
  const questions = data?.questions ?? [];

  return (
    <Layout>
      <div className="container max-w-3xl py-8 md:py-10">
        <div className="mb-7">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your contributions</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Everything you have shared. Edit or remove any of it from the company's own page.
          </p>
        </div>

        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Shimmer key={index} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <Tabs defaultValue="experiences">
            <TabsList>
              <TabsTrigger value="experiences">
                Experiences
                <span className="ml-1.5 font-mono text-2xs tabular text-muted-foreground">
                  {experiences.length}
                </span>
              </TabsTrigger>
              <TabsTrigger value="questions">
                Questions
                <span className="ml-1.5 font-mono text-2xs tabular text-muted-foreground">
                  {questions.length}
                </span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="experiences" className="mt-5 space-y-3">
              {experiences.length === 0 ? (
                <EmptyState
                  variant="experiences"
                  title="You have not written up a drive yet"
                  description="If you have sat an interview, the next batch would find your account of it useful."
                  action={
                    <Button asChild>
                      <Link to="/companies">Find a company</Link>
                    </Button>
                  }
                />
              ) : (
                experiences.map((entry) => (
                  <Item
                    key={entry.id}
                    companyId={entry.companies?.id}
                    companyName={entry.companies?.name}
                    title={entry.round_name}
                    body={entry.experience}
                    createdAt={entry.created_at}
                    badges={[entry.difficulty, entry.result].filter(Boolean) as string[]}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="questions" className="mt-5 space-y-3">
              {questions.length === 0 ? (
                <EmptyState
                  variant="questions"
                  title="No questions added yet"
                  description="Add the questions you were asked so others can prepare for them."
                />
              ) : (
                questions.map((entry) => (
                  <Item
                    key={entry.id}
                    companyId={entry.companies?.id}
                    companyName={entry.companies?.name}
                    title={entry.question}
                    body={entry.answer ?? ""}
                    createdAt={entry.created_at}
                    badges={[entry.question_type, entry.topic].filter(Boolean) as string[]}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
};

interface ItemProps {
  companyId?: string;
  companyName?: string;
  title: string;
  body: string;
  createdAt: string;
  badges: string[];
}

function Item({ companyId, companyName, title, body, createdAt, badges }: ItemProps) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {companyId && (
            <Link
              to={`/companies/${companyId}`}
              className="text-2xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {companyName}
            </Link>
          )}
          <h2 className="mt-0.5 truncate font-medium">{title}</h2>
        </div>
        <span className="shrink-0 text-2xs text-muted-foreground">{formatInISTHuman(createdAt)}</span>
      </div>

      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge} variant="outline" className="text-2xs font-normal">
              {badge}
            </Badge>
          ))}
        </div>
      )}

      {body && <p className="mt-2.5 line-clamp-3 text-sm text-muted-foreground">{body}</p>}
    </article>
  );
}

export default Contributions;
