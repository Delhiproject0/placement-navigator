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

const Index = () => {
  const [recentCompanies, setRecentCompanies] = useState<Company[]>([]);
  const [upcomingCompanies, setUpcomingCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState({ total: 0, upcoming: 0, completed: 0, selected: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const [allRes, upcomingRes] = await Promise.all([
      supabase.from("companies").select("*").order("created_at", { ascending: false }).limit(5),
      supabase.from("companies").select("*").eq("status", "upcoming").order("visit_date", { ascending: true }).limit(5),
    ]);

    setRecentCompanies(allRes.data || []);
    setUpcomingCompanies(upcomingRes.data || []);

    const { data: allCompanies } = await supabase.from("companies").select("status, people_selected");
    if (allCompanies) {
      setStats({
        total: allCompanies.length,
        upcoming: allCompanies.filter((c) => c.status === "upcoming").length,
        completed: allCompanies.filter((c) => c.status === "completed").length,
        selected: allCompanies.reduce((sum, c) => sum + (c.people_selected || 0), 0),
      });
    }
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
              <CardTitle>Recently Added</CardTitle>
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
