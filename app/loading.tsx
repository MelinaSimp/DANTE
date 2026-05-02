import TetrisLoading from "@/components/ui/tetris-loader";

export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--canvas)] flex items-center justify-center">
      <TetrisLoading size="sm" speed="fast" />
    </div>
  );
}
