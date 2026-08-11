import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Seo } from "@/components/Seo";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { CalendarSubscription } from "@/components/CalendarSubscription";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useUpdateProfile } from "@/hooks/queries";
import { api, ApiError } from "@/lib/api";
import { changePasswordSchema, profileSchema } from "@/lib/schemas";
import { formatInISTHuman } from "@/lib/utils";

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof changePasswordSchema>;

const Profile = () => {
  const { user, profile, refresh, signOut } = useAuth();
  const updateProfile = useUpdateProfile();

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: "", avatar_url: "" },
  });

  // The profile arrives after the first render, so the form has to be seeded
  // once it does rather than only from defaultValues.
  useEffect(() => {
    if (profile) {
      profileForm.reset({
        full_name: profile.full_name ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
    }
  }, [profile, profileForm]);

  const passwordForm = useForm<PasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current_password: "", new_password: "", confirm_password: "" },
  });

  const onSaveProfile = profileForm.handleSubmit(async (values) => {
    try {
      await updateProfile.mutateAsync({
        full_name: values.full_name || null,
        avatar_url: values.avatar_url || null,
      });
      await refresh();
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        for (const [field, message] of Object.entries(error.details)) {
          profileForm.setError(field as keyof ProfileValues, { message });
        }
      }
    }
  });

  const onChangePassword = passwordForm.handleSubmit(async (values) => {
    try {
      await api.auth.changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      });
      // Every session was revoked, including this one - so the honest thing is
      // to sign out rather than let the next request fail mysteriously.
      toast.success("Password changed. Sign in again with your new password.");
      await signOut();
    } catch (error) {
      if (error instanceof ApiError) {
        passwordForm.setError("current_password", { message: error.message });
      }
    }
  });

  const initials = (profile?.full_name ?? user?.email ?? "U").slice(0, 2).toUpperCase();

  return (
    <Layout>
      <Seo title="Your profile" noIndex />
      <div className="container max-w-3xl py-8 md:py-10">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your profile</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          How you appear on the experiences and questions you contribute.
        </p>

        <div className="mt-7 space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-base">Account</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-6 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="bg-secondary text-secondary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{user?.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-2xs capitalize">
                      {user?.role}
                    </Badge>
                    <span className="text-2xs text-muted-foreground">
                      Joined {user?.created_at ? formatInISTHuman(user.created_at) : ""}
                    </span>
                  </div>
                </div>
              </div>

              <form onSubmit={onSaveProfile} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="full_name">Display name</Label>
                  <Input id="full_name" {...profileForm.register("full_name")} />
                  {profileForm.formState.errors.full_name && (
                    <p className="text-xs text-destructive">
                      {profileForm.formState.errors.full_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="avatar_url">Avatar URL</Label>
                  <Input id="avatar_url" placeholder="https://" {...profileForm.register("avatar_url")} />
                  {profileForm.formState.errors.avatar_url && (
                    <p className="text-xs text-destructive">
                      {profileForm.formState.errors.avatar_url.message}
                    </p>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save profile
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {user && (
            <Card>
              <CardContent className="pt-6">
                <AttachmentsPanel
                  entityType="profile"
                  entityId={user.id}
                  canUpload
                  title="Your files"
                  description="Your resume, or anything else you want to keep here. Only you can upload to this."
                  emptyDescription="Upload your resume so it is to hand when a drive opens."
                />
              </CardContent>
            </Card>
          )}

          <CalendarSubscription />

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 font-display text-base">
                <KeyRound className="h-4 w-4" />
                Change password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onChangePassword} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="current_password">Current password</Label>
                  <Input
                    id="current_password"
                    type="password"
                    autoComplete="current-password"
                    {...passwordForm.register("current_password")}
                  />
                  {passwordForm.formState.errors.current_password && (
                    <p className="text-xs text-destructive">
                      {passwordForm.formState.errors.current_password.message}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="new_password">New password</Label>
                    <Input
                      id="new_password"
                      type="password"
                      autoComplete="new-password"
                      {...passwordForm.register("new_password")}
                    />
                    {passwordForm.formState.errors.new_password && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.new_password.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="confirm_password">Repeat it</Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      autoComplete="new-password"
                      {...passwordForm.register("confirm_password")}
                    />
                    {passwordForm.formState.errors.confirm_password && (
                      <p className="text-xs text-destructive">
                        {passwordForm.formState.errors.confirm_password.message}
                      </p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  Changing your password signs you out everywhere, including here.
                </p>

                <div className="flex justify-end">
                  <Button type="submit" variant="outline" disabled={passwordForm.formState.isSubmitting}>
                    {passwordForm.formState.isSubmitting && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Change password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-4 py-5">
              <div>
                <p className="text-sm font-medium">Sign out</p>
                <p className="text-xs text-muted-foreground">Ends this session on this device.</p>
              </div>
              <Button variant="outline" onClick={() => void signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Profile;
