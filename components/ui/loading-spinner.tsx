// components/ui/loading-spinner.tsx
interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  text?: string;
}

export default function LoadingSpinner({ size = "md", text }: LoadingSpinnerProps) {
  const getSizeClasses = () => {
    switch (size) {
      case "sm":
        return "h-4 w-4";
      case "md":
        return "h-6 w-6";
      case "lg":
        return "h-8 w-8";
      default:
        return "h-6 w-6";
    }
  };

  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center space-x-2">
        <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${getSizeClasses()}`}></div>
        {text && <span className="text-sm text-gray-600">{text}</span>}
      </div>
    </div>
  );
}
