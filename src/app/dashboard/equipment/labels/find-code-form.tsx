import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "I'm holding a sticker, take me to its unit." A plain GET form pointed at
 * /dashboard/equipment/find, which normalises the code and redirects — no
 * client JS, no state, so it works on a phone in a boiler room.
 */
export function FindCodeForm({ notFound = false }: { notFound?: boolean }) {
  return (
    <form action="/dashboard/equipment/find" method="get" className="w-full sm:w-auto">
      {/* Bounces a miss back to this page rather than the equipment list, so
          the "no match" message lands where the code was typed. The route
          allowlists this value — it is never followed blindly. */}
      <input type="hidden" name="from" value="/dashboard/equipment/labels" />
      <label htmlFor="find-code" className="sr-only">
        Find equipment by QR code
      </label>
      <div className="flex gap-2">
        <Input
          id="find-code"
          name="code"
          placeholder="Enter a code, e.g. ABCD-2345"
          className="font-mono uppercase placeholder:font-sans placeholder:normal-case sm:w-64"
          autoComplete="off"
          aria-invalid={notFound || undefined}
        />
        <Button type="submit" variant="outline">
          <Search />
          Find
        </Button>
      </div>
      {notFound && (
        <p className="mt-1 text-sm text-destructive">
          No equipment found for that code. Check the sticker and try again.
        </p>
      )}
    </form>
  );
}
