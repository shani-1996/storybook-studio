"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { useRequireUser } from "../../../components/auth";
import { Button, ErrorText, inputClass, Page } from "../../../components/ui";
import { db } from "../../../lib/firebase";
import { titlePreview } from "../../../lib/helpers";
import { ChildDetails, DEFAULT_PROFESSIONS, DEFAULT_STORY_ID, Relationship } from "../../../lib/generated";

const GENDERS = [
  { value: "girl", label: "Girl" },
  { value: "boy", label: "Boy" },
  { value: "neutral", label: "Prefer not to say" },
] as const;

const RELATIONSHIPS = [
  { value: "parent", label: "Parent" },
  { value: "grandparent", label: "Grandparent" },
  { value: "aunt_uncle", label: "Aunt or uncle" },
  { value: "sibling", label: "Sibling" },
  { value: "family_friend", label: "Family friend" },
  { value: "other", label: "Other" },
] as const;

function Details() {
  const { user, loading } = useRequireUser();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [age, setAge] = useState<string>("");
  const [relationship, setRelationship] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    // The same rules run in the browser, in Firestore security rules and on the server.
    const child = ChildDetails.safeParse({ firstName, gender, age: Number(age) });
    const rel = Relationship.safeParse(relationship);
    const next: Record<string, string> = {};
    if (!child.success) {
      for (const issue of child.error.issues) {
        const field = String(issue.path[0] ?? "firstName");
        next[field] =
          field === "firstName" ? "Please enter 1 to 20 letters." : field === "gender" ? "Please choose one." : "Please choose an age from 1 to 7.";
      }
    }
    if (!rel.success) next["relationship"] = "Please choose one.";
    setErrors(next);
    if (!child.success || !rel.success) return;

    setBusy(true);
    setFailed(false);
    try {
      const ref = await addDoc(collection(db, "books"), {
        ownerUid: user.uid,
        storyId: DEFAULT_STORY_ID,
        child: child.data,
        relationship: rel.data,
        status: "draft",
        professions: [...DEFAULT_PROFESSIONS],
        dedicationText: "",
        createdAt: serverTimestamp(),
      });
      router.push(`/create/photos?book=${ref.id}`);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  if (loading || !user) return <Page title="Your child's details"><p role="status">Loading...</p></Page>;

  return (
    <Page title="Your child's details">
      <p className="rounded-lg bg-white/60 px-4 py-3 text-xl font-semibold dark:bg-white/10" aria-live="polite" data-testid="title-preview">
        {titlePreview(firstName)}
      </p>
      {failed && <ErrorText>We could not save these details. Please try again.</ErrorText>}
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="firstName" className="font-semibold">Child's first name</label>
          <input id="firstName" maxLength={20} autoComplete="off" value={firstName} onChange={(e) => setFirstName(e.target.value)} aria-invalid={!!errors["firstName"]} aria-describedby={errors["firstName"] ? "firstName-error" : undefined} className={inputClass} />
          {errors["firstName"] && <p id="firstName-error" role="alert" className="text-red-800">{errors["firstName"]}</p>}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">Gender</legend>
          <div className="flex flex-wrap gap-4">
            {GENDERS.map((g) => (
              <label key={g.value} className="flex items-center gap-2">
                <input type="radio" name="gender" value={g.value} checked={gender === g.value} onChange={() => setGender(g.value)} />
                {g.label}
              </label>
            ))}
          </div>
          {errors["gender"] && <p role="alert" className="text-red-800">{errors["gender"]}</p>}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="age" className="font-semibold">Age</label>
          <select id="age" value={age} onChange={(e) => setAge(e.target.value)} aria-invalid={!!errors["age"]} className={inputClass}>
            <option value="">Choose...</option>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          {errors["age"] && <p role="alert" className="text-red-800">{errors["age"]}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="relationship" className="font-semibold">Your relationship to the child</label>
          <select id="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} aria-invalid={!!errors["relationship"]} className={inputClass}>
            <option value="">Choose...</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {errors["relationship"] && <p role="alert" className="text-red-800">{errors["relationship"]}</p>}
        </div>

        <Button type="submit" disabled={busy}>Next: add photos</Button>
      </form>
    </Page>
  );
}

export default function DetailsPage() {
  return (
    <Suspense>
      <Details />
    </Suspense>
  );
}
