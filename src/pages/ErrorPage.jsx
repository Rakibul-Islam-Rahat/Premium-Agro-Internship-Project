import { Link, useRouteError } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function ErrorPage() {
  const error = useRouteError();
  return (
    <div className="mx-auto max-w-md pt-40 text-center">
      <h1 className="mb-3 text-4xl font-extrabold text-primary">Something went wrong</h1>
      <p className="mb-6 text-muted-foreground">{error?.statusText || error?.message || "An unexpected error occurred. Please try again."}</p>
      <Button asChild><Link to="/">Return to home page</Link></Button>
    </div>
  );
}
