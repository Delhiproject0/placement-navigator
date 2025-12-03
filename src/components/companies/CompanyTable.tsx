import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { ExternalLink, MapPin, Users } from "lucide-react";
import type { Company } from "@/types/database";

interface CompanyTableProps {
  companies: Company[];
  loading?: boolean;
}

export const CompanyTable = ({ companies, loading }: CompanyTableProps) => {
  const formatDateTime = (dateTime: string | null) => {
    if (!dateTime) return "-";
    return format(new Date(dateTime), "MMM d, yyyy h:mm a");
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return format(new Date(date), "MMM d, yyyy");
  };

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
            <TableHead>Roles</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Visit Date</TableHead>
            <TableHead>PPT</TableHead>
            <TableHead>OA</TableHead>
            <TableHead>Interview</TableHead>
            <TableHead>CTC</TableHead>
            <TableHead>Selected</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {companies.map((company) => (
            <TableRow key={company.id}>
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
                    {company.job_location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {company.job_location}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
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
              <TableCell>
                <StatusBadge status={company.status} />
              </TableCell>
              <TableCell className="text-sm">{formatDate(company.visit_date)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(company.ppt_datetime)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(company.oa_datetime)}</TableCell>
              <TableCell className="text-sm">{formatDateTime(company.interview_datetime)}</TableCell>
              <TableCell className="font-medium">{company.offered_ctc || "-"}</TableCell>
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
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/companies/${company.id}`}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
