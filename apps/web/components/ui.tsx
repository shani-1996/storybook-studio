import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Page({ title, children, wide = false }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto flex min-h-screen ${wide ? "max-w-5xl" : "max-w-xl"} flex-col gap-6 px-4 py-10`}>
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </main>
  );
}

export function Button({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg bg-teal-700 px-5 py-3 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  );
}

export function SecondaryButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`rounded-lg border border-current px-5 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-lg bg-red-100 px-3 py-2 text-red-900">
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-lg border border-neutral-400 bg-white px-3 py-3 text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
