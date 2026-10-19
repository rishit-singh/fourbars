import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ActionError({
  title = "Something went wrong",
  message,
  onRetry,
  children,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return (
    <Alert variant="destructive" className="my-4">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <span>{message}</span>
        {(onRetry || children) && (
          <div className="mt-3 flex flex-wrap gap-3">
            {onRetry && (
              <Button variant="outline" onClick={onRetry}>
                Try again
              </Button>
            )}
            {children}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
