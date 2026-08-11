import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Edit,
  ExternalLink,
  IndianRupee,
  MapPin,
  Plus,
  Trash,
  Users,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { PhaseChip } from "@/components/companies/PhaseChip";
import { DeadlinePill } from "@/components/companies/DeadlinePill";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { CompanyForm } from "@/components/companies/CompanyForm";
import { ExperienceForm } from "@/components/companies/ExperienceForm";
import { QuestionForm } from "@/components/companies/QuestionForm";
import { RoundTimeline } from "@/components/companies/RoundTimeline";
import { TrackingControls } from "@/components/companies/TrackingControls";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import {
  useCompany,
  useDeleteCompany,
  useDeleteExperience,
  useDeleteQuestion,
  useDeletionImpact,
  useExperiences,
  useQuestions,
} from "@/hooks/queries";
import { resolvePhase } from "@/lib/phase";
import { formatCtc, parseCtcToNumber } from "@/lib/ctc";
import { formatInISTHuman } from "@/lib/utils";
import type { ExperienceWithAuthor, QuestionWithAuthor } from "@/lib/api";

const CompanyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, canEdit, isAdmin } = useAuth();

  const { data: company, isPending, isError } = useCompany(id);
  const { data: experiences = [], isPending: experiencesLoading } = useExperiences(id);
  const { data: questions = [], isPending: questionsLoading } = useQuestions(id);

  const [editOpen, setEditOpen] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingExperience, setEditingExperience] = useState<ExperienceWithAuthor | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuestionWithAuthor | null>(null);

  const deleteCompany = useDeleteCompany();
  const deleteExperience = useDeleteExperience(id ?? "");
  const deleteQuestion = useDeleteQuestion(id ?? "");
  const { data: impact } = useDeletionImpact(id, deleteOpen && isAdmin);

  /**
   * Exact match, not a substring search.
   *
   * This used to be `.ilike('result', '%selected%')`, which also matches
   * "Not Selected" - so the single experience in the live database, a
   * rejection, was being listed as a successful candidate.
   */
  const selected = useMemo(
    () => experiences.filter((entry) => entry.result === "Selected"),
    [experiences],
  );

  /** Owner or moderator. The old UI checked ownership only, so an admin could
      not remove a spam entry from the page it appeared on. */
  const canModerate = (authorId: string | null) => Boolean(user) && (user?.id === authorId || canEdit);

  if (isPending) {
    return (
      <Layout>
        <div className="container space-y-4 py-10">
          <Shimmer className="h-8 w-64 rounded-sm" />
          <Shimmer className="h-4 w-96 rounded-sm" />
          <Shimmer className="h-64 w-full rounded-lg" />
        </div>
      </Layout>
    );
  }

  if (isError || !company) {
    return (
      <Layout>
        <div className="container py-16">
          <EmptyState
            variant="search"
            title="Company not found"
            description="This company may have been removed, or the link is wrong."
            action={
              <Button asChild>
                <Link to="/companies">Back to companies</Link>
              </Button>
            }
          />
        </div>
      </Layout>
    );
  }

  const phase = resolvePhase(company);
  const ctc = parseCtcToNumber(company.offered_ctc);

  return (
    <Layout>
      <div className="border-b border-border bg-muted/25">
        <div className="container py-7">
          <Link
            to="/companies"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All companies
          </Link>

          <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-start">
            <div className="flex min-w-0 items-start gap-4">
              <CompanyLogo name={company.name} url={company.logo_url} className="h-14 w-14 rounded-md" />
              <div className="min-w-0">
                <h1 className="font-display text-3xl font-semibold tracking-tight">{company.name}</h1>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <PhaseChip phase={phase} />
                  {company.job_location && (
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {company.job_location}
                    </span>
                  )}
                  {company.website_url && (
                    <a
                      href={company.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Website
                    </a>
                  )}
                </div>
                {company.description && (
                  <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{company.description}</p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {company.external_form && (
                <Button asChild>
                  <a href={company.external_form} target="_blank" rel="noreferrer">
                    Register
                    <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}

              {canEdit && (
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="font-display">Edit {company.name}</DialogTitle>
                    </DialogHeader>
                    <CompanyForm company={company} onSuccess={() => setEditOpen(false)} />
                  </DialogContent>
                </Dialog>
              )}

              {isAdmin && (
                <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="text-destructive hover:text-destructive">
                      <Trash className="h-4 w-4" />
                      <span className="sr-only">Delete company</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {company.name}?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2">
                          <span className="block">This cannot be undone.</span>
                          {/* Naming what else goes matters: the cascade takes
                              student-written content with it. */}
                          {impact && (impact.experiences > 0 || impact.questions > 0) && (
                            <span className="block rounded-sm border border-destructive/25 bg-destructive/10 p-2.5 text-destructive">
                              This will also delete {impact.experiences} interview{" "}
                              {impact.experiences === 1 ? "experience" : "experiences"} and{" "}
                              {impact.questions} {impact.questions === 1 ? "question" : "questions"}{" "}
                              contributed by students.
                            </span>
                          )}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          await deleteCompany.mutateAsync(company.id);
                          navigate("/companies");
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete permanently
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container grid gap-8 py-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>

            <TabsContent value="experiences" className="mt-5 space-y-3">
              <div className="flex justify-end">
                {user ? (
                  <Dialog open={experienceOpen} onOpenChange={setExperienceOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Share your experience
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="font-display">Share your experience</DialogTitle>
                      </DialogHeader>
                      <ExperienceForm companyId={company.id} onSuccess={() => setExperienceOpen(false)} />
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/auth">Sign in to contribute</Link>
                  </Button>
                )}
              </div>

              {experiencesLoading ? (
                <Shimmer className="h-40 w-full rounded-lg" />
              ) : experiences.length === 0 ? (
                <EmptyState
                  variant="experiences"
                  title="No experiences yet"
                  description="Nobody has written up this drive. If you sat it, you would be the first."
                />
              ) : (
                experiences.map((entry) => (
                  <ContributionCard
                    key={entry.id}
                    title={entry.round_name}
                    author={entry.author?.full_name ?? null}
                    createdAt={entry.created_at}
                    badges={[entry.difficulty, entry.result].filter(Boolean) as string[]}
                    body={entry.experience}
                    footer={entry.tips ? { label: "Tips", text: entry.tips } : undefined}
                    canModerate={canModerate(entry.user_id)}
                    onEdit={() => setEditingExperience(entry)}
                    onDelete={() => deleteExperience.mutate(entry.id)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="questions" className="mt-5 space-y-3">
              <div className="flex justify-end">
                {user ? (
                  <Dialog open={questionOpen} onOpenChange={setQuestionOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-1.5 h-4 w-4" />
                        Add a question
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="font-display">Add a question</DialogTitle>
                      </DialogHeader>
                      <QuestionForm companyId={company.id} onSuccess={() => setQuestionOpen(false)} />
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/auth">Sign in to contribute</Link>
                  </Button>
                )}
              </div>

              {questionsLoading ? (
                <Shimmer className="h-40 w-full rounded-lg" />
              ) : questions.length === 0 ? (
                <EmptyState
                  variant="questions"
                  title="No questions yet"
                  description="Add the questions you were asked so the next batch can prepare."
                />
              ) : (
                questions.map((entry) => (
                  <ContributionCard
                    key={entry.id}
                    title={entry.question}
                    author={entry.author?.full_name ?? null}
                    createdAt={entry.created_at}
                    badges={[entry.question_type, entry.topic].filter(Boolean) as string[]}
                    body={entry.answer ?? ""}
                    canModerate={canModerate(entry.user_id)}
                    onEdit={() => setEditingQuestion(entry)}
                    onDelete={() => deleteQuestion.mutate(entry.id)}
                  />
                ))
              )}
            </TabsContent>
            <TabsContent value="documents" className="mt-5">
              <AttachmentsPanel
                entityType="company"
                entityId={company.id}
                canUpload={canEdit}
                description={
                  canEdit
                    ? "Job descriptions, offer letters, question papers and feedback forms."
                    : "Files attached by the placement team."
                }
              />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-5">
          {user && <TrackingControls companyId={company.id} />}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base">Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <RoundTimeline company={company} />
              {company.registration_deadline && (
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5" />
                    Registration
                  </span>
                  <DeadlinePill deadline={company.registration_deadline} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base">Compensation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Detail
                icon={IndianRupee}
                label="Offered CTC"
                value={company.offered_ctc ?? "Not disclosed"}
                hint={ctc ? formatCtc(ctc) : undefined}
              />
              {company.ctc_distribution && (
                <Detail icon={IndianRupee} label="Breakdown" value={company.ctc_distribution} />
              )}
              {company.cgpa_cutoff != null && (
                <Detail icon={Building2} label="CGPA cutoff" value={Number(company.cgpa_cutoff).toFixed(2)} />
              )}
              {company.people_selected != null && (
                <Detail icon={Users} label="Selected" value={String(company.people_selected)} />
              )}
              {company.bond_details && <Detail icon={Building2} label="Bond" value={company.bond_details} />}
              {company.eligibility_criteria && (
                <Detail icon={Building2} label="Eligibility" value={company.eligibility_criteria} />
              )}
            </CardContent>
          </Card>

          {selected.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base">Reported offers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selected.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2.5 text-sm">
                    <span className="grid h-7 w-7 place-items-center rounded-[999px] bg-success/12 text-2xs font-semibold text-success">
                      {(entry.author?.full_name ?? "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="truncate">{entry.author?.full_name ?? "Anonymous"}</span>
                    <span className="ml-auto shrink-0 text-2xs text-muted-foreground">{entry.round_name}</span>
                  </div>
                ))}
                <p className="pt-1 text-2xs text-muted-foreground">
                  Self-reported by students, not verified by the placement office.
                </p>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      {/* Edit dialogs, driven by whichever row opened them. */}
      <Dialog open={Boolean(editingExperience)} onOpenChange={(open) => !open && setEditingExperience(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit experience</DialogTitle>
          </DialogHeader>
          {editingExperience && (
            <ExperienceForm
              companyId={company.id}
              experience={editingExperience}
              onSuccess={() => setEditingExperience(null)}
              onCancel={() => setEditingExperience(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingQuestion)} onOpenChange={(open) => !open && setEditingQuestion(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Edit question</DialogTitle>
          </DialogHeader>
          {editingQuestion && (
            <QuestionForm
              companyId={company.id}
              question={editingQuestion}
              onSuccess={() => setEditingQuestion(null)}
              onCancel={() => setEditingQuestion(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

function Detail({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words">
          {value}
          {hint && <span className="ml-1.5 font-mono text-2xs tabular text-muted-foreground">({hint})</span>}
        </p>
      </div>
    </div>
  );
}

interface ContributionCardProps {
  title: string;
  author: string | null;
  createdAt: string;
  badges: string[];
  body: string;
  footer?: { label: string; text: string };
  canModerate: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function ContributionCard({
  title,
  author,
  createdAt,
  badges,
  body,
  footer,
  canModerate,
  onEdit,
  onDelete,
}: ContributionCardProps) {
  return (
    <article className="rounded-lg border border-border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{title}</h3>
          <p className="mt-1 text-2xs text-muted-foreground">
            {author ?? "Anonymous"} - {formatInISTHuman(createdAt)}
          </p>
        </div>
        {canModerate && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit">
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Delete">
                  <Trash className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {badges.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <Badge key={badge} variant="outline" className="text-2xs font-normal">
              {badge}
            </Badge>
          ))}
        </div>
      )}

      {body && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{body}</p>}

      {footer && (
        <div className="mt-4 rounded-sm border-l-2 border-accent bg-accent/8 p-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-accent">{footer.label}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{footer.text}</p>
        </div>
      )}
    </article>
  );
}

export default CompanyDetail;
