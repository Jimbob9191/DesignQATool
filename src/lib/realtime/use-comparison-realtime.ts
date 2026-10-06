"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

export type PresentUser = { userId: string; email: string };

type RawAnnotationRow = {
  id: string;
  comparison_id: string;
  target: "design" | "live";
  x_ratio: string;
  y_px: number;
  status: "open" | "resolved" | "wont_fix" | "needs_review";
  element_selector: string | null;
  element_rect: { x: number; y: number; width: number; height: number } | null;
  element_text: string | null;
  page_url: string | null;
  // Null once the author's account is deleted.
  created_by: string | null;
};

type RawCommentRow = {
  id: string;
  annotation_id: string;
  body: string;
  // Null for guest comments, and once the author's account is deleted.
  created_by: string | null;
  // Set instead of created_by on comments left through a share link.
  guest_name: string | null;
  created_at: string;
  edited_at: string | null;
};

export function useComparisonRealtime({
  comparisonId,
  annotationIds,
  currentUser,
  onAnnotationChange,
  onCommentChange,
}: {
  comparisonId: string;
  annotationIds: string[];
  currentUser: { id: string; email: string };
  onAnnotationChange: (payload: RealtimePostgresChangesPayload<RawAnnotationRow>) => void;
  onCommentChange: (payload: RealtimePostgresChangesPayload<RawCommentRow>) => void;
}) {
  const [presentUsers, setPresentUsers] = useState<PresentUser[]>([]);
  // Realtime filters can't reference values that change every render without
  // resubscribing, so track the current annotation-id set in a ref the
  // comment handler reads from instead of putting it in the effect deps.
  const annotationIdsRef = useRef(annotationIds);
  annotationIdsRef.current = annotationIds;
  const onAnnotationChangeRef = useRef(onAnnotationChange);
  onAnnotationChangeRef.current = onAnnotationChange;
  const onCommentChangeRef = useRef(onCommentChange);
  onCommentChangeRef.current = onCommentChange;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`comparison:${comparisonId}`, {
      config: { presence: { key: currentUser.id } },
    });

    // With RLS on, Supabase sends DELETE events with only the primary key in
    // `old`, and it can't apply a column filter to them either. So deletes
    // get their own unfiltered subscriptions and are matched by id alone;
    // the workspace removes rows by id, so an id it doesn't hold is a no-op.
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "annotations", filter: `comparison_id=eq.${comparisonId}` },
        (payload) => onAnnotationChangeRef.current(payload as never)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "annotations", filter: `comparison_id=eq.${comparisonId}` },
        (payload) => onAnnotationChangeRef.current(payload as never)
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "annotations" }, (payload) => {
        const id = (payload.old as Partial<RawAnnotationRow>).id;
        if (!id || !annotationIdsRef.current.includes(id)) return;
        onAnnotationChangeRef.current(payload as never);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, (payload) => {
        const row = payload.new as RawCommentRow;
        if (!annotationIdsRef.current.includes(row.annotation_id)) return;
        onCommentChangeRef.current(payload as never);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "comments" }, (payload) => {
        const row = payload.new as RawCommentRow;
        if (!annotationIdsRef.current.includes(row.annotation_id)) return;
        onCommentChangeRef.current(payload as never);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments" }, (payload) => {
        if (!(payload.old as Partial<RawCommentRow>).id) return;
        onCommentChangeRef.current(payload as never);
      })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ email: string }>();
        const users = Object.entries(state).map(([userId, presences]) => ({
          userId,
          email: presences[0]?.email ?? "unknown",
        }));
        setPresentUsers(users);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ email: currentUser.email });
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [comparisonId, currentUser.id, currentUser.email]);

  return { presentUsers };
}
