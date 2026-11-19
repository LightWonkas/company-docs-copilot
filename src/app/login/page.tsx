import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Sign in · Company Docs Copilot" };

// Static page: it prerenders fully. Sending the magic link (Server Action +
// /auth/confirm route) is added in M2; until then the button is disabled
// rather than wired to a stub.
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Company Docs Copilot</CardTitle>
          <CardDescription>
            Atlas Lojistik internal assistant. You only get answers from documents you are
            allowed to read.
          </CardDescription>
        </CardHeader>
        <form>
          <CardContent className="flex flex-col gap-2">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </CardContent>
          <CardFooter className="mt-4 flex flex-col items-stretch gap-2">
            <Button type="submit" disabled>
              Send magic link
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Magic-link sign-in is enabled in milestone M2.
            </p>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
