"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { connectFigmaPat, disconnectFigma } from "@/lib/actions/figma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FigmaConnectionForm({ handle }: { handle: string | null }) {
  const [token, setToken] = useState("");
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  async function handleConnect(event: React.FormEvent) {
    event.preventDefault();
    setIsPending(true);
    const result = await connectFigmaPat({ token });
    setIsPending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setToken("");
    toast.success(`Connected to Figma as ${result.data.handle}`);
    router.refresh();
  }

  async function handleDisconnect() {
    setIsPending(true);
    const result = await disconnectFigma();
    setIsPending(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success("Disconnected from Figma");
    router.refresh();
  }

  if (handle) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Connected as <span className="font-medium">{handle}</span>.
        </p>
        <Button variant="outline" onClick={handleDisconnect} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleConnect} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="figma-token">Personal access token</Label>
        <Input
          id="figma-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          In Figma, open Settings → Security → Personal access tokens and generate one with{" "}
          <span className="font-medium">File content</span> and{" "}
          <span className="font-medium">File metadata</span> set to read-only. It&rsquo;s stored
          encrypted and only used to render frames you import.
        </p>
      </div>
      <Button type="submit" disabled={isPending || token.trim().length === 0} className="self-start">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Connect Figma
      </Button>
    </form>
  );
}
