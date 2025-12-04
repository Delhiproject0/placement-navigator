import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./StatusBadge";
import { MapPin, Users, ExternalLink } from "lucide-react";
import type { Company } from "@/types/database";
import { computePlacementStatus, formatInISTHuman } from "@/lib/utils";

interface CompanyTableProps {
  companies: Company[];
  loading?: boolean;
}

export const CompanyTable = ({ companies, loading }: CompanyTableProps) => {
  const navigate = useNavigate();
  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return "-";
    return formatInISTHuman(dateTime);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return formatInISTHuman(date).split(',')[0];
  };

  // companies are expected to be pre-sorted by parent; render directly

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Loading companies...
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No companies found.
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Company</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>CGPA</TableHead>
            <TableHead>CTC</TableHead>
            <TableHead>External Form</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Registration Deadline</TableHead>
            <TableHead>PPT</TableHead>
            <TableHead>OA</TableHead>
            <TableHead>Interview</TableHead>
            <TableHead>Selected</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => {
            const reg = company.registration_deadline ? new Date(company.registration_deadline) : null;
            const now = new Date();
            const twelveHours = 12 * 60 * 60 * 1000;
            const isImminent = !!(reg && reg.getTime() - now.getTime() > 0 && reg.getTime() - now.getTime() <= twelveHours);

            return (
              <TableRow key={company.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/companies/${company.id}`)}>
              <TableCell>
                <div className="flex items-center gap-3">
                  {company.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt={company.name}
                      className="h-8 w-8 rounded object-contain bg-muted"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                      {company.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="font-medium">{company.name}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-sm">{company.job_location || '-'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {company.roles?.slice(0, 2).map((role, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                  {(company.roles?.length || 0) > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{(company.roles?.length || 0) - 2}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm">{company.cgpa_cutoff !== null && company.cgpa_cutoff !== undefined ? Number(company.cgpa_cutoff).toFixed(2) : '-'}</TableCell>
              <TableCell className="font-medium">{company.offered_ctc || "-"}</TableCell>
              <TableCell className="text-sm">
                {company.external_form ? (
                  <a
                    href={company.external_form}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    <span className="truncate max-w-[12rem]">{company.external_form}</span>
                  </a>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={computePlacementStatus(company as any)} />
              </TableCell>
              <TableCell className={`text-sm ${isImminent ? 'text-red-600 font-semibold' : ''}`}>{formatDateTime(company.registration_deadline)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(company.ppt_datetime)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(company.oa_datetime)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(company.interview_datetime)}</TableCell>
              <TableCell>
                {company.people_selected !== null ? (
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {company.people_selected}
                  </div>
                ) : (
                  "-"
                )}
              </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
