import {useRef, useState} from "react";

/**
 * Picking the token image.
 *
 * A file from the person's machine, not a URI they were expected to produce
 * elsewhere. The file goes to a server function that holds the pinning
 * credential, and what comes back is the ipfs:// URI that goes on chain.
 *
 * The preview is shown from a local object URL immediately, so the choice feels
 * made before the upload finishes.
 */

const ENDPOINT = "/.netlify/functions/upload";
const MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  /** The ipfs:// URI once pinned. Empty until then. */
  value: string;
  onChange: (uri: string) => void;
};

export function ImageUpload({value, onChange}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  async function accept(file?: File | null) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setState("error");
      setMessage("That is not an image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setState("error");
      setMessage("That image is over 5 MB. Use a smaller one.");
      return;
    }

    setPreview(URL.createObjectURL(file));
    setState("uploading");
    setMessage("");

    const body = new FormData();
    body.append("file", file);

    try {
      const response = await fetch(ENDPOINT, {method: "POST", body});
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setState("error");
        setMessage(payload.error ?? "The upload did not go through. Try again.");
        return;
      }

      onChange(payload.uri);
      setState("done");
    } catch {
      setState("error");
      setMessage("Could not reach the upload service. Check that the app is running.");
    }
  }

  function clear() {
    setPreview("");
    setState("idle");
    setMessage("");
    onChange("");
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className="flex items-center gap-4"
      >
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden border border-dashed transition-colors"
          style={{
            borderColor: dragging ? "var(--color-ink-deep)" : "var(--color-rule)",
            background: dragging ? "var(--color-paper-block)" : "transparent",
          }}
          aria-label={preview ? "Replace the image" : "Choose an image"}
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="meta">add</span>
          )}
        </button>

        <div className="min-w-0">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
          >
            {preview ? "Choose a different image" : "Choose an image"}
          </button>
          <p className="meta mt-1">or drop one here · png, jpeg, gif, webp · up to 5 MB</p>

          {state === "uploading" && <p className="meta mt-2">pinning to IPFS</p>}

          {state === "done" && value && (
            <p className="meta mt-2 flex flex-wrap items-center gap-2">
              <span style={{color: "var(--color-signal)"}}>pinned</span>
              <span className="break-all">{value}</span>
              <button type="button" onClick={clear} className="underline underline-offset-4">
                remove
              </button>
            </p>
          )}

          {state === "error" && <p className="prose-tight mt-2 text-[0.8125rem]">{message}</p>}
        </div>
      </div>
    </div>
  );
}
