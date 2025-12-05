import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { formatInISTHuman } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { StatusBadge } from "@/components/companies/StatusBadge";
import { CompanyForm } from "@/components/companies/CompanyForm";
import { ExperienceForm } from "@/components/companies/ExperienceForm";
import { QuestionForm } from "@/components/companies/QuestionForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Building2, Calendar, DollarSign, Edit, ExternalLink, MapPin, Plus, Users, Trash } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { Company, InterviewExperience, InterviewQuestion } from "@/types/database";

// Inline edit form for experiences
function ExperienceEditForm({ experience, onCancel, onSaved }: { experience: InterviewExperience; onCancel: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    round_name: experience.round_name || "",
    experience: experience.experience || "",
    difficulty: experience.difficulty || "",
    result: experience.result || "",
    tips: experience.tips || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from("interview_experiences")
        .update({
          round_name: formData.round_name,
          experience: formData.experience,
          difficulty: formData.difficulty || null,
          result: formData.result || null,
          tips: formData.tips || null,
        })
        .eq("id", experience.id);
      if (error) throw error;
      toast({ title: "Success", description: "Experience updated" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="round_name">Round Name</Label>
        <Input id="round_name" value={formData.round_name} onChange={(e) => setFormData({ ...formData, round_name: e.target.value })} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="experience">Experience</Label>
        <Textarea id="experience" value={formData.experience} onChange={(e) => setFormData({ ...formData, experience: e.target.value })} rows={5} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Input id="difficulty" value={formData.difficulty} onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="result">Result</Label>
          <Input id="result" value={formData.result} onChange={(e) => setFormData({ ...formData, result: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="tips">Tips</Label>
        <Textarea id="tips" value={formData.tips} onChange={(e) => setFormData({ ...formData, tips: e.target.value })} rows={3} />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} type="button">Cancel</Button>
        <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
      </div>
    </form>
  );
}

// Inline edit form for questions
function QuestionEditForm({ question, onCancel, onSaved }: { question: InterviewQuestion; onCancel: () => void; onSaved: () => void }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    question: question.question || "",
    answer: question.answer || "",
    topic: question.topic || "",
    question_type: question.question_type || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase
        .from("interview_questions")
        .update({
          question: formData.question,
          answer: formData.answer || null,
          topic: formData.topic || null,
          question_type: formData.question_type || null,
        })
        .eq("id", question.id);
      if (error) throw error;
      toast({ title: "Success", description: "Question updated" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="question">Question</Label>
        <Textarea id="question" value={formData.question} onChange={(e) => setFormData({ ...formData, question: e.target.value })} rows={3} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="answer">Answer</Label>
        <Textarea id="answer" value={formData.answer} onChange={(e) => setFormData({ ...formData, answer: e.target.value })} rows={4} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" value={formData.topic} onChange={(e) => setFormData({ ...formData, topic: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="question_type">Type</Label>
          <Input id="question_type" value={formData.question_type} onChange={(e) => setFormData({ ...formData, question_type: e.target.value })} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} type="button">Cancel</Button>
        <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
      </div>
    </form>
  );
}

const CompanyDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { canEdit, user } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [experiences, setExperiences] = useState<InterviewExperience[]>([]);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [selectedProfiles, setSelectedProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [experienceDialogOpen, setExperienceDialogOpen] = useState(false);
  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editExperienceOpen, setEditExperienceOpen] = useState(false);
  const [editQuestionOpen, setEditQuestionOpen] = useState(false);
  const [currentExperience, setCurrentExperience] = useState<InterviewExperience | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<InterviewQuestion | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchCompany();
      fetchExperiences();
      fetchQuestions();
      fetchSelectedProfiles();
    }
  }, [id]);

  const fetchCompany = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      const anyData = data as any;
      setCompany({
        ...anyData,
        registration_deadline: anyData.registration_deadline ?? null,
        cgpa_cutoff: anyData.cgpa_cutoff ?? null,
      });
    } catch (error) {
      console.error("Error fetching company:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExperiences = async () => {
    try {
      const { data, error } = await supabase
        .from("interview_experiences")
        .select("*")
        .eq("company_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setExperiences(data || []);
    } catch (error) {
      console.error("Error fetching experiences:", error);
    }
  };

  const fetchSelectedProfiles = async () => {
    try {
      // Get user_ids from interview_experiences where result indicates selected
      const { data: selData, error: selErr } = await supabase
        .from('interview_experiences')
        .select('user_id')
        .eq('company_id', id)
        .filter('user_id', 'not.is', null)
        .ilike('result', '%selected%');

      if (selErr) throw selErr;

      const userIds = Array.from(new Set((selData || []).map((r: any) => r.user_id))).filter(Boolean);

      if (userIds.length === 0) {
        setSelectedProfiles([]);
        return;
      }

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      if (profErr) throw profErr;
      setSelectedProfiles(profiles || []);
    } catch (error) {
      console.error('Error fetching selected profiles:', error);
    }
  };

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from("interview_questions")
        .select("*")
        .eq("company_id", id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error("Error fetching questions:", error);
    }
  };

  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return "Not scheduled";
    return formatInISTHuman(dateTime);
  };

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        </div>
      </Layout>
    );
  }

  if (!company) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-2">Company not found</h1>
            <Button asChild>
              <Link to="/companies">Back to Companies</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <Button variant="ghost" asChild className="mb-6">
          <Link to="/companies">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Companies
          </Link>
        </Button>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    {company.logo_url ? (
                      <img
                        src={company.logo_url}
                        alt={company.name}
                        className="h-16 w-16 rounded-lg object-contain bg-muted"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-8 w-8 text-primary" />
                      </div>
                    )}
                    <div>
                      <CardTitle className="text-2xl">{company.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-2">
                        <StatusBadge status={company.status} />
                        {company.website_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={company.website_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Company</DialogTitle>
                        </DialogHeader>
                        <CompanyForm
                          company={company}
                          onSuccess={() => {
                            setEditDialogOpen(false);
                            fetchCompany();
                          }}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {company.roles && company.roles.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Roles</h4>
                    <div className="flex flex-wrap gap-2">
                      {company.roles.map((role, i) => (
                        <Badge key={i} variant="secondary">{role}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {company.description && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Description</h4>
                    <p className="text-sm">{company.description}</p>
                  </div>
                )}

                {company.eligibility_criteria && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Eligibility Criteria</h4>
                    <p className="text-sm">{company.eligibility_criteria}</p>
                  </div>
                )}

                {company.ctc_distribution && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">CTC Distribution</h4>
                    <p className="text-sm">{company.ctc_distribution}</p>
                  </div>
                )}

                {company.bond_details && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">Bond Details</h4>
                    <p className="text-sm">{company.bond_details}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Tabs defaultValue="experiences">
              <TabsList>
                <TabsTrigger value="experiences">
                  Experiences ({experiences.length})
                </TabsTrigger>
                <TabsTrigger value="questions">
                  Questions ({questions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="experiences" className="mt-4 space-y-4">
                {user && (
                  <Dialog open={experienceDialogOpen} onOpenChange={setExperienceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Share Experience
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Share Interview Experience</DialogTitle>
                      </DialogHeader>
                      <ExperienceForm
                        companyId={company.id}
                        onSuccess={() => {
                          setExperienceDialogOpen(false);
                          fetchExperiences();
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                )}

                {experiences.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No experiences shared yet. Be the first to share!
                    </CardContent>
                  </Card>
                ) : (
                  experiences.map((exp) => (
                    <Card key={exp.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{exp.round_name}</CardTitle>
                          <div className="flex items-center gap-2">
                            {exp.difficulty && (
                              <Badge variant="outline">{exp.difficulty}</Badge>
                            )}
                            {exp.result && (
                              <Badge variant={exp.result === "Selected" ? "default" : "secondary"}>
                                {exp.result}
                              </Badge>
                            )}
                            {user && user.id === exp.user_id && (
                              <div className="flex items-center gap-1">
                                <Dialog open={editExperienceOpen && currentExperience?.id === exp.id} onOpenChange={setEditExperienceOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setCurrentExperience(exp); setEditExperienceOpen(true); }}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit Experience</DialogTitle>
                                    </DialogHeader>
                                    <ExperienceEditForm
                                      experience={exp}
                                      onCancel={() => { setEditExperienceOpen(false); setCurrentExperience(null); }}
                                      onSaved={() => { setEditExperienceOpen(false); setCurrentExperience(null); fetchExperiences(); }}
                                    />
                                  </DialogContent>
                                </Dialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete experience?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently remove the experience. Are you sure?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={async () => { setProcessingId(exp.id); try { const { error } = await supabase.from('interview_experiences').delete().eq('id', exp.id); if (error) throw error; fetchExperiences(); toast({ title: 'Deleted', description: 'Experience removed' }); } catch (err: any) { toast({ title: 'Error', description: err.message || 'Failed to delete', variant: 'destructive' }); } finally { setProcessingId(null); } }}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm whitespace-pre-wrap">{exp.experience}</p>
                        {exp.tips && (
                          <div className="bg-muted/50 p-3 rounded-md">
                            <p className="text-sm font-medium mb-1">Tips</p>
                            <p className="text-sm text-muted-foreground">{exp.tips}</p>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(exp.created_at), "MMMM d, yyyy")}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              <TabsContent value="questions" className="mt-4 space-y-4">
                {user && (
                  <Dialog open={questionDialogOpen} onOpenChange={setQuestionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Question
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Interview Question</DialogTitle>
                      </DialogHeader>
                      <QuestionForm
                        companyId={company.id}
                        onSuccess={() => {
                          setQuestionDialogOpen(false);
                          fetchQuestions();
                        }}
                      />
                    </DialogContent>
                  </Dialog>
                )}

                {questions.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      No questions added yet. Be the first to contribute!
                    </CardContent>
                  </Card>
                ) : (
                  questions.map((q) => (
                    <Card key={q.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2 flex-1">
                            <p className="font-medium">{q.question}</p>
                            {q.answer && (
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {q.answer}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {q.topic && <Badge variant="outline">{q.topic}</Badge>}
                            {q.question_type && (
                              <Badge variant="secondary" className="text-xs">
                                {q.question_type}
                              </Badge>
                            )}
                            {user && user.id === q.user_id && (
                              <div className="flex items-center gap-1 mt-2">
                                <Dialog open={editQuestionOpen && currentQuestion?.id === q.id} onOpenChange={setEditQuestionOpen}>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="sm" onClick={() => { setCurrentQuestion(q); setEditQuestionOpen(true); }}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>Edit Question</DialogTitle>
                                    </DialogHeader>
                                    <QuestionEditForm
                                      question={q}
                                      onCancel={() => { setEditQuestionOpen(false); setCurrentQuestion(null); }}
                                      onSaved={() => { setEditQuestionOpen(false); setCurrentQuestion(null); fetchQuestions(); }}
                                    />
                                  </DialogContent>
                                </Dialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm">
                                      <Trash className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete question?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently remove the question. Are you sure?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={async () => { setProcessingId(q.id); try { const { error } = await supabase.from('interview_questions').delete().eq('id', q.id); if (error) throw error; fetchQuestions(); toast({ title: 'Deleted', description: 'Question removed' }); } catch (err: any) { toast({ title: 'Error', description: err.message || 'Failed to delete', variant: 'destructive' }); } finally { setProcessingId(null); } }}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Visit Date</p>
                    <p className="text-sm text-muted-foreground">
                      {company.visit_date
                        ? format(new Date(company.visit_date), "MMMM d, yyyy")
                        : "Not scheduled"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">PPT</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(company.ppt_datetime)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Online Assessment</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(company.oa_datetime)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Interview</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(company.interview_datetime)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Compensation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Offered CTC</p>
                    <p className="text-lg font-semibold text-primary">
                      {company.offered_ctc || "Not disclosed"}
                    </p>
                  </div>
                </div>
                {company.job_location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Location</p>
                      <p className="text-sm text-muted-foreground">{company.job_location}</p>
                    </div>
                  </div>
                )}
                {company.people_selected !== null && (
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">People Selected</p>
                      <p className="text-lg font-semibold">{company.people_selected}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Selected Applicants</CardTitle>
              </CardHeader>
              <CardContent>
                {selectedProfiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No selected applicants recorded yet.</p>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Total selected: {selectedProfiles.length}</p>
                    <div className="flex flex-col gap-2">
                      {selectedProfiles.map((p) => (
                        <div key={p.id} className="flex items-center gap-3">
                          <img src={p.avatar_url || '/placeholder.svg'} alt={p.full_name || p.email} className="h-8 w-8 rounded-full object-cover bg-muted" />
                          <div>
                            <div className="font-medium">{p.full_name || p.email}</div>
                            <div className="text-xs text-muted-foreground">{p.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CompanyDetail;
