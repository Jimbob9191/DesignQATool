"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitCompare } from "lucide-react";
import { toast } from "sonner";

import { createComparison } from "@/lib/actions/comparisons";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AssetOption = { id: string; label: string };

export function CreateComparisonDialog({
  projectSlug,
  pageId,
  designOptions,
  captureOptions,
  trigger,
}: {
  projectSlug: string;
  pageId: string;
  designOptions: AssetOption[];
  captureOptions: AssetOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [designAssetId, setDesignAssetId] = useState<string>("");
  const [captureAssetId, setCaptureAssetId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const canSubmit = name.trim() && designAssetId && captureAssetId;

  async function handleSubmit() {
    setIsSubmitting(true);
    const result = await createComparison({ pageId, designAssetId, captureAssetId, name });
    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    toast.success("Comparison created");
    setOpen(false);
    setName("");
    setDesignAssetId("");
    setCaptureAssetId("");
    router.push(`/projects/${projectSlug}/${pageId}/compare/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New comparison</DialogTitle>
          <DialogDescription>
            Pick a design upload and a capture to compare side by side.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="comparison-name">Name</Label>
            <Input
              id="comparison-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Desktop — v2"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Design asset</Label>
            <Select value={designAssetId} onValueChange={setDesignAssetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a design upload" />
              </SelectTrigger>
              <SelectContent>
                {designOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Capture</Label>
            <Select value={captureAssetId} onValueChange={setCaptureAssetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a capture" />
              </SelectTrigger>
              <SelectContent>
                {captureOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}>
            <GitCompare className="h-4 w-4" />
            Create comparison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
