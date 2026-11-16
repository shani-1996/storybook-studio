import Link from "next/link";
import { Page } from "../components/ui";

export default function Home() {
  return (
    <Page title="Personalised storybooks">
      <p className="text-lg leading-relaxed">
        A printed storybook starring your child. Upload three photos, preview three pages for free, and we print and
        deliver the book.
      </p>
      <Link
        href="/create/details"
        className="self-start rounded-lg bg-teal-700 px-6 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Create your book
      </Link>
      <p className="text-sm opacity-75">This site is in early development.</p>
    </Page>
  );
}
