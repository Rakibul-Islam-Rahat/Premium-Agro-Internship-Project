import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <section className="flex h-screen items-center justify-center px-4 text-center">
      <div>
        <h1 className="mb-4 text-7xl font-extrabold tracking-tight text-primary lg:text-9xl">404</h1>
        <p className="mb-3 text-3xl font-bold tracking-tight md:text-4xl">Page not found</p>
        <p className="mb-6 text-lg text-muted-foreground">The address you requested does not exist or has been moved.</p>
        <Button asChild><Link to="/">Return to home page</Link></Button>
      </div>
    </section>
  );
}
