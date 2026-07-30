"use client";

import { useState } from "react";
import { toast } from "sonner";

import { updateNotificationPreferences } from "@/lib/actions/preferences";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function NotificationPreferencesForm({
  initialPreferences,
}: {
  initialPreferences: { notifyOnMention: boolean; notifyOnReply: boolean };
}) {
  const [preferences, setPreferences] = useState(initialPreferences);

  async function handleChange(next: typeof preferences) {
    setPreferences(next);
    const result = await updateNotificationPreferences(next);
    if (!result.success) {
      toast.error(result.error);
      setPreferences(preferences);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="notify-on-mention"
          checked={preferences.notifyOnMention}
          onCheckedChange={(checked) =>
            handleChange({ ...preferences, notifyOnMention: checked === true })
          }
        />
        <Label htmlFor="notify-on-mention" className="text-sm font-normal">
          Email me when I&rsquo;m @mentioned in a comment
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="notify-on-reply"
          checked={preferences.notifyOnReply}
          onCheckedChange={(checked) =>
            handleChange({ ...preferences, notifyOnReply: checked === true })
          }
        />
        <Label htmlFor="notify-on-reply" className="text-sm font-normal">
          Email me when someone replies on a pin I&rsquo;ve commented on
        </Label>
      </div>
    </div>
  );
}
