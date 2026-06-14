"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UploadPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !session?.accessToken) {
      setError("File required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/v1/imports/excel`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        setError("Failed to upload file");
        return;
      }

      const result = await response.json();
      router.push(`/import/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  if (!session) return <div className="shell">Loading...</div>;

  return (
    <main className="shell">
      <section className="appChrome">
        <h1 className="pageTitle">Upload Excel</h1>

        <form className="grid gap-4 mt-6" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="file">Choose Excel file (.xlsx)</label>
            <input
              id="file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              required
            />
          </div>

          {file && (
            <p className="muted">Selected: {file.name}</p>
          )}

          {error && <p className="muted">{error}</p>}

          <button type="submit" className="primaryButton" disabled={loading}>
            {loading ? "Uploading..." : "Upload"}
          </button>
        </form>

        <div className="mt-4">
          <Link href="/import" className="ghostButton">
            Back
          </Link>
        </div>
      </section>
    </main>
  );
}
