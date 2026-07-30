"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { confirmUpload, requestUploadUrl } from "@/lib/actions/assets";
import { readImageDimensions } from "@/lib/assets/read-image-dimensions";
import { ALLOWED_ASSET_MIME_TYPES, MAX_ASSET_SIZE_BYTES } from "@/lib/validations/asset";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UploadState = {
  file: File;
  status: "uploading" | "done" | "error";
  error?: string;
};

export function UploadDropzone({ defaultPageId = null }: { defaultPageId?: string | null }) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const uploadFile = useCallback(
    async (file: File) => {
      setUploads((prev) => [...prev, { file, status: "uploading" }]);

      const setStatus = (status: UploadState["status"], error?: string) => {
        setUploads((prev) =>
          prev.map((u) => (u.file === file ? { ...u, status, error } : u))
        );
        if (status === "error" && error) {
          toast.error(`${file.name}: ${error}`);
        }
      };

      if (!(ALLOWED_ASSET_MIME_TYPES as readonly string[]).includes(file.type)) {
        setStatus("error", "Unsupported file type");
        return;
      }
      if (file.size > MAX_ASSET_SIZE_BYTES) {
        setStatus("error", "File is too large (25MB max)");
        return;
      }

      const urlResult = await requestUploadUrl({
        pageId: defaultPageId,
        filename: file.name,
        mime: file.type,
        size: file.size,
      });
      if (!urlResult.success) {
        setStatus("error", urlResult.error);
        return;
      }

      const { assetId, storagePath, token } = urlResult.data;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from("assets")
        .uploadToSignedUrl(storagePath, token, file);

      if (uploadError) {
        setStatus("error", uploadError.message);
        return;
      }

      const dimensions = await readImageDimensions(file);
      const confirmResult = await confirmUpload({
        assetId,
        storagePath,
        pageId: defaultPageId,
        mime: file.type,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
      });

      if (!confirmResult.success) {
        setStatus("error", confirmResult.error);
        return;
      }

      setStatus("done");
      toast.success(`${file.name} uploaded`);
      router.refresh();
    },
    [defaultPageId, router]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      Array.from(fileList).forEach((file) => {
        void uploadFile(file);
      });
    },
    [uploadFile]
  );

  const pendingCount = uploads.filter((u) => u.status === "uploading").length;
  const erroredUploads = uploads.filter((u) => u.status === "error");

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" />
        <div>
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => inputRef.current?.click()}
          >
            Click to upload
          </button>
          <span className="text-muted-foreground"> or drag and drop</span>
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG, WebP, GIF, or SVG — up to 25MB</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_ASSET_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            handleFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {pendingCount > 0 ? (
        <p className="text-sm text-muted-foreground">
          Uploading {pendingCount} file{pendingCount === 1 ? "" : "s"}…
        </p>
      ) : null}
      {erroredUploads.length > 0 ? (
        <div className="flex flex-col gap-1">
          {erroredUploads.map((u, i) => (
            <p key={i} className="text-sm text-destructive">
              {u.file.name}: {u.error}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
