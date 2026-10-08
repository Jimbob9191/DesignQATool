import { getNotificationPreferences } from "@/lib/actions/preferences";
import { requireUser } from "@/lib/auth/team";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog";
import { NotificationPreferencesForm } from "@/components/settings/notification-preferences-form";

export default async function SettingsPage() {
  const [user, preferences] = await Promise.all([requireUser(), getNotificationPreferences()]);
  const email = user.email ?? "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Your personal account settings.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationPreferencesForm initialPreferences={preferences} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription>Signed in as {email}.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm email={email} />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete account</CardTitle>
          <CardDescription>
            Permanently delete your account. If you&rsquo;re the only owner of a team that has
            other members, make someone else an owner first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteAccountDialog email={email} />
        </CardContent>
      </Card>
    </div>
  );
}
