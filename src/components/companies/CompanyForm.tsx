import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Company, PlacementStatus } from "@/types/database";
import { formatForInputInIST, inputISTToOffsetISOString } from "@/lib/utils";

interface CompanyFormProps {
  company?: Company;
  onSuccess: () => void;
}

export const CompanyForm = ({ company, onSuccess }: CompanyFormProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: company?.name || "",
    description: company?.description || "",
    logo_url: company?.logo_url || "",
    website_url: company?.website_url || "",
  visit_date: company?.visit_date || "",
  registration_deadline: company ? formatForInputInIST((company as any).registration_deadline) : "",
  cgpa_cutoff: company?.cgpa_cutoff?.toString() || "",
  ppt_datetime: company ? formatForInputInIST((company as any).ppt_datetime) : "",
  oa_datetime: company ? formatForInputInIST((company as any).oa_datetime) : "",
  interview_datetime: company ? formatForInputInIST((company as any).interview_datetime) : "",
    offered_ctc: company?.offered_ctc || "",
    ctc_distribution: company?.ctc_distribution || "",
    roles: company?.roles?.join(", ") || "",
    people_selected: company?.people_selected?.toString() || "",
    status: company?.status || "upcoming" as PlacementStatus,
    bond_details: company?.bond_details || "",
    job_location: company?.job_location || "",
    eligibility_criteria: company?.eligibility_criteria || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const payload = {
        name: formData.name,
        description: formData.description || null,
        logo_url: formData.logo_url || null,
        website_url: formData.website_url || null,
        visit_date: formData.visit_date || null,
  ppt_datetime: formData.ppt_datetime ? inputISTToOffsetISOString(formData.ppt_datetime) : null,
  oa_datetime: formData.oa_datetime ? inputISTToOffsetISOString(formData.oa_datetime) : null,
  interview_datetime: formData.interview_datetime ? inputISTToOffsetISOString(formData.interview_datetime) : null,
        offered_ctc: formData.offered_ctc || null,
        ctc_distribution: formData.ctc_distribution || null,
        roles: formData.roles ? formData.roles.split(",").map((r) => r.trim()) : null,
        people_selected: formData.people_selected ? parseInt(formData.people_selected) : null,
        registration_deadline: formData.registration_deadline || null,
        cgpa_cutoff: formData.cgpa_cutoff ? parseFloat(formData.cgpa_cutoff) : null,
        status: formData.status,
        bond_details: formData.bond_details || null,
        job_location: formData.job_location || null,
        eligibility_criteria: formData.eligibility_criteria || null,
      };

      if (company) {
        const { error } = await supabase
          .from("companies")
          .update(payload as any)
          .eq("id", company.id);
        if (error) throw error;
        toast({ title: "Success", description: "Company updated successfully" });
      } else {
        const { error } = await supabase.from("companies").insert(payload as any);
        if (error) throw error;
        toast({ title: "Success", description: "Company added successfully" });
      }

      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Company Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value: PlacementStatus) => setFormData({ ...formData, status: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="logo_url">Logo URL</Label>
          <Input
            id="logo_url"
            type="url"
            value={formData.logo_url}
            onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website_url">Website URL</Label>
          <Input
            id="website_url"
            type="url"
            value={formData.website_url}
            onChange={(e) => setFormData({ ...formData, website_url: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="roles">Roles (comma separated)</Label>
          <Input
            id="roles"
            value={formData.roles}
            onChange={(e) => setFormData({ ...formData, roles: e.target.value })}
            placeholder="SDE, Data Analyst"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="job_location">Job Location</Label>
          <Input
            id="job_location"
            value={formData.job_location}
            onChange={(e) => setFormData({ ...formData, job_location: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="visit_date">Visit Date</Label>
          <Input
            id="visit_date"
            type="date"
            value={formData.visit_date}
            onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="registration_deadline">Registration Deadline</Label>
          <Input
            id="registration_deadline"
            type="datetime-local"
            value={formData.registration_deadline}
            onChange={(e) => setFormData({ ...formData, registration_deadline: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ppt_datetime">PPT Date & Time</Label>
          <Input
            id="ppt_datetime"
            type="datetime-local"
            value={formData.ppt_datetime}
            onChange={(e) => setFormData({ ...formData, ppt_datetime: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cgpa_cutoff">CGPA Cutoff</Label>
          <Input
            id="cgpa_cutoff"
            type="number"
            step="0.01"
            min="0"
            max="10"
            value={formData.cgpa_cutoff}
            onChange={(e) => setFormData({ ...formData, cgpa_cutoff: e.target.value })}
            placeholder="7.5"
          />
        </div>
        <div />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="oa_datetime">OA Date & Time</Label>
          <Input
            id="oa_datetime"
            type="datetime-local"
            value={formData.oa_datetime}
            onChange={(e) => setFormData({ ...formData, oa_datetime: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="interview_datetime">Interview Date & Time</Label>
          <Input
            id="interview_datetime"
            type="datetime-local"
            value={formData.interview_datetime}
            onChange={(e) => setFormData({ ...formData, interview_datetime: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="offered_ctc">Offered CTC</Label>
          <Input
            id="offered_ctc"
            value={formData.offered_ctc}
            onChange={(e) => setFormData({ ...formData, offered_ctc: e.target.value })}
            placeholder="12 LPA"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="people_selected">People Selected</Label>
          <Input
            id="people_selected"
            type="number"
            value={formData.people_selected}
            onChange={(e) => setFormData({ ...formData, people_selected: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ctc_distribution">CTC Distribution</Label>
        <Input
          id="ctc_distribution"
          value={formData.ctc_distribution}
          onChange={(e) => setFormData({ ...formData, ctc_distribution: e.target.value })}
          placeholder="Base: 8L, Bonus: 2L, Stock: 2L"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="eligibility_criteria">Eligibility Criteria</Label>
        <Textarea
          id="eligibility_criteria"
          value={formData.eligibility_criteria}
          onChange={(e) => setFormData({ ...formData, eligibility_criteria: e.target.value })}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="bond_details">Bond Details</Label>
        <Input
          id="bond_details"
          value={formData.bond_details}
          onChange={(e) => setFormData({ ...formData, bond_details: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {company ? "Update Company" : "Add Company"}
      </Button>
    </form>
  );
};
