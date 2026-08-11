import { useState } from "react";
import { Building2, FileText, MessageSquareText, Search, Shield, Trash, Users } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  useAdminStats,
  useAdminUsers,
  useDeleteUser,
  useSetUserActive,
  useSetUserRole,
} from "@/hooks/queries";
import { formatInISTHuman } from "@/lib/utils";
import type { AdminUser } from "@/lib/api";

const ROLES: Array<AdminUser["role"]> = ["viewer", "editor", "admin"];

const Admin = () => {
  const { user, isAdmin, loading } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const usersQuery = useAdminUsers(search, page, isAdmin);
  const statsQuery = useAdminStats(isAdmin);
  const setRole = useSetUserRole();
  const setActive = useSetUserActive();
  const deleteUser = useDeleteUser();

  // Gate on `loading` first. Without it an admin sees "Access denied" flash on
  // every hard refresh, because the role is not known on the first render.
  if (loading) {
    return (
      <Layout>
        <div className="container space-y-4 py-10">
          <Shimmer className="h-8 w-56 rounded-sm" />
          <Shimmer className="h-64 w-full rounded-lg" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="container py-16">
          <EmptyState
            variant="error"
            title="Admins only"
            description={
              user
                ? "Your account does not have admin access. Ask an existing admin if you need it."
                : "Sign in with an admin account to manage users."
            }
          />
        </div>
      </Layout>
    );
  }

  const users = usersQuery.data?.users ?? [];
  const total = usersQuery.data?.total ?? 0;
  const perPage = usersQuery.data?.per_page ?? 25;
  const pageCount = Math.max(Math.ceil(total / perPage), 1);

  return (
    <Layout>
      <div className="container py-8 md:py-10">
        <div className="mb-7">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Manage accounts, roles and access.</p>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Accounts" value={statsQuery.data?.users} />
          <StatCard icon={Building2} label="Companies" value={statsQuery.data?.companies} />
          <StatCard icon={FileText} label="Experiences" value={statsQuery.data?.experiences} />
          <StatCard icon={MessageSquareText} label="Questions" value={statsQuery.data?.questions} />
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <CardTitle className="font-display text-base">
              Users
              <span className="ml-2 font-mono text-2xs font-normal tabular text-muted-foreground">
                {total}
              </span>
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name or email"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  // A filtered result set is shorter; staying on page 4 would
                  // show an empty table.
                  setPage(1);
                }}
                className="pl-9"
                aria-label="Search users"
              />
            </div>
          </CardHeader>

          <CardContent>
            {usersQuery.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Shimmer key={index} className="h-11 w-full rounded-sm" />
                ))}
              </div>
            ) : users.length === 0 ? (
              <EmptyState
                variant="search"
                title={search ? "No matching users" : "No accounts yet"}
                description={search ? "Try a different search term." : undefined}
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-2xs uppercase tracking-wider">User</TableHead>
                      <TableHead className="text-2xs uppercase tracking-wider">Role</TableHead>
                      <TableHead className="text-2xs uppercase tracking-wider">Active</TableHead>
                      <TableHead className="text-2xs uppercase tracking-wider">Last seen</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((row) => {
                      const isSelf = row.id === user?.id;
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {row.full_name ?? "No name set"}
                                {isSelf && (
                                  <Badge variant="outline" className="ml-2 text-2xs font-normal">
                                    you
                                  </Badge>
                                )}
                              </p>
                              <p className="truncate text-2xs text-muted-foreground">{row.email}</p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Select
                              value={row.role}
                              // Changing your own role is refused by the API too;
                              // disabling it here just avoids a pointless error.
                              disabled={isSelf || setRole.isPending}
                              onValueChange={(value) =>
                                setRole.mutate({ userId: row.id, role: value as AdminUser["role"] })
                              }
                            >
                              <SelectTrigger className="h-8 w-28 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLES.map((role) => (
                                  <SelectItem key={role} value={role} className="capitalize">
                                    {role}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          <TableCell>
                            <Switch
                              checked={row.is_active}
                              disabled={isSelf || setActive.isPending}
                              onCheckedChange={(checked) =>
                                setActive.mutate({ userId: row.id, isActive: checked })
                              }
                              aria-label={`${row.is_active ? "Disable" : "Enable"} ${row.email}`}
                            />
                          </TableCell>

                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {row.last_login_at ? formatInISTHuman(row.last_login_at) : "Never"}
                          </TableCell>

                          <TableCell>
                            {!isSelf && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label={`Delete ${row.email}`}>
                                    <Trash className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete {row.email}?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      The account, its profile and all of its sessions are removed and it
                                      can no longer sign in. Anything they contributed stays, shown as
                                      Anonymous - removing one account should not take a hundred useful
                                      interview writeups with it.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteUser.mutate(row.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete account
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {pageCount > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  Page {page} of {pageCount}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= pageCount}
                    onClick={() => setPage((value) => value + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Shield;
  label: string;
  value: number | undefined;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
          {value === undefined ? (
            <Shimmer className="mt-1 h-6 w-12 rounded-sm" />
          ) : (
            <p className="font-display text-2xl font-semibold tabular">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default Admin;
