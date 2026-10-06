"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { createTeam, switchTeam } from "@/lib/actions/teams";
import { isTeamScopedPath } from "@/lib/auth/team-switch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type TeamOption = { id: string; name: string; role: string };

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export function TeamSwitcher({
  currentTeamId,
  teams,
}: {
  currentTeamId: string;
  teams: TeamOption[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const currentTeam = teams.find((t) => t.id === currentTeamId);

  const form = useForm<z.infer<typeof createTeamSchema>>({
    resolver: zodResolver(createTeamSchema),
    defaultValues: { name: "" },
  });

  // Both switching and creating a team change the current team. A project,
  // page or comparison URL belongs to the team being left, so refreshing it
  // would only 404; start the new team on its dashboard instead.
  function showNewTeam() {
    if (isTeamScopedPath(window.location.pathname, window.location.search)) {
      router.push("/dashboard");
    } else {
      router.refresh();
    }
  }

  async function handleSwitch(teamId: string) {
    if (teamId === currentTeamId) return;
    const result = await switchTeam(teamId);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    showNewTeam();
  }

  async function handleCreate(values: z.infer<typeof createTeamSchema>) {
    const result = await createTeam(values);
    if (!result.success) {
      form.setError("name", { message: result.error });
      return;
    }
    toast.success("Team created");
    setCreateOpen(false);
    form.reset();
    showNewTeam();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left hover:bg-sidebar-accent">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-sidebar-foreground/60">
                Team
              </span>
              <span className="block truncate text-sm font-medium">
                {currentTeam?.name ?? "Select team"}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {teams.map((team) => (
            <DropdownMenuItem
              key={team.id}
              onSelect={() => void handleSwitch(team.id)}
              className="flex items-center justify-between"
            >
              <span className="flex flex-col">
                <span className="truncate">{team.name}</span>
                <span className="text-xs text-muted-foreground capitalize">{team.role}</span>
              </span>
              {team.id === currentTeamId ? <Check className="h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleCreate)} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Create team</DialogTitle>
                <DialogDescription>You&rsquo;ll be the owner of this new team.</DialogDescription>
              </DialogHeader>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Inc" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  Create team
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
