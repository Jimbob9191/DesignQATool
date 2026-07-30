import { ComparisonViewer } from "@/components/comparison/comparison-viewer";

// Dev-only harness for manually verifying the pan/zoom/sync engine against
// two differently-sized static images, per the Phase 5 build instructions,
// before wiring it up to real design/capture assets. Not linked in nav.
export default function ComparisonTestPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Comparison viewer test harness</h1>
        <p className="text-muted-foreground">
          800×1200 grid vs. 1440×2160 grid — different intrinsic sizes, to exercise
          width-normalized sync.
        </p>
      </div>
      <ComparisonViewer
        design={{ src: "/test/design-test.svg", width: 800, height: 1200, label: "Design" }}
        live={{ src: "/test/capture-test.svg", width: 1440, height: 2160, label: "Live" }}
      />
    </div>
  );
}
