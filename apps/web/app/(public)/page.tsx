import { brand } from '@cmobeat/config';
import { Button, DataCard, MeshPanel, MonoLabel, MovesFeed, Status } from '@cmobeat/ui';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-16 pb-24 md:px-8 md:pt-24">
      <div className="relative grid grid-cols-12 gap-8">
        <section className="col-span-12 flex flex-col gap-8 lg:col-span-7">
          <MonoLabel>{brand.newsletterName} · Issue 000</MonoLabel>
          <h1 className="font-serif text-h1 text-text md:text-display">
            Where CMOs get hired, and companies learn what CMO they need.
          </h1>
          <p className="max-w-xl text-body text-text-2">
            CMO moves, interviews and comp data, a curated board of senior roles with comp on every
            listing, and AI that helps define the mandate before anyone is matched. A person reviews
            every match.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Status tone="machine" className="self-center">
              Publication opens in Phase 1
            </Status>
          </div>
        </section>
        <aside className="col-span-12 flex flex-col gap-6 lg:col-span-5">
          <MeshPanel padded>
            <MovesFeed moves={[]} title="CMO Moves" />
          </MeshPanel>
          <DataCard
            value="—"
            label="Median CMO tenure"
            footnote="Published once the data set is reviewed by an editor."
          />
        </aside>
      </div>
    </main>
  );
}
