import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { CompanyTable } from "@/components/companies/CompanyTable";
import { CompanyForm } from "@/components/companies/CompanyForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, ChevronDown, ChevronUp } from "lucide-react";
import { computePlacementStatus } from "@/lib/utils";
import type { Company, PlacementStatus } from "@/types/database";

const Companies = () => {
  const { canEdit } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlacementStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"name" | "registration_deadline" | "oa" | "interview" | "ctc" | "status">("registration_deadline");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      // ensure new fields exist to satisfy Company type
      const anyData = (data || []) as any[];
      const normalized = anyData.map((d) => ({
        ...d,
        registration_deadline: d.registration_deadline ?? null,
        cgpa_cutoff: d.cgpa_cutoff ?? null,
      }));
      setCompanies(normalized);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = company.name.toLowerCase().includes(search.toLowerCase()) ||
      company.roles?.some((role) => role.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || company.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sortedCompanies = useMemo(() => {
    const safeDate = (v?: string | null) => (v ? new Date(v).getTime() : 0);
    const parseCTC = (s?: string | null) => {
      if (!s) return 0;
      const m = s.match(/([\d,.]+)/);
      if (!m) return 0;
      // remove commas and parse
      return parseFloat(m[1].replace(/,/g, '')) || 0;
    };

    const list = [...filteredCompanies];
    const now = new Date();
    const statusOrder = [
      'completed',
      'interviews_done',
      'oa_done',
      'ppt_done',
      'registration_done',
      'registration_pending',
      'ongoing',
      'upcoming',
      'cancelled',
    ];
    if (sortBy === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortBy === 'registration_deadline') return list.sort((a, b) => safeDate(a.registration_deadline) - safeDate(b.registration_deadline));
    if (sortBy === 'oa') return list.sort((a, b) => safeDate(a.oa_datetime) - safeDate(b.oa_datetime));
    if (sortBy === 'interview') return list.sort((a, b) => safeDate(a.interview_datetime) - safeDate(b.interview_datetime));
    if (sortBy === 'ctc') return list.sort((a, b) => parseCTC(b.offered_ctc) - parseCTC(a.offered_ctc));
    if (sortBy === 'status') {
      return list.sort((a, b) => {
        const aStatus = computePlacementStatus(a as any);
        const bStatus = computePlacementStatus(b as any);

        // registration done/pending logic
        const regA = a.registration_deadline ? new Date(a.registration_deadline) : null;
        const regB = b.registration_deadline ? new Date(b.registration_deadline) : null;
        const aKey = aStatus === 'upcoming' && regA ? (now > regA ? 'registration_done' : 'registration_pending') : aStatus;
        const bKey = bStatus === 'upcoming' && regB ? (now > regB ? 'registration_done' : 'registration_pending') : bStatus;

        const aIndex = statusOrder.indexOf(aKey as string);
        const bIndex = statusOrder.indexOf(bKey as string);
        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        // For descending (default), order by lower index first (completed first)
        return sortDir === 'desc' ? aIndex - bIndex : bIndex - aIndex;
      });
    }
    return list;
  }, [filteredCompanies, sortBy]);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
            <p className="text-muted-foreground mt-1">
              View all placement companies and their details
            </p>
          </div>
          {canEdit && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Company
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Company</DialogTitle>
                </DialogHeader>
                <CompanyForm
                  onSuccess={() => {
                    setDialogOpen(false);
                    fetchCompanies();
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies or roles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as PlacementStatus | "all")}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="upcoming">Upcoming</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="registration_deadline">Registration Deadline</SelectItem>
                  <SelectItem value="ctc">CTC</SelectItem>
                  <SelectItem value="oa">OA Date</SelectItem>
                  <SelectItem value="interview">Interview Date</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                className="inline-flex items-center justify-center h-9 w-9 rounded border bg-muted/10"
                onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
                title="Toggle sort direction"
              >
                {sortDir === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        <CompanyTable companies={sortedCompanies} loading={loading} />
      </div>
    </Layout>
  );
};

export default Companies;
