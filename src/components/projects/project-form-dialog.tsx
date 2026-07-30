"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { createProject, updateProject } from "@/lib/actions/projects";
import { slugify } from "@/lib/slug";
import { projectFormSchema, type ProjectFormValues } from "@/lib/validations/project";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

type ProjectFormDialogProps = {
  trigger: React.ReactNode;
  project?: { id: string; name: string; slug: string; baseUrl: string | null };
};

export function ProjectFormDialog({ trigger, project }: ProjectFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [slugTouched, setSlugTouched] = useState(Boolean(project));
  const router = useRouter();
  const isEditing = Boolean(project);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      slug: project?.slug ?? "",
      baseUrl: project?.baseUrl ?? "",
    },
  });

  async function onSubmit(values: ProjectFormValues) {
    const result = isEditing
      ? await updateProject(project!.id, values)
      : await createProject(values);

    if (!result.success) {
      form.setError("slug", { message: result.error });
      toast.error(result.error);
      return;
    }

    toast.success(isEditing ? "Project updated" : "Project created");
    setOpen(false);
    form.reset();
    setSlugTouched(Boolean(project));
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          form.reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{isEditing ? "Edit project" : "New project"}</DialogTitle>
              <DialogDescription>
                A project represents one website you&rsquo;re comparing designs against.
              </DialogDescription>
            </DialogHeader>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Marketing site"
                      {...field}
                      onChange={(event) => {
                        field.onChange(event);
                        if (!slugTouched) {
                          form.setValue("slug", slugify(event.target.value), {
                            shouldValidate: true,
                          });
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="marketing-site"
                      {...field}
                      onChange={(event) => {
                        setSlugTouched(true);
                        field.onChange(event);
                      }}
                    />
                  </FormControl>
                  <FormDescription>Used in the URL. Must be unique within your team.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="baseUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Base URL (optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormDescription>The live site this project&rsquo;s captures come from.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {isEditing ? "Save changes" : "Create project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
