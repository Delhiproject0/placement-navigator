import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/layout/Layout";
import { StatusBadge } from "@/components/companies/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Building2, Calendar, TrendingUp, Users } from "lucide-react";
import type { Company } from "@/types/database";
import { computePlacementStatus } from "@/lib/utils";

const Index = () => {
  const [recentCompanies, setRecentCompanies] = useState<Company[]>([]);
  const [upcomingCompanies, setUpcomingCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState({ total: 0, upcoming: 0, completed: 0, selected: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Fetch all companies and compute upcoming/recent based on date fields
    const { data: allCompanies } = await supabase.from("companies").select("*");
    const all = (allCompanies || []) as Company[];
    const now = new Date();

    // For each company compute future dates and past dates arrays
    const withDates = all.map((c) => {
      const dates = [c.registration_deadline, c.ppt_datetime, c.oa_datetime, c.interview_datetime]
        .map((d) => (d ? new Date(d) : null))
        .filter(Boolean) as Date[];
      const futureDates = dates.filter((d) => d.getTime() > now.getTime());
      const pastDates = dates.filter((d) => d.getTime() <= now.getTime());
      const nextUpcoming = futureDates.length ? new Date(Math.min(...futureDates.map((d) => d.getTime()))) : null;
      const mostRecentPast = pastDates.length ? new Date(Math.max(...pastDates.map((d) => d.getTime()))) : null;
      return { company: c, nextUpcoming, mostRecentPast };
    });

    // Upcoming: prioritize companies that have a pending registration_deadline.
    const regUpcoming = withDates
      .filter((w) => w.company.registration_deadline && new Date(w.company.registration_deadline!).getTime() > now.getTime())
      .sort((a, b) => new Date(a.company.registration_deadline!).getTime() - new Date(b.company.registration_deadline!).getTime())
      .map((w) => w.company);

    // If we don't have enough registration-based upcoming, fill with other upcoming events (nearest nextUpcoming)
    const otherUpcoming = withDates
      .filter((w) => w.nextUpcoming && (!w.company.registration_deadline || new Date(w.company.registration_deadline!).getTime() <= now.getTime()))
      .sort((a, b) => a.nextUpcoming!.getTime() - b.nextUpcoming!.getTime())
      .map((w) => w.company);

    const combinedUpcoming = Array.from(new Set([...regUpcoming, ...otherUpcoming])).slice(0, 5);

    // Recent (Recently completed): interview passed OR (interview is null AND OA passed)
    const recentCompleted = withDates
      .filter((w) => {
        const iv = w.company.interview_datetime ? new Date(w.company.interview_datetime) : null;
        const oa = w.company.oa_datetime ? new Date(w.company.oa_datetime) : null;
        if (iv && iv.getTime() <= now.getTime()) return true;
        if (!iv && oa && oa.getTime() <= now.getTime()) return true;
        return false;
      })
      .sort((a, b) => {
        const aDate = a.company.interview_datetime ? new Date(a.company.interview_datetime).getTime() : (a.company.oa_datetime ? new Date(a.company.oa_datetime!).getTime() : 0);
        const bDate = b.company.interview_datetime ? new Date(b.company.interview_datetime).getTime() : (b.company.oa_datetime ? new Date(b.company.oa_datetime!).getTime() : 0);
        return bDate - aDate;
      })
      .slice(0, 5)
      .map((w) => w.company);

    

    // Stats computed from date-based rules
    const total = all.length;
    const upcomingCount = all.filter((c) => c.registration_deadline && new Date(c.registration_deadline).getTime() > now.getTime()).length;
    const completedCount = all.filter((c) => {
      const iv = c.interview_datetime ? new Date(c.interview_datetime) : null;
      const oa = c.oa_datetime ? new Date(c.oa_datetime) : null;
      if (iv && iv.getTime() <= now.getTime()) return true;
      if (!iv && oa && oa.getTime() <= now.getTime()) return true;
      return false;
    }).length;
    const selectedCount = all.reduce((sum, c) => sum + (c.people_selected || 0), 0);

    setStats({ total, upcoming: upcomingCount, completed: completedCount, selected: selectedCount });

    setUpcomingCompanies(combinedUpcoming);
    setRecentCompanies(recentCompleted);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8">
        <section className="text-center py-12 mb-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Placement Tracker
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Track placement companies, share interview experiences, and prepare better together.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link to="/companies">
                View Companies
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Companies</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.upcoming}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Selected</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.selected}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Upcoming Companies</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/companies?status=upcoming">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {upcomingCompanies.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No upcoming companies
                </p>
              ) : (
                <div className="space-y-4">
                  {upcomingCompanies.map((company) => (
                    <Link
                      key={company.id}
                      to={`/companies/${company.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {company.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{company.name}</p>
                          <div className="flex items-center gap-2">
                            {company.roles?.slice(0, 2).map((role, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {role}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={company.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Recently Completed</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/companies">View all</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {recentCompanies.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No companies added yet
                </p>
              ) : (
                <div className="space-y-4">
                  {recentCompanies.map((company) => (
                    <Link
                      key={company.id}
                      to={`/companies/${company.id}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary font-semibold">
                          {company.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium">{company.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {company.offered_ctc || "CTC not disclosed"}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={company.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Index;
